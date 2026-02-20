import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { JustMeAgainDownHere_400Regular } from '@expo-google-fonts/just-me-again-down-here';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { MochiyPopOne_400Regular } from '@expo-google-fonts/mochiy-pop-one';
import { ChironGoRoundTC_400Regular } from '@expo-google-fonts/chiron-goround-tc';
import { PoetsenOne_400Regular } from '@expo-google-fonts/poetsen-one';
import { NanumPenScript_400Regular } from '@expo-google-fonts/nanum-pen-script';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { Lora_400Regular, Lora_500Medium, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { DoHyeon_400Regular } from '@expo-google-fonts/do-hyeon';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, AppState, AppStateStatus, Alert, Platform, View } from 'react-native';
import 'react-native-reanimated';

// Initialize i18n (must be imported before any component that uses translations)
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';

import { useAuthStore, useOnboardingStore, useTimezoneStore, useSubscriptionStore, useLanguageStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { usePlanStore } from '@/stores/planStore';
import { BackgroundProvider, useBackground } from '@/contexts';
import { db, isDemoMode, supabase } from '@/lib/supabase';
import { onAuthStateChange, signOut as supabaseSignOut } from '@/lib/socialAuth';
import { updateUserLocationInDB, checkLocationPermission } from '@/lib/locationUtils';
import { initializeNetworkMonitoring, subscribeToNetwork } from '@/lib/useNetwork';
import { offlineQueue } from '@/lib/offlineQueue';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useWidgetSync } from '@/hooks/useWidgetSync';
import { checkForUpdates } from '@/lib/versionCheck';

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
  heart_liked_by?: string;
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
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const authHydrated = useAuthStore((state) => state._hasHydrated);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Jua: Jua_400Regular,
    JustMeAgainDownHere: JustMeAgainDownHere_400Regular,
    BricolageGrotesque: BricolageGrotesque_800ExtraBold,
    MochiyPopOne: MochiyPopOne_400Regular,
    ChironGoRoundTC: ChironGoRoundTC_400Regular,
    PoetsenOne: PoetsenOne_400Regular,
    NanumPenScript: NanumPenScript_400Regular,
    Inter: Inter_400Regular,
    InterMedium: Inter_500Medium,
    InterSemiBold: Inter_600SemiBold,
    InterBold: Inter_700Bold,
    InterExtraBold: Inter_800ExtraBold,
    Anton: Anton_400Regular,
    Lora: Lora_400Regular,
    LoraMedium: Lora_500Medium,
    LoraSemiBold: Lora_600SemiBold,
    LoraBold: Lora_700Bold,
    InstrumentSerif: InstrumentSerif_400Regular,
    InstrumentSerifItalic: InstrumentSerif_400Regular_Italic,
    DoHyeon: DoHyeon_400Regular,
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  // Request location and notification permissions on first app launch
  useEffect(() => {
    const requestPermissionsOnFirstLaunch = async () => {
      try {
        const hasRequestedPermissions = await AsyncStorage.getItem('hasRequestedInitialPermissions');
        if (hasRequestedPermissions) {
          // Already requested before, skip
          return;
        }

        // Mark as requested before actually requesting (to prevent duplicate requests)
        await AsyncStorage.setItem('hasRequestedInitialPermissions', 'true');

        // Request location permission - this shows the native OS dialog
        await Location.requestForegroundPermissionsAsync();
        console.log('[Layout] Location permission requested on first launch');

        // Request push notification permission - this shows the native OS dialog
        // Import dynamically to avoid issues in Expo Go
        try {
          const { requestNotificationPermission } = await import('@/lib/pushNotifications');
          const granted = await requestNotificationPermission();
          console.log('[Layout] Notification permission requested on first launch, granted:', granted);
        } catch (notifError) {
          console.log('[Layout] Could not request notification permission:', notifError);
        }
      } catch (error) {
        console.error('[Layout] Error requesting permissions on first launch:', error);
      }
    };

    requestPermissionsOnFirstLaunch();
  }, []);

  useEffect(() => {
    // Include authHydrated to prevent flash of home screen before auth state is known
    if (fontsLoaded && backgroundLoaded && authHydrated) {
      // Add minimum display time for splash screen (1.5 seconds)
      const timer = setTimeout(() => {
        safeSplashScreen.hide();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [fontsLoaded, backgroundLoaded, authHydrated]);

  if (!fontsLoaded) {
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
  const { isAuthenticated, isOnboardingComplete, setIsOnboardingComplete, couple, user, setCouple, setPartner, partner, _hasHydrated: authHydrated } = useAuthStore();
  const { initializeSync, cleanup: cleanupSync, processPendingOperations, loadAlbums, loadTodos, loadMenstrualSettings } = useCoupleSyncStore();
  const { initializePlanSync, cleanup: cleanupPlanSync } = usePlanStore();
  const { setStep: setOnboardingStep, updateData: updateOnboardingData } = useOnboardingStore();
  const { syncFromCouple } = useTimezoneStore();
  const { initializeRevenueCat, loadFromDatabase, checkCouplePremium, setPartnerIsPremium, _hasHydrated: subscriptionHydrated } = useSubscriptionStore();
  const { syncLanguageToDatabase } = useLanguageStore();
  const appState = useRef(AppState.currentState);
  const lastFetchTime = useRef<number>(0);
  const subscriptionInitialized = useRef(false);
  const languageSynced = useRef(false);
  // Prevent duplicate disconnect alerts (push notification, realtime, and fetch can all trigger)
  const disconnectAlertShownRef = useRef(false);

  // Initialize push notifications
  usePushNotifications();

  // Sync widget data (iOS only)
  useWidgetSync();

  // Get signOut function from authStore
  const authSignOut = useAuthStore((state) => state.signOut);

  // Listen for Supabase auth state changes (session expiry, token refresh failures)
  useEffect(() => {
    if (isDemoMode || !supabase) return;

    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      console.log('[Layout] Auth state changed:', event, 'hasSession:', !!session);

      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        // If session is null after SIGNED_OUT or TOKEN_REFRESHED, user is logged out
        if (!session) {
          console.log('[Layout] Session is null - clearing local auth state');

          // Get current auth state to check if we need to clean up
          const { isAuthenticated, user: currentUser } = useAuthStore.getState();

          if (isAuthenticated || currentUser) {
            console.log('[Layout] Clearing stale auth state due to session expiry');

            // Cleanup realtime subscriptions
            cleanupSync();

            // Clear local auth state
            authSignOut();

            // Set onboarding incomplete to trigger navigation to login
            setIsOnboardingComplete(false);
          }
        }
      }

      // Handle refresh token errors
      if (event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        // Verify the session is still valid
        if (session?.user?.id) {
          const { user: currentUser, isAuthenticated } = useAuthStore.getState();

          // If we have a local user but it doesn't match the session, or session is invalid
          if (currentUser && currentUser.id !== session.user.id) {
            console.log('[Layout] Session user mismatch - clearing local state');
            cleanupSync();
            authSignOut();
            setIsOnboardingComplete(false);
          }
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [authSignOut, cleanupSync, setIsOnboardingComplete]);

  // Verify session on app startup (catches stale sessions from previous launches)
  useEffect(() => {
    if (isDemoMode || !supabase || !authHydrated) return;

    const verifyInitialSession = async () => {
      const { isAuthenticated, user: currentUser } = useAuthStore.getState();

      // Only verify if we think we're authenticated
      if (!isAuthenticated || !currentUser?.id) return;

      console.log('[Layout] Verifying initial session for user:', currentUser.id);

      try {
        const { data: { session }, error } = await supabase!.auth.getSession();

        if (error || !session) {
          console.log('[Layout] Initial session invalid:', error?.message || 'No session');
          // Session is invalid, clear local state
          cleanupSync();
          authSignOut();
          setIsOnboardingComplete(false);
        } else {
          console.log('[Layout] Initial session valid');
        }
      } catch (err) {
        console.error('[Layout] Initial session verification failed:', err);
        cleanupSync();
        authSignOut();
        setIsOnboardingComplete(false);
      }
    };

    verifyInitialSession();
  }, [authHydrated, authSignOut, cleanupSync, setIsOnboardingComplete]);

  // Check for app updates on startup
  useEffect(() => {
    if (!authHydrated) return;

    // Delay version check slightly to avoid blocking initial app load
    const timer = setTimeout(() => {
      checkForUpdates().catch((err) => {
        console.error('[Layout] Version check failed:', err);
      });
    }, 2000); // 2 second delay after auth hydration

    return () => clearTimeout(timer);
  }, [authHydrated]);

  // Initialize subscription/premium status when user is authenticated
  useEffect(() => {
    if (user?.id && subscriptionHydrated && !subscriptionInitialized.current) {
      subscriptionInitialized.current = true;
      console.log('[Layout] Initializing subscription for user:', user.id);
      initializeRevenueCat(user.id);
    }
  }, [user?.id, subscriptionHydrated, initializeRevenueCat]);

  // Sync user's language preference to database for push notification localization
  useEffect(() => {
    if (user?.id && !languageSynced.current && !isDemoMode) {
      languageSynced.current = true;
      console.log('[Layout] Syncing language to database for push notifications');
      syncLanguageToDatabase();
    }
  }, [user?.id, syncLanguageToDatabase]);

  // Check couple premium status to determine if partner has premium (for shared premium benefits)
  // Also subscribe to realtime changes in partner's subscription status AND couple premium status
  useEffect(() => {
    if (!couple?.id || !user?.id || isDemoMode || !supabase) {
      return;
    }

    const checkPartnerPremium = async () => {
      try {
        console.log('[Layout] Checking couple premium status for couple:', couple.id);
        const isCouplePremium = await checkCouplePremium(couple.id);
        // If the couple has premium but user doesn't, it means partner has premium
        // setPartnerIsPremium will update the state for ad removal and UI
        const { isPremium } = useSubscriptionStore.getState();
        if (isCouplePremium && !isPremium) {
          console.log('[Layout] Partner has premium - enabling shared premium benefits');
          setPartnerIsPremium(true);
        } else if (!isCouplePremium) {
          setPartnerIsPremium(false);
        }
      } catch (error) {
        console.error('[Layout] Error checking couple premium status:', error);
      }
    };

    // Initial check
    checkPartnerPremium();

    // Subscribe to realtime changes in partner's subscription status
    // This ensures premium status syncs between partners immediately
    const partnerId = couple.user1Id === user.id ? couple.user2Id : couple.user1Id;
    if (!partnerId) {
      console.log('[Layout] No partner ID found, skipping subscription sync');
      return;
    }

    console.log('[Layout] Setting up realtime subscription for partner premium:', partnerId);

    // Channel for partner's profile changes
    const profileChannel = supabase
      .channel(`partner_premium:${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${partnerId}`,
        },
        (payload) => {
          console.log('[Layout] Partner profile updated:', payload);
          const newProfile = payload.new as { subscription_plan?: string; subscription_expires_at?: string };

          // Check if partner became premium or lost premium
          const isPremiumPlan = newProfile.subscription_plan && newProfile.subscription_plan !== 'free';
          const hasValidExpiry = newProfile.subscription_expires_at && new Date(newProfile.subscription_expires_at) > new Date();
          const partnerHasPremium = isPremiumPlan && hasValidExpiry;

          const { isPremium: myPremium } = useSubscriptionStore.getState();

          if (partnerHasPremium && !myPremium) {
            console.log('[Layout] Partner gained premium - enabling shared benefits');
            setPartnerIsPremium(true);
          } else if (!partnerHasPremium) {
            console.log('[Layout] Partner lost premium - disabling shared benefits');
            setPartnerIsPremium(false);
          }
        }
      )
      .subscribe();

    // Channel for couple's is_premium changes (more reliable than profile subscription)
    // This handles cases where syncWithDatabase updates the couples table directly
    console.log('[Layout] Setting up realtime subscription for couple premium:', couple.id);
    const coupleChannel = supabase
      .channel(`couple_premium:${couple.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'couples',
          filter: `id=eq.${couple.id}`,
        },
        (payload) => {
          console.log('[Layout] Couple premium updated:', payload);
          const coupleData = payload.new as { is_premium?: boolean; premium_user_id?: string };

          const { isPremium: myPremium } = useSubscriptionStore.getState();

          // If couple has premium and it's not from this user, partner must have premium
          if (coupleData.is_premium && coupleData.premium_user_id !== user?.id && !myPremium) {
            console.log('[Layout] Couple gained premium from partner - enabling shared benefits');
            setPartnerIsPremium(true);
          } else if (!coupleData.is_premium) {
            console.log('[Layout] Couple lost premium - disabling shared benefits');
            setPartnerIsPremium(false);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[Layout] Cleaning up partner premium subscriptions');
      supabase?.removeChannel(profileChannel);
      supabase?.removeChannel(coupleChannel);
    };
  }, [couple?.id, couple?.user1Id, couple?.user2Id, user?.id, checkCouplePremium, setPartnerIsPremium]);

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

      // Sync couple timezone to timezoneStore (ensures both users use same timezone)
      if (coupleData?.timezone) {
        console.log('[Layout] Syncing couple timezone to local store:', coupleData.timezone);
        useTimezoneStore.getState().syncFromCouple(coupleData.timezone);
      }

      // Sync heart liked state to coupleSyncStore
      if (coupleData) {
        useCoupleSyncStore.setState({ heartLikedBy: coupleData.heart_liked_by || null });
      }

      // Couple record was deleted (partner deleted their account)
      if (!coupleData) {
        console.log('[Layout] Couple record not found - partner may have deleted their account');

        // Prevent duplicate alerts (push notification, realtime, and fetch can all trigger)
        if (disconnectAlertShownRef.current) {
          console.log('[Layout] Disconnect alert already shown, skipping duplicate');
          return;
        }
        disconnectAlertShownRef.current = true;

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
                  // Clear profile.couple_id in database (partner's unpair cleared theirs, we clear ours)
                  console.log('[Layout] Clearing profile couple_id for user:', user.id);
                  await db.profiles.update(user.id, { couple_id: null });
                }

                // IMPORTANT: Set onboarding step to pairing FIRST
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
                // Set onboarding incomplete - this triggers navigation via the navigation effect
                // DO NOT call router.replace here as it would cause duplicate navigation
                setIsOnboardingComplete(false);
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
        // Check if disconnected by self - if so, unpair.tsx already handled notification
        const wasDisconnectedBySelf = coupleData.disconnected_by === user?.id;
        if (wasDisconnectedBySelf) {
          console.log('[Layout] Couple disconnected by self, skipping alert (handled by unpair.tsx)');
          return;
        }

        console.log('[Layout] Couple is disconnected - partner unpaired, showing alert');

        // Prevent duplicate alerts (push notification, realtime, and fetch can all trigger)
        if (disconnectAlertShownRef.current) {
          console.log('[Layout] Disconnect alert already shown, skipping duplicate');
          return;
        }
        disconnectAlertShownRef.current = true;

        // Use disconnect_reason to show appropriate message (consistent with realtime handler)
        // disconnect_reason === 'account_deleted' means partner deleted their account
        // disconnect_reason === 'unpaired' (or null) means partner just unpaired
        const isAccountDeleted = coupleData.disconnect_reason === 'account_deleted';

        Alert.alert(
          isAccountDeleted
            ? t('settings.unpair.partnerDeletedAccountTitle')
            : t('settings.unpair.partnerDisconnectedTitle'),
          isAccountDeleted
            ? t('settings.unpair.partnerDeletedAccountMessage')
            : t('settings.unpair.partnerDisconnectedMessage'),
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
                  // Clear profile.couple_id in database (partner's unpair cleared theirs, we clear ours)
                  console.log('[Layout] Clearing profile couple_id for user:', user.id);
                  await db.profiles.update(user.id, { couple_id: null });
                }

                // IMPORTANT: Set onboarding step to pairing FIRST
                setOnboardingStep('pairing');
                // Clear anniversaryDate to prevent old date from being applied to new couple
                updateOnboardingData({
                  isPairingConnected: false,
                  isCreatingCode: true,
                  pairingCode: '',
                  anniversaryDate: null, // Clear old anniversary date
                  relationshipType: 'dating', // Reset relationship type
                });
                // Set onboarding incomplete - this triggers navigation via the navigation effect
                // DO NOT call router.replace here as it would cause duplicate navigation
                setIsOnboardingComplete(false);
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
              locationLatitude: partnerData.location_latitude,
              locationLongitude: partnerData.location_longitude,
              locationCity: partnerData.location_city,
              locationDistrict: partnerData.location_district,
              createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching couple/partner data:', error);
    }
  }, [isOnboardingComplete, couple, user?.id, setCouple, setPartner, cleanupSync, setIsOnboardingComplete, setOnboardingStep, updateOnboardingData, syncFromCouple, t]);

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

  // Verify session validity and refresh data when app comes to foreground
  const verifySessionAndRefresh = useCallback(async () => {
    // Skip if in demo mode or no supabase
    if (isDemoMode || !supabase) return;

    const { isAuthenticated, user: currentUser } = useAuthStore.getState();

    // Only verify if we think we're authenticated
    if (!isAuthenticated || !currentUser?.id) return;

    try {
      // Try to get the current session - this will fail if refresh token is invalid
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.log('[Layout] Session verification error:', error.message);
        // Session is invalid, clear local state
        cleanupSync();
        authSignOut();
        setIsOnboardingComplete(false);
        return;
      }

      if (!session) {
        console.log('[Layout] No session found during verification - clearing local state');
        cleanupSync();
        authSignOut();
        setIsOnboardingComplete(false);
        return;
      }

      // Session is valid, proceed with data refresh
      console.log('[Layout] Session verified, refreshing data...');
    } catch (err) {
      console.error('[Layout] Session verification failed:', err);
      // On any error, clear local state for safety
      cleanupSync();
      authSignOut();
      setIsOnboardingComplete(false);
    }
  }, [authSignOut, cleanupSync, setIsOnboardingComplete]);

  // Refresh partner data, location, albums, and subscription when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground - first verify session is still valid
        await verifySessionAndRefresh();

        // Then refresh all synced data
        await fetchCoupleAndPartnerData();
        updateUserLocation();
        // Refresh albums to sync any changes from partner
        loadAlbums();
        // Refresh calendar data (todos and menstrual settings) to sync any changes from partner
        loadTodos();
        loadMenstrualSettings();
        // Refresh subscription/premium status from database
        loadFromDatabase();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchCoupleAndPartnerData, updateUserLocation, loadAlbums, loadTodos, loadMenstrualSettings, loadFromDatabase, verifySessionAndRefresh]);

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

  // Reset disconnect alert ref when couple changes (new pairing or logout)
  useEffect(() => {
    if (couple?.id) {
      disconnectAlertShownRef.current = false;
    }
  }, [couple?.id]);

  // Initialize couple sync when user and couple are available
  useEffect(() => {
    if (couple?.id && user?.id) {
      initializeSync(couple.id, user.id);
      initializePlanSync(couple.id, user.id);
    }

    return () => {
      cleanupSync();
      cleanupPlanSync();
    };
  }, [couple?.id, user?.id, initializeSync, cleanupSync, initializePlanSync, cleanupPlanSync]);

  // Check premium status when couple is formed or changed (e.g., after pairing)
  useEffect(() => {
    if (!isOnboardingComplete || !couple?.id || isDemoMode) return;

    // Check if either partner has premium
    (async () => {
      console.log('[Layout] Checking couple premium status for coupleId:', couple.id);
      const hasPremium = await checkCouplePremium(couple.id);
      if (hasPremium) {
        console.log('[Layout] Couple has premium access');
        // Also refresh from database to get full subscription details
        loadFromDatabase();
      }
    })();
  }, [isOnboardingComplete, couple?.id, checkCouplePremium, loadFromDatabase]);

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
              // Get CURRENT user state - don't rely on closure which may be stale
              // This is critical for account deletion flow where user becomes null
              const currentUser = useAuthStore.getState().user;

              // If user is null/undefined, skip redirect - user is being logged out/deleted
              if (!currentUser?.id) {
                console.log('[Layout] User is null/undefined, skipping disconnect redirect');
                return;
              }

              // Check if disconnected by partner (not by self)
              const disconnectedByPartner = coupleData.disconnected_by && coupleData.disconnected_by !== currentUser.id;
              console.log('[Layout] Couple disconnected', { disconnectedByPartner, disconnectedBy: coupleData.disconnected_by, userId: currentUser.id });

              // If disconnect was initiated by current user (e.g., during account deletion or self-unpair),
              // don't redirect to pairing here - let the initiating flow handle navigation
              // This prevents brief flash of pairing screen during account deletion
              if (!disconnectedByPartner) {
                console.log('[Layout] Disconnect initiated by self, skipping pairing redirect');
                return;
              }

              // Prevent duplicate alerts (push notification, realtime, and fetch can all trigger)
              if (disconnectAlertShownRef.current) {
                console.log('[Layout] Disconnect alert already shown, skipping duplicate');
                return;
              }
              disconnectAlertShownRef.current = true;

              // Show alert FIRST, then handle state changes and navigation on confirm
              // This prevents the navigation effect from triggering before the alert is shown
              console.log('[Layout] Partner disconnected, reason:', coupleData.disconnect_reason);

              const handleDisconnectConfirm = async () => {
                // Cleanup realtime subscriptions
                cleanupSync();

                // Clear couple and partner from local state
                setCouple(null);
                setPartner(null);

                // Delete pending pairing codes and clear profile.couple_id
                if (currentUser?.id) {
                  console.log('[Layout] Deleting pending pairing codes for user:', currentUser.id);
                  await db.pairingCodes.deleteByCreatorId(currentUser.id);
                  // Clear profile.couple_id in database (partner's unpair cleared theirs, we clear ours)
                  console.log('[Layout] Clearing profile couple_id for user:', currentUser.id);
                  await db.profiles.update(currentUser.id, { couple_id: null });
                }

                // IMPORTANT: Set onboarding step to pairing FIRST
                setOnboardingStep('pairing');

                // Reset all pairing state so user can pair with a new partner
                updateOnboardingData({
                  isPairingConnected: false,
                  isCreatingCode: true,
                  pairingCode: '',
                  anniversaryDate: null,
                  relationshipType: 'dating',
                });

                // Set onboarding incomplete - this triggers navigation via the navigation effect
                // DO NOT call router.replace here as it would cause duplicate navigation
                setIsOnboardingComplete(false);
              };

              if (coupleData.disconnect_reason === 'account_deleted') {
                // Partner deleted their account - no reconnection possible
                Alert.alert(
                  t('settings.unpair.partnerDeletedAccountTitle'),
                  t('settings.unpair.partnerDeletedAccountMessage'),
                  [
                    {
                      text: t('common.confirm'),
                      onPress: handleDisconnectConfirm,
                    },
                  ],
                  { cancelable: false }
                );
              } else {
                // Partner unpaired but still has account - can reconnect within 30 days
                Alert.alert(
                  t('settings.unpair.partnerDisconnectedTitle'),
                  t('settings.unpair.partnerDisconnectedMessage'),
                  [
                    {
                      text: t('common.confirm'),
                      onPress: handleDisconnectConfirm,
                    },
                  ],
                  { cancelable: false }
                );
              }
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
  }, [isOnboardingComplete, couple?.id, setCouple, setPartner, setIsOnboardingComplete, cleanupSync, setOnboardingStep, updateOnboardingData]);

  // Track if navigation has been performed to prevent re-navigation
  // Use ref instead of state to persist across hot reloads
  const hasNavigated = useRef(false);
  // Track if Stack navigator is mounted - USE STATE to trigger navigation effect re-run
  const [isNavigatorMounted, setIsNavigatorMounted] = useState(false);

  // Calculate navigation state
  const inAuthGroup = segments?.[0] === '(auth)';
  const shouldBeInTabs = isOnboardingComplete === true;
  const shouldBeInAuth = isOnboardingComplete === false;

  // Check if we're in the wrong place and need navigation
  const needsNavigationToTabs = shouldBeInTabs && inAuthGroup;
  // Need to redirect to auth if onboarding incomplete AND user is NOT already in auth group
  // This covers tabs, more, and any other top-level routes
  const needsNavigationToAuth = shouldBeInAuth && !inAuthGroup;

  // Trigger navigation only AFTER navigator is mounted
  // This prevents "route not found" errors when navigator isn't ready
  useEffect(() => {
    if (!authHydrated || typeof isOnboardingComplete !== 'boolean') return;
    if (hasNavigated.current) return;
    if (!isNavigatorMounted) return; // Wait for navigator to mount

    if (needsNavigationToAuth) {
      hasNavigated.current = true;
      router.replace('/(auth)/onboarding');
    } else if (needsNavigationToTabs) {
      hasNavigated.current = true;
      router.replace('/');
    }
  }, [authHydrated, isOnboardingComplete, needsNavigationToAuth, needsNavigationToTabs, isNavigatorMounted]);

  // Reset navigation flag when onboarding state changes
  useEffect(() => {
    hasNavigated.current = false;
  }, [isOnboardingComplete]);

  // Mark navigator as mounted when Stack renders
  // Using state instead of ref ensures navigation effect re-runs when this changes
  useEffect(() => {
    setIsNavigatorMounted(true);
    return () => {
      setIsNavigatorMounted(false);
    };
  }, []);

  // Don't render Stack until:
  // 1. Auth state is hydrated
  // 2. Onboarding state is determined (boolean, not undefined)
  // This prevents flash of home screen before redirecting to login
  if (!authHydrated || typeof isOnboardingComplete !== 'boolean') {
    return <StatusBar style="light" />;
  }

  // Check subscription status for showing ads
  const isPremium = useSubscriptionStore.getState().isPremium;
  const partnerIsPremium = useSubscriptionStore.getState().partnerIsPremium;
  const showAds = !isPremium && !partnerIsPremium;

  // Get current route to hide banner on auth screens (segments already declared above)
  const isAuthScreen = segments[0] === '(auth)' || segments[0] === 'auth';

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
        <Stack.Screen name="(auth)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
            animation: 'none',
          }}
        />
        <Stack.Screen
          name="more"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'fade',
            animationDuration: Platform.OS === 'android' ? 0 : 100,
            gestureEnabled: false,
          }}
        />
      </Stack>
      {/* Banner ad disabled - now shown inside tab bar component */}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
