import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Drizzle table definitions — the typed query layer. Actual table creation
 * happens via the plain-SQL statements in client.ts (no drizzle-kit CLI/
 * migration runner needed for a scaffold this size — hand-rolled CREATE
 * TABLE IF NOT EXISTS is simpler to reason about and just as correct).
 */
export const downloads = sqliteTable("downloads", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  filepath: text("filepath"),
  sizeBytes: integer("size_bytes"), // null = unknown total, never fabricated
  downloadedBytes: integer("downloaded_bytes").notNull().default(0),
  avgSpeedBps: real("avg_speed_bps"), // computed once, from real elapsed time — see queue-manager.ts
  sourceType: text("source_type").notNull(), // 'http' | 'social' | 'torrent'
  platform: text("platform"),
  status: text("status").notNull(), // DownloadStatus
  format: text("format"),
  quality: text("quality"),
  errorMessage: text("error_message"),
  segments: integer("segments").notNull().default(1),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  scheduledFor: text("scheduled_for"), // ISO datetime — null = start immediately
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
});

export type DownloadRow = typeof downloads.$inferSelect;
export type NewDownloadRow = typeof downloads.$inferInsert;
