import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupResult {
  couple_id: string;
  user1_id: string;
  user2_id: string;
  days_since_disconnect: number;
  storage_cleanup: {
    memories: number;
    backgrounds: number;
    album_covers: number;
    errors: string[];
  };
}

interface CleanupResponse {
  success: boolean;
  deleted_count: number;
  expired_missions_deleted: number;
  results: CleanupResult[];
  errors: string[];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body for optional parameters
    let trigger = "cron";
    let dryRun = false;

    try {
      const body = await req.json();
      trigger = body.trigger || "cron";
      dryRun = body.dry_run || false;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[Cleanup] Starting cleanup job. Trigger: ${trigger}, Dry run: ${dryRun}`);

    // Step 0: Delete expired missions older than 7 days
    let expiredMissionsDeleted = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (!dryRun) {
      const { data: deletedMissions, error: missionDeleteError } = await supabase
        .from("couple_missions")
        .delete()
        .eq("status", "expired")
        .lt("expires_at", sevenDaysAgo.toISOString())
        .select("id");

      if (missionDeleteError) {
        console.error("[Cleanup] Error deleting expired missions:", missionDeleteError);
      } else {
        expiredMissionsDeleted = deletedMissions?.length || 0;
        console.log(`[Cleanup] Deleted ${expiredMissionsDeleted} expired missions (older than 7 days)`);
      }
    } else {
      // Dry run: just count
      const { count } = await supabase
        .from("couple_missions")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired")
        .lt("expires_at", sevenDaysAgo.toISOString());

      expiredMissionsDeleted = count || 0;
      console.log(`[Cleanup] Would delete ${expiredMissionsDeleted} expired missions (dry run)`);
    }

    // Step 1: Find all couples disconnected more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: disconnectedCouples, error: fetchError } = await supabase
      .from("couples")
      .select("id, user1_id, user2_id, disconnected_at")
      .eq("status", "disconnected")
      .not("disconnected_at", "is", null)
      .lt("disconnected_at", thirtyDaysAgo.toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch disconnected couples: ${fetchError.message}`);
    }

    if (!disconnectedCouples || disconnectedCouples.length === 0) {
      console.log("[Cleanup] No couples to clean up");
      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: 0,
          expired_missions_deleted: expiredMissionsDeleted,
          results: [],
          errors: [],
          message: "No couples found for cleanup",
        } as CleanupResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Found ${disconnectedCouples.length} couples to clean up`);

    const results: CleanupResult[] = [];
    const globalErrors: string[] = [];

    // Step 2: Process each couple
    for (const couple of disconnectedCouples) {
      const coupleId = couple.id;
      const daysSince = Math.floor(
        (Date.now() - new Date(couple.disconnected_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      console.log(`[Cleanup] Processing couple ${coupleId} (disconnected ${daysSince} days ago)`);

      const storageCleanup = {
        memories: 0,
        backgrounds: 0,
        album_covers: 0,
        errors: [] as string[],
      };

      // Step 2a: Delete storage files
      if (!dryRun) {
        // Delete memories folder
        try {
          const { data: memoryFiles } = await supabase.storage
            .from("memories")
            .list(coupleId);

          if (memoryFiles && memoryFiles.length > 0) {
            const filePaths = memoryFiles.map((f) => `${coupleId}/${f.name}`);
            const { error } = await supabase.storage.from("memories").remove(filePaths);
            if (error) {
              storageCleanup.errors.push(`memories: ${error.message}`);
            } else {
              storageCleanup.memories = memoryFiles.length;
            }
          }
        } catch (e) {
          storageCleanup.errors.push(`memories: ${String(e)}`);
        }

        // Delete backgrounds folder
        try {
          const { data: bgFiles } = await supabase.storage
            .from("memories")
            .list(`backgrounds/${coupleId}`);

          if (bgFiles && bgFiles.length > 0) {
            const bgPaths = bgFiles.map((f) => `backgrounds/${coupleId}/${f.name}`);
            const { error } = await supabase.storage.from("memories").remove(bgPaths);
            if (error) {
              storageCleanup.errors.push(`backgrounds: ${error.message}`);
            } else {
              storageCleanup.backgrounds = bgFiles.length;
            }
          }
        } catch (e) {
          storageCleanup.errors.push(`backgrounds: ${String(e)}`);
        }

        // Delete album covers folder
        try {
          const { data: coverFiles } = await supabase.storage
            .from("memories")
            .list(`album-covers/${coupleId}`);

          if (coverFiles && coverFiles.length > 0) {
            const coverPaths = coverFiles.map((f) => `album-covers/${coupleId}/${f.name}`);
            const { error } = await supabase.storage.from("memories").remove(coverPaths);
            if (error) {
              storageCleanup.errors.push(`album-covers: ${error.message}`);
            } else {
              storageCleanup.album_covers = coverFiles.length;
            }
          }
        } catch (e) {
          storageCleanup.errors.push(`album-covers: ${String(e)}`);
        }

        // Step 2b: Delete couple record (CASCADE handles related tables)
        const { error: deleteError } = await supabase
          .from("couples")
          .delete()
          .eq("id", coupleId);

        if (deleteError) {
          globalErrors.push(`Failed to delete couple ${coupleId}: ${deleteError.message}`);
          continue;
        }

        // Step 2c: Log the cleanup
        await supabase.from("couple_cleanup_log").insert({
          couple_id: coupleId,
          user1_id: couple.user1_id,
          user2_id: couple.user2_id,
          disconnected_at: couple.disconnected_at,
          days_since_disconnect: daysSince,
          cleanup_trigger: trigger,
        });
      }

      results.push({
        couple_id: coupleId,
        user1_id: couple.user1_id,
        user2_id: couple.user2_id,
        days_since_disconnect: daysSince,
        storage_cleanup: storageCleanup,
      });

      console.log(
        `[Cleanup] Couple ${coupleId} cleaned up. Storage: ${storageCleanup.memories} memories, ${storageCleanup.backgrounds} backgrounds, ${storageCleanup.album_covers} covers`
      );
    }

    const response: CleanupResponse = {
      success: globalErrors.length === 0,
      deleted_count: dryRun ? 0 : results.length,
      expired_missions_deleted: expiredMissionsDeleted,
      results,
      errors: globalErrors,
    };

    console.log(`[Cleanup] Completed. Deleted ${response.deleted_count} couples, ${expiredMissionsDeleted} expired missions`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Cleanup] Fatal error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        deleted_count: 0,
        expired_missions_deleted: 0,
        results: [],
        errors: [String(error)],
      } as CleanupResponse),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
