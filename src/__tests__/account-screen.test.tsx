import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/theme/theme';

import AccountScreen from '@/app/(tabs)/settings/account';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-notifications', () => ({ cancelAllScheduledNotificationsAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/config/env', () => ({ isSupabaseConfigured: true, env: {} }));
jest.mock('@/config/plans', () => ({ usePlan: () => ({ premium: false, limits: { cloudSync: false } }) }));
jest.mock('@/data/database', () => ({ useDb: () => ({}) }));
jest.mock('@/data/hooks', () => ({ useActions: () => ({}) }));
jest.mock('@/services/sync', () => ({ syncNow: jest.fn() }));
jest.mock('@/services/auth', () => ({
  useAuth: (sel: (s: { user: null }) => unknown) => sel({ user: null }),
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  sendPasswordReset: jest.fn(),
  deleteAccount: jest.fn(),
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  loadAppleAuthentication: () => Promise.resolve(null),
}));
jest.mock('@/services/push', () => ({ unregisterPushToken: jest.fn() }));

const wrap = (ui: ReactNode) => (
  <ThemeProvider preference="light" accent="sage">
    {ui}
  </ThemeProvider>
);

describe('Account screen (backend configured, signed out)', () => {
  it('shows the sign-in form', async () => {
    await render(wrap(<AccountScreen />));
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0);
    expect(screen.getByText('Create account')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
  });
});
