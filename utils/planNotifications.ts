import { db } from '@/lib/supabase';
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

  // 1. Booking nudge (meaningful only in interested state)
  if (plan.ticketOpenDate) {
    const ticketDate = new Date(plan.ticketOpenDate + 'T00:00:00');
    if (ticketDate > today) {
      // Ticket open date is in the future
      notifications.push({
        plan_id: plan.id,
        type: 'ticket_open',
        scheduled_at: ticketDate.toISOString(),
        include_affiliate_link: true,
        message_title: '🎟 티켓 오픈!',
        message_body: `${plan.title} 티켓이 오늘 오픈됐어요!`,
      });
    } else {
      // Ticket already open
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
        scheduled_at: subDays(eventDate, 14).toISOString(),
        include_affiliate_link: true,
        message_title: '📅 미리 예약해둘까요?',
        message_body: `${plan.title}까지 2주! 미리 예약하면 자리 걱정 없어요`,
      });
    } else {
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
      scheduled_at: subDays(eventDate, 7).toISOString(),
      include_affiliate_link: true,
      message_title: '📅 일주일 남았어요!',
      message_body: `${plan.title}까지 D-7!`,
    });
  }

  if (daysUntilEvent >= 3) {
    notifications.push({
      plan_id: plan.id,
      type: 'd_3',
      scheduled_at: subDays(eventDate, 3).toISOString(),
      include_affiliate_link: true,
      message_title: '📅 3일 남았어요!',
      message_body: `${plan.title}까지 D-3!`,
    });
  }

  if (daysUntilEvent >= 1) {
    notifications.push({
      plan_id: plan.id,
      type: 'd_1',
      scheduled_at: subDays(eventDate, 1).toISOString(),
      include_affiliate_link: false,
      message_title: '💕 내일이에요!',
      message_body: `내일 ${plan.locationName || plan.title}에서 만나요!`,
    });
  }

  // 3. D-day
  notifications.push({
    plan_id: plan.id,
    type: 'd_day',
    scheduled_at: eventDate.toISOString(),
    include_affiliate_link: false,
    message_title: '🎉 오늘이에요!',
    message_body: `${plan.title} 가는 날! 즐거운 데이트 되세요`,
  });

  // 4. Photo nudge (D+1)
  notifications.push({
    plan_id: plan.id,
    type: 'photo_nudge',
    scheduled_at: addDays(eventDate, 1).toISOString(),
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
