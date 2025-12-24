import { Stack } from 'expo-router';

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="my-profile" />
      <Stack.Screen name="couple-profile" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
