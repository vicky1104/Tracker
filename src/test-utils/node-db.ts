/**
 * node:sqlite-backed implementation of the `Db` interface for integration tests.
 * Uses the same `createDb` wrapper (write queue + transactions) as the app.
 */
import { createDb, type Db, type SQLValue } from '@/db/db';
import { migrate } from '@/db/schema';

interface StatementSync {
  run(...params: SQLValue[]): { changes: number | bigint };
  all(...params: SQLValue[]): unknown[];
  get(...params: SQLValue[]): unknown;
}
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
}

export async function createTestDb(): Promise<Db> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- node built-in, test only
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };
  const conn = new DatabaseSync(':memory:');
  const db = createDb({
    exec: async (sql) => conn.exec(sql),
    run: async (sql, params) => Number(conn.prepare(sql).run(...params).changes),
    all: async <T,>(sql: string, params: SQLValue[]) => conn.prepare(sql).all(...params) as T[],
    first: async <T,>(sql: string, params: SQLValue[]) => (conn.prepare(sql).get(...params) as T | undefined) ?? null,
  });
  await migrate(db);
  return db;
}
