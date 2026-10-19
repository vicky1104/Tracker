/**
 * Offline-first synchronisation engine.
 *
 * Push: drain the local outbox (oldest first, parents before children). For each
 * queued key the *current* local row is read and upserted remotely, so retries
 * and duplicate requests are idempotent. Entries are acknowledged only if they
 * were not re-queued while the request was in flight.
 *
 * Pull: per table, fetch rows whose server timestamp is newer than our cursor
 * and merge them locally.
 *
 * Conflict resolution: per-record last-writer-wins on the client `updated_at`
 * timestamp. The server enforces the same rule with a trigger that ignores
 * older writes, so a device that was offline for a week cannot overwrite newer
 * edits. Completions are keyed by (habit_id, date), so two devices logging the
 * same day converge on a single record. Deletions are tombstones (`deleted_at`)
 * and follow the same rule.
 */
import type { Db, SQLValue } from '@/db/db';
import {
  acknowledge,
  completionKey,
  enqueue,
  getSyncState,
  markFailed,
  parseCompletionKey,
  pendingEntries,
  setSyncState,
  type OutboxEntry,
  type SyncEntity,
} from '@/db/outbox';
import { DEFAULT_LIST, ensureDefaultList } from '@/db/lists';
import { getSettings } from '@/db/settings';

export type RemoteTable =
  | 'habit_lists'
  | 'habits'
  | 'habit_schedules'
  | 'habit_reminders'
  | 'habit_completions'
  | 'user_settings';

export type RemoteRow = Record<string, unknown>;

export interface RemoteAdapter {
  upsert(table: RemoteTable, rows: RemoteRow[], onConflict: string): Promise<void>;
  /** Rows with `server_updated_at >= since`, ascending, at most `limit`. */
  fetchChanges(table: RemoteTable, since: string | null, limit: number): Promise<RemoteRow[]>;
}

interface TableSpec {
  entity: Exclude<SyncEntity, 'settings'>;
  local: string;
  remote: RemoteTable;
  key: string[];
  columns: string[];
  json: string[];
  bool: string[];
}

const SPECS: TableSpec[] = [
  {
    entity: 'lists',
    local: 'habit_lists',
    remote: 'habit_lists',
    key: ['id'],
    columns: ['id', 'name', 'color', 'icon', 'sort_order', 'archived_on', 'inactive_ranges', 'created_at', 'updated_at', 'deleted_at'],
    json: ['inactive_ranges'],
    bool: [],
  },
  {
    entity: 'habits',
    local: 'habits',
    remote: 'habits',
    key: ['id'],
    columns: [
      'id', 'list_id', 'name', 'description', 'icon', 'color', 'category', 'time_of_day', 'kind', 'target', 'unit',
      'target_direction', 'start_date', 'end_date', 'sort_order', 'archived_on', 'inactive_ranges', 'created_at',
      'updated_at', 'deleted_at',
    ],
    json: ['inactive_ranges'],
    bool: [],
  },
  {
    entity: 'schedules',
    local: 'habit_schedules',
    remote: 'habit_schedules',
    key: ['id'],
    columns: ['id', 'habit_id', 'effective_from', 'rule', 'created_at', 'updated_at', 'deleted_at'],
    json: ['rule'],
    bool: [],
  },
  {
    entity: 'reminders',
    local: 'habit_reminders',
    remote: 'habit_reminders',
    key: ['id'],
    columns: ['id', 'habit_id', 'time', 'weekdays', 'enabled', 'created_at', 'updated_at', 'deleted_at'],
    json: ['weekdays'],
    bool: ['enabled'],
  },
  {
    entity: 'completions',
    local: 'habit_completions',
    remote: 'habit_completions',
    key: ['habit_id', 'date'],
    columns: ['habit_id', 'date', 'status', 'value', 'note', 'created_at', 'updated_at', 'deleted_at'],
    json: [],
    bool: [],
  },
];

const PAGE = 500;

