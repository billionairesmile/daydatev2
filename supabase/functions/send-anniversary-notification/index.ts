import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Anniversary {
  id: string;
  couple_id: string;
  title: string;
  date: string;
  is_recurring: boolean;
  notification_enabled: boolean;
}

interface Couple {
  id: string;
  user1_id: string;
  user2_id: string;
  status: string;
  timezone: string | null;
}

interface Profile {
  id: string;
  push_token: string | null;
  language: string | null;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

// Notification messages by language
const notificationMessages = {
  weekBefore: {
    ko: {
      title: (icon: string) => `${icon} 기념일이 일주일 앞으로 다가왔어요!`,
      body: (title: string, daysLeft: number) => `${title}까지 ${daysLeft}일 남았어요. 특별한 계획을 세워보세요! 💕`,
    },
    en: {
      title: (icon: string) => `${icon} Anniversary is coming in a week!`,
      body: (title: string, daysLeft: number) => `${daysLeft} days until ${title}. Plan something special! 💕`,
    },
    es: {
      title: (icon: string) => `${icon} ¡El aniversario es en una semana!`,
      body: (title: string, daysLeft: number) => `Faltan ${daysLeft} días para ${title}. ¡Planea algo especial! 💕`,
    },
    "zh-TW": {
      title: (icon: string) => `${icon} 紀念日還有一週就到了！`,
      body: (title: string, daysLeft: number) => `距離${title}還有${daysLeft}天，來計劃一些特別的事吧！💕`,
    },
    ja: {
      title: (icon: string) => `${icon} 記念日まであと1週間！`,
      body: (title: string, daysLeft: number) => `${title}まであと${daysLeft}日です。特別な計画を立ててみてね！💕`,
    },
  },
  today: {
    ko: {
      title: (icon: string) => `${icon} 오늘은 특별한 날이에요!`,
      body: (title: string) => `오늘은 ${title}이에요! 사랑하는 사람과 행복한 하루 보내세요 💕`,
    },
    en: {
      title: (icon: string) => `${icon} Today is a special day!`,
      body: (title: string) => `Today is ${title}! Have a wonderful day with your loved one 💕`,
    },
    es: {
      title: (icon: string) => `${icon} ¡Hoy es un día especial!`,
      body: (title: string) => `¡Hoy es ${title}! Pasa un día maravilloso con tu ser querido 💕`,
    },
    "zh-TW": {
      title: (icon: string) => `${icon} 今天是特別的日子！`,
      body: (title: string) => `今天是${title}！和心愛的人一起度過美好的一天吧 💕`,
    },
    ja: {
      title: (icon: string) => `${icon} 今日は特別な日です！`,
      body: (title: string) => `今日は${title}です！大切な人と素敵な一日を過ごしてね 💕`,
    },
  },
};

type SupportedLanguage = "ko" | "en" | "es" | "zh-TW" | "ja";

function getLanguage(lang: string | null): SupportedLanguage {
  if (lang && ["ko", "en", "es", "zh-TW", "ja"].includes(lang)) {
    return lang as SupportedLanguage;
  }
  return "ko";
}

// ---------------------------------------------------------------------------
// Timezone-aware helpers
// ---------------------------------------------------------------------------

/** Get current hour (0-23) in the given IANA timezone */
function getCurrentHourInTimezone(timezone: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return parseInt(parts.find((p) => p.type === "hour")!.value, 10);
}

/** Get today's date components in the given IANA timezone */
function getTodayInTimezone(timezone: string): { year: number; month: number; day: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value, 10),
    month: parseInt(parts.find((p) => p.type === "month")!.value, 10),
    day: parseInt(parts.find((p) => p.type === "day")!.value, 10),
  };
}

/**
 * Calculate days until anniversary using the couple's timezone.
 * "today" is determined by the couple's local date, not UTC.
 */
function getDaysUntilAnniversary(
  dateStr: string,
  isRecurring: boolean,
  timezone: string
): number {
  const { year: todayYear, month: todayMonth, day: todayDay } = getTodayInTimezone(timezone);
  const todayMs = Date.UTC(todayYear, todayMonth - 1, todayDay);

  // Parse anniversary date (stored as YYYY-MM-DD in DB)
  const [annYear, annMonth, annDay] = dateStr.split("-").map(Number);

  if (isRecurring) {
    const thisYearMs = Date.UTC(todayYear, annMonth - 1, annDay);
    if (thisYearMs < todayMs) {
      const nextYearMs = Date.UTC(todayYear + 1, annMonth - 1, annDay);
      return Math.floor((nextYearMs - todayMs) / (1000 * 60 * 60 * 24));
    }
    return Math.floor((thisYearMs - todayMs) / (1000 * 60 * 60 * 24));
  } else {
    const anniversaryMs = Date.UTC(annYear, annMonth - 1, annDay);
    return Math.floor((anniversaryMs - todayMs) / (1000 * 60 * 60 * 24));
  }
}

