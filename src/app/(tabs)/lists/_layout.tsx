import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme';

export default function ListsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.background },
      }}>
      {/* The tab root renders its own in-content header (see TabHeader). */}
      <Stack.Screen name="index" options={{ title: 'My Lists', headerShown: false }} />
    </Stack>
  );
}