export function toRemote(spec: TableSpec, row: Record<string, SQLValue>, userId: string): RemoteRow {
  const out: RemoteRow = { user_id: userId };
  for (const c of spec.columns) {
    const v = row[c];
    if (spec.json.includes(c)) out[c] = v == null ? null : JSON.parse(String(v));
    else if (spec.bool.includes(c)) out[c] = v === 1;
    else out[c] = v;
  }
  return out;
}

export function toLocal(spec: TableSpec, row: RemoteRow): Record<string, SQLValue> {
  const out: Record<string, SQLValue> = {};
  for (const c of spec.columns) {
    const v = row[c];
    if (spec.json.includes(c)) out[c] = v == null ? (c === 'inactive_ranges' ? '[]' : null) : JSON.stringify(v);
    else if (spec.bool.includes(c)) out[c] = v ? 1 : 0;
    else if (typeof v === 'string' || typeof v === 'number' || v === null) out[c] = v;
    else if (v === undefined) out[c] = null;
    else out[c] = String(v);
  }
  // Normalise timestamps so string comparison between devices is consistent.
  for (const c of ['created_at', 'updated_at', 'deleted_at']) {
    if (typeof out[c] === 'string') out[c] = new Date(out[c] as string).toISOString();
  }
  return out;
}

function keyOf(spec: TableSpec, entry: OutboxEntry): SQLValue[] {
  if (spec.entity === 'completions') {
    const { habitId, date } = parseCompletionKey(entry.recordKey);
    return [habitId, date];
  }
  return [entry.recordKey];
}

