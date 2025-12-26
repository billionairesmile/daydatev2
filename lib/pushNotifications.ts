import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { db, supabase, isDemoMode } from './supabase';

// Check if running in Expo Go (push notifications don't work in Expo Go as of SDK 53)
const isExpoGo = Constants.appOwnership === 'expo';

// Conditionally import notifications to avoid crashes in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
    // Configure notification behavior
    // When app is in foreground, don't show alert/banner - only update badge
    // This prevents notifications from popping up when user is already using the app
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: false, // Don't show alert when app is in foreground
          shouldPlaySound: false, // Don't play sound when app is in foreground
          shouldSetBadge: true,   // Still update badge count
          shouldShowBanner: false, // Don't show banner when app is in foreground
          shouldShowList: true,    // Still add to notification list
        }),
      });
    }
  } catch (error) {
    console.log('[Push] expo-notifications not available:', error);
  }
} else {
  console.log('[Push] Running in Expo Go - push notifications are disabled');
}

export interface PushNotificationResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Check current notification permission status
 * Returns true if notifications are granted, false otherwise
 */
export async function getNotificationPermissionStatus(): Promise<boolean> {
  if (!Notifications) {
    return false;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[Push] Error getting permission status:', error);
    return false;
  }
}

/**
 * Sync marketing_agreed field with OS notification permission status
 */
