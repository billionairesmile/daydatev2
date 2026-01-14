import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'android' ? 'none' : 'fade',
        animationDuration: Platform.OS === 'android' ? 0 : 100,
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