async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const message: ExpoPushMessage = {
    to: pushToken,
    title,
    body,
    sound: "default",
    priority: "high",
    channelId: "default",
    data: data || {},
  };

  try {
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

    if (result.data?.status === "ok") {
      return { success: true };
    }

    return { success: false, error: result.data?.message || "Unknown error" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
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

    console.log("[Anniversary] Starting anniversary notification check...");

    // Get all anniversaries with notifications enabled
    const { data: anniversaries, error: anniversaryError } = await supabase
      .from("anniversaries")
      .select("id, couple_id, title, date, is_recurring, notification_enabled, icon")
      .eq("notification_enabled", true);

    if (anniversaryError) {
      console.error("[Anniversary] Error fetching anniversaries:", anniversaryError);
      return new Response(
        JSON.stringify({ success: false, error: anniversaryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!anniversaries || anniversaries.length === 0) {
      console.log("[Anniversary] No anniversaries with notifications enabled");
      return new Response(
        JSON.stringify({ success: true, message: "No anniversaries to process", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Anniversary] Found ${anniversaries.length} anniversaries to check`);

    // Cache couple data to avoid repeated queries for couples with multiple anniversaries
    const coupleCache = new Map<string, Couple | null>();

    const results = {
      processed: 0,
      weekBefore: 0,
      today: 0,
      skipped: 0,
      skippedNotNineAM: 0,
      errors: 0,
    };

    for (const anniversary of anniversaries) {
      results.processed++;
      const icon = anniversary.icon || "🎉";

      // Get couple info (with timezone)
      let couple = coupleCache.get(anniversary.couple_id);
      if (couple === undefined) {
        const { data, error: coupleError } = await supabase
          .from("couples")
          .select("id, user1_id, user2_id, status, timezone")
          .eq("id", anniversary.couple_id)
          .eq("status", "connected")
          .single();

        couple = coupleError || !data ? null : (data as Couple);
        coupleCache.set(anniversary.couple_id, couple);
      }

      if (!couple) {
        console.log(`[Anniversary] Couple not found or not connected: ${anniversary.couple_id}`);
        results.skipped++;
        continue;
      }

      // Use couple's timezone, default to Asia/Seoul
      const coupleTimezone = couple.timezone || "Asia/Seoul";

      // Only send notifications at midnight (0 AM) in the couple's timezone
      // This function runs hourly via cron — each timezone hits midnight once per day
      const currentHour = getCurrentHourInTimezone(coupleTimezone);
      if (currentHour !== 0) {
        results.skippedNotNineAM++;
        continue;
      }

      // Calculate days until anniversary using the couple's timezone
      const daysUntil = getDaysUntilAnniversary(
        anniversary.date,
        anniversary.is_recurring,
        coupleTimezone
      );

      // Check if notification should be sent (7 days before or today)
      let notificationType: "weekBefore" | "today" | null = null;

      if (daysUntil === 7) {
        notificationType = "weekBefore";
      } else if (daysUntil === 0) {
        notificationType = "today";
      }

      if (!notificationType) {
        results.skipped++;
        continue;
      }

      console.log(
        `[Anniversary] ${anniversary.title}: ${daysUntil} days until, type: ${notificationType}, timezone: ${coupleTimezone}`
      );

      // Get both users' profiles
      const userIds = [couple.user1_id, couple.user2_id];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, push_token, language")
        .in("id", userIds);

      if (profileError || !profiles) {
        console.error(`[Anniversary] Error fetching profiles:`, profileError);
        results.errors++;
        continue;
      }

      // Send notifications to both users
      for (const profile of profiles) {
        if (!profile.push_token) {
          console.log(`[Anniversary] User ${profile.id} has no push token`);
          continue;
        }

        const lang = getLanguage(profile.language);
        const messages = notificationMessages[notificationType][lang];

        const title = messages.title(icon);
        const body = notificationType === "weekBefore"
          ? messages.body(anniversary.title, daysUntil)
          : messages.body(anniversary.title);

        const result = await sendExpoPushNotification(
          profile.push_token,
          title,
          body,
          {
            type: "anniversary_reminder",
            anniversaryId: anniversary.id,
            anniversaryTitle: anniversary.title,
            daysUntil,
            screen: "calendar",
          }
        );

        if (result.success) {
          console.log(`[Anniversary] Notification sent to user ${profile.id}`);
          if (notificationType === "weekBefore") {
            results.weekBefore++;
          } else {
            results.today++;
          }
        } else {
          console.error(`[Anniversary] Failed to send to user ${profile.id}:`, result.error);
          results.errors++;

          // Remove invalid push tokens
          if (result.error?.includes("DeviceNotRegistered") || result.error?.includes("InvalidCredentials")) {
            await supabase
              .from("profiles")
              .update({ push_token: null, push_token_updated_at: new Date().toISOString() })
              .eq("id", profile.id);
          }
        }
      }
    }

    console.log("[Anniversary] Completed:", results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Anniversary] Fatal error:", error);

    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
