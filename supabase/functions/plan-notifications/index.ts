import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    const message: ExpoPushMessage = {
      to: pushToken,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data: data || {},
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    return result.data?.status === "ok";
  } catch (e) {
    console.error("[plan-notifications] Push error:", e);
    return false;
  }
}

async function sendPushToBothUsers(
  supabase: ReturnType<typeof createClient>,
  user1Id: string,
  user2Id: string | null,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const userIds = [user1Id];
  if (user2Id) userIds.push(user2Id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, push_token")
    .in("id", userIds);

  let sent = 0;
  for (const profile of profiles || []) {
    if (profile.push_token) {
      const ok = await sendExpoPush(profile.push_token, title, body, data);
      if (ok) sent++;
    }
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const now = new Date().toISOString();

    // Fetch pending notifications: scheduled_at <= now AND not sent AND not cancelled
    const { data: pendingNotifs, error: fetchError } = await supabase
      .from("plan_notifications")
      .select(`
        *,
        plan:plans(
          id, title, status, location_name,
          affiliate_link, couple_id
        )
      `)
      .lte("scheduled_at", now)
      .is("sent_at", null)
      .eq("is_cancelled", false)
      .limit(100);

    if (fetchError) {
      console.error("[plan-notifications] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const notif of pendingNotifs || []) {
      const plan = notif.plan;

      if (!plan) {
        skippedCount++;
        continue;
      }

      // Skip cancelled plans
      if (plan.status === "cancelled") {
        await supabase
          .from("plan_notifications")
          .update({ is_cancelled: true })
          .eq("id", notif.id);
        skippedCount++;
        continue;
      }

      // For booked plans, don't include affiliate link
      const includeLink =
        notif.include_affiliate_link && plan.status === "interested";

      // Get couple member IDs
      const { data: couple } = await supabase
        .from("couples")
        .select("user1_id, user2_id, is_premium")
        .eq("id", plan.couple_id)
        .single();

      if (!couple) {
        skippedCount++;
        continue;
      }

      // d_3 notifications are premium-only
      if (notif.type === "d_3" && !couple.is_premium) {
        skippedCount++;
        continue;
      }

      // Premium-only notification types for free users
      const premiumOnlyTypes = ["booking_nudge", "ticket_open", "d_7"];
      if (premiumOnlyTypes.includes(notif.type) && !couple.is_premium) {
        skippedCount++;
        continue;
      }

      // Build push data
      const pushData: Record<string, unknown> = {
        type: `plan_${notif.type}`,
        plan_id: plan.id,
      };
      if (includeLink && plan.affiliate_link) {
        pushData.affiliate_link = plan.affiliate_link;
      }

      // Send push to both users
      const sent = await sendPushToBothUsers(
        supabase,
        couple.user1_id,
        couple.user2_id,
        notif.message_title || "",
        notif.message_body || "",
        pushData
      );

      sentCount += sent;

      // Mark as sent
      await supabase
        .from("plan_notifications")
        .update({ sent_at: now })
        .eq("id", notif.id);
    }

    console.log(
      `[plan-notifications] Processed: ${pendingNotifs?.length || 0} notifications, sent: ${sentCount}, skipped: ${skippedCount}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingNotifs?.length || 0,
        sent: sentCount,
        skipped: skippedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[plan-notifications] Fatal error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
