import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationBar } from 'expo-navigation-bar';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { ErrorState } from '@/components/ui/layout';
import { LoadingState } from '@/components/ui/screen-skeletons';
import { ToastHost } from '@/components/ui/toast';
import { DatabaseProvider } from '@/data/database';
import { queryClient } from '@/data/query-client';
import { AppServices } from '@/services/app-services';
import { useAppStore } from '@/state/app-store';
import { ThemeProvider, useTheme } from '@/theme/theme';

void SplashScreen.preventAutoHideAsync();

// Android's default modal transition matches a regular push; slide modals up from the bottom instead.
const modalAnimation = Platform.OS === 'android' ? ({ animation: 'slide_from_bottom' } as const) : {};

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

  // Edge-to-edge draws the app behind the system bars; keep the root view themed so nothing light shows through.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const barStyle = scheme === 'dark' ? 'light' : 'dark';

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={barStyle} />
      <NavigationBar style={barStyle} />
      <Stack screenOptions={{ headerTintColor: colors.accent, headerTitleStyle: { color: colors.text } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, ...modalAnimation }}
        />
        <Stack.Screen name="habit/[id]" options={{ title: 'Habit' }} />
        <Stack.Screen name="habit/edit" options={{ presentation: 'modal', ...modalAnimation, title: 'Habit' }} />
        <Stack.Screen name="list/edit" options={{ presentation: 'modal', ...modalAnimation, title: 'List' }} />
        <Stack.Screen name="planner" options={{ title: 'Habit planner' }} />
        <Stack.Screen name="premium" options={{ presentation: 'modal', ...modalAnimation, title: 'HabitFlow Premium' }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', ...modalAnimation, title: 'Account' }} />
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
