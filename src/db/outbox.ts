/**
 * Sync outbox. Every local write enqueues `(entity, record_key)` in the same
 * transaction, so a change is never persisted without also being queued. The
 * queue is coalesced: re-editing a record before sync just refreshes its entry.
 * The syncer reads the *current* row at push time, so pushes are idempotent.
 */
import { nowIso } from '@/lib/clock';

import type { Db } from './db';

export type SyncEntity = 'lists' | 'habits' | 'schedules' | 'reminders' | 'completions' | 'settings';

export interface OutboxEntry {
  entity: SyncEntity;
  recordKey: string;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

export function completionKey(habitId: string, date: string): string {
  return `${habitId}|${date}`;
}

export function parseCompletionKey(key: string): { habitId: string; date: string } {
  const [habitId, date] = key.split('|');
  return { habitId, date };
}

export async function enqueue(db: Db, entity: SyncEntity, recordKey: string): Promise<void> {
  await db.run(
    `INSERT INTO sync_outbox (entity, record_key, queued_at, attempts, last_error)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(entity, record_key) DO UPDATE SET queued_at = excluded.queued_at, attempts = 0, last_error = NULL`,
    [entity, recordKey, nowIso()],
  );
}

export async function pendingEntries(db: Db, limit = 200): Promise<OutboxEntry[]> {
  const rows = await db.all<{
    entity: SyncEntity;
    record_key: string;
    queued_at: string;
    attempts: number;
    last_error: string | null;
  }>('SELECT * FROM sync_outbox ORDER BY queued_at LIMIT ?', [limit]);
  return rows.map((r) => ({
    entity: r.entity,
    recordKey: r.record_key,
    queuedAt: r.queued_at,
    attempts: r.attempts,
    lastError: r.last_error,
  }));
}

export async function pendingCount(db: Db): Promise<number> {
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
  return row?.n ?? 0;
}

/**
 * Removes entries that were pushed — but only if they were not re-queued while
 * the push was in flight (queued_at unchanged), so no edit is ever lost.
 */
export async function acknowledge(db: Db, entries: OutboxEntry[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx.run('DELETE FROM sync_outbox WHERE entity = ? AND record_key = ? AND queued_at = ?', [
        e.entity,
        e.recordKey,
        e.queuedAt,
      ]);
    }
  });
}

export async function markFailed(db: Db, entries: OutboxEntry[], error: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx.run(
        'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE entity = ? AND record_key = ?',
        [error.slice(0, 500), e.entity, e.recordKey],
      );
    }
  });
}

export async function getSyncState(db: Db, key: string): Promise<string | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSyncState(db: Db, key: string, value: string): Promise<void> {
  await db.run(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
