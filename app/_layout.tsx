import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { JustMeAgainDownHere_400Regular } from '@expo-google-fonts/just-me-again-down-here';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, AppState, AppStateStatus } from 'react-native';
import 'react-native-reanimated';

import { useAuthStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { BackgroundProvider, useBackground } from '@/contexts';
import { preloadCharacterAssets } from '@/utils';
import { db, isDemoMode } from '@/lib/supabase';

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
  const { isAuthenticated, isOnboardingComplete, couple, user, setCouple, setPartner, partner } = useAuthStore();
  const { initializeSync, cleanup: cleanupSync } = useCoupleSyncStore();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const appState = useRef(AppState.currentState);
  const lastFetchTime = useRef<number>(0);

  // Reusable function to fetch couple and partner data
  const fetchCoupleAndPartnerData = useCallback(async (forceRefresh = false) => {
    if (!isOnboardingComplete || !couple?.id || !user?.id || isDemoMode) return;

    // Throttle fetches to at most once every 5 seconds (unless force refresh)
    const now = Date.now();
    if (!forceRefresh && now - lastFetchTime.current < 5000) return;
    lastFetchTime.current = now;

    try {
      // Fetch latest couple data from DB
      const { data: coupleData, error: coupleError } = await db.couples.get(couple.id);

      if (coupleError) {
        console.error('Error fetching couple:', coupleError);
        return;
      }

      if (coupleData) {
        // Update couple in authStore with DB data
        setCouple({
          ...couple,
          user1Id: coupleData.user1_id,
          user2Id: coupleData.user2_id,
          anniversaryDate: coupleData.dating_start_date ? new Date(coupleData.dating_start_date) : couple.anniversaryDate,
          datingStartDate: coupleData.dating_start_date ? new Date(coupleData.dating_start_date) : undefined,
          weddingDate: coupleData.wedding_date ? new Date(coupleData.wedding_date) : undefined,
          status: coupleData.status || 'active',
        });

        // Determine partner's user_id
        const partnerId = coupleData.user1_id === user.id
          ? coupleData.user2_id
          : coupleData.user1_id;

        // Fetch partner profile if partner exists
        if (partnerId) {
          const { data: partnerData, error: partnerError } = await db.profiles.get(partnerId);

          if (!partnerError && partnerData) {
            setPartner({
              id: partnerData.id,
              email: partnerData.email || '',
              nickname: partnerData.nickname || '',
              inviteCode: partnerData.invite_code || '',
              preferences: partnerData.preferences || {},
              birthDate: partnerData.birth_date ? new Date(partnerData.birth_date) : undefined,
              createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching couple/partner data:', error);
    }
  }, [isOnboardingComplete, couple, user?.id, setCouple, setPartner]);

  // Fetch couple and partner data when onboarding is complete
  useEffect(() => {
    fetchCoupleAndPartnerData();
  }, [fetchCoupleAndPartnerData]);

  // Refresh partner data when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground, refresh partner data
        fetchCoupleAndPartnerData();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchCoupleAndPartnerData]);

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
