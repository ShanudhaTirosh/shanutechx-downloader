import { eq, desc } from "drizzle-orm";
import { getDb } from "./client";
import { downloads, type DownloadRow } from "./schema";
import type { DownloadRecord, DownloadStatus, SourceType } from "@shanutechx/shared-types";

function rowToRecord(row: DownloadRow): DownloadRecord {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename,
    filepath: row.filepath,
    sizeBytes: row.sizeBytes,
    downloadedBytes: row.downloadedBytes,
    speedBps: 0, // instantaneous speed is runtime-only state, never persisted/read from DB
    avgSpeedBps: row.avgSpeedBps,
    sourceType: row.sourceType as SourceType,
    platform: row.platform,
    status: row.status as DownloadStatus,
    format: row.format,
    quality: row.quality,
    errorMessage: row.errorMessage,
    segments: row.segments,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export const downloadsRepo = {
  insert(row: {
    id: string; url: string; filename: string; sourceType: SourceType;
    platform?: string | null; format?: string | null; quality?: string | null; segments?: number;
  }): void {
    getDb().insert(downloads).values({
      id: row.id,
      url: row.url,
      filename: row.filename,
      filepath: null,
      sizeBytes: null,
      downloadedBytes: 0,
      status: "queued",
      sourceType: row.sourceType,
      platform: row.platform ?? null,
      format: row.format ?? null,
      quality: row.quality ?? null,
      segments: row.segments ?? 1,
      createdAt: new Date().toISOString(),
    }).run();
  },

  // Progress ticks land here from both the HTTP and social-extractor engines
  // — each of those already throttles its own onProgress callback (Phase 1
  // + this pass), but downloadedBytes/sizeBytes only matter for surviving an
  // app restart mid-download; the live UI number comes from the IPC
  // broadcast, not from reading this back. So the DB write itself is
  // throttled independently, and coarser than the UI feed: better-sqlite3
  // is a synchronous call on Electron's main thread, so every write here
  // briefly blocks IPC/UI handling, and there's no benefit to persisting a
  // resumability checkpoint more often than every couple of seconds.
  _lastProgressWriteAt: new Map<string, number>(),
  updateProgress(id: string, downloadedBytes: number, sizeBytes: number | null): void {
    const now = Date.now();
    const last = downloadsRepo._lastProgressWriteAt.get(id) ?? 0;
    if (now - last < 2000) return;
    downloadsRepo._lastProgressWriteAt.set(id, now);
    getDb().update(downloads).set({ downloadedBytes, sizeBytes }).where(eq(downloads.id, id)).run();
  },

  updateStatus(id: string, status: DownloadStatus, errorMessage?: string | null): void {
    if (status === "failed" || status === "cancelled") downloadsRepo._lastProgressWriteAt.delete(id);
    getDb().update(downloads).set({ status, errorMessage: errorMessage ?? null }).where(eq(downloads.id, id)).run();
  },

  setResolvedMeta(id: string, filename: string, sizeBytes: number | null, segments: number): void {
    getDb().update(downloads).set({ filename, sizeBytes, segments }).where(eq(downloads.id, id)).run();
  },

  /**
   * avgSpeedBps here is ALWAYS a real elapsed-time-based figure computed once
   * by QueueManager at completion — never a placeholder like the old app's
   * hardcoded `elapsed = 0` bug. See queue-manager.ts `finishDownload()`.
   */
  complete(id: string, filepath: string, sizeBytes: number, avgSpeedBps: number): void {
    downloadsRepo._lastProgressWriteAt.delete(id);
    getDb().update(downloads).set({
      status: "complete", filepath, sizeBytes, downloadedBytes: sizeBytes, avgSpeedBps,
      completedAt: new Date().toISOString(),
    }).where(eq(downloads.id, id)).run();
  },

  list(): DownloadRecord[] {
    return getDb().select().from(downloads).orderBy(desc(downloads.createdAt)).all().map(rowToRecord);
  },

  get(id: string): DownloadRecord | null {
    const row = getDb().select().from(downloads).where(eq(downloads.id, id)).get();
    return row ? rowToRecord(row) : null;
  },

  /**
   * Finds an existing download for this exact URL that isn't in a terminal
   * "gone" state (failed/cancelled don't count as a duplicate — re-trying a
   * failed download is the normal, expected thing to do, not something to
   * warn about). Used to power the "you already downloaded/are downloading
   * this" confirmation in the Add Download flow.
   */
  findActiveOrCompleteByUrl(url: string): DownloadRecord | null {
    const rows = getDb().select().from(downloads).where(eq(downloads.url, url)).orderBy(desc(downloads.createdAt)).all();
    const match = rows.find((r) => r.status !== "failed" && r.status !== "cancelled");
    return match ? rowToRecord(match) : null;
  },

  remove(id: string): void {
    downloadsRepo._lastProgressWriteAt.delete(id);
    getDb().delete(downloads).where(eq(downloads.id, id)).run();
  },

  stats(): { totalCompleted: number; totalFailed: number; totalBytesDownloaded: number } {
    const rows = getDb().select().from(downloads).all();
    return {
      totalCompleted: rows.filter((r) => r.status === "complete").length,
      totalFailed: rows.filter((r) => r.status === "failed").length,
      totalBytesDownloaded: rows.filter((r) => r.status === "complete").reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0),
    };
  },
};
