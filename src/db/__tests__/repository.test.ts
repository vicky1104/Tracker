/**
 * @jest-environment node
 */
import { buildRecordsByHabit, daySummary, evaluateHabit } from '@/domain/stats';
import type { HabitFormValues } from '@/domain/validation';
import { setClock } from '@/lib/clock';
import { createTestDb } from '@/test-utils/node-db';

import { exportBackup, exportCompletionsCsv, restoreBackup } from '../backup';
import { clearCompletion, getCompletions, logValue, setCompletion, toggleDone } from '../completions';
import type { Db } from '../db';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  duplicateHabit,
  getHabitContext,
  getHabitContexts,
  getReminders,
  reorderHabits,
  restoreHabit,
  updateHabit,
} from '../habits';
import { archiveList, createList, deleteList, ensureDefaultList, getLists, restoreList } from '../lists';
import { acknowledge, pendingCount, pendingEntries } from '../outbox';
import { getSettings, updateSettings } from '../settings';

let db: Db;
let listId: string;

const at = (iso: string) => setClock(() => new Date(iso));

const habitInput = (overrides: Partial<HabitFormValues> = {}): HabitFormValues => ({
  name: 'Read',
  description: '',
  icon: '📖',
  color: '#2F9E7E',
  listId,
  category: 'learning',
  timeOfDay: 'evening',
  kind: 'check',
  target: null,
  unit: '',
  targetDirection: 'atLeast',
  rule: { type: 'daily' },
  startDate: '2024-01-01',
  endDate: null,
  reminders: [],
  ...overrides,
});

beforeEach(async () => {
  at('2024-01-10T12:00:00');
  db = await createTestDb();
  listId = await ensureDefaultList(db);
});

afterAll(() => setClock(null));

describe('habits', () => {
  it('creates, edits and renames without touching completion history', async () => {
    const id = await createHabit(db, habitInput());
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    await setCompletion(db, id, '2024-01-06', { status: 'skipped' });

    await updateHabit(db, id, habitInput({ name: 'Read 20 pages', reminders: [{ time: '21:00', weekdays: null, enabled: true }] }));
    const ctx = await getHabitContext(db, id);
    expect(ctx?.habit.name).toBe('Read 20 pages');
    expect(await getCompletions(db, { habitId: id })).toHaveLength(2);
    expect(await getReminders(db, id)).toHaveLength(1);
  });

  it('versions schedule changes from today and keeps past evaluation intact', async () => {
    const id = await createHabit(db, habitInput());
    for (const d of ['2024-01-01', '2024-01-02', '2024-01-03']) await setCompletion(db, id, d, { status: 'done' });

    await updateHabit(db, id, habitInput({ rule: { type: 'weekdays', days: [1] } })); // Mondays from today
    const ctx = (await getHabitContext(db, id))!;
    expect(ctx.versions.map((v) => [v.effectiveFrom, v.rule.type])).toEqual([
      ['2024-01-01', 'daily'],
      ['2024-01-10', 'weekdays'],
    ]);
    const stats = evaluateHabit(ctx, buildRecordsByHabit(await getCompletions(db)).get(id)!, {
      from: '2024-01-01',
      to: '2024-01-03',
      today: '2024-01-10',
      firstDayOfWeek: 1,
    });
    expect(stats.rate).toBe(1);

    // Editing again on the same day updates the version in place.
    await updateHabit(db, id, habitInput({ rule: { type: 'weekdays', days: [1, 3] } }));
    expect((await getHabitContext(db, id))!.versions).toHaveLength(2);

    // Explicit "fix the whole history" collapses to one version.
    await updateHabit(db, id, habitInput({ rule: { type: 'weekdays', days: [2] } }), 'start');
    const fixed = (await getHabitContext(db, id))!;
    expect(fixed.versions).toHaveLength(1);
    expect(fixed.versions[0].rule).toEqual({ type: 'weekdays', days: [2] });
  });

  it('duplicates a habit with its reminders but not its history', async () => {
    const id = await createHabit(db, habitInput({ reminders: [{ time: '08:00', weekdays: [1, 2], enabled: true }] }));
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    const copy = await duplicateHabit(db, id);
    expect((await getHabitContext(db, copy))!.habit.name).toBe('Read (copy)');
    expect(await getReminders(db, copy)).toHaveLength(1);
    expect(await getCompletions(db, { habitId: copy })).toHaveLength(0);
  });

  it('archives and restores without counting the paused days', async () => {
    const id = await createHabit(db, habitInput());
    await archiveHabit(db, id);
    at('2024-01-15T09:00:00');
    await restoreHabit(db, id);
    const ctx = (await getHabitContext(db, id))!;
    expect(ctx.habit.archivedOn).toBeNull();
    expect(ctx.habit.inactiveRanges).toEqual([{ from: '2024-01-10', to: '2024-01-14' }]);
    const summary = daySummary([ctx], new Map(), '2024-01-12', '2024-01-15', 1);
    expect(summary.items).toHaveLength(0);
  });

  it('deletes a habit and all of its records', async () => {
    const id = await createHabit(db, habitInput({ reminders: [{ time: '08:00', weekdays: null, enabled: true }] }));
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    await deleteHabit(db, id);
    expect(await getHabitContexts(db)).toHaveLength(0);
    expect(await getCompletions(db)).toHaveLength(0);
    expect(await getReminders(db)).toHaveLength(0);
    await expect(setCompletion(db, id, '2024-01-06', { status: 'done' })).rejects.toThrow('no longer exists');
  });

  it('reorders habits', async () => {
    const a = await createHabit(db, habitInput({ name: 'A' }));
    const b = await createHabit(db, habitInput({ name: 'B' }));
    await reorderHabits(db, [b, a]);
    expect((await getHabitContexts(db)).map((c) => c.habit.name)).toEqual(['B', 'A']);
  });

  it('rejects invalid list references', async () => {
    await expect(createHabit(db, habitInput({ listId: 'missing' }))).rejects.toThrow('no longer exists');
  });
});

