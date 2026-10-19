/**
 * Email authentication (optional). The app is fully usable as a guest; an
 * account adds cloud backup/sync and the AI planner allowance.
 */
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

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password });
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
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim());
  friendly(error);
}

/** Deletes the account and all server-side data (via the `delete-account` Edge Function). */
export async function deleteAccount(): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new UserFacingError('Could not delete your account right now. Please try again.');
  await supabase.auth.signOut();
}