export async function syncMarketingAgreedWithPermission(userId: string): Promise<boolean> {
  if (isDemoMode || !userId) {
    return false;
  }

  try {
    const hasPermission = await getNotificationPermissionStatus();

    const { error } = await db.profiles.update(userId, {
      marketing_agreed: hasPermission,
    });

    if (error) {
      console.error('[Push] Error syncing marketing_agreed:', error);
      return false;
    }

    console.log('[Push] marketing_agreed synced with permission status:', hasPermission);
    return true;
  } catch (error) {
    console.error('[Push] Error syncing marketing_agreed:', error);
    return false;
  }
}

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotifications(): Promise<PushNotificationResult> {
  // Check if notifications are available (not in Expo Go)
  if (!Notifications) {
    console.log('[Push] Notifications not available (running in Expo Go)');
    return { success: false, error: 'Notifications not available in Expo Go' };
  }

  if (isDemoMode) {
    console.log('[Push] Demo mode - skipping push notification registration');
    return { success: false, error: 'Demo mode' };
  }

  // Check if physical device
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for push notifications');
    return { success: false, error: 'Must use physical device' };
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return { success: false, error: 'Permission not granted' };
    }

    // Get project ID from Constants
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn('[Push] No project ID found, using default');
    }

    // Get Expo push token
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });

    const token = tokenResponse.data;
    console.log('[Push] Got push token:', token);

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B9D',
      });
    }

    return { success: true, token };
  } catch (error) {
    console.error('[Push] Error registering for push notifications:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Save push token to database for a user
 */
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  if (isDemoMode || !userId || !token) {
    return false;
  }

  try {
    const { error } = await db.profiles.update(userId, {
      push_token: token,
      push_token_updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[Push] Error saving push token:', error);
      return false;
    }

    console.log('[Push] Push token saved successfully');
    return true;
  } catch (error) {
    console.error('[Push] Error saving push token:', error);
    return false;
  }
}

/**
 * Remove push token from database (on logout)
 */
export async function removePushToken(userId: string): Promise<boolean> {
  if (isDemoMode || !userId) {
    return false;
  }

  try {
    const { error } = await db.profiles.update(userId, {
      push_token: null,
      push_token_updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[Push] Error removing push token:', error);
      return false;
    }

    console.log('[Push] Push token removed successfully');
    return true;
  } catch (error) {
    console.error('[Push] Error removing push token:', error);
    return false;
  }
}

/**
 * Get partner's push token
 */
export async function getPartnerPushToken(partnerId: string): Promise<string | null> {
  if (isDemoMode || !partnerId) {
    return null;
  }

  try {
    const { data, error } = await db.profiles.get(partnerId);

    if (error || !data) {
      console.error('[Push] Error getting partner push token:', error);
      return null;
    }

    return (data as { push_token?: string }).push_token || null;
  } catch (error) {
    console.error('[Push] Error getting partner push token:', error);
    return null;
  }
}

export type NotificationType =
  | 'mission_generated'
  | 'mission_reminder'
  | 'partner_message_waiting'
  | 'partner_message_written'
  | 'hourly_reminder'
  | 'couple_unpaired';

export interface SendNotificationParams {
  targetUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Notification message translations
const notificationMessages = {
  missionGenerated: {
    ko: {
      title: '오늘의 미션이 도착했어요!',
      body: (nickname: string) => `${nickname}님이 오늘의 미션을 생성했어요. 확인해보세요!`,
    },
    en: {
      title: "Today's mission has arrived!",
      body: (nickname: string) => `${nickname} has created today's mission. Check it out!`,
    },
    es: {
      title: '¡La misión de hoy ha llegado!',
      body: (nickname: string) => `${nickname} ha creado la misión de hoy. ¡Échale un vistazo!`,
    },
    'zh-TW': {
      title: '今日任務來了！',
      body: (nickname: string) => `${nickname}建立了今天的任務，快來看看吧！`,
    },
  },
  missionReminder: {
    ko: {
      title: '미션 완료까지 한 걸음!',
      bodyWithPartner: (nickname: string) => `${nickname}님이 메시지를 남겼어요. 당신의 메시지도 작성해주세요!`,
      bodyWithoutPartner: '서로에게 한마디를 작성해야 미션이 완료돼요!',
    },
    en: {
      title: 'One step to complete the mission!',
      bodyWithPartner: (nickname: string) => `${nickname} left a message. Please write your message too!`,
      bodyWithoutPartner: 'Write a message to each other to complete the mission!',
    },
    es: {
      title: '¡Un paso más para completar la misión!',
      bodyWithPartner: (nickname: string) => `${nickname} dejó un mensaje. ¡Escribe el tuyo también!`,
      bodyWithoutPartner: '¡Escríbanse un mensaje para completar la misión!',
    },
    'zh-TW': {
      title: '任務完成只差一步！',
      bodyWithPartner: (nickname: string) => `${nickname}留了訊息給你，也寫下你的訊息吧！`,
      bodyWithoutPartner: '互相寫下給對方的話就能完成任務！',
    },
  },
  scheduledReminder: {
    ko: {
      title: '오늘의 미션을 완료해보세요!',
      body: '아직 완료하지 않은 미션이 있어요. 연인과 함께 특별한 추억을 만들어보세요 💕',
    },
    en: {
      title: "Complete today's mission!",
      body: "You have an incomplete mission. Create special memories with your partner 💕",
    },
    es: {
      title: '¡Completa la misión de hoy!',
      body: 'Tienes una misión sin completar. Crea recuerdos especiales con tu pareja 💕',
    },
    'zh-TW': {
      title: '來完成今天的任務吧！',
      body: '還有未完成的任務喔，和另一半一起創造特別的回憶吧 💕',
    },
  },
  partnerMessageWritten: {
    ko: {
      title: '💌 서로에게 한마디가 도착했어요!',
      body: (nickname: string) => `${nickname}님이 메시지를 남겼어요. 지금 확인해보세요!`,
    },
    en: {
      title: '💌 A message from your partner!',
      body: (nickname: string) => `${nickname} left you a message. Check it out now!`,
    },
    es: {
      title: '💌 ¡Tienes un mensaje de tu pareja!',
      body: (nickname: string) => `${nickname} te dejó un mensaje. ¡Míralo ahora!`,
    },
    'zh-TW': {
      title: '💌 收到另一半的話了！',
      body: (nickname: string) => `${nickname}留了訊息給你，快去看看吧！`,
    },
  },
  hourlyReminder: {
    ko: {
      title: '⏰ 아직 미션이 기다리고 있어요!',
      body: '서로에게 한마디를 남겨 오늘의 미션을 완료해보세요 💕',
    },
    en: {
      title: "⏰ Your mission is waiting!",
      body: "Leave a message for each other to complete today's mission 💕",
    },
    es: {
      title: '⏰ ¡Tu misión te está esperando!',
      body: 'Déjense un mensaje para completar la misión de hoy 💕',
    },
    'zh-TW': {
      title: '⏰ 任務還在等你喔！',
      body: '互相留下訊息來完成今天的任務吧 💕',
    },
  },
} as const;

type SupportedLanguage = 'ko' | 'en' | 'es' | 'zh-TW';

/**
 * Send push notification via Supabase Edge Function
 */
export async function sendPushNotification(params: SendNotificationParams): Promise<boolean> {
  if (isDemoMode || !supabase) {
    console.log('[Push] Demo mode - skipping push notification');
    return false;
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        target_user_id: params.targetUserId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data || {},
      },
    });

    if (error) {
      console.error('[Push] Error sending notification:', error);
      return false;
    }

    console.log('[Push] Notification sent successfully:', data);
    return true;
  } catch (error) {
    console.error('[Push] Error sending notification:', error);
    return false;
  }
}

/**
 * Send mission generated notification to partner
 */
export async function notifyPartnerMissionGenerated(
  partnerId: string,
  generatorNickname: string,
  language: SupportedLanguage = 'ko'
): Promise<boolean> {
  const messages = notificationMessages.missionGenerated[language];
  return sendPushNotification({
    targetUserId: partnerId,
    type: 'mission_generated',
    title: messages.title,
    body: messages.body(generatorNickname),
    data: { screen: 'mission' },
  });
}

/**
 * Send mission reminder notification
 */
export async function notifyMissionReminder(
  userId: string,
  partnerNickname: string,
  hasPartnerWritten: boolean,
  language: SupportedLanguage = 'ko'
): Promise<boolean> {
  const messages = notificationMessages.missionReminder[language];
  const body = hasPartnerWritten
    ? messages.bodyWithPartner(partnerNickname)
    : messages.bodyWithoutPartner;

  return sendPushNotification({
    targetUserId: userId,
    type: 'mission_reminder',
    title: messages.title,
    body,
    data: { screen: 'mission' },
  });
}

/**
 * Send unpair notification to partner
 */
export async function notifyPartnerUnpaired(
  partnerId: string,
  partnerNickname: string,
  title: string,
  body: string
): Promise<boolean> {
  return sendPushNotification({
    targetUserId: partnerId,
    type: 'couple_unpaired',
    title,
    body,
    data: { screen: 'onboarding' },
  });
}

/**
 * Send notification when partner writes their message (한마디)
 */
export async function notifyPartnerMessageWritten(
  partnerId: string,
  writerNickname: string,
  language: SupportedLanguage = 'ko'
): Promise<boolean> {
  const messages = notificationMessages.partnerMessageWritten[language];
  return sendPushNotification({
    targetUserId: partnerId,
    type: 'partner_message_written',
    title: messages.title,
    body: messages.body(writerNickname),
    data: { screen: 'mission' },
  });
}

// Subscription type for when Notifications is available
type NotificationSubscription = { remove: () => void } | null;

/**
 * Add notification response listener
 */
export function addNotificationResponseListener(
  callback: (response: unknown) => void
): NotificationSubscription {
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add notification received listener (foreground)
 */
export function addNotificationReceivedListener(
  callback: (notification: unknown) => void
): NotificationSubscription {
  if (!Notifications) return null;
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Remove notification subscription
 */
export function removeNotificationSubscription(subscription: NotificationSubscription): void {
  if (subscription) {
    subscription.remove();
  }
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  if (!Notifications) return 0;
  return Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  if (!Notifications) return;
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}

// Scheduled notification identifiers
const MISSION_REMINDER_NOTIFICATION_ID = 'mission-reminder-scheduled';

/**
 * Schedule a local notification for mission reminder at a specific hour
 * Default: 8 PM (20:00)
 */
export async function scheduleMissionReminderNotification(
  hour: number = 20,
  language: SupportedLanguage = 'ko'
): Promise<string | null> {
  if (!Notifications) {
    console.log('[Push] Notifications not available - skipping scheduled notification');
    return null;
  }

  if (isDemoMode) {
    console.log('[Push] Demo mode - skipping scheduled notification');
    return null;
  }

  try {
    // Cancel any existing scheduled reminder first
    await cancelMissionReminderNotification();

    // Calculate trigger time for today at the specified hour
    const now = new Date();
    const triggerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);

    // If the time has already passed today, don't schedule
    if (triggerDate <= now) {
      console.log('[Push] Scheduled time has already passed for today - skipping');
      return null;
    }

    const messages = notificationMessages.scheduledReminder[language];
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: messages.title,
        body: messages.body,
        data: { screen: 'mission', type: 'mission_incomplete_reminder' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
      identifier: MISSION_REMINDER_NOTIFICATION_ID,
    });

    console.log('[Push] Mission reminder scheduled for', triggerDate.toLocaleTimeString(), 'ID:', identifier);
    return identifier;
  } catch (error) {
    console.error('[Push] Error scheduling mission reminder:', error);
    return null;
  }
}

/**
 * Cancel scheduled mission reminder notification
 */
export async function cancelMissionReminderNotification(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(MISSION_REMINDER_NOTIFICATION_ID);
    console.log('[Push] Cancelled scheduled mission reminder');
  } catch (error) {
    // Ignore errors - notification might not exist
  }
}

