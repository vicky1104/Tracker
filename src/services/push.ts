/**
 * Remote push registration (Expo push service → APNs / Firebase Cloud Messaging).
 *
 * A device registers its Expo push token with the backend only when:
 *  - the user is signed in and cloud sync is active (the server evaluates synced
 *    data, so it must be current), and
 *  - streak protection is enabled in settings, and
 *  - notification permission is granted.
 * Otherwise any previously registered token for this device is removed.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Db } from '@/db/db';
import { getSyncState, setSyncState } from '@/db/outbox';
import { getSettings } from '@/db/settings';

import { useAuth } from './auth';
import { getPermissionState } from './notifications';
import { getSupabase } from './supabase';
import { isSyncAvailable } from './sync';

const TOKEN_KEY = 'push_token';

export type PushStatus =
  | 'registered'
  | 'disabled'
  | 'not-signed-in'
  | 'sync-off'
  | 'no-permission'
  | 'no-project-id'
  | 'unsupported'
  | 'error';

export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

let lastStatus: PushStatus = 'not-signed-in';
export const getPushStatus = () => lastStatus;

/** Skip the network round-trip when nothing changed since the last registration. */
const REFRESH_MS = 12 * 60 * 60 * 1000;
let lastRegistration: { key: string; at: number } | null = null;

/** Removes this device's token from the backend (call while still signed in). */
export async function unregisterPushToken(db: Db): Promise<void> {
  const token = await getSyncState(db, TOKEN_KEY);
  const supabase = getSupabase();
  if (!token || !supabase || !useAuth.getState().user) return;
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (!error) await setSyncState(db, TOKEN_KEY, '');
  lastRegistration = null;
}

export async function syncPushRegistration(db: Db): Promise<PushStatus> {
  lastStatus = await (async (): Promise<PushStatus> => {
    const supabase = getSupabase();
    if (!supabase || !useAuth.getState().user) return 'not-signed-in';
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';

    const settings = await getSettings(db);
    if (!settings.streakNudges) {
      await unregisterPushToken(db);
      return 'disabled';
    }
    if (!isSyncAvailable()) {
      await unregisterPushToken(db);
      return 'sync-off';
    }
    const permission = await getPermissionState();
    if (permission !== 'granted' && permission !== 'provisional') return 'no-permission';
    const projectId = easProjectId();
    if (!projectId) return 'no-project-id';

    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      const key = `${useAuth.getState().user?.id}|${token}`;
      if (lastRegistration?.key === key && Date.now() - lastRegistration.at < REFRESH_MS) return 'registered';
      const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_platform: Platform.OS,
        p_device_name: Device.deviceName ?? null,
      });
      if (error) throw new Error(error.message);
      await setSyncState(db, TOKEN_KEY, token);
      lastRegistration = { key, at: Date.now() };
      return 'registered';
    } catch (error) {
      console.warn('[push] registration failed', error);
      return 'error';
    }
  })();
  return lastStatus;
}

export function describePushStatus(status: PushStatus): string {
  switch (status) {
    case 'registered':
      return 'This device will get a push if a streak is about to break.';
    case 'disabled':
      return 'Streak protection is turned off.';
    case 'not-signed-in':
      return 'Sign in to get streak protection pushes.';
    case 'sync-off':
      return 'Streak protection needs cloud sync, so the server sees today’s progress.';
    case 'no-permission':
      return 'Allow notifications to get streak protection pushes.';
    case 'no-project-id':
      return 'Push isn’t configured in this build (missing EAS project ID).';
    case 'unsupported':
      return 'Push isn’t supported on this platform.';
    case 'error':
      return 'Couldn’t register this device for push. It will retry automatically.';
  }
}
