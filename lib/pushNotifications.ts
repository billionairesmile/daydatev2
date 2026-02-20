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
 * Request notification permission using native OS dialog
 * Shows the system permission dialog (like location permission)
 * Returns true if permission was granted, false otherwise
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) {
    console.log('[Push] Notifications not available (running in Expo Go)');
    return false;
  }

  try {
    // Check if already granted
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return true;
    }

    // Request permission - this shows the native OS dialog
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[Push] Error requesting permission:', error);
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
      // Log detailed error info for debugging
      console.error('[Push] Error saving push token:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
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
      // Log detailed error info for debugging
      console.error('[Push] Error removing push token:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
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
  | 'partner_message_written'
  | 'couple_unpaired'
  | 'new_plan'
  | 'plan_booked'
  | 'plan_cancelled';

export interface SendNotificationParams {
  targetUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Notification message translations
const notificationMessages = {
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
    ja: {
      title: '💌 お互いへのひとことが届きました！',
      body: (nickname: string) => `${nickname}さんがメッセージを残しました。今すぐ確認してね！`,
    },
  },
  coupleUnpaired: {
    ko: {
      title: '💔 페어링이 해제되었어요',
      body: (nickname: string) => `${nickname}님이 페어링을 해제했어요.`,
    },
    en: {
      title: '💔 Pairing disconnected',
      body: (nickname: string) => `${nickname} has disconnected the pairing.`,
    },
    es: {
      title: '💔 Emparejamiento desconectado',
      body: (nickname: string) => `${nickname} ha desconectado el emparejamiento.`,
    },
    'zh-TW': {
      title: '💔 配對已解除',
      body: (nickname: string) => `${nickname}已解除配對。`,
    },
    ja: {
      title: '💔 ペアリングが解除されました',
      body: (nickname: string) => `${nickname}さんがペアリングを解除しました。`,
    },
  },
} as const;

type SupportedLanguage = 'ko' | 'en' | 'es' | 'zh-TW' | 'ja';

/**
 * Get user's language preference from database
 * This is used to send push notifications in the recipient's language
 */
async function getUserLanguage(userId: string): Promise<SupportedLanguage> {
  if (isDemoMode || !supabase) {
    console.log('[Push] getUserLanguage: Demo mode or no supabase, defaulting to ko');
    return 'ko';
  }

  try {
    console.log('[Push] getUserLanguage: Fetching language for user:', userId);
    const { data, error } = await db.profiles.get(userId);
    if (error || !data) {
      console.log('[Push] getUserLanguage: Could not fetch profile, using default ko. Error:', error?.message);
      return 'ko';
    }

    const language = (data as { language?: string }).language;
    console.log('[Push] getUserLanguage: User', userId, 'has language:', language);

    if (language && ['ko', 'en', 'es', 'zh-TW', 'ja'].includes(language)) {
      console.log('[Push] getUserLanguage: Using language from DB:', language);
      return language as SupportedLanguage;
    }

    console.log('[Push] getUserLanguage: Invalid or missing language, defaulting to ko');
    return 'ko';
  } catch (e) {
    console.error('[Push] getUserLanguage: Error fetching user language:', e);
    return 'ko';
  }
}

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
 * Send unpair notification to partner
 * Uses the recipient's language preference from the database
 */
export async function notifyPartnerUnpaired(
  partnerId: string,
  unpairedByNickname: string,
  _title?: string, // Deprecated: translations are now used
  _body?: string   // Deprecated: translations are now used
): Promise<boolean> {
  // Fetch the recipient's language preference
  const recipientLanguage = await getUserLanguage(partnerId);
  const messages = notificationMessages.coupleUnpaired[recipientLanguage];
  return sendPushNotification({
    targetUserId: partnerId,
    type: 'couple_unpaired',
    title: messages.title,
    body: messages.body(unpairedByNickname),
    data: { screen: 'onboarding' },
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


// Hourly reminder notification identifiers
const HOURLY_REMINDER_PREFIX = 'hourly-reminder-';
const MAX_HOURLY_REMINDERS = 12; // Limit to 12 hours of reminders

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
