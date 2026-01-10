import { useEffect } from 'react';
import { Link, Stack, useRouter } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';

import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/design';
import { useAuthStore } from '@/stores';

export default function NotFoundScreen() {
  const router = useRouter();
  const { isOnboardingComplete, _hasHydrated } = useAuthStore();

  // Auto-redirect based on auth state
  // This handles edge cases where navigation state gets corrupted (e.g., after account deletion)
  useEffect(() => {
    if (!_hasHydrated) return; // Wait for auth state to hydrate

    const timer = setTimeout(() => {
      if (isOnboardingComplete === false) {
        // User hasn't completed onboarding, redirect to onboarding
        console.log('[NotFound] Redirecting to onboarding (isOnboardingComplete: false)');
        router.replace('/(auth)/onboarding');
      } else if (isOnboardingComplete === true) {
        // User has completed onboarding, redirect to tabs
        console.log('[NotFound] Redirecting to tabs (isOnboardingComplete: true)');
        router.replace('/(tabs)');
      }
    }, 100); // Small delay to ensure navigation is ready

    return () => clearTimeout(timer);
  }, [_hasHydrated, isOnboardingComplete, router]);

  return (
    <>
      <Stack.Screen options={{ title: '페이지를 찾을 수 없습니다' }} />
      <View style={styles.container}>
        <Text style={styles.title}>페이지를 찾을 수 없습니다</Text>
        <Text style={styles.subtitle}>요청하신 페이지가 존재하지 않아요</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>홈으로 돌아가기</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.black,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white60,
    marginBottom: SPACING.xxl,
  },
  link: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.glass.white20,
    borderRadius: 12,
  },
  linkText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
});
