import type { Db } from './db';
import { ensureDefaultList } from './lists';

/**
 * Permanently erases all habit data on this device (personal-data deletion for
 * guests, or after account deletion). Settings are reset as well.
 */
export async function wipeLocalData(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of [
      'habit_completions',
      'habit_reminders',
      'habit_schedules',
      'habits',
      'habit_lists',
      'settings',
      'sync_outbox',
      'sync_state',
    ]) {
      await tx.run(`DELETE FROM ${table}`);
    }
  });
  await ensureDefaultList(db);
}
