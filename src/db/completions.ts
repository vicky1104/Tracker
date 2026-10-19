import { isValidLocalDate } from '@/domain/dates';
import { statusForValue } from '@/domain/stats';
import type { Completion, CompletionStatus, Habit, LocalDate } from '@/domain/types';
import { nowIso, todayLocal } from '@/lib/clock';
import { UserFacingError } from '@/lib/errors';

import type { Db } from './db';
import { completionKey, enqueue } from './outbox';
import { completionFromRow, habitFromRow, type CompletionRow, type HabitRow } from './rows';

export async function getCompletions(
  db: Db,
  opts: { from?: LocalDate; to?: LocalDate; habitId?: string } = {},
): Promise<Completion[]> {
  const where = ['deleted_at IS NULL'];
  const params: string[] = [];
  if (opts.from) {
    where.push('date >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('date <= ?');
    params.push(opts.to);
  }
  if (opts.habitId) {
    where.push('habit_id = ?');
    params.push(opts.habitId);
  }
  const rows = await db.all<CompletionRow>(
    `SELECT * FROM habit_completions WHERE ${where.join(' AND ')} ORDER BY date`,
    params,
  );
  return rows.map(completionFromRow);
}

export interface CompletionInput {
  status: CompletionStatus;
  value?: number | null;
  note?: string;
}

/**
 * Creates or replaces the record for (habit, date). Past dates are always
 * editable; future dates may only be marked as skipped (planned time off).
 */
export async function setCompletion(
  db: Db,
  habitId: string,
  date: LocalDate,
  input: CompletionInput,
): Promise<void> {
  if (!isValidLocalDate(date)) throw new UserFacingError('Invalid date.');
  if (date > todayLocal() && input.status !== 'skipped') {
    throw new UserFacingError('You can log this day when it arrives. Future days can only be skipped.');
  }
  if (input.value != null && (!Number.isFinite(input.value) || input.value < 0)) {
    throw new UserFacingError('Enter a positive number.');
  }
  await db.transaction(async (tx) => {
    const habit = await tx.first<{ id: string }>('SELECT id FROM habits WHERE id = ? AND deleted_at IS NULL', [
      habitId,
    ]);
    if (!habit) throw new UserFacingError('This habit no longer exists.');
    const ts = nowIso();
    await tx.run(
      `INSERT INTO habit_completions (habit_id, date, status, value, note, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(habit_id, date) DO UPDATE SET
         status = excluded.status, value = excluded.value, note = excluded.note,
         updated_at = excluded.updated_at, deleted_at = NULL`,
      [habitId, date, input.status, input.value ?? null, input.note ?? '', ts, ts],
    );
    await enqueue(tx, 'completions', completionKey(habitId, date));
  });
}

/** Removes the record for (habit, date), returning the day to "not logged". */
export async function clearCompletion(db: Db, habitId: string, date: LocalDate): Promise<void> {
  await db.transaction(async (tx) => {
    const ts = nowIso();
    const changed = await tx.run(
      `UPDATE habit_completions SET deleted_at = ?, updated_at = ?
       WHERE habit_id = ? AND date = ? AND deleted_at IS NULL`,
      [ts, ts, habitId, date],
    );
    if (changed > 0) await enqueue(tx, 'completions', completionKey(habitId, date));
  });
}

/** One-tap toggle: done ↔ not logged. Numeric habits are filled to their target. */
export async function toggleDone(db: Db, habit: Habit, date: LocalDate, current: Completion | null): Promise<void> {
  if (current?.status === 'done') {
    await clearCompletion(db, habit.id, date);
    return;
  }
  const value = habit.kind === 'numeric' ? (habit.target ?? 1) : null;
  await setCompletion(db, habit.id, date, { status: 'done', value, note: current?.note ?? '' });
}

/** Logs a numeric value; status is derived from the habit's target. */
export async function logValue(db: Db, habitId: string, date: LocalDate, value: number, note = ''): Promise<void> {
  const row = await db.first<HabitRow>('SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL', [habitId]);
  if (!row) throw new UserFacingError('This habit no longer exists.');
  const status = statusForValue(habitFromRow(row), value);
  if (status == null) {
    await clearCompletion(db, habitId, date);
    return;
  }
  await setCompletion(db, habitId, date, { status, value, note });
}
