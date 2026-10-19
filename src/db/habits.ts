import { rangesAfterRestore } from '@/domain/archive';
import { rulesEqual, versionOn } from '@/domain/schedule';
import type { HabitContext, LocalDate, Reminder, ScheduleRule, ScheduleVersion } from '@/domain/types';
import type { HabitFormValues } from '@/domain/validation';
import { nowIso, todayLocal } from '@/lib/clock';
import { UserFacingError } from '@/lib/errors';
import { newId } from '@/lib/ids';

import type { Db } from './db';
import { completionKey, enqueue } from './outbox';
import {
  habitFromRow,
  listFromRow,
  reminderFromRow,
  scheduleFromRow,
  type HabitRow,
  type ListRow,
  type ReminderRow,
  type ScheduleRow,
} from './rows';

export type HabitInput = HabitFormValues;

/**
 * How a schedule edit applies:
 * - `today`: from today onward; past days keep being evaluated with the old schedule.
 * - `start`: replace the schedule for the habit's whole history (fixing a mistake).
 */
export type ScheduleApplyFrom = 'today' | 'start';

export async function getHabitContexts(db: Db): Promise<HabitContext[]> {
  const [habitRows, versionRows, listRows] = await Promise.all([
    db.all<HabitRow>('SELECT * FROM habits WHERE deleted_at IS NULL ORDER BY sort_order, created_at'),
    db.all<ScheduleRow>(
      'SELECT * FROM habit_schedules WHERE deleted_at IS NULL ORDER BY habit_id, effective_from',
    ),
    db.all<ListRow>('SELECT * FROM habit_lists'),
  ]);
  const versions = new Map<string, ScheduleVersion[]>();
  for (const r of versionRows) {
    const v = scheduleFromRow(r);
    const arr = versions.get(v.habitId) ?? [];
    arr.push(v);
    versions.set(v.habitId, arr);
  }
  const lists = new Map(listRows.map((r) => [r.id, listFromRow(r)]));
  return habitRows.map((row) => {
    const habit = habitFromRow(row);
    const list = lists.get(habit.listId) ?? null;
    return {
      habit,
      versions: versions.get(habit.id) ?? [fallbackVersion(habit.id, habit.startDate)],
      list: list ? { archivedOn: list.archivedOn, inactiveRanges: list.inactiveRanges, deletedAt: list.deletedAt } : null,
    };
  });
}

function fallbackVersion(habitId: string, from: LocalDate): ScheduleVersion {
  const ts = nowIso();
  return { id: `${habitId}-fallback`, habitId, effectiveFrom: from, rule: { type: 'daily' }, createdAt: ts, updatedAt: ts };
}

export async function getHabitContext(db: Db, id: string): Promise<HabitContext | null> {
  const all = await getHabitContexts(db);
  return all.find((c) => c.habit.id === id) ?? null;
}

export async function getReminders(db: Db, habitId?: string): Promise<Reminder[]> {
  const rows = habitId
    ? await db.all<ReminderRow>(
        'SELECT * FROM habit_reminders WHERE habit_id = ? AND deleted_at IS NULL ORDER BY time',
        [habitId],
      )
    : await db.all<ReminderRow>('SELECT * FROM habit_reminders WHERE deleted_at IS NULL ORDER BY time');
  return rows.map(reminderFromRow);
}

async function assertList(tx: Db, listId: string): Promise<void> {
  const list = await tx.first<{ id: string }>('SELECT id FROM habit_lists WHERE id = ? AND deleted_at IS NULL', [
    listId,
  ]);
  if (!list) throw new UserFacingError('The selected list no longer exists.');
}

async function insertVersion(tx: Db, habitId: string, effectiveFrom: LocalDate, rule: ScheduleRule, ts: string) {
  const id = newId();
  await tx.run(
    `INSERT INTO habit_schedules (id, habit_id, effective_from, rule, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, habitId, effectiveFrom, JSON.stringify(rule), ts, ts],
  );
  await enqueue(tx, 'schedules', id);
}

async function saveReminders(tx: Db, habitId: string, reminders: HabitInput['reminders'], ts: string) {
  const existing = await tx.all<{ id: string }>(
    'SELECT id FROM habit_reminders WHERE habit_id = ? AND deleted_at IS NULL',
    [habitId],
  );
  const keep = new Set(reminders.map((r) => r.id).filter(Boolean));
  for (const e of existing) {
    if (!keep.has(e.id)) {
      await tx.run('UPDATE habit_reminders SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, e.id]);
      await enqueue(tx, 'reminders', e.id);
    }
  }
  const existingIds = new Set(existing.map((e) => e.id));
  for (const r of reminders) {
    const weekdays = r.weekdays ? JSON.stringify([...r.weekdays].sort()) : null;
    if (r.id && existingIds.has(r.id)) {
      await tx.run(
        'UPDATE habit_reminders SET time = ?, weekdays = ?, enabled = ?, updated_at = ? WHERE id = ?',
        [r.time, weekdays, r.enabled ? 1 : 0, ts, r.id],
      );
      await enqueue(tx, 'reminders', r.id);
    } else {
      const id = newId();
      await tx.run(
        `INSERT INTO habit_reminders (id, habit_id, time, weekdays, enabled, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, habitId, r.time, weekdays, r.enabled ? 1 : 0, ts, ts],
      );
      await enqueue(tx, 'reminders', id);
    }
  }
}

