/**
 * Minimal database interface used by repositories. Implemented by an expo-sqlite
 * adapter in the app and by a node:sqlite adapter in integration tests, so the
 * repository code is exercised against real SQLite in both.
 */
export type SQLValue = string | number | null;

export interface Db {
  exec(sql: string): Promise<void>;
  /** Returns the number of changed rows. */
  run(sql: string, params?: SQLValue[]): Promise<number>;
  all<T>(sql: string, params?: SQLValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SQLValue[]): Promise<T | null>;
  /**
   * Runs `fn` atomically. Writes are serialised through a single queue so two
   * transactions can never interleave on the shared connection.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

interface RawConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SQLValue[]): Promise<number>;
  all<T>(sql: string, params: SQLValue[]): Promise<T[]>;
  first<T>(sql: string, params: SQLValue[]): Promise<T | null>;
}

/** Wraps a raw connection with a write queue and BEGIN/COMMIT/ROLLBACK handling. */
export function createDb(conn: RawConnection): Db {
  let queue: Promise<unknown> = Promise.resolve();

  const inner: Db = {
    exec: (sql) => conn.exec(sql),
    run: (sql, params = []) => conn.run(sql, params),
    all: (sql, params = []) => conn.all(sql, params),
    first: (sql, params = []) => conn.first(sql, params),
    transaction: (fn) => fn(inner), // nested: already inside the outer transaction
  };

  return {
    ...inner,
    transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const task = queue.then(async () => {
        await conn.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(inner);
          await conn.exec('COMMIT');
          return result;
        } catch (error) {
          await conn.exec('ROLLBACK');
          throw error;
        }
      });
      // Keep the queue alive regardless of this task's outcome.
      queue = task.catch(() => undefined);
      return task;
    },
  };
}
