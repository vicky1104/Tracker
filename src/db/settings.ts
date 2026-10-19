import { deviceTimeZone } from '@/domain/dates';
import type { UserSettings } from '@/domain/types';
import { nowIso } from '@/lib/clock';

import type { Db } from './db';
import { enqueue } from './outbox';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  accent: 'sage',
  density: 'comfortable',
  firstDayOfWeek: 1,
  onboardingCompleted: false,
  focusAreas: [],
  defaultReminderTimes: { morning: '08:00', afternoon: '13:00', evening: '20:00' },
  remindersEnabled: true,
  streakNudges: true,
  streakNudgeTime: '20:00',
  timeZone: deviceTimeZone(),
};

export async function getSettings(db: Db): Promise<UserSettings> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored: Partial<Record<keyof UserSettings, unknown>> = {};
  for (const r of rows) {
    try {
      stored[r.key as keyof UserSettings] = JSON.parse(r.value);
    } catch {
      // Ignore a corrupt value; the default is used and the next write repairs it.
    }
  }
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<UserSettings>) };
}

export async function updateSettings(db: Db, patch: Partial<UserSettings>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await db.transaction(async (tx) => {
    const ts = nowIso();
    for (const [key, value] of entries) {
      await tx.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), ts],
      );
    }
    await enqueue(tx, 'settings', 'user');
  });
}
