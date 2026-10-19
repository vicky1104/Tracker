import { openDatabaseAsync } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Db } from '@/db/db';
import { fromExpoDatabase } from '@/db/expo-db';
import { ensureDefaultList } from '@/db/lists';
import { migrate } from '@/db/schema';
import { getSettings, updateSettings } from '@/db/settings';
import { deviceTimeZone } from '@/domain/dates';
import { useAppStore } from '@/state/app-store';

export const DATABASE_NAME = 'habitflow.db';

let instance: Db | null = null;
let opening: Promise<Db> | null = null;

/** Opens and migrates the database once per process. */
export function openAppDatabase(): Promise<Db> {
  if (instance) return Promise.resolve(instance);
  if (!opening) {
    opening = (async () => {
      const raw = await openDatabaseAsync(DATABASE_NAME);
      const db = fromExpoDatabase(raw);
      await migrate(db);
      await ensureDefaultList(db);
      let settings = await getSettings(db);
      // Track the device's IANA zone so the backend and history views know it.
      const tz = deviceTimeZone();
      if (settings.timeZone !== tz) {
        await updateSettings(db, { timeZone: tz });
        settings = { ...settings, timeZone: tz };
      }
      useAppStore.getState().setSettings(settings);
      instance = db;
      return db;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

/** For services running outside React (notification handlers, sync). */
export function getOpenDb(): Db | null {
  return instance;
}

const DbContext = createContext<Db | null>(null);

type State = { status: 'loading' } | { status: 'ready'; db: Db } | { status: 'error'; error: unknown };

export function DatabaseProvider({
  children,
  renderLoading,
  renderError,
}: {
  children: ReactNode;
  renderLoading: () => ReactNode;
  renderError: (error: unknown, retry: () => void) => ReactNode;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const open = useCallback(() => {
    openAppDatabase()
      .then((db) => setState({ status: 'ready', db }))
      .catch((error) => {
        console.error('[db] failed to open', error);
        setState({ status: 'error', error });
      });
  }, []);

  useEffect(open, [open]);

  const retry = () => {
    setState({ status: 'loading' });
    open();
  };

  if (state.status === 'loading') return renderLoading();
  if (state.status === 'error') return renderError(state.error, retry);
  return <DbContext.Provider value={state.db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside DatabaseProvider');
  return db;
}
