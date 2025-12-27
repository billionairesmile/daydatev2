import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores';
import {
  registerForPushNotifications,
  savePushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  removeNotificationSubscription,
} from '@/lib/pushNotifications';
import { isDemoMode } from '@/lib/supabase';

// Subscription type that matches the one from pushNotifications.ts
type NotificationSubscription = { remove: () => void } | null;

interface UsePushNotificationsOptions {
  onNotificationReceived?: (notification: unknown) => void;
  onNotificationResponse?: (data: Record<string, unknown>) => void;
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const router = useRouter();
  const { user, isOnboardingComplete } = useAuthStore();
  const notificationReceivedRef = useRef<NotificationSubscription>(null);
  const notificationResponseRef = useRef<NotificationSubscription>(null);
  const isRegistered = useRef(false);

  // Register for push notifications
  const registerPushNotifications = useCallback(async () => {
    if (isDemoMode || !user?.id || isRegistered.current) {
      return;
    }

    try {
      const result = await registerForPushNotifications();

      if (result.success && result.token) {
        const saved = await savePushToken(user.id, result.token);
        if (saved) {
          isRegistered.current = true;
          console.log('[usePushNotifications] Registration complete');
        }
      }
    } catch (error) {
      console.error('[usePushNotifications] Registration error:', error);
    }
  }, [user?.id]);

  // Handle notification response (user tapped on notification)
  const handleNotificationResponse = useCallback(
    (response: unknown) => {
      // Type-safe access to notification response data
      const typedResponse = response as {
        notification?: {
          request?: {
            content?: {
              data?: Record<string, unknown>;
            };
          };
        };
      };
      const data = typedResponse?.notification?.request?.content?.data || {};
      console.log('[usePushNotifications] Notification tapped:', data);

      // Custom handler
      if (options.onNotificationResponse) {
        options.onNotificationResponse(data);
        return;
      }

      // Default navigation based on data.screen
      if (data.screen === 'mission') {
        router.push('/(tabs)');
      } else if (data.screen === 'memories') {
        router.push('/(tabs)/memories');
      }
    },
    [router, options.onNotificationResponse]
  );

  // Handle notification received in foreground
  const handleNotificationReceived = useCallback(
    (notification: unknown) => {
      // Type-safe access to notification data
      const typedNotification = notification as {
        request?: {
          content?: unknown;
        };
      };
      console.log('[usePushNotifications] Notification received:', typedNotification?.request?.content);

      if (options.onNotificationReceived) {
        options.onNotificationReceived(notification);
      }
    },
    [options.onNotificationReceived]
  );

  // Register on mount when user is authenticated and onboarding is complete
  useEffect(() => {
    if (isOnboardingComplete && user?.id) {
      registerPushNotifications();
    }
  }, [isOnboardingComplete, user?.id, registerPushNotifications]);

  // Set up notification listeners
  useEffect(() => {
    if (isDemoMode) return;

    // Listen for notifications received in foreground
    notificationReceivedRef.current = addNotificationReceivedListener(handleNotificationReceived);

    // Listen for notification taps
    notificationResponseRef.current = addNotificationResponseListener(handleNotificationResponse);

    return () => {
      if (notificationReceivedRef.current) {
        removeNotificationSubscription(notificationReceivedRef.current);
      }
      if (notificationResponseRef.current) {
        removeNotificationSubscription(notificationResponseRef.current);
      }
    };
  }, [handleNotificationReceived, handleNotificationResponse]);

  return {
    registerPushNotifications,
    isRegistered: isRegistered.current,
  };
}

export default usePushNotifications;
