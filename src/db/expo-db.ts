import type { SQLiteDatabase } from 'expo-sqlite';

import { createDb, type Db } from './db';

export function fromExpoDatabase(database: SQLiteDatabase): Db {
  return createDb({
    exec: (sql) => database.execAsync(sql),
    run: async (sql, params) => (await database.runAsync(sql, params)).changes,
    all: (sql, params) => database.getAllAsync(sql, params),
    first: (sql, params) => database.getFirstAsync(sql, params),
  });
}
