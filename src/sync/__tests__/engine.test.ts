/**
 * @jest-environment node
 */
import { getCompletions, setCompletion } from '@/db/completions';
import type { Db } from '@/db/db';
import { createHabit, deleteHabit, getHabitContexts } from '@/db/habits';
import { ensureDefaultList, getLists } from '@/db/lists';
import { pendingCount, pendingEntries } from '@/db/outbox';
import { getSettings, updateSettings } from '@/db/settings';
import type { HabitFormValues } from '@/domain/validation';
import { setClock } from '@/lib/clock';
import { createTestDb } from '@/test-utils/node-db';

import { syncAll, type RemoteAdapter, type RemoteRow, type RemoteTable } from '../engine';

/** In-memory stand-in for Supabase that applies the same LWW rule as the SQL trigger. */
class FakeRemote implements RemoteAdapter {
  tables = new Map<RemoteTable, Map<string, RemoteRow>>();
  clock = 0;
  fail = false;
  upserts = 0;

  async upsert(table: RemoteTable, rows: RemoteRow[], onConflict: string) {
    if (this.fail) throw new Error('network down');
    this.upserts++;
    const t = this.tables.get(table) ?? new Map<string, RemoteRow>();
    this.tables.set(table, t);
    for (const row of rows) {
      const key = onConflict.split(',').map((k) => String(row[k])).join('|');
      const existing = t.get(key);
      if (existing && String(existing.updated_at) > String(row.updated_at)) continue; // stale write ignored
      t.set(key, { ...row, server_updated_at: String(++this.clock).padStart(10, '0') });
    }
  }

  async fetchChanges(table: RemoteTable, since: string | null, limit: number) {
    if (this.fail) throw new Error('network down');
    return [...(this.tables.get(table)?.values() ?? [])]
      .filter((r) => !since || String(r.server_updated_at) >= since)
      .sort((a, b) => String(a.server_updated_at).localeCompare(String(b.server_updated_at)))
      .slice(0, limit);
  }

  rows(table: RemoteTable) {
    return [...(this.tables.get(table)?.values() ?? [])];
  }
}

const USER = 'user-1';
const at = (iso: string) => setClock(() => new Date(iso));

async function habit(db: Db, overrides: Partial<HabitFormValues> = {}) {
  const listId = await ensureDefaultList(db);
  return createHabit(db, {
    name: 'Meditate',
    description: '',
    icon: '🧘',
    color: '#2F9E7E',
    listId,
    category: 'mindfulness',
    timeOfDay: 'morning',
    kind: 'check',
    target: null,
    unit: '',
    targetDirection: 'atLeast',
    rule: { type: 'daily' },
    startDate: '2024-01-01',
    endDate: null,
    reminders: [{ time: '07:00', weekdays: null, enabled: true }],
    ...overrides,
  });
}

let remote: FakeRemote;
let a: Db;
let b: Db;

beforeEach(async () => {
  at('2024-01-10T08:00:00Z');
  remote = new FakeRemote();
  a = await createTestDb();
  b = await createTestDb();
});

afterAll(() => setClock(null));

describe('sync engine', () => {
  it('uploads guest data created offline and downloads it on another device', async () => {
    const id = await habit(a);
    await setCompletion(a, id, '2024-01-09', { status: 'done' });
    await updateSettings(a, { firstDayOfWeek: 0 });

    const res = await syncAll(a, remote, USER);
    expect(res.pushed).toBeGreaterThan(0);
    expect(await pendingCount(a)).toBe(0);
    expect(remote.rows('habits')[0]).toMatchObject({ id, user_id: USER, inactive_ranges: [] });
    expect(remote.rows('habit_reminders')[0]).toMatchObject({ enabled: true, weekdays: null });

    await syncAll(b, remote, USER);
    const ctxs = await getHabitContexts(b);
    expect(ctxs.map((c) => c.habit.id)).toContain(id);
    expect(ctxs.find((c) => c.habit.id === id)!.versions[0].rule).toEqual({ type: 'daily' });
    expect(await getCompletions(b, { habitId: id })).toHaveLength(1);
    expect((await getSettings(b)).firstDayOfWeek).toBe(0);
    // B's untouched auto-created list was dropped instead of duplicating "My Habits".
    expect((await getLists(b)).map((l) => l.name)).toEqual(['My Habits']);
  });

  it('is idempotent: repeated syncs create no duplicates', async () => {
    const id = await habit(a);
    await setCompletion(a, id, '2024-01-09', { status: 'done' });
    await syncAll(a, remote, USER);
    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);
    await syncAll(b, remote, USER);
    expect(remote.rows('habit_completions')).toHaveLength(1);
    expect(await getCompletions(b)).toHaveLength(1);
  });

  it('resolves concurrent edits with last-writer-wins and converges both devices', async () => {
    const id = await habit(a);
    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);

    at('2024-01-10T09:00:00Z');
    await setCompletion(a, id, '2024-01-10', { status: 'done' });
    at('2024-01-10T09:05:00Z');
    await setCompletion(b, id, '2024-01-10', { status: 'skipped' }); // later edit wins

    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);
    await syncAll(a, remote, USER);

    expect((await getCompletions(a, { habitId: id }))[0].status).toBe('skipped');
    expect((await getCompletions(b, { habitId: id }))[0].status).toBe('skipped');
  });

  it('never lets a stale offline device overwrite a newer edit', async () => {
    const id = await habit(a);
    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);

    at('2024-01-10T07:00:00Z'); // B's clock/edit is older
    await setCompletion(b, id, '2024-01-09', { status: 'missed' });
    at('2024-01-10T10:00:00Z');
    await setCompletion(a, id, '2024-01-09', { status: 'done' });

    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);
    expect(remote.rows('habit_completions')[0].status).toBe('done');
    expect((await getCompletions(b, { habitId: id }))[0].status).toBe('done');
  });

  it('propagates deletions as tombstones', async () => {
    const id = await habit(a);
    await setCompletion(a, id, '2024-01-09', { status: 'done' });
    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);

    at('2024-01-10T11:00:00Z');
    await deleteHabit(a, id);
    await syncAll(a, remote, USER);
    await syncAll(b, remote, USER);
    expect(await getHabitContexts(b)).toHaveLength(0);
    expect(await getCompletions(b)).toHaveLength(0);
  });

  it('keeps queued changes when the network fails and retries safely', async () => {
    const id = await habit(a);
    await setCompletion(a, id, '2024-01-09', { status: 'done' });
    remote.fail = true;
    await expect(syncAll(a, remote, USER)).rejects.toThrow('network down');
    const queued = await pendingEntries(a);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.some((e) => e.attempts > 0 && e.lastError === 'network down')).toBe(true);

    remote.fail = false;
    await syncAll(a, remote, USER);
    expect(await pendingCount(a)).toBe(0);
    expect(remote.rows('habit_completions')).toHaveLength(1);
  });

  it('re-uploads everything when switching to a different account', async () => {
    await habit(a);
    await syncAll(a, remote, USER);
    const other = new FakeRemote();
    await syncAll(a, other, 'user-2');
    expect(other.rows('habits')).toHaveLength(1);
    expect(other.rows('habits')[0].user_id).toBe('user-2');
  });
});
