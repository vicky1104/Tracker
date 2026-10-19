/**
 * Starts background services once the database is open and keeps them in step
 * with app lifecycle and data changes. Renders nothing.
 */
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useDb } from '@/data/database';
import { debounce, onLocalDataChanged } from '@/data/events';
import { qk, queryClient } from '@/data/query-client';

import { initAuth } from './auth';
import { runAutoBackup } from './backup-files';
import {
  configureNotificationHandler,
  handleNotificationResponse,
  setupNotificationChannels,
  syncReminders,
} from './notifications';
import { identifyPurchaser, initPurchases } from './purchases';
import { syncNow } from './sync';

configureNotificationHandler();

export function AppServices() {
  const db = useDb();

  useEffect(() => {
    const scheduleReminders = debounce(() => void syncReminders(db).catch((e) => console.warn('[reminders]', e)), 800);
    const scheduleSync = debounce(() => void syncNow(db), 2500);

    void setupNotificationChannels().then(scheduleReminders);
    void runAutoBackup(db).catch((e) => console.warn('[backup] auto-backup failed', e));
    void initPurchases();

    let unsubscribeAuth: () => void = () => undefined;
    void initAuth((user) => {
      void identifyPurchaser(user?.id ?? null);
      scheduleSync();
    }).then((unsub) => {
      unsubscribeAuth = unsub;
    });

    const offData = onLocalDataChanged(() => {
      scheduleReminders();
      scheduleSync();
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        scheduleReminders(); // re-plans the rolling window and picks up permission changes
        scheduleSync();
      }
    });

    // Cold start from a notification tap/action.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        void handleNotificationResponse(db, response).then(() => {
          void queryClient.invalidateQueries({ queryKey: qk.completions });
          scheduleReminders();
        });
        Notifications.clearLastNotificationResponse();
      }
    });
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(db, response).then(() => {
        void queryClient.invalidateQueries({ queryKey: qk.completions });
        scheduleReminders();
        scheduleSync();
      });
    });

    return () => {
      offData();
      appState.remove();
      responses.remove();
      unsubscribeAuth();
    };
  }, [db]);

  return null;
}
