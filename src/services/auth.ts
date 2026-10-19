/**
 * Authentication (optional): email + password, Google (OAuth/PKCE) and Sign in
 * with Apple, all backed by Supabase Auth. The app is fully usable as a guest;
 * an account adds cloud backup/sync, server push and the AI planner allowance.
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { UserFacingError } from '@/lib/errors';

import { getSupabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  set: (user: AuthUser | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  set: (user) => set({ user, ready: true }),
}));

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new UserFacingError('Accounts are not available in this build.');
  return supabase;
}

function friendly(error: { message: string; status?: number } | null): never | void {
  if (!error) return;
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login')) throw new UserFacingError('Email or password is incorrect.');
  if (msg.includes('already registered')) throw new UserFacingError('An account with this email already exists. Try signing in.');
  if (msg.includes('email not confirmed')) throw new UserFacingError('Please confirm your email first — check your inbox.');
  if (msg.includes('password')) throw new UserFacingError(error.message);
  if (msg.includes('network') || msg.includes('fetch')) throw new UserFacingError('No connection. Your data is safe on this device — try again when online.');
  throw new UserFacingError('Could not complete the request. Please try again.');
}

/** Restores a persisted session and subscribes to auth changes. */
export async function initAuth(onChange: (user: AuthUser | null) => void): Promise<() => void> {
  const supabase = getSupabase();
  if (!supabase) {
    useAuth.getState().set(null);
    return () => undefined;
  }
  const { data } = await supabase.auth.getSession();
  const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? null } : null;
  const initial = toUser(data.session?.user);
  useAuth.getState().set(initial);
  onChange(initial);
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = toUser(session?.user);
    const prev = useAuth.getState().user;
    useAuth.getState().set(user);
    if (prev?.id !== user?.id) onChange(user);
  });
  return () => sub.subscription.unsubscribe();
}

/** Deep link that email confirmation, password reset and OAuth return to. */
export function authRedirectUrl(path: 'auth-callback' | 'reset-password' = 'auth-callback'): string {
  return Linking.createURL(path);
}

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireClient().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  friendly(error);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
  friendly(error);
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  friendly(error);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirectUrl('reset-password'),
  });
  friendly(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await requireClient().auth.updateUser({ password });
  friendly(error);
}

/** Exchanges a PKCE `code` from an email link or OAuth redirect for a session. */
export async function completeAuthRedirect(code: string): Promise<void> {
  const { error } = await requireClient().auth.exchangeCodeForSession(code);
  if (error) throw new UserFacingError('This link has expired or was already used. Please try again.');
}

// --- Social sign-in --------------------------------------------------------

/** True while an in-app browser OAuth flow owns the redirect (see auth-callback route). */
let oauthInFlight = false;
export const isOAuthInFlight = () => oauthInFlight;

/**
 * Google sign-in through Supabase OAuth in a secure in-app browser session
 * (ASWebAuthenticationSession / Custom Tabs) with PKCE. Returns false if cancelled.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const supabase = requireClient();
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new UserFacingError('Google sign-in isn’t available right now.');
  oauthInFlight = true;
  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return false;
    const { queryParams } = Linking.parse(result.url);
    const errorDescription = queryParams?.error_description;
    if (typeof errorDescription === 'string') throw new UserFacingError(errorDescription);
    const code = queryParams?.code;
    if (typeof code !== 'string') throw new UserFacingError('Google sign-in didn’t complete. Please try again.');
    await completeAuthRedirect(code);
    return true;
  } finally {
    oauthInFlight = false;
  }
}

type AppleModule = typeof import('expo-apple-authentication');
let appleModule: Promise<AppleModule | null> | null = null;

/** Loaded lazily so builds without the native module keep working. */
export function loadAppleAuthentication(): Promise<AppleModule | null> {
  if (Platform.OS !== 'ios') return Promise.resolve(null);
  appleModule ??= import('expo-apple-authentication')
    .then(async (m) => ((await m.isAvailableAsync()) ? m : null))
    .catch(() => null);
  return appleModule;
}

/** Native Sign in with Apple (iOS). Returns false if cancelled. */
export async function signInWithApple(): Promise<boolean> {
  const Apple = await loadAppleAuthentication();
  if (!Apple) throw new UserFacingError('Sign in with Apple isn’t available on this device.');
  const supabase = requireClient();
  // Apple receives the SHA-256 of the nonce; Supabase verifies it against the raw value.
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential;
  try {
    credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw new UserFacingError('Sign in with Apple didn’t complete. Please try again.');
  }
  if (!credential.identityToken) throw new UserFacingError('Sign in with Apple didn’t return a token.');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  friendly(error);
  // Apple only shares the name on the first authorisation — keep it.
  const { givenName, familyName } = credential.fullName ?? {};
  if (givenName || familyName) {
    await supabase.auth.updateUser({
      data: { full_name: [givenName, familyName].filter(Boolean).join(' '), given_name: givenName, family_name: familyName },
    });
  }
  return true;
}

/** Deletes the account and all server-side data (via the `delete-account` Edge Function). */
export async function deleteAccount(): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new UserFacingError('Could not delete your account right now. Please try again.');
  await supabase.auth.signOut();
}
