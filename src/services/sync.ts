/**
 * Cloud sync orchestration: runs the engine against Supabase when the backend
 * is configured, a user is signed in and their plan includes cloud sync.
 * Local data is always the source of truth for the UI; sync never blocks it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_PLAN_LIMITS } from '@/config/plans';
import { qk, queryClient } from '@/data/query-client';
import type { Db } from '@/db/db';
import { pendingCount } from '@/db/outbox';
import { getSettings } from '@/db/settings';
import { syncAll, type RemoteAdapter } from '@/sync/engine';
import { useAppStore } from '@/state/app-store';

import { useAuth } from './auth';
import { getSupabase } from './supabase';

export function supabaseAdapter(client: SupabaseClient): RemoteAdapter {
  return {
    async upsert(table, rows, onConflict) {
      const { error } = await client.from(table).upsert(rows, { onConflict });
      if (error) throw new Error(error.message);
    },
    async fetchChanges(table, since, limit) {
      let q = client.from(table).select('*').order('server_updated_at', { ascending: true }).limit(limit);
      if (since) q = q.gte('server_updated_at', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}

function cloudSyncAllowed(): boolean {
  const premium = useAppStore.getState().entitlement.premium;
  const remote = queryClient.getQueryData<typeof DEFAULT_PLAN_LIMITS>(qk.remoteConfig) ?? DEFAULT_PLAN_LIMITS;
  return (premium ? remote.premium : remote.free).cloudSync;
}

export function isSyncAvailable(): boolean {
  return !!getSupabase() && !!useAuth.getState().user && cloudSyncAllowed();
}

let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

const isNetworkError = (msg: string) => /network|fetch|timed? ?out|offline/i.test(msg);

export function syncNow(db: Db): Promise<void> {
  if (running) return running;
  running = (async () => {
    const setSync = useAppStore.getState().setSync;
    const supabase = getSupabase();
    const user = useAuth.getState().user;
    if (!supabase || !user || !cloudSyncAllowed()) {
      setSync({ status: 'disabled', pending: await pendingCount(db) });
      return;
    }
    setSync({ status: 'syncing', error: null });
    try {
      const { pulled } = await syncAll(db, supabaseAdapter(supabase), user.id);
      failures = 0;
      setSync({ status: 'idle', lastSyncedAt: new Date().toISOString(), pending: await pendingCount(db), error: null });
      if (pulled > 0) {
        useAppStore.getState().setSettings(await getSettings(db));
        await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== qk.remoteConfig[0] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures++;
      setSync({
        status: isNetworkError(message) ? 'offline' : 'error',
        error: isNetworkError(message) ? null : message,
        pending: await pendingCount(db),
      });
      // Exponential backoff, capped at 5 minutes. Unsynced data stays queued locally.
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void syncNow(db), Math.min(300_000, 5_000 * 2 ** Math.min(failures, 6)));
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
