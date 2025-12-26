import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { JustMeAgainDownHere_400Regular } from '@expo-google-fonts/just-me-again-down-here';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, AppState, AppStateStatus, Alert } from 'react-native';
import 'react-native-reanimated';

// Initialize i18n (must be imported before any component that uses translations)
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';

import { useAuthStore, useOnboardingStore, useTimezoneStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { BackgroundProvider, useBackground } from '@/contexts';
import { preloadCharacterAssets } from '@/utils';
import { db, isDemoMode, supabase } from '@/lib/supabase';
import { updateUserLocationInDB, checkLocationPermission } from '@/lib/locationUtils';
import { initializeNetworkMonitoring, subscribeToNetwork } from '@/lib/useNetwork';
import { offlineQueue } from '@/lib/offlineQueue';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// Type for couple data from DB (includes timezone column)
interface CoupleDbRow {
  id: string;
  user1_id: string;
  user2_id?: string;
  dating_start_date?: string;
  wedding_date?: string;
  timezone?: string;
  status?: 'pending' | 'active' | 'disconnected';
  disconnected_at?: string;
  disconnected_by?: string;
  disconnect_reason?: 'unpaired' | 'account_deleted';
}

// Parse date string as local date (not UTC) to avoid timezone issues
// "1990-01-03" should be January 3rd in local timezone, not UTC
// Handles both simple date strings and ISO timestamps
const parseDateAsLocal = (dateString: string): Date => {
  // If it's an ISO timestamp (contains T), parse as Date first to get correct local time
  // e.g., "1990-01-02T15:00:00.000Z" represents Jan 3 00:00 in KST (UTC+9)
  if (dateString.includes('T')) {
    const d = new Date(dateString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // If it's a simple date string like "1990-01-03", parse as local
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Safe SplashScreen singleton to prevent multiple hide calls
let splashScreenHidden = false;
let splashScreenPrevented = false;

const safeSplashScreen = {
  preventAutoHide: async () => {
    if (splashScreenPrevented) return;
    try {
      await SplashScreen.preventAutoHideAsync();
      splashScreenPrevented = true;
    } catch {
      // Silently ignore - splash screen may not be available
    }
  },
  hide: async () => {
    if (splashScreenHidden || !splashScreenPrevented) return;
    splashScreenHidden = true;
    try {
      await SplashScreen.hideAsync();
    } catch {
      // Silently ignore - splash screen may already be hidden or not registered
    }
  },
};

// Prevent the splash screen from auto-hiding before asset loading is complete
safeSplashScreen.preventAutoHide();

export default function RootLayout() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Jua: Jua_400Regular,
    JustMeAgainDownHere: JustMeAgainDownHere_400Regular,
  });

  // Preload character assets for ransom text
  useEffect(() => {
    preloadCharacterAssets().then(() => {
      setAssetsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && assetsLoaded && backgroundLoaded) {
      // Add minimum display time for splash screen (1.5 seconds)
      const timer = setTimeout(() => {
        safeSplashScreen.hide();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded, assetsLoaded, backgroundLoaded]);

  if (!fontsLoaded || !assetsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <BackgroundProvider>
        <BackgroundLoadedHandler setBackgroundLoaded={setBackgroundLoaded} />
        <RootLayoutNav />
      </BackgroundProvider>
    </GestureHandlerRootView>
  );
}

// Helper component to notify when background is loaded
function BackgroundLoadedHandler({ setBackgroundLoaded }: { setBackgroundLoaded: (loaded: boolean) => void }) {
  const { isLoaded } = useBackground();

  useEffect(() => {
    if (isLoaded) {
      setBackgroundLoaded(true);
    }
  }, [isLoaded, setBackgroundLoaded]);

  return null;
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation();
  const { isAuthenticated, isOnboardingComplete, setIsOnboardingComplete, couple, user, setCouple, setPartner, partner } = useAuthStore();
  const { initializeSync, cleanup: cleanupSync, processPendingOperations, loadMissionProgress, loadSharedMissions } = useCoupleSyncStore();
  const { setStep: setOnboardingStep, updateData: updateOnboardingData } = useOnboardingStore();
  const { syncFromCouple } = useTimezoneStore();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const appState = useRef(AppState.currentState);
  const lastFetchTime = useRef<number>(0);

  // Initialize push notifications
  usePushNotifications();

  // Initialize network monitoring and handle reconnection sync
  useEffect(() => {
    // Initialize network monitoring on app start
    initializeNetworkMonitoring();

    // Subscribe to network status changes for sync-on-reconnect
    const unsubscribe = subscribeToNetwork(async (isOnline) => {
      if (isOnline && offlineQueue.hasPendingOperations()) {
        console.log('[Layout] Network reconnected - processing pending operations');
        await processPendingOperations();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [processPendingOperations]);

  // Reusable function to fetch couple and partner data
  const fetchCoupleAndPartnerData = useCallback(async (forceRefresh = false) => {
    console.log('[Layout] fetchCoupleAndPartnerData called:', {
      isOnboardingComplete,
      coupleId: couple?.id,
      userId: user?.id,
      isDemoMode,
      forceRefresh,
    });

    if (!isOnboardingComplete || !couple?.id || !user?.id || isDemoMode) {
      console.log('[Layout] fetchCoupleAndPartnerData early return - conditions not met');
      return;
    }

    // Throttle fetches to at most once every 5 seconds (unless force refresh)
    const now = Date.now();
    if (!forceRefresh && now - lastFetchTime.current < 5000) {
      console.log('[Layout] fetchCoupleAndPartnerData throttled');
      return;
    }
    lastFetchTime.current = now;

    try {
      // Fetch latest couple data from DB
      console.log('[Layout] Fetching couple data for id:', couple.id);
      const { data, error: coupleError } = await db.couples.get(couple.id);
      const coupleData = data as CoupleDbRow | null;
      console.log('[Layout] Couple data fetched:', { coupleData, coupleError });

      if (coupleError) {
        console.error('Error fetching couple:', coupleError);
        return;
      }

      // Couple record was deleted (partner deleted their account)
      if (!coupleData) {
        console.log('[Layout] Couple record not found - partner may have deleted their account');

        // Show alert FIRST, then handle state changes on confirm
        // This prevents navigation from happening before alert is shown
        Alert.alert(
          t('settings.unpair.partnerDeletedAccountTitle'),
          t('settings.unpair.partnerDeletedAccountMessage'),
          [
            {
              text: t('common.confirm'),
              onPress: async () => {
                // Cleanup realtime subscriptions
                cleanupSync();

                // Clear couple and partner from local state
                setCouple(null);
                setPartner(null);

                // Delete any existing pending pairing codes for this user
                // This ensures a fresh code with full 24-hour timer will be created
                if (user?.id) {
                  console.log('[Layout] Deleting pending pairing codes for user:', user.id);
                  await db.pairingCodes.deleteByCreatorId(user.id);
                }

                // Set onboarding incomplete and go directly to pairing screen
                setIsOnboardingComplete(false);
                setOnboardingStep('pairing');
                // Reset all pairing state so user can pair with a new partner
                // Clear anniversaryDate to prevent old date from being applied to new couple
                updateOnboardingData({
                  isPairingConnected: false,
                  isCreatingCode: true,
                  pairingCode: '', // Clear any previously entered code
                  anniversaryDate: null, // Clear old anniversary date
                  relationshipType: 'dating', // Reset relationship type
                });
                // Navigation is handled by the useEffect that watches isOnboardingComplete
                // Don't navigate here to avoid duplicate navigation
              },
            },
          ],
          { cancelable: false } // Prevent dismissing by tapping outside
        );
        return;
      }

      // Note: disconnect_reason being set while status is 'active' is EXPECTED during reconnection flow
      // It's used as a flag for creator's realtime handler to detect reconnection
      // The creator's handler will clear it after detection - don't clear it here

      // Check if couple was disconnected (soft delete from unpair)
      console.log('[Layout] Checking couple status:', coupleData?.status);
      if (coupleData && coupleData.status === 'disconnected') {
        console.log('[Layout] Couple is disconnected - partner unpaired, showing alert');

        // Get disconnected_by to show appropriate message
        const wasDisconnectedByPartner = coupleData.disconnected_by && coupleData.disconnected_by !== user?.id;

        Alert.alert(
          wasDisconnectedByPartner
            ? t('settings.unpair.partnerDisconnectedTitle')
            : t('settings.unpair.partnerDeletedAccountTitle'),
          wasDisconnectedByPartner
            ? t('settings.unpair.partnerDisconnectedMessage')
            : t('settings.unpair.partnerDeletedAccountMessage'),
          [
            {
              text: t('common.confirm'),
              onPress: async () => {
                // Cleanup realtime subscriptions
                cleanupSync();

                // Clear couple and partner from local state
                setCouple(null);
                setPartner(null);

                // Delete any existing pending pairing codes for this user
                if (user?.id) {
                  console.log('[Layout] Deleting pending pairing codes for user:', user.id);
                  await db.pairingCodes.deleteByCreatorId(user.id);
                }

                // Set onboarding incomplete and go directly to pairing screen
                setIsOnboardingComplete(false);
                setOnboardingStep('pairing');
                // Clear anniversaryDate to prevent old date from being applied to new couple
                updateOnboardingData({
                  isPairingConnected: false,
                  isCreatingCode: true,
                  pairingCode: '',
                  anniversaryDate: null, // Clear old anniversary date
                  relationshipType: 'dating', // Reset relationship type
                });
                // Navigation is handled by the useEffect that watches isOnboardingComplete
                // Don't navigate here to avoid duplicate navigation
              },
            },
          ],
          { cancelable: false }
        );
        return;
      }

      if (coupleData) {
        // Determine relationship type from wedding_date
        const relationshipType = coupleData.wedding_date ? 'married' : 'dating';

        // Update couple in authStore with DB data
        // IMPORTANT: Do NOT fall back to old couple values for dates - always use DB as source of truth
        // This prevents old anniversary dates from previous relationships from appearing
        setCouple({
          ...couple,
          user1Id: coupleData.user1_id,
          user2Id: coupleData.user2_id,
          anniversaryDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
          datingStartDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
          weddingDate: coupleData.wedding_date ? parseDateAsLocal(coupleData.wedding_date) : undefined,
          relationshipType,
          timezone: coupleData.timezone || 'auto',
          status: coupleData.status || 'active',
        });

        // Sync timezone from couple record
        syncFromCouple(coupleData.timezone);

        // Determine partner's user_id
        const partnerId = coupleData.user1_id === user.id
          ? coupleData.user2_id
          : coupleData.user1_id;

        // Fetch partner profile if partner exists
        if (partnerId) {
          const { data: partnerData, error: partnerError } = await db.profiles.get(partnerId);

          if (!partnerError && partnerData) {
            // Extract birthDateCalendarType from preferences
            const partnerPreferences = partnerData.preferences || {};
            const birthDateCalendarType = (partnerPreferences as Record<string, unknown>).birthDateCalendarType as 'solar' | 'lunar' | undefined;

            setPartner({
              id: partnerData.id,
              email: partnerData.email || '',
              nickname: partnerData.nickname || '',
              inviteCode: partnerData.invite_code || '',
              preferences: partnerPreferences,
              birthDate: partnerData.birth_date ? parseDateAsLocal(partnerData.birth_date) : undefined,
              birthDateCalendarType: birthDateCalendarType || 'solar',
              createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching couple/partner data:', error);
    }
  }, [isOnboardingComplete, couple, user?.id, setCouple, setPartner, cleanupSync, setIsOnboardingComplete, setOnboardingStep, updateOnboardingData, syncFromCouple, t, router]);

  // Update user location in DB (silently, no alerts)
  const updateUserLocation = useCallback(async () => {
    if (!isOnboardingComplete || !user?.id || isDemoMode) return;

    try {
      const hasPermission = await checkLocationPermission();
      if (hasPermission) {
        await updateUserLocationInDB(user.id);
        console.log('[Location] User location updated on app start/foreground');
      }
    } catch (error) {
      console.error('[Location] Error updating user location:', error);
    }
  }, [isOnboardingComplete, user?.id]);

  // Fetch couple and partner data when onboarding is complete
  useEffect(() => {
    fetchCoupleAndPartnerData();
  }, [fetchCoupleAndPartnerData]);

  // Update user location when onboarding is complete
  useEffect(() => {
    updateUserLocation();
  }, [updateUserLocation]);

  // Refresh partner data, location, and mission progress when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground, refresh partner data, location, and mission progress
        fetchCoupleAndPartnerData();
        updateUserLocation();
        // Refresh mission data to sync any changes from partner
        loadMissionProgress();
        loadSharedMissions();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchCoupleAndPartnerData, updateUserLocation, loadMissionProgress, loadSharedMissions]);

  // Also refresh if partner data is incomplete (partner might have completed onboarding)
  useEffect(() => {
    if (isOnboardingComplete && partner && !partner.nickname) {
      // Partner profile exists but nickname is missing, poll until we get it
      const pollInterval = setInterval(() => {
        fetchCoupleAndPartnerData(true); // Force refresh
      }, 3000);

      // Also try immediately
      fetchCoupleAndPartnerData(true);

      return () => clearInterval(pollInterval);
    }
  }, [isOnboardingComplete, partner?.nickname, fetchCoupleAndPartnerData]);

  // Initialize couple sync when user and couple are available
  useEffect(() => {
    if (couple?.id && user?.id) {
      initializeSync(couple.id, user.id);
    }

    return () => {
      cleanupSync();
    };
  }, [couple?.id, user?.id, initializeSync, cleanupSync]);

  // Subscribe to partner profile changes for real-time sync
  useEffect(() => {
    if (!isOnboardingComplete || !couple?.id || !user?.id || isDemoMode || !supabase) return;

    // Determine partner's user_id
    const partnerId = couple.user1Id === user.id ? couple.user2Id : couple.user1Id;
    if (!partnerId) {
      console.log('[Layout] Partner subscription skipped - no partnerId yet');
      return;
    }

    console.log('[Layout] Setting up partner profile subscription for partnerId:', partnerId);

    // Fetch partner data immediately when subscription is set up
    // This ensures we have the latest data even if no UPDATE event has been received yet
    (async () => {
      try {
        const { data: partnerData, error } = await db.profiles.get(partnerId);
        if (!error && partnerData) {
          const partnerPreferences = partnerData.preferences || {};
          const birthDateCalendarType = (partnerPreferences as Record<string, unknown>).birthDateCalendarType as 'solar' | 'lunar' | undefined;

          console.log('[Layout] Initial partner fetch:', {
            nickname: partnerData.nickname,
            birthDate: partnerData.birth_date,
          });

          setPartner({
            id: partnerData.id,
            email: partnerData.email || '',
            nickname: partnerData.nickname || '',
            inviteCode: partnerData.invite_code || '',
            preferences: partnerPreferences,
            birthDate: partnerData.birth_date ? parseDateAsLocal(partnerData.birth_date) : undefined,
            birthDateCalendarType: birthDateCalendarType || 'solar',
            createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
          });
        }
      } catch (err) {
        console.error('[Layout] Error fetching partner data:', err);
      }
    })();

    // Subscribe to partner's profile changes
    const channel = supabase
      .channel(`partner-profile-${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${partnerId}`,
        },
        (payload) => {
          console.log('[Layout] Partner profile realtime update received:', payload);
          // Partner profile was updated, refresh the data
          const partnerData = payload.new as {
            id: string;
            email?: string;
            nickname?: string;
            invite_code?: string;
            preferences?: Record<string, unknown>;
            birth_date?: string;
            created_at?: string;
          };

          if (partnerData) {
            const prefs = partnerData.preferences || {};
            const birthDateCalendarType = prefs.birthDateCalendarType as 'solar' | 'lunar' | undefined;

            console.log('[Layout] Updating partner state with:', {
              nickname: partnerData.nickname,
              birthDate: partnerData.birth_date,
              birthDateCalendarType,
            });

            setPartner({
              id: partnerData.id,
              email: partnerData.email || '',
              nickname: partnerData.nickname || '',
              inviteCode: partnerData.invite_code || '',
              preferences: prefs as unknown as import('@/types').UserPreferences,
              birthDate: partnerData.birth_date ? parseDateAsLocal(partnerData.birth_date) : undefined,
              birthDateCalendarType: birthDateCalendarType || 'solar',
              createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[Layout] Partner profile subscription status:', status);
      });

    return () => {
      console.log('[Layout] Cleaning up partner profile subscription for partnerId:', partnerId);
      supabase?.removeChannel(channel);
    };
  }, [isOnboardingComplete, couple?.id, couple?.user1Id, couple?.user2Id, user?.id, setPartner]);

  // Subscribe to couple data changes for real-time sync (anniversary updates + disconnect detection)
  useEffect(() => {
    if (!isOnboardingComplete || !couple?.id || isDemoMode || !supabase) return;

    console.log('[Layout] Setting up couple subscription for coupleId:', couple.id);

    const channel = supabase
      .channel(`couple-${couple.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'couples',
          filter: `id=eq.${couple.id}`,
        },
        async (payload) => {
          console.log('[Layout] Couple realtime update received:', payload);
          // Couple data was updated, refresh the data
          const coupleData = payload.new as CoupleDbRow;

          if (coupleData) {
            // Check if couple was disconnected by partner
            if (coupleData.status === 'disconnected') {
              // Check if disconnected by partner (not by self)
              const disconnectedByPartner = coupleData.disconnected_by && coupleData.disconnected_by !== user?.id;
              console.log('[Layout] Couple disconnected', { disconnectedByPartner, disconnectedBy: coupleData.disconnected_by, userId: user?.id });

              // If disconnect was initiated by current user (e.g., during account deletion or self-unpair),
              // don't redirect to pairing here - let the initiating flow handle navigation
              // This prevents brief flash of pairing screen during account deletion
              if (!disconnectedByPartner) {
                console.log('[Layout] Disconnect initiated by self, skipping pairing redirect');
                return;
              }

              // Cleanup realtime subscriptions
              cleanupSync();

              // Clear couple and partner from local state
              setCouple(null);
              setPartner(null);

              // Set onboarding incomplete and go directly to pairing screen
              setIsOnboardingComplete(false);
              setOnboardingStep('pairing');
              // Reset all pairing state so user can pair with a new partner
              // Clear anniversaryDate to prevent old date from being applied to new couple
              updateOnboardingData({
                isPairingConnected: false,
                isCreatingCode: true,
                pairingCode: '', // Clear any previously entered code
                anniversaryDate: null, // Clear old anniversary date
                relationshipType: 'dating', // Reset relationship type
              });

              // Show alert if disconnected by partner (always true at this point since we returned above otherwise)
              if (disconnectedByPartner) {
                // Check disconnect_reason to determine the appropriate message
                console.log('[Layout] Partner disconnected, reason:', coupleData.disconnect_reason);

                if (coupleData.disconnect_reason === 'account_deleted') {
                  // Partner deleted their account - no reconnection possible
                  Alert.alert(
                    t('settings.unpair.partnerDeletedAccountTitle'),
                    t('settings.unpair.partnerDeletedAccountMessage'),
                    [
                      {
                        text: t('common.confirm'),
                        // Navigation is handled by the useEffect that watches isOnboardingComplete
                      },
                    ]
                  );
                } else {
                  // Partner unpaired but still has account - can reconnect within 30 days
                  Alert.alert(
                    t('settings.unpair.partnerDisconnectedTitle'),
                    t('settings.unpair.partnerDisconnectedMessage'),
                    [
                      {
                        text: t('common.confirm'),
                        // Navigation is handled by the useEffect that watches isOnboardingComplete
                      },
                    ]
                  );
                }
              }
              // Navigation is handled by the useEffect that watches isOnboardingComplete
              // Don't navigate here to avoid duplicate navigation
              return;
            }

            const relationshipType = coupleData.wedding_date ? 'married' : 'dating';

            // Get latest couple from store to avoid stale closure
            const currentCouple = useAuthStore.getState().couple;
            if (currentCouple) {
              console.log('[Layout] Updating couple state with:', {
                user2Id: coupleData.user2_id,
                datingStartDate: coupleData.dating_start_date,
                weddingDate: coupleData.wedding_date,
                timezone: coupleData.timezone,
                status: coupleData.status,
              });

              // IMPORTANT: Do NOT fall back to old couple values for dates - always use DB as source of truth
              setCouple({
                ...currentCouple,
                user1Id: coupleData.user1_id,
                user2Id: coupleData.user2_id,
                anniversaryDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
                datingStartDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
                weddingDate: coupleData.wedding_date ? parseDateAsLocal(coupleData.wedding_date) : undefined,
                relationshipType,
                timezone: coupleData.timezone || 'auto',
                status: (coupleData.status as 'pending' | 'active') || 'active',
              });

              // Sync timezone when partner updates it
              useTimezoneStore.getState().syncFromCouple(coupleData.timezone);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Layout] Couple subscription status:', status);
      });

    return () => {
      console.log('[Layout] Cleaning up couple subscription for coupleId:', couple.id);
      supabase?.removeChannel(channel);
    };
  }, [isOnboardingComplete, couple?.id, setCouple, setPartner, setIsOnboardingComplete, cleanupSync, router, setOnboardingStep, updateOnboardingData]);

  // Wait for navigation to be ready before redirecting
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNavigationReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isNavigationReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    // If onboarding not complete and not in auth group, redirect to onboarding
    if (!isOnboardingComplete && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    }
    // If onboarding is complete and in auth group, redirect to tabs
    else if (isOnboardingComplete && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isNavigationReady, isOnboardingComplete]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="mission/[id]"
          options={{
            presentation: 'card',
            animation: 'fade',
            animationDuration: 150,
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