describe('completions', () => {
  it('keeps one record per habit per day (upsert, no duplicates)', async () => {
    const id = await createHabit(db, habitInput());
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    await setCompletion(db, id, '2024-01-05', { status: 'missed' });
    const recs = await getCompletions(db, { habitId: id });
    expect(recs).toHaveLength(1);
    expect(recs[0].status).toBe('missed');
  });

  it('allows editing past days and only skipping future days', async () => {
    const id = await createHabit(db, habitInput());
    await setCompletion(db, id, '2023-12-31', { status: 'done' }); // before start: stored, ignored by stats
    await expect(setCompletion(db, id, '2024-01-11', { status: 'done' })).rejects.toThrow('Future days');
    await setCompletion(db, id, '2024-01-11', { status: 'skipped' });
    expect(await getCompletions(db, { habitId: id })).toHaveLength(2);
  });

  it('toggles and clears', async () => {
    const id = await createHabit(db, habitInput());
    const ctx = (await getHabitContext(db, id))!;
    await toggleDone(db, ctx.habit, '2024-01-10', null);
    const [rec] = await getCompletions(db, { habitId: id });
    expect(rec.status).toBe('done');
    await toggleDone(db, ctx.habit, '2024-01-10', rec);
    expect(await getCompletions(db, { habitId: id })).toHaveLength(0);
    await toggleDone(db, ctx.habit, '2024-01-10', null);
    await clearCompletion(db, id, '2024-01-10');
    expect(await getCompletions(db, { habitId: id })).toHaveLength(0);
  });

  it('derives numeric status from the target', async () => {
    const id = await createHabit(db, habitInput({ kind: 'numeric', target: 10, unit: 'pages' }));
    await logValue(db, id, '2024-01-09', 4);
    await logValue(db, id, '2024-01-10', 12);
    const recs = await getCompletions(db, { habitId: id });
    expect(recs.map((r) => [r.status, r.value])).toEqual([
      ['partial', 4],
      ['done', 12],
    ]);
  });
});

