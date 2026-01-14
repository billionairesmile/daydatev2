import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupResult {
  couple_id: string;
  total_files: number;
  completed_photos: number;
  deleted_files: number;
  errors: string[];
}

interface CleanupResponse {
  success: boolean;
  total_deleted: number;
  couples_processed: number;
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
    let dryRun = false;
    let maxAgeDays = 1; // Default: only delete photos older than 1 day

    try {
      const body = await req.json();
      dryRun = body.dry_run || false;
      maxAgeDays = body.max_age_days || 1;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[OrphanCleanup] Starting cleanup. Dry run: ${dryRun}, Max age: ${maxAgeDays} days`);

    // Get all active couples
    const { data: couples, error: couplesError } = await supabase
      .from("couples")
      .select("id")
      .eq("status", "connected");

    if (couplesError) {
      throw new Error(`Failed to fetch couples: ${couplesError.message}`);
    }

    if (!couples || couples.length === 0) {
      console.log("[OrphanCleanup] No active couples found");
      return new Response(
        JSON.stringify({
          success: true,
          total_deleted: 0,
          couples_processed: 0,
          results: [],
          errors: [],
          message: "No active couples found",
        } as CleanupResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[OrphanCleanup] Processing ${couples.length} couples`);

    const results: CleanupResult[] = [];
    const globalErrors: string[] = [];
    let totalDeleted = 0;

    // Calculate cutoff time (photos older than this are candidates for deletion)
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    for (const couple of couples) {
      const coupleId = couple.id;
      const result: CleanupResult = {
        couple_id: coupleId,
        total_files: 0,
        completed_photos: 0,
        deleted_files: 0,
        errors: [],
      };

      try {
        // Step 1: List all files in the couple's storage folder
        const { data: storageFiles, error: listError } = await supabase.storage
          .from("memories")
          .list(coupleId);

        if (listError) {
          result.errors.push(`List error: ${listError.message}`);
          results.push(result);
          continue;
        }

        if (!storageFiles || storageFiles.length === 0) {
          results.push(result);
          continue;
        }

        result.total_files = storageFiles.length;

        // Step 2: Get all completed mission photo URLs for this couple
        const { data: completedMissions, error: missionsError } = await supabase
          .from("completed_missions")
          .select("photo_url")
          .eq("couple_id", coupleId);

        if (missionsError) {
          result.errors.push(`Missions query error: ${missionsError.message}`);
          results.push(result);
          continue;
        }

        // Extract file names from completed mission URLs
        const completedPhotoNames = new Set<string>();
        if (completedMissions) {
          for (const mission of completedMissions) {
            if (mission.photo_url) {
              // Extract filename from URL: .../memories/{coupleId}/{filename}.jpg
              const match = mission.photo_url.match(/\/memories\/[^/]+\/([^/]+)$/);
              if (match) {
                completedPhotoNames.add(match[1]);
              }
            }
          }
        }

        result.completed_photos = completedPhotoNames.size;

        // Step 3: Find orphaned files (in storage but not in completed_missions)
        const orphanedFiles: string[] = [];

        for (const file of storageFiles) {
          // Skip if file is referenced in completed_missions
          if (completedPhotoNames.has(file.name)) {
            continue;
          }

          // Check file age by parsing timestamp from filename
          // Filename format: {timestamp}.jpg
          const timestampMatch = file.name.match(/^(\d+)\.jpg$/);
          if (timestampMatch) {
            const fileTimestamp = parseInt(timestampMatch[1], 10);

            // Only delete if older than cutoff time
            if (fileTimestamp < cutoffTime) {
              orphanedFiles.push(`${coupleId}/${file.name}`);
            }
          }
        }

        // Step 4: Delete orphaned files
        if (orphanedFiles.length > 0) {
          if (!dryRun) {
            const { error: deleteError } = await supabase.storage
              .from("memories")
              .remove(orphanedFiles);

            if (deleteError) {
              result.errors.push(`Delete error: ${deleteError.message}`);
            } else {
              result.deleted_files = orphanedFiles.length;
              totalDeleted += orphanedFiles.length;
            }
          } else {
            // Dry run: just count
            result.deleted_files = orphanedFiles.length;
            totalDeleted += orphanedFiles.length;
          }
        }

        console.log(
          `[OrphanCleanup] Couple ${coupleId}: ${result.total_files} files, ` +
          `${result.completed_photos} completed, ${result.deleted_files} deleted`
        );

      } catch (e) {
        result.errors.push(`Processing error: ${String(e)}`);
        globalErrors.push(`Couple ${coupleId}: ${String(e)}`);
      }

      results.push(result);
    }

    const response: CleanupResponse = {
      success: globalErrors.length === 0,
      total_deleted: totalDeleted,
      couples_processed: couples.length,
      results: results.filter(r => r.total_files > 0 || r.errors.length > 0),
      errors: globalErrors,
    };

    console.log(
      `[OrphanCleanup] Completed. ` +
      `${response.couples_processed} couples processed, ` +
      `${response.total_deleted} orphaned photos ${dryRun ? "would be " : ""}deleted`
    );

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[OrphanCleanup] Fatal error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        total_deleted: 0,
        couples_processed: 0,
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
