import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import * as schema from "./schema";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS downloads (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT,
  size_bytes INTEGER,
  downloaded_bytes INTEGER NOT NULL DEFAULT 0,
  avg_speed_bps REAL,
  source_type TEXT NOT NULL,
  platform TEXT,
  status TEXT NOT NULL,
  format TEXT,
  quality TEXT,
  error_message TEXT,
  segments INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let dbInstance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteInstance: Database.Database | null = null;

/**
 * ONE long-lived connection for the app's entire lifetime, opened in WAL
 * mode. This directly replaces the old app's "open a fresh sqlite connection
 * per single query" pattern (a real perf bug found in the PyQt audit) and
 * removes the writer-thread-deadlock class of bug entirely — there's no
 * separate writer queue/thread to get out of sync with a shutdown flag.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (dbInstance) return dbInstance;

  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "shanutechx.db");

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  // WAL + synchronous=NORMAL is SQLite's own documented recommended pairing:
  // WAL already makes the database file itself crash-safe without an fsync
  // on every commit, so NORMAL (fsync only at WAL checkpoints, not every
  // transaction) is safe here — the only realistic risk is losing the last
  // few transactions on a power-loss/OS crash (not an app crash), which for
  // this table is at most a stale progress-byte count that gets overwritten
  // on the next tick anyway. better-sqlite3 is synchronous and runs on
  // Electron's main thread, so every write briefly blocks IPC/UI handling —
  // this materially cuts that per-write cost, on top of the write-frequency
  // throttle in downloads-repo.ts's updateProgress().
  sqliteInstance.pragma("synchronous = NORMAL");
  sqliteInstance.pragma("foreign_keys = ON");
  sqliteInstance.exec(SCHEMA_SQL);

  dbInstance = drizzle(sqliteInstance, { schema });
  return dbInstance;
}

/** Called only from the shutdown state machine's "db-flush" phase. */
export function closeDb(): void {
  sqliteInstance?.close();
  dbInstance = null;
  sqliteInstance = null;
}
