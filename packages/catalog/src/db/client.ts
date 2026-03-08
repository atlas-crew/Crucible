import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/**
 * Create a Drizzle ORM database instance backed by SQLite.
 *
 * @param path - File path for the SQLite database, or ':memory:' for in-memory (default)
 * @returns An object with `db` (Drizzle instance) and `close()` for graceful shutdown
 */
export function createDb(path: string = ':memory:') {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return Object.assign(db, {
    close: (): void => { sqlite.close(); },
  });
}

export type CrucibleDb = ReturnType<typeof createDb>;
