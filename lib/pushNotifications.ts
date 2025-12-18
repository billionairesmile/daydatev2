import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { db, supabase, isDemoMode } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotifications(): Promise<PushNotificationResult> {
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
  | 'couple_unpaired';

export interface SendNotificationParams {
  targetUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
 * Send mission generated notification to partner
 */
export async function notifyPartnerMissionGenerated(
  partnerId: string,
  generatorNickname: string
): Promise<boolean> {
  return sendPushNotification({
    targetUserId: partnerId,
    type: 'mission_generated',
    title: '오늘의 미션이 도착했어요!',
    body: `${generatorNickname}님이 오늘의 미션을 생성했어요. 확인해보세요!`,
    data: { screen: 'mission' },
  });
}

/**
 * Send mission reminder notification
 */
export async function notifyMissionReminder(
  userId: string,
  partnerNickname: string,
  hasPartnerWritten: boolean
): Promise<boolean> {
  const body = hasPartnerWritten
    ? `${partnerNickname}님이 메시지를 남겼어요. 당신의 메시지도 작성해주세요!`
    : '서로에게 한마디를 작성해야 미션이 완료돼요!';

  return sendPushNotification({
    targetUserId: userId,
    type: 'mission_reminder',
    title: '미션 완료까지 한 걸음!',
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
 * Add notification response listener
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add notification received listener (foreground)
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Remove notification subscription
 */
export function removeNotificationSubscription(subscription: Notifications.Subscription): void {
  subscription.remove();
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}

// Scheduled notification identifiers
const MISSION_REMINDER_NOTIFICATION_ID = 'mission-reminder-scheduled';

/**
 * Schedule a local notification for mission reminder at a specific hour
 * Default: 8 PM (20:00)
 */
export async function scheduleMissionReminderNotification(hour: number = 20): Promise<string | null> {
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

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '오늘의 미션을 완료해보세요!',
        body: '아직 완료하지 않은 미션이 있어요. 연인과 함께 특별한 추억을 만들어보세요 💕',
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
  try {
    await Notifications.cancelScheduledNotificationAsync(MISSION_REMINDER_NOTIFICATION_ID);
    console.log('[Push] Cancelled scheduled mission reminder');
  } catch (error) {
    // Ignore errors - notification might not exist
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
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
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}
