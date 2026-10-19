/**
 * Supabase client — created only when the backend is configured. The auth
 * session (access + refresh token) is stored in the OS keychain/keystore via
 * expo-secure-store. SecureStore values are limited to ~2 KB, so large values
 * are split into chunks.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { env, isSupabaseConfigured } from '@/config/env';

const CHUNK_SIZE = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count == null) return SecureStore.getItemAsync(k);
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) return null; // incomplete write: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    const previous = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${k}.${i}`, chunks[i]);
    await SecureStore.setItemAsync(`${k}.n`, String(chunks.length));
    for (let i = chunks.length; i < previous; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
    await SecureStore.deleteItemAsync(k);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : chunkedSecureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE for OAuth and email links: the code is exchanged in-app with a verifier
        // that never leaves the device.
        flowType: 'pkce',
      },
    });
    // Only refresh tokens while the app is in the foreground.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