export async function createHabit(db: Db, input: HabitInput): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await db.transaction(async (tx) => {
    await assertList(tx, input.listId);
    const max = await tx.first<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM habits WHERE list_id = ? AND deleted_at IS NULL',
      [input.listId],
    );
    await tx.run(
      `INSERT INTO habits (id, list_id, name, description, icon, color, category, time_of_day, kind, target, unit,
         target_direction, start_date, end_date, sort_order, archived_on, inactive_ranges, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, NULL)`,
      [
        id,
        input.listId,
        input.name.trim(),
        input.description.trim(),
        input.icon,
        input.color,
        input.category,
        input.timeOfDay,
        input.kind,
        input.kind === 'numeric' ? input.target : null,
        input.kind === 'numeric' ? input.unit.trim() : '',
        input.targetDirection,
        input.startDate,
        input.endDate,
        (max?.m ?? -1) + 1,
        ts,
        ts,
      ],
    );
    await enqueue(tx, 'habits', id);
    await insertVersion(tx, id, input.startDate, input.rule, ts);
    await saveReminders(tx, id, input.reminders, ts);
  });
  return id;
}

export async function updateHabit(
  db: Db,
  id: string,
  input: HabitInput,
  applyFrom: ScheduleApplyFrom = 'today',
): Promise<void> {
  const ts = nowIso();
  const today = todayLocal();
  await db.transaction(async (tx) => {
    const row = await tx.first<HabitRow>('SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new UserFacingError('This habit no longer exists.');
    await assertList(tx, input.listId);

    let sortOrder = row.sort_order;
    if (row.list_id !== input.listId) {
      const max = await tx.first<{ m: number | null }>(
        'SELECT MAX(sort_order) AS m FROM habits WHERE list_id = ? AND deleted_at IS NULL',
        [input.listId],
      );
      sortOrder = (max?.m ?? -1) + 1;
    }

    await tx.run(
      `UPDATE habits SET list_id = ?, name = ?, description = ?, icon = ?, color = ?, category = ?, time_of_day = ?,
         kind = ?, target = ?, unit = ?, target_direction = ?, start_date = ?, end_date = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.listId,
        input.name.trim(),
        input.description.trim(),
        input.icon,
        input.color,
        input.category,
        input.timeOfDay,
        input.kind,
        input.kind === 'numeric' ? input.target : null,
        input.kind === 'numeric' ? input.unit.trim() : '',
        input.targetDirection,
        input.startDate,
        input.endDate,
        sortOrder,
        ts,
        id,
      ],
    );
    await enqueue(tx, 'habits', id);

    // --- Schedule versioning: never rewrite how past days were scheduled
    // unless the user explicitly asks to.
    const versions = (
      await tx.all<ScheduleRow>(
        'SELECT * FROM habit_schedules WHERE habit_id = ? AND deleted_at IS NULL ORDER BY effective_from',
        [id],
      )
    ).map(scheduleFromRow);
    const ctx: HabitContext = {
      habit: { ...habitFromRow(row), startDate: input.startDate },
      versions: versions.length ? versions : [fallbackVersion(id, input.startDate)],
      list: null,
    };
    const effectiveDay = today < input.startDate ? input.startDate : today;
    const current = versionOn(ctx, effectiveDay).version;

    if (versions.length === 0 || applyFrom === 'start') {
      for (const v of versions) {
        await tx.run('UPDATE habit_schedules SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, v.id]);
        await enqueue(tx, 'schedules', v.id);
      }
      await insertVersion(tx, id, input.startDate, input.rule, ts);
    } else if (!rulesEqual(current.rule, input.rule)) {
      const latest = versions[versions.length - 1];
      const noHistoryYet = input.startDate >= today;
      if (latest.effectiveFrom >= effectiveDay || noHistoryYet) {
        const from = versions.length === 1 ? input.startDate : latest.effectiveFrom;
        await tx.run('UPDATE habit_schedules SET rule = ?, effective_from = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(input.rule),
          from,
          ts,
          latest.id,
        ]);
        await enqueue(tx, 'schedules', latest.id);
      } else {
        await insertVersion(tx, id, effectiveDay, input.rule, ts);
      }
    } else if (versions.length === 1 && versions[0].effectiveFrom !== input.startDate) {
      // Keep the single version aligned with the start date.
      await tx.run('UPDATE habit_schedules SET effective_from = ?, updated_at = ? WHERE id = ?', [
        input.startDate,
        ts,
        versions[0].id,
      ]);
      await enqueue(tx, 'schedules', versions[0].id);
    }

    await saveReminders(tx, id, input.reminders, ts);
  });
}

export async function duplicateHabit(db: Db, id: string): Promise<string> {
  const ctx = await getHabitContext(db, id);
  if (!ctx) throw new UserFacingError('This habit no longer exists.');
  const reminders = await getReminders(db, id);
  const today = todayLocal();
  const { habit } = ctx;
  return createHabit(db, {
    name: `${habit.name} (copy)`.slice(0, 60),
    description: habit.description,
    icon: habit.icon,
    color: habit.color,
    listId: habit.listId,
    category: habit.category,
    timeOfDay: habit.timeOfDay,
    kind: habit.kind,
    target: habit.target,
    unit: habit.unit,
    targetDirection: habit.targetDirection,
    rule: versionOn(ctx, today).version.rule,
    startDate: today,
    endDate: habit.endDate && habit.endDate >= today ? habit.endDate : null,
    reminders: reminders.map((r) => ({ time: r.time, weekdays: r.weekdays, enabled: r.enabled })),
  });
}

export async function archiveHabit(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run('UPDATE habits SET archived_on = ?, updated_at = ? WHERE id = ? AND archived_on IS NULL', [
      todayLocal(),
      nowIso(),
      id,
    ]);
    await enqueue(tx, 'habits', id);
  });
}

export async function restoreHabit(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.first<HabitRow>('SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new UserFacingError('This habit no longer exists.');
    const habit = habitFromRow(row);
    const list = await tx.first<{ archived_on: string | null }>('SELECT archived_on FROM habit_lists WHERE id = ?', [
      habit.listId,
    ]);
    if (list?.archived_on) throw new UserFacingError('Restore its list first, or move the habit to another list.');
    const ranges = rangesAfterRestore(habit.archivedOn, habit.inactiveRanges, todayLocal());
    await tx.run('UPDATE habits SET archived_on = NULL, inactive_ranges = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(ranges),
      nowIso(),
      id,
    ]);
    await enqueue(tx, 'habits', id);
  });
}

/** Soft-deletes a habit and everything that belongs to it. Must run inside a transaction. */
export async function deleteHabitTx(tx: Db, id: string, ts: string): Promise<void> {
  await tx.run('UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [ts, ts, id]);
  await enqueue(tx, 'habits', id);
  for (const v of await tx.all<{ id: string }>(
    'SELECT id FROM habit_schedules WHERE habit_id = ? AND deleted_at IS NULL',
    [id],
  )) {
    await tx.run('UPDATE habit_schedules SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, v.id]);
    await enqueue(tx, 'schedules', v.id);
  }
  for (const r of await tx.all<{ id: string }>(
    'SELECT id FROM habit_reminders WHERE habit_id = ? AND deleted_at IS NULL',
    [id],
  )) {
    await tx.run('UPDATE habit_reminders SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, r.id]);
    await enqueue(tx, 'reminders', r.id);
  }
  for (const c of await tx.all<{ date: string }>(
    'SELECT date FROM habit_completions WHERE habit_id = ? AND deleted_at IS NULL',
    [id],
  )) {
    await tx.run('UPDATE habit_completions SET deleted_at = ?, updated_at = ? WHERE habit_id = ? AND date = ?', [
      ts,
      ts,
      id,
      c.date,
    ]);
    await enqueue(tx, 'completions', completionKey(id, c.date));
  }
}

export async function deleteHabit(db: Db, id: string): Promise<void> {
  await db.transaction((tx) => deleteHabitTx(tx, id, nowIso()));
}

export async function reorderHabits(db: Db, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const ts = nowIso();
    for (let i = 0; i < orderedIds.length; i++) {
      const changed = await tx.run(
        'UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ? AND sort_order != ?',
        [i, ts, orderedIds[i], i],
      );
      if (changed > 0) await enqueue(tx, 'habits', orderedIds[i]);
    }
  });
}
