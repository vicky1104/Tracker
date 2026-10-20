import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';

import { ErrorState, LoadingState } from '@/components/ui/layout';
import { ToastHost } from '@/components/ui/toast';
import { DatabaseProvider } from '@/data/database';
import { queryClient } from '@/data/query-client';
import { AppServices } from '@/services/app-services';
import { useAppStore } from '@/state/app-store';
import { ThemeProvider, useTheme } from '@/theme/theme';

void SplashScreen.preventAutoHideAsync();

function HideSplash() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return null;
}

function AppTheme({ children }: { children: React.ReactNode }) {
  const settings = useAppStore((s) => s.settings);
  return (
    <ThemeProvider preference={settings.theme} accent={settings.accent}>
      {children}
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, scheme]);

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerTintColor: colors.accent, headerTitleStyle: { color: colors.text } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="habit/[id]" options={{ title: 'Habit' }} />
        <Stack.Screen name="habit/edit" options={{ presentation: 'modal', title: 'Habit' }} />
        <Stack.Screen name="list/edit" options={{ presentation: 'modal', title: 'List' }} />
        <Stack.Screen name="planner" options={{ presentation: 'modal', title: 'Habit planner' }} />
        <Stack.Screen name="premium" options={{ presentation: 'modal', title: 'HabitFlow Premium' }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Account' }} />
        <Stack.Screen name="reset-password" options={{ title: 'New password' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
      </Stack>
      <ToastHost />
      <AppServices />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppTheme>
        <DatabaseProvider
          renderLoading={() => <LoadingState />}
          renderError={(error, retry) => (
            <>
              <HideSplash />
              <ErrorState
                title="Couldn’t open your data"
                message={`Your habits are stored on this device and have not been deleted. Please restart the app. ${
                  error instanceof Error && __DEV__ ? `(${error.message})` : ''
                }`}
                onRetry={retry}
              />
            </>
          )}>
          <HideSplash />
          <RootNavigator />
        </DatabaseProvider>
      </AppTheme>
    </QueryClientProvider>
  );
}
