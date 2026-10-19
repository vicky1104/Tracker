/**
 * Reminder scheduling (expo-notifications) on top of the pure planner in
 * `domain/reminders.ts`.
 *
 * - `syncReminders()` is idempotent: it diffs the desired one-shot notifications
 *   against what the OS has scheduled and only applies the difference. It is
 *   called on launch, on resume, after every local data change and after
 *   permission changes.
 * - Completing or skipping a habit removes that day's pending reminder.
 * - Archived/deleted habits and disabled reminders are never scheduled.
 * - Android reschedules pending notifications after reboot (expo-notifications
 *   registers RECEIVE_BOOT_COMPLETED); iOS keeps them across restarts natively.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { getCompletions, setCompletion } from '@/db/completions';
import type { Db } from '@/db/db';
import { getHabitContexts, getReminders } from '@/db/habits';
import { getSettings } from '@/db/settings';
import { addDays, isValidLocalDate } from '@/domain/dates';
import { diffNotifications, NOTIFICATION_PREFIX, planNotifications } from '@/domain/reminders';
import { buildRecordsByHabit } from '@/domain/stats';
import { now, todayLocal } from '@/lib/clock';

export const REMINDER_CHANNEL_ID = 'habit-reminders';
export const REMINDER_CATEGORY_ID = 'habit_reminder';
const ACTION_COMPLETE = 'complete';

export type PermissionState = 'granted' | 'provisional' | 'denied' | 'undetermined';

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotificationChannels(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Habit reminders',
        description: 'Reminders for the habits you schedule',
        importance: AndroidImportance.HIGH,
      });
    }
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
      { identifier: ACTION_COMPLETE, buttonTitle: 'Mark done', options: { opensAppToForeground: true } },
    ]);
  } catch (error) {
    console.warn('[notifications] channel/category setup failed', error);
  }
}

export async function getPermissionState(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return mapPermission(p);
}

function mapPermission(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (Platform.OS === 'ios' && p.ios) {
    switch (p.ios.status) {
      case IosAuthorizationStatus.AUTHORIZED:
      case IosAuthorizationStatus.EPHEMERAL:
        return 'granted';
      case IosAuthorizationStatus.PROVISIONAL:
        return 'provisional';
      case IosAuthorizationStatus.DENIED:
        return 'denied';
      default:
        return 'undetermined';
    }
  }
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Asks for permission (only call after explaining why). */
export async function requestPermission(): Promise<PermissionState> {
  await setupNotificationChannels(); // Android 13+ shows the prompt only once a channel exists
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return mapPermission(p);
}

export function openSystemSettings(): void {
  void Linking.openSettings();
}

export interface SyncResult {
  planned: number;
  scheduled: number;
  cancelled: number;
  blockedBy: 'permission' | 'disabled' | null;
}

let running: Promise<SyncResult> | null = null;
let rerun = false;

/** Serialised: concurrent calls coalesce into one follow-up run. */
export function syncReminders(db: Db): Promise<SyncResult> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let result: SyncResult;
    do {
      rerun = false;
      result = await syncOnce(db);
    } while (rerun);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function cancelOurs(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

async function syncOnce(db: Db): Promise<SyncResult> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.map((r) => r.identifier).filter((id) => id.startsWith(NOTIFICATION_PREFIX));
  const settings = await getSettings(db);

  if (!settings.remindersEnabled) {
    await cancelOurs(ours);
    return { planned: 0, scheduled: 0, cancelled: ours.length, blockedBy: 'disabled' };
  }
  const permission = await getPermissionState();
  if (permission !== 'granted' && permission !== 'provisional') {
    return { planned: 0, scheduled: 0, cancelled: 0, blockedBy: 'permission' };
  }

  const today = todayLocal();
  const [contexts, reminders, completions] = await Promise.all([
    getHabitContexts(db),
    getReminders(db),
    // Enough history for the current week/month quota checks.
    getCompletions(db, { from: addDays(today, -31) }),
  ]);
  const plan = planNotifications({
    contexts,
    reminders,
    records: buildRecordsByHabit(completions),
    now: now(),
    today,
    firstDayOfWeek: settings.firstDayOfWeek,
  });
  const diff = diffNotifications(plan, ours);
  await cancelOurs(diff.toCancel);
  for (const p of diff.toSchedule) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: p.identifier,
        content: {
          title: p.title,
          body: p.body,
          data: { habitId: p.habitId, date: p.date, reminderId: p.reminderId },
          categoryIdentifier: REMINDER_CATEGORY_ID,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: p.fireAt,
          channelId: REMINDER_CHANNEL_ID,
        },
      });
    } catch (error) {
      console.warn('[notifications] failed to schedule', p.identifier, error);
    }
  }
  return { planned: plan.length, scheduled: diff.toSchedule.length, cancelled: diff.toCancel.length, blockedBy: null };
}

export interface UpcomingReminder {
  identifier: string;
  title: string;
  fireAt: Date | null;
}

export async function listUpcoming(): Promise<UpcomingReminder[]> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const out = await Promise.all(
    requests
      .filter((r) => r.identifier.startsWith(NOTIFICATION_PREFIX))
      .map(async (r) => {
        let fireAt: Date | null = null;
        const t = r.trigger as { type?: string; value?: number; date?: number } | null;
        if (t && typeof t.value === 'number') fireAt = new Date(t.value);
        else if (t && typeof t.date === 'number') fireAt = new Date(t.date);
        return { identifier: r.identifier, title: r.content.title ?? '', fireAt };
      }),
  );
  return out.sort((a, b) => (a.fireAt?.getTime() ?? 0) - (b.fireAt?.getTime() ?? 0));
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'HabitFlow test', body: 'Reminders are working on this device.', sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

/** Handles taps and the "Mark done" action. Returns true if it navigated. */
export async function handleNotificationResponse(
  db: Db,
  response: Notifications.NotificationResponse,
): Promise<void> {
  const data = response.notification.request.content.data as { habitId?: unknown; date?: unknown; type?: unknown } | undefined;
  if (data?.type === 'streak') {
    router.navigate('/today');
    return;
  }
  const habitId = typeof data?.habitId === 'string' ? data.habitId : null;
  const date = typeof data?.date === 'string' && isValidLocalDate(data.date) ? data.date : null;
  if (!habitId || !date) return;

  if (response.actionIdentifier === ACTION_COMPLETE) {
    try {
      const habit = await db.first<{ kind: string; target: number | null }>(
        'SELECT kind, target FROM habits WHERE id = ? AND deleted_at IS NULL',
        [habitId],
      );
      if (!habit) return;
      await setCompletion(db, habitId, date, {
        status: 'done',
        value: habit.kind === 'numeric' ? habit.target : null,
      });
    } catch (error) {
      console.warn('[notifications] could not complete from notification', error);
    }
    return;
  }
  if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    router.push({ pathname: '/habit/[id]', params: { id: habitId } });
  }
}
