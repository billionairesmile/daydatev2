import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { JustMeAgainDownHere_400Regular } from '@expo-google-fonts/just-me-again-down-here';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useAuthStore } from '@/stores';
import { BackgroundProvider, useBackground } from '@/contexts';
import { preloadCharacterAssets } from '@/utils';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
let splashScreenPrevented = false;
SplashScreen.preventAutoHideAsync()
  .then(() => {
    splashScreenPrevented = true;
  })
  .catch(() => {
    // Splash screen may already be hidden or not available
    splashScreenPrevented = false;
  });

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
    if (fontsLoaded && assetsLoaded && backgroundLoaded && splashScreenPrevented) {
      // Add minimum display time for splash screen (1.5 seconds)
      setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {
          // Ignore error if splash screen is already hidden or not available
        });
      }, 1500);
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
  const { isAuthenticated, isOnboardingComplete } = useAuthStore();
  const [isNavigationReady, setIsNavigationReady] = useState(false);

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