describe('lists', () => {
  it('creates, archives, restores and keeps at least one active list', async () => {
    const fitness = await createList(db, { name: 'Fitness', color: '#E25C5C', icon: '💪' });
    expect((await getLists(db)).map((l) => l.name)).toEqual(['My Habits', 'Fitness']);
    await archiveList(db, fitness);
    await expect(archiveList(db, listId)).rejects.toThrow('at least one');
    await restoreList(db, fitness);
    expect((await getLists(db)).every((l) => l.archivedOn === null)).toBe(true);
  });

  it('deletes a list moving its habits elsewhere, preserving history', async () => {
    const fitness = await createList(db, { name: 'Fitness', color: '#E25C5C', icon: '💪' });
    const h = await createHabit(db, habitInput({ listId: fitness }));
    await setCompletion(db, h, '2024-01-05', { status: 'done' });
    await deleteList(db, fitness, listId);
    const ctx = (await getHabitContext(db, h))!;
    expect(ctx.habit.listId).toBe(listId);
    expect(await getCompletions(db, { habitId: h })).toHaveLength(1);
  });

  it('deletes a list with its habits', async () => {
    const fitness = await createList(db, { name: 'Fitness', color: '#E25C5C', icon: '💪' });
    await createHabit(db, habitInput({ listId: fitness }));
    await deleteList(db, fitness, null);
    expect(await getHabitContexts(db)).toHaveLength(0);
  });

  it('archived list hides its habits for the archived span', async () => {
    const fitness = await createList(db, { name: 'Fitness', color: '#E25C5C', icon: '💪' });
    const h = await createHabit(db, habitInput({ listId: fitness }));
    await archiveList(db, fitness);
    const ctx = (await getHabitContext(db, h))!;
    expect(daySummary([ctx], new Map(), '2024-01-10', '2024-01-10', 1).items).toHaveLength(0);
    expect(daySummary([ctx], new Map(), '2024-01-09', '2024-01-10', 1).items).toHaveLength(1);
  });
});

describe('settings', () => {
  it('merges stored values over defaults', async () => {
    await updateSettings(db, { theme: 'dark', firstDayOfWeek: 0 });
    const s = await getSettings(db);
    expect(s.theme).toBe('dark');
    expect(s.firstDayOfWeek).toBe(0);
    expect(s.density).toBe('comfortable');
  });
});

describe('sync outbox', () => {
  it('queues every write and coalesces repeated edits', async () => {
    const id = await createHabit(db, habitInput());
    await setCompletion(db, id, '2024-01-05', { status: 'done' });
    await setCompletion(db, id, '2024-01-05', { status: 'skipped' });
    const entries = await pendingEntries(db);
    const keys = entries.map((e) => `${e.entity}:${e.recordKey}`);
    expect(keys).toContain(`completions:${id}|2024-01-05`);
    expect(keys.filter((k) => k.startsWith('completions:'))).toHaveLength(1);
    expect(keys).toContain(`habits:${id}`);
  });

  it('does not drop an entry that was re-queued during an in-flight push', async () => {
    const id = await createHabit(db, habitInput());
    const inFlight = await pendingEntries(db);
    at('2024-01-10T12:00:05');
    await setCompletion(db, id, '2024-01-10', { status: 'done' });
    await updateHabit(db, id, habitInput({ name: 'Changed during push' }));
    await acknowledge(db, inFlight);
    const left = await pendingEntries(db);
    expect(left.map((e) => e.entity).sort()).toEqual(['completions', 'habits']);
  });

  it('survives failed transactions without partial writes', async () => {
    const before = await pendingCount(db);
    await expect(createHabit(db, habitInput({ listId: 'nope' }))).rejects.toThrow();
    expect(await pendingCount(db)).toBe(before);
    expect(await getHabitContexts(db)).toHaveLength(0);
  });
});

describe('backup', () => {
  it('round-trips and restores idempotently, merging by recency', async () => {
    const id = await createHabit(db, habitInput());
    await setCompletion(db, id, '2024-01-05', { status: 'done', note: 'great, "really"' });
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));

    const fresh = await createTestDb();
    const first = await restoreBackup(fresh, backup);
    expect(first.written).toBeGreaterThan(0);
    const second = await restoreBackup(fresh, backup);
    expect(second.written).toBe(0);
    expect(await getCompletions(fresh)).toHaveLength(1);

    // A newer local edit is not overwritten by an older backup.
    at('2024-01-11T08:00:00');
    await setCompletion(fresh, id, '2024-01-05', { status: 'skipped' });
    await restoreBackup(fresh, backup);
    expect((await getCompletions(fresh))[0].status).toBe('skipped');

    const csv = await exportCompletionsCsv(db);
    expect(csv.split('\n')[1]).toBe('2024-01-05,My Habits,Read,done,,,"great, ""really"""');
  });

  it('rejects malformed files', async () => {
    await expect(restoreBackup(db, { hello: 'world' })).rejects.toThrow('not a valid');
  });
});
