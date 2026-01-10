import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores';

/**
 * OAuth callback handler route
 * This route catches the redirect from OAuth providers (Google, Apple)
 * URL: daydate://auth/callback → /auth/callback
 *
 * Uses Redirect component for immediate navigation without rendering any UI.
 * This prevents any visible flash or intermediate screen.
 */
export default function AuthCallbackScreen() {
  const { isOnboardingComplete, _hasHydrated } = useAuthStore();

  // Wait for auth store to hydrate before deciding where to redirect
  if (!_hasHydrated) {
    // Return null while hydrating - this is very brief and invisible
    return null;
  }

  // Immediate redirect based on onboarding state
  if (isOnboardingComplete === true) {
    console.log('[AuthCallback] Redirecting to tabs');
    return <Redirect href="/(tabs)" />;
  }

  // Default: go to onboarding (handles false and undefined states)
  console.log('[AuthCallback] Redirecting to onboarding');
  return <Redirect href="/(auth)/onboarding" />;
}
