/**
 * Full-fidelity JSON backup and restore, plus CSV export of completions.
 *
 * Restore merges by stable id: a record is written only if it does not exist
 * locally or the backup's `updated_at` is newer. Restoring the same file twice
 * is a no-op, and restoring never deletes data that is newer on the device.
 */
import { z } from 'zod';

import { nowIso } from '@/lib/clock';
import { UserFacingError } from '@/lib/errors';

import type { Db, SQLValue } from './db';
import { completionKey, enqueue, type SyncEntity } from './outbox';

export const BACKUP_FORMAT = 'habitflow-backup';
export const BACKUP_VERSION = 1;

const TABLES = {
  lists: { table: 'habit_lists', key: ['id'] },
  habits: { table: 'habits', key: ['id'] },
  schedules: { table: 'habit_schedules', key: ['id'] },
  reminders: { table: 'habit_reminders', key: ['id'] },
  completions: { table: 'habit_completions', key: ['habit_id', 'date'] },
} as const satisfies Record<Exclude<SyncEntity, 'settings'>, { table: string; key: string[] }>;

type Row = Record<string, SQLValue>;

const COLUMNS: Record<keyof typeof TABLES, string[]> = {
  lists: ['id', 'name', 'color', 'icon', 'sort_order', 'archived_on', 'inactive_ranges', 'created_at', 'updated_at', 'deleted_at'],
  habits: [
    'id', 'list_id', 'name', 'description', 'icon', 'color', 'category', 'time_of_day', 'kind', 'target', 'unit',
    'target_direction', 'start_date', 'end_date', 'sort_order', 'archived_on', 'inactive_ranges', 'created_at',
    'updated_at', 'deleted_at',
  ],
  schedules: ['id', 'habit_id', 'effective_from', 'rule', 'created_at', 'updated_at', 'deleted_at'],
  reminders: ['id', 'habit_id', 'time', 'weekdays', 'enabled', 'created_at', 'updated_at', 'deleted_at'],
  completions: ['habit_id', 'date', 'status', 'value', 'note', 'created_at', 'updated_at', 'deleted_at'],
};

const sqlValue = z.union([z.string(), z.number(), z.null()]);
const rowSchema = z.record(z.string(), sqlValue);

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object({
    lists: z.array(rowSchema),
    habits: z.array(rowSchema),
    schedules: z.array(rowSchema),
    reminders: z.array(rowSchema),
    completions: z.array(rowSchema),
    settings: z.array(z.object({ key: z.string(), value: z.string(), updated_at: z.string() })),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

export async function exportBackup(db: Db): Promise<Backup> {
  const data = {} as Backup['data'];
  for (const [entity, { table }] of Object.entries(TABLES) as [keyof typeof TABLES, (typeof TABLES)[keyof typeof TABLES]][]) {
    data[entity] = await db.all<Row>(`SELECT ${COLUMNS[entity].join(', ')} FROM ${table}`);
  }
  data.settings = await db.all('SELECT key, value, updated_at FROM settings');
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowIso(), data };
}

export interface RestoreResult {
  written: number;
  skipped: number;
}

export async function restoreBackup(db: Db, raw: unknown): Promise<RestoreResult> {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UserFacingError('This file is not a valid HabitFlow backup.');
  }
  const { data } = parsed.data;
  let written = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    // Parents before children so foreign keys are satisfied.
    for (const entity of ['lists', 'habits', 'schedules', 'reminders', 'completions'] as const) {
      const { table, key } = TABLES[entity];
      const cols = COLUMNS[entity];
      for (const row of data[entity]) {
        if (cols.some((c) => !(c in row)) || typeof row.updated_at !== 'string') {
          skipped++;
          continue;
        }
        const where = key.map((k) => `${k} = ?`).join(' AND ');
        const keyValues = key.map((k) => row[k]);
        const existing = await tx.first<{ updated_at: string }>(
          `SELECT updated_at FROM ${table} WHERE ${where}`,
          keyValues,
        );
        if (existing && existing.updated_at >= row.updated_at) {
          skipped++;
          continue;
        }
        const values = cols.map((c) => row[c]);
        await tx.run(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
           ON CONFLICT(${key.join(', ')}) DO UPDATE SET ${cols
             .filter((c) => !(key as readonly string[]).includes(c))
             .map((c) => `${c} = excluded.${c}`)
             .join(', ')}`,
          values,
        );
        await enqueue(
          tx,
          entity,
          entity === 'completions' ? completionKey(String(row.habit_id), String(row.date)) : String(row.id),
        );
        written++;
      }
    }
    for (const s of data.settings) {
      const existing = await tx.first<{ updated_at: string }>('SELECT updated_at FROM settings WHERE key = ?', [s.key]);
      if (existing && existing.updated_at >= s.updated_at) continue;
      await tx.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [s.key, s.value, s.updated_at],
      );
    }
  });

  return { written, skipped };
}

const csvEscape = (v: SQLValue) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per logged day, joined with habit and list names. */
export async function exportCompletionsCsv(db: Db): Promise<string> {
  const rows = await db.all<Row>(
    `SELECT c.date, l.name AS list, h.name AS habit, c.status, c.value, h.unit, c.note
     FROM habit_completions c
     JOIN habits h ON h.id = c.habit_id
     LEFT JOIN habit_lists l ON l.id = h.list_id
     WHERE c.deleted_at IS NULL AND h.deleted_at IS NULL
     ORDER BY c.date, l.sort_order, h.sort_order`,
  );
  const header = ['date', 'list', 'habit', 'status', 'value', 'unit', 'note'];
  return [header.join(','), ...rows.map((r) => header.map((h) => csvEscape(r[h])).join(','))].join('\n');
}
