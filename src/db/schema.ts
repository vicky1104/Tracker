/**
 * Local SQLite schema and migrations, applied in order using PRAGMA user_version.
 *
 * Conventions
 * - Text UUID primary keys generated on device (stable across sync).
 * - `created_at` / `updated_at` / `deleted_at` are ISO-8601 UTC timestamps.
 *   Deletes are soft (tombstones) so they can be synchronised.
 * - Occurrence dates (`date`, `start_date`, `effective_from`, `archived_on`) are
 *   local calendar dates `YYYY-MM-DD`.
 * - Completions are keyed by (habit_id, date): there can never be two records for
 *   the same habit on the same day, and they are stored apart from habit
 *   configuration so edits never rewrite history.
 */
import { LEGACY_EMOJI_ICONS } from '@/constants/habit-icons';

import type { Db } from './db';

export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE habit_lists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_on TEXT,
    inactive_ranges TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE habits (
    id TEXT PRIMARY KEY NOT NULL,
    list_id TEXT NOT NULL REFERENCES habit_lists(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    time_of_day TEXT NOT NULL DEFAULT 'anytime',
    kind TEXT NOT NULL DEFAULT 'check' CHECK (kind IN ('check', 'numeric')),
    target REAL,
    unit TEXT NOT NULL DEFAULT '',
    target_direction TEXT NOT NULL DEFAULT 'atLeast' CHECK (target_direction IN ('atLeast', 'atMost')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_on TEXT,
    inactive_ranges TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_habits_list ON habits(list_id, sort_order);

  CREATE TABLE habit_schedules (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits(id),
    effective_from TEXT NOT NULL,
    rule TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX idx_schedules_habit_from ON habit_schedules(habit_id, effective_from) WHERE deleted_at IS NULL;

  CREATE TABLE habit_reminders (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits(id),
    time TEXT NOT NULL,
    weekdays TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX idx_reminders_habit ON habit_reminders(habit_id);

  CREATE TABLE habit_completions (
    habit_id TEXT NOT NULL REFERENCES habits(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('done', 'partial', 'skipped', 'missed')),
    value REAL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (habit_id, date)
  );
  CREATE INDEX idx_completions_date ON habit_completions(date);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sync_outbox (
    entity TEXT NOT NULL,
    record_key TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    PRIMARY KEY (entity, record_key)
  );

  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,

  // v2 — habit/list icons: emoji → icon keys (rendering also tolerates legacy values)
  ['habits', 'habit_lists']
    .map((table) => {
      const cases = Object.entries(LEGACY_EMOJI_ICONS)
        .map(([emoji, key]) => `WHEN '${emoji.replace(/'/g, "''")}' THEN '${key}'`)
        .join(' ');
      return `UPDATE ${table} SET icon = CASE icon ${cases} ELSE icon END;`;
    })
    .join('\n'),
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${current} is newer than this app (v${SCHEMA_VERSION}). Please update the app.`,
    );
  }
  if (current === 0) {
    await db.exec("PRAGMA journal_mode = 'wal';");
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
