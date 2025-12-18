import { Stack } from 'expo-router';
import { COLORS } from '@/constants/design';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.black },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="pairing" />
      <Stack.Screen name="anniversary" />
    </Stack>
  );
}
