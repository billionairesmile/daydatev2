import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { FingerPaint_400Regular } from '@expo-google-fonts/finger-paint';
import { Mynerve_400Regular } from '@expo-google-fonts/mynerve';
import { JustMeAgainDownHere_400Regular } from '@expo-google-fonts/just-me-again-down-here';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useAuthStore } from '@/stores';
import { BackgroundProvider } from '@/contexts';
import { preloadCharacterAssets } from '@/utils';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
let splashScreenReady = false;
try {
  SplashScreen.preventAutoHideAsync().then(() => {
    splashScreenReady = true;
  }).catch(() => {
    // Splash screen may already be hidden or not available
  });
} catch {
  // Ignore errors in environments where SplashScreen is not available
}

export default function RootLayout() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Jua: Jua_400Regular,
    FingerPaint: FingerPaint_400Regular,
    Mynerve: Mynerve_400Regular,
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
    if (fontsLoaded && assetsLoaded) {
      const hideSplash = async () => {
        try {
          await SplashScreen.hideAsync();
        } catch {
          // Ignore error if splash screen is already hidden or not available
        }
      };
      hideSplash();
    }
  }, [fontsLoaded, assetsLoaded]);

  if (!fontsLoaded || !assetsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <BackgroundProvider>
        <RootLayoutNav />
      </BackgroundProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isOnboardingComplete } = useAuthStore();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';

    // If not authenticated and not in auth group, redirect to onboarding
    if (!isOnboardingComplete && !inAuthGroup) {
      // For now, skip auth check and go directly to tabs for development
      // router.replace('/(auth)/onboarding');
    }
  }, [isAuthenticated, isOnboardingComplete, segments]);

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
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});