export async function pushChanges(db: Db, remote: RemoteAdapter, userId: string): Promise<number> {
  let pushed = 0;
  for (;;) {
    const entries = await pendingEntries(db, PAGE);
    if (entries.length === 0) return pushed;

    for (const spec of SPECS) {
      const group = entries.filter((e) => e.entity === spec.entity);
      if (group.length === 0) continue;
      const rows: RemoteRow[] = [];
      for (const e of group) {
        const where = spec.key.map((k) => `${k} = ?`).join(' AND ');
        const row = await db.first<Record<string, SQLValue>>(
          `SELECT ${spec.columns.join(', ')} FROM ${spec.local} WHERE ${where}`,
          keyOf(spec, e),
        );
        if (row) rows.push(toRemote(spec, row, userId));
      }
      try {
        if (rows.length) await remote.upsert(spec.remote, rows, spec.key.join(','));
        await acknowledge(db, group);
        pushed += rows.length;
      } catch (error) {
        await markFailed(db, group, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    const settings = entries.filter((e) => e.entity === 'settings');
    if (settings.length) {
      const row = await db.first<{ updated_at: string | null }>('SELECT MAX(updated_at) AS updated_at FROM settings');
      const s = await getSettings(db);
      try {
        await remote.upsert(
          'user_settings',
          [{ user_id: userId, settings: s, time_zone: s.timeZone, updated_at: row?.updated_at ?? new Date(0).toISOString() }],
          'user_id',
        );
        await acknowledge(db, settings);
        pushed++;
      } catch (error) {
        await markFailed(db, settings, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    if (entries.length < PAGE) return pushed;
  }
}

async function applyRemoteRow(tx: Db, spec: TableSpec, remoteRow: RemoteRow): Promise<boolean> {
  const row = toLocal(spec, remoteRow);
  const where = spec.key.map((k) => `${k} = ?`).join(' AND ');
  const keyValues = spec.key.map((k) => row[k]);
  const local = await tx.first<{ updated_at: string }>(`SELECT updated_at FROM ${spec.local} WHERE ${where}`, keyValues);
  if (local && local.updated_at >= String(row.updated_at)) return false; // local is newer or equal: keep
  const cols = spec.columns;
  await tx.run(
    `INSERT INTO ${spec.local} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(${spec.key.join(', ')}) DO UPDATE SET ${cols
       .filter((c) => !spec.key.includes(c))
       .map((c) => `${c} = excluded.${c}`)
       .join(', ')}`,
    cols.map((c) => row[c]),
  );
  return true;
}

export async function pullChanges(db: Db, remote: RemoteAdapter): Promise<number> {
  let applied = 0;
  // Rows can arrive before their parents (e.g. a habit whose list was edited
  // later); parent existence is validated by the repositories on write instead.
  await db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const spec of SPECS) {
      const cursorKey = `cursor:${spec.remote}`;
      let cursor = await getSyncState(db, cursorKey);
      for (;;) {
        const rows = await remote.fetchChanges(spec.remote, cursor, PAGE);
        if (rows.length === 0) break;
        await db.transaction(async (tx) => {
          for (const r of rows) if (await applyRemoteRow(tx, spec, r)) applied++;
        });
        const last = String(rows[rows.length - 1].server_updated_at);
        const stuck = last === cursor;
        cursor = last;
        await setSyncState(db, cursorKey, cursor);
        if (rows.length < PAGE || stuck) break;
      }
    }

    const cursorKey = 'cursor:user_settings';
    const settingsRows = await remote.fetchChanges('user_settings', await getSyncState(db, cursorKey), 1);
    const remoteSettings = settingsRows[0] as { settings?: Record<string, unknown>; updated_at?: string; server_updated_at?: string } | undefined;
    if (remoteSettings?.settings && remoteSettings.updated_at) {
      const local = await db.first<{ updated_at: string | null }>('SELECT MAX(updated_at) AS updated_at FROM settings');
      const remoteTs = new Date(remoteSettings.updated_at).toISOString();
      if (!local?.updated_at || local.updated_at < remoteTs) {
        await db.transaction(async (tx) => {
          for (const [key, value] of Object.entries(remoteSettings.settings!)) {
            if (key === 'timeZone') continue; // device-specific
            await tx.run(
              `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              [key, JSON.stringify(value), remoteTs],
            );
          }
        });
        applied++;
      }
      await setSyncState(db, cursorKey, String(remoteSettings.server_updated_at));
    }
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
  return applied;
}

/**
 * Queues every local record. Used when a guest signs in for the first time (or
 * switches account) so all existing data is uploaded. Upserts by stable id mean
 * this never creates duplicates, even if it runs more than once.
 */
export async function enqueueAll(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const spec of SPECS) {
      const rows = await tx.all<Record<string, SQLValue>>(`SELECT ${spec.key.join(', ')} FROM ${spec.local}`);
      for (const r of rows) {
        await enqueue(tx, spec.entity, spec.entity === 'completions' ? completionKey(String(r.habit_id), String(r.date)) : String(r.id));
      }
    }
    await enqueue(tx, 'settings', 'user');
  });
}

/** Prepares local state for a (possibly different) signed-in user. */
export async function bindUser(db: Db, userId: string): Promise<void> {
  const bound = await getSyncState(db, 'user_id');
  if (bound === userId) return;
  await discardUntouchedDefaultList(db);
  await db.exec("DELETE FROM sync_state WHERE key LIKE 'cursor:%'");
  await enqueueAll(db);
  await setSyncState(db, 'user_id', userId);
}

/**
 * A fresh install auto-creates an empty default list. When that device signs
 * into an existing account, drop it so the user doesn't end up with two
 * "My Habits" lists. Lists the user created or edited are always kept.
 */
async function discardUntouchedDefaultList(db: Db): Promise<void> {
  const habits = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM habits');
  if ((habits?.n ?? 0) > 0) return;
  const lists = await db.all<{ id: string; name: string; created_at: string; updated_at: string }>(
    'SELECT id, name, created_at, updated_at FROM habit_lists',
  );
  if (lists.length !== 1) return;
  const [only] = lists;
  if (only.name !== DEFAULT_LIST.name || only.created_at !== only.updated_at) return;
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM habit_lists WHERE id = ?', [only.id]);
    await tx.run("DELETE FROM sync_outbox WHERE entity = 'lists' AND record_key = ?", [only.id]);
  });
}

export async function syncAll(db: Db, remote: RemoteAdapter, userId: string): Promise<{ pushed: number; pulled: number }> {
  await bindUser(db, userId);
  const pushed = await pushChanges(db, remote, userId);
  const pulled = await pullChanges(db, remote);
  await ensureDefaultList(db);
  return { pushed, pulled };
}