// Hourly reminder notification identifiers
const HOURLY_REMINDER_PREFIX = 'hourly-reminder-';
const MAX_HOURLY_REMINDERS = 12; // Limit to 12 hours of reminders

/**
 * Schedule hourly reminder notifications after photo upload
 * Schedules notifications for the next several hours until midnight
 */
export async function scheduleHourlyReminders(
  language: SupportedLanguage = 'ko'
): Promise<string[]> {
  if (!Notifications) {
    console.log('[Push] Notifications not available - skipping hourly reminders');
    return [];
  }

  if (isDemoMode) {
    console.log('[Push] Demo mode - skipping hourly reminders');
    return [];
  }

  try {
    // Cancel any existing hourly reminders first
    await cancelHourlyReminders();

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const scheduledIds: string[] = [];

    const messages = notificationMessages.hourlyReminder[language];

    // Schedule reminders for the next several hours
    // Start from the next hour, end before midnight (23:00)
    for (let i = 1; i <= MAX_HOURLY_REMINDERS; i++) {
      const reminderHour = currentHour + i;

      // Don't schedule past 23:00 (11 PM) - let people sleep!
      if (reminderHour >= 23) break;

      // Calculate trigger time
      const triggerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), reminderHour, 0, 0);

      const identifier = `${HOURLY_REMINDER_PREFIX}${i}`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: messages.title,
          body: messages.body,
          data: { screen: 'mission', type: 'hourly_reminder' },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
        identifier,
      });

      scheduledIds.push(identifier);
      console.log('[Push] Hourly reminder scheduled for', triggerDate.toLocaleTimeString());
    }

    console.log('[Push] Scheduled', scheduledIds.length, 'hourly reminders');
    return scheduledIds;
  } catch (error) {
    console.error('[Push] Error scheduling hourly reminders:', error);
    return [];
  }
}

/**
 * Cancel all hourly reminder notifications
 */
export async function cancelHourlyReminders(): Promise<void> {
  if (!Notifications) return;

  try {
    for (let i = 1; i <= MAX_HOURLY_REMINDERS; i++) {
      const identifier = `${HOURLY_REMINDER_PREFIX}${i}`;
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch {
        // Ignore errors - notification might not exist
      }
    }
    console.log('[Push] Cancelled hourly reminders');
  } catch (error) {
    console.error('[Push] Error cancelling hourly reminders:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Push] Cancelled all scheduled notifications');
  } catch (error) {
    console.error('[Push] Error cancelling scheduled notifications:', error);
  }
}

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getScheduledNotifications(): Promise<unknown[]> {
  if (!Notifications) return [];
  return Notifications.getAllScheduledNotificationsAsync();
}
