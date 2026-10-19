import { rangesAfterRestore } from '@/domain/archive';
import type { HabitList } from '@/domain/types';
import type { ListFormValues } from '@/domain/validation';
import { nowIso, todayLocal } from '@/lib/clock';
import { UserFacingError } from '@/lib/errors';
import { newId } from '@/lib/ids';

import type { Db } from './db';
import { deleteHabitTx } from './habits';
import { enqueue } from './outbox';
import { listFromRow, type ListRow } from './rows';

export const DEFAULT_LIST = { name: 'My Habits', color: '#2F9E7E', icon: 'list' };

export async function getLists(db: Db): Promise<HabitList[]> {
  const rows = await db.all<ListRow>(
    'SELECT * FROM habit_lists WHERE deleted_at IS NULL ORDER BY sort_order, created_at',
  );
  return rows.map(listFromRow);
}

export async function getList(db: Db, id: string): Promise<HabitList | null> {
  const row = await db.first<ListRow>('SELECT * FROM habit_lists WHERE id = ? AND deleted_at IS NULL', [id]);
  return row ? listFromRow(row) : null;
}

/** Guarantees there is at least one active list. Returns its id. */
export async function ensureDefaultList(db: Db): Promise<string> {
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM habit_lists WHERE deleted_at IS NULL AND archived_on IS NULL ORDER BY sort_order LIMIT 1',
  );
  if (existing) return existing.id;
  return createList(db, DEFAULT_LIST);
}

export async function createList(db: Db, input: ListFormValues): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await db.transaction(async (tx) => {
    const max = await tx.first<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM habit_lists WHERE deleted_at IS NULL',
    );
    await tx.run(
      `INSERT INTO habit_lists (id, name, color, icon, sort_order, archived_on, inactive_ranges, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL, '[]', ?, ?, NULL)`,
      [id, input.name.trim(), input.color, input.icon, (max?.m ?? -1) + 1, ts, ts],
    );
    await enqueue(tx, 'lists', id);
  });
  return id;
}

export async function updateList(db: Db, id: string, input: ListFormValues): Promise<void> {
  await db.transaction(async (tx) => {
    const changed = await tx.run(
      'UPDATE habit_lists SET name = ?, color = ?, icon = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [input.name.trim(), input.color, input.icon, nowIso(), id],
    );
    if (changed === 0) throw new UserFacingError('This list no longer exists.');
    await enqueue(tx, 'lists', id);
  });
}

export async function archiveList(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const active = await tx.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM habit_lists WHERE deleted_at IS NULL AND archived_on IS NULL AND id != ?',
      [id],
    );
    if ((active?.n ?? 0) === 0) throw new UserFacingError('Keep at least one active list.');
    await tx.run(
      'UPDATE habit_lists SET archived_on = ?, updated_at = ? WHERE id = ? AND archived_on IS NULL',
      [todayLocal(), nowIso(), id],
    );
    await enqueue(tx, 'lists', id);
  });
}

export async function restoreList(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.first<ListRow>('SELECT * FROM habit_lists WHERE id = ?', [id]);
    if (!row || row.deleted_at) throw new UserFacingError('This list no longer exists.');
    const list = listFromRow(row);
    const ranges = rangesAfterRestore(list.archivedOn, list.inactiveRanges, todayLocal());
    await tx.run(
      'UPDATE habit_lists SET archived_on = NULL, inactive_ranges = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(ranges), nowIso(), id],
    );
    await enqueue(tx, 'lists', id);
  });
}

/**
 * Deletes a list. Its habits are either moved to `moveHabitsTo` (history kept)
 * or deleted along with the list.
 */
export async function deleteList(db: Db, id: string, moveHabitsTo: string | null): Promise<void> {
  if (moveHabitsTo === id) throw new UserFacingError('Choose a different list to move habits to.');
  await db.transaction(async (tx) => {
    const ts = nowIso();
    const habits = await tx.all<{ id: string }>(
      'SELECT id FROM habits WHERE list_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      [id],
    );
    if (moveHabitsTo) {
      const target = await tx.first<{ id: string }>(
        'SELECT id FROM habit_lists WHERE id = ? AND deleted_at IS NULL',
        [moveHabitsTo],
      );
      if (!target) throw new UserFacingError('The destination list no longer exists.');
      const max = await tx.first<{ m: number | null }>(
        'SELECT MAX(sort_order) AS m FROM habits WHERE list_id = ? AND deleted_at IS NULL',
        [moveHabitsTo],
      );
      let order = (max?.m ?? -1) + 1;
      for (const h of habits) {
        await tx.run('UPDATE habits SET list_id = ?, sort_order = ?, updated_at = ? WHERE id = ?', [
          moveHabitsTo,
          order++,
          ts,
          h.id,
        ]);
        await enqueue(tx, 'habits', h.id);
      }
    } else {
      for (const h of habits) await deleteHabitTx(tx, h.id, ts);
    }
    await tx.run('UPDATE habit_lists SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await enqueue(tx, 'lists', id);
  });
  await ensureDefaultList(db);
}

export async function reorderLists(db: Db, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const ts = nowIso();
    for (let i = 0; i < orderedIds.length; i++) {
      const changed = await tx.run(
        'UPDATE habit_lists SET sort_order = ?, updated_at = ? WHERE id = ? AND sort_order != ?',
        [i, ts, orderedIds[i], i],
      );
      if (changed > 0) await enqueue(tx, 'lists', orderedIds[i]);
    }
  });
}
