import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushNotificationRequest {
  target_user_id: string;
  type: "mission_generated" | "mission_reminder" | "partner_message_waiting";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<ExpoPushTicket> {
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

  if (result.data) {
    return result.data;
  }

  return { status: "error", message: "Unknown error" };
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

    // Parse request body
    const body: PushNotificationRequest = await req.json();
    const { target_user_id, type, title, body: messageBody, data } = body;

    if (!target_user_id || !title || !messageBody) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: target_user_id, title, body",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[Push] Sending ${type} notification to user ${target_user_id}`);

    // Get user's push token from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("push_token, nickname")
      .eq("id", target_user_id)
      .single();

    if (profileError) {
      console.error("[Push] Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Profile not found: ${profileError.message}`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile.push_token) {
      console.log("[Push] User does not have a push token");
      return new Response(
        JSON.stringify({
          success: false,
          error: "User does not have a push token registered",
        }),
        {
          status: 200, // Not an error, just no token
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send the push notification via Expo
    const ticket = await sendExpoPushNotification(
      profile.push_token,
      title,
      messageBody,
      {
        ...data,
        type,
        timestamp: Date.now(),
      }
    );

    if (ticket.status === "ok") {
      console.log(`[Push] Notification sent successfully. Ticket ID: ${ticket.id}`);
      return new Response(
        JSON.stringify({
          success: true,
          ticket_id: ticket.id,
          recipient: profile.nickname || target_user_id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      console.error("[Push] Expo push error:", ticket.message, ticket.details);

      // Handle invalid push token - remove it from database
      if (
        ticket.details?.error === "DeviceNotRegistered" ||
        ticket.details?.error === "InvalidCredentials"
      ) {
        console.log("[Push] Removing invalid push token");
        await supabase
          .from("profiles")
          .update({ push_token: null, push_token_updated_at: new Date().toISOString() })
          .eq("id", target_user_id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: ticket.message || "Failed to send notification",
          details: ticket.details,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("[Push] Fatal error:", error);

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
