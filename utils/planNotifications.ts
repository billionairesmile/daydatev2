import { db } from '@/lib/supabase';
import { useTimezoneStore } from '@/stores/timezoneStore';
import type { Plan } from '@/types';

// Date helpers
function diffDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Convert a local date to 9:00 AM in the given IANA timezone, returned as UTC ISO string.
 * E.g., 2026-03-15 in "Asia/Seoul" (UTC+9) → "2026-03-15T00:00:00.000Z" (midnight UTC = 9AM KST)
 */
function toNineAMInTimezone(date: Date, timezone: string): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Create a reference point at noon UTC to determine timezone offset
  const ref = new Date(Date.UTC(year, month, day, 12, 0, 0));

  const getTimeParts = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(ref);
    return {
      hour: parseInt(parts.find(p => p.type === 'hour')!.value, 10),
      minute: parseInt(parts.find(p => p.type === 'minute')!.value, 10),
    };
  };

  const utcTime = getTimeParts('UTC');
  const localTime = getTimeParts(timezone);

  // Offset in minutes (positive = east of UTC)
  let offsetMin = (localTime.hour * 60 + localTime.minute) - (utcTime.hour * 60 + utcTime.minute);
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  // 9:00 AM local = (9*60 - offsetMin) minutes from midnight UTC of that date
  const utcMinutes = 9 * 60 - offsetMin;

  // Date.UTC + setUTCMinutes handles overflow/underflow (wraps to prev/next day)
  const result = new Date(Date.UTC(year, month, day, 0, 0, 0));
  result.setUTCMinutes(utcMinutes);

  return result.toISOString();
}

interface NotificationInsert {
  plan_id: string;
  type: string;
  scheduled_at: string;
  include_affiliate_link: boolean;
  message_title: string;
  message_body: string;
}

export async function schedulePlanNotifications(plan: Plan): Promise<void> {
  const today = new Date();
  const eventDate = new Date(plan.eventDate + 'T00:00:00');
  const daysUntilEvent = diffDays(eventDate, today);
  const notifications: NotificationInsert[] = [];

  // Get couple's effective timezone for scheduling at 9 AM local time
  const timezone = useTimezoneStore.getState().getEffectiveTimezone();

  // 1. Booking nudge (meaningful only in interested state)
  if (plan.ticketOpenDate) {
    const ticketDate = new Date(plan.ticketOpenDate + 'T00:00:00');
    if (ticketDate > today) {
      // Ticket open date is in the future → send at 9 AM local on that date
      notifications.push({
        plan_id: plan.id,
        type: 'ticket_open',
        scheduled_at: toNineAMInTimezone(ticketDate, timezone),
        include_affiliate_link: true,
        message_title: '🎟 티켓 오픈!',
        message_body: `${plan.title} 티켓이 오늘 오픈됐어요!`,
      });
    } else {
      // Ticket already open → send 2 hours from now (immediate nudge)
      notifications.push({
        plan_id: plan.id,
        type: 'booking_nudge',
        scheduled_at: addHours(today, 2).toISOString(),
        include_affiliate_link: true,
        message_title: '🎟 지금 예매 가능!',
        message_body: `${plan.title} 예매가 가능해요. 좋은 자리 먼저 잡아요!`,
      });
    }
  } else {
    // No ticket open date (cafes, restaurants, etc.)
    if (daysUntilEvent >= 14) {
      notifications.push({
        plan_id: plan.id,
        type: 'booking_nudge',
        scheduled_at: toNineAMInTimezone(subDays(eventDate, 14), timezone),
        include_affiliate_link: true,
        message_title: '📅 미리 예약해둘까요?',
        message_body: `${plan.title}까지 2주! 미리 예약하면 자리 걱정 없어요`,
      });
    } else {
      // Close event → send 2 hours from now (immediate nudge)
      notifications.push({
        plan_id: plan.id,
        type: 'booking_nudge',
        scheduled_at: addHours(today, 2).toISOString(),
        include_affiliate_link: true,
        message_title: '🎟 곧이에요!',
        message_body: `${plan.title} 얼마 안 남았어요. 지금 예약하세요!`,
      });
    }
  }

  // 2. Reminders (sent even when booked, but links removed at send time)
  if (daysUntilEvent >= 7) {
    notifications.push({
      plan_id: plan.id,
      type: 'd_7',
      scheduled_at: toNineAMInTimezone(subDays(eventDate, 7), timezone),
      include_affiliate_link: true,
      message_title: '📅 일주일 남았어요!',
      message_body: `${plan.title}까지 D-7!`,
    });
  }

  if (daysUntilEvent >= 1) {
    notifications.push({
      plan_id: plan.id,
      type: 'd_1',
      scheduled_at: toNineAMInTimezone(subDays(eventDate, 1), timezone),
      include_affiliate_link: false,
      message_title: '💕 내일이에요!',
      message_body: `내일 ${plan.locationName || plan.title}에서 만나요!`,
    });
  }

  // 3. D-day → 9 AM local
  notifications.push({
    plan_id: plan.id,
    type: 'd_day',
    scheduled_at: toNineAMInTimezone(eventDate, timezone),
    include_affiliate_link: false,
    message_title: '🎉 오늘이에요!',
    message_body: `${plan.title} 가는 날! 즐거운 데이트 되세요`,
  });

  // 4. Photo nudge (D+1) → 9 AM local
  notifications.push({
    plan_id: plan.id,
    type: 'photo_nudge',
    scheduled_at: toNineAMInTimezone(addDays(eventDate, 1), timezone),
    include_affiliate_link: false,
    message_title: '📸 추억 남기기',
    message_body: `어제 ${plan.title} 어땠어? 사진 올려서 추억 남기자!`,
  });

  // Insert all notifications
  try {
    await db.planNotifications.createBatch(notifications);
  } catch (e) {
    console.warn('[planNotifications] Failed to schedule notifications:', e);
  }
}
