import { Stack } from 'expo-router';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 100,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="my-profile" />
      <Stack.Screen name="couple-profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="announcements" />
      <Stack.Screen name="customer-service" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="unpair" />
      <Stack.Screen name="others" />
      <Stack.Screen name="help" />
    </Stack>
  );
}
