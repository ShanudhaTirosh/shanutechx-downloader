import { request, type Dispatcher } from "undici";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { resolveMeta } from "./resolve-meta";
import { reserveUniqueFilepath } from "../../utils/filename";
import { TokenBucket } from "../../utils/token-bucket";

export interface SegmentPlan { index: number; start: number; end: number; tempPath: string }

export interface DownloadJobEvents {
  onProgress: (downloadedBytes: number, sizeBytes: number | null) => void;
  onResolved: (filename: string, sizeBytes: number | null, segmentCount: number) => void;
  onStatus: (status: "downloading" | "merging" | "complete" | "failed" | "cancelled", errorMessage?: string) => void;
}

/**
 * One HTTP download's full lifecycle: resolve -> segment -> fetch (async,
 * concurrent — NOT OS threads; Node's event loop handles concurrent network
 * I/O natively, so there's no analogue of the old app's raw-thread-per-
 * segment model or its associated thread-count/scalability concerns) ->
 * merge -> done. Every byte written passes through the caller-supplied
 * token buckets, so global + per-file speed limits are always the real
 * aggregate rate (audit fix, §3.1 / §2.7).
 */
export class DownloadJob {
  readonly id: string;
  readonly url: string;
  private saveDir: string;
  private requestedSegmentCount: number;
  private dispatcher?: Dispatcher;
  private retryAttempts: number;

  private abortController = new AbortController();
  private pausedResolvers: (() => void)[] = [];
  private isPaused = false;

  private segments: SegmentPlan[] = [];
  private segmentBytesDone: number[] = [];
  private filename = "";
  private sizeBytes: number | null = null;
  private finalFilepath = "";
  private startedAt = 0;

  constructor(id: string, url: string, saveDir: string, requestedSegmentCount: number, dispatcher?: Dispatcher, retryAttempts = 3) {
    this.id = id;
    this.url = url;
    this.saveDir = saveDir;
    this.requestedSegmentCount = requestedSegmentCount;
    this.dispatcher = dispatcher;
    this.retryAttempts = retryAttempts;
  }

  get downloadedBytes(): number {
    return this.segmentBytesDone.reduce((a, b) => a + b, 0);
  }

  pause(): void { this.isPaused = true; }
  resume(): void {
    this.isPaused = false;
    this.pausedResolvers.splice(0).forEach((r) => r());
  }
  cancel(): void { this.abortController.abort(); this.resume(); }

  private async waitIfPaused(): Promise<void> {
    if (!this.isPaused) return;
    await new Promise<void>((resolve) => this.pausedResolvers.push(resolve));
  }

  async run(events: DownloadJobEvents, globalBucket: TokenBucket, perFileBucket: TokenBucket): Promise<void> {
    this.startedAt = Date.now();
    try {
      const meta = await resolveMeta(this.url, this.dispatcher);
      this.filename = meta.filename;
      this.sizeBytes = meta.sizeBytes;
      
      // Use actualUrl if provided (for redirected URLs like Google Drive)
      const downloadUrl = meta.actualUrl || this.url;

      const canSegment = meta.acceptsRanges && meta.sizeBytes !== null && meta.sizeBytes > 2 * 1024 * 1024;
      const segmentCount = canSegment ? Math.max(1, Math.min(this.requestedSegmentCount, 32)) : 1;

      const tempDir = path.join(this.saveDir, ".shanutechx-tmp");
      await fsp.mkdir(tempDir, { recursive: true });

      this.segments = this.planSegments(segmentCount, tempDir);
      this.segmentBytesDone = new Array(this.segments.length).fill(0);

      events.onResolved(this.filename, this.sizeBytes, this.segments.length);
      events.onStatus("downloading");

      await Promise.all(
        this.segments.map((seg) => this.downloadSegment(seg, events, globalBucket, perFileBucket, downloadUrl)),
      );

      events.onStatus("merging");
      this.finalFilepath = await reserveUniqueFilepath(this.saveDir, this.filename);
      await this.mergeSegments();
      await this.cleanupTemp();

      events.onStatus("complete");
    } catch (err) {
      await this.cleanupTemp().catch(() => {});
      if (this.abortController.signal.aborted) {
        events.onStatus("cancelled");
      } else {
        events.onStatus("failed", err instanceof Error ? err.message : String(err));
      }
    }
  }

  get result() {
    const elapsedSec = Math.max((Date.now() - this.startedAt) / 1000, 0.001);
    // Real elapsed-time-based average — the direct fix for the old app's
    // `elapsed = 0` bug that made every stored avg_speed equal to the file size.
    const avgSpeedBps = this.downloadedBytes / elapsedSec;
    return { filepath: this.finalFilepath, sizeBytes: this.downloadedBytes, avgSpeedBps };
  }

  private planSegments(count: number, tempDir: string): SegmentPlan[] {
    if (count === 1 || this.sizeBytes === null) {
      return [{ index: 0, start: 0, end: (this.sizeBytes ?? 1) - 1, tempPath: path.join(tempDir, `${this.id}.part0`) }];
    }
    const size = this.sizeBytes;
    const chunk = Math.floor(size / count);
    const plans: SegmentPlan[] = [];
    for (let i = 0; i < count; i++) {
      const start = i * chunk;
      const end = i === count - 1 ? size - 1 : start + chunk - 1;
      plans.push({ index: i, start, end, tempPath: path.join(tempDir, `${this.id}.part${i}`) });
    }
    return plans;
  }

  private async downloadSegment(
    seg: SegmentPlan, events: DownloadJobEvents, globalBucket: TokenBucket, perFileBucket: TokenBucket, downloadUrl: string,
  ): Promise<void> {
    let attempt = 0;
    for (;;) {
      try {
        await this.attemptSegmentDownload(seg, events, globalBucket, perFileBucket, attempt > 0, downloadUrl);
        return;
      } catch (err) {
        if (this.abortController.signal.aborted) throw err; // never retry a genuine user cancel
        
        // Check if error is a permanent failure (don't retry)
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isPermanentFailure = 
          errorMsg.includes("404") || 
          errorMsg.includes("403") || 
          errorMsg.includes("401") ||
          errorMsg.includes("410") || // Gone
          errorMsg.includes("Not Found") ||
          errorMsg.includes("Forbidden");
        
        if (isPermanentFailure) {
          throw err; // Don't retry permanent failures
        }
        
        attempt++;
        if (attempt > this.retryAttempts) throw err;
        // Exponential-ish backoff, capped — and RESUME from the bytes this
        // segment already has on disk (via the Range header's start offset),
        // rather than discarding partial progress and starting the segment
        // over on every transient network blip.
        await new Promise((r) => setTimeout(r, Math.min(5000, 500 * attempt)));
      }
    }
  }

  private async attemptSegmentDownload(
    seg: SegmentPlan, events: DownloadJobEvents, globalBucket: TokenBucket, perFileBucket: TokenBucket, isRetry: boolean, downloadUrl: string,
  ): Promise<void> {
    const canResumeViaRange = this.segments.length > 1; // only true multi-segment requests carry a Range header at all
    const alreadyOnDisk = canResumeViaRange ? (this.segmentBytesDone[seg.index] ?? 0) : 0;
    const headers: Record<string, string> = {};
    if (canResumeViaRange) headers.range = `bytes=${seg.start + alreadyOnDisk}-${seg.end}`;

    const res = await request(downloadUrl, { method: "GET", headers, signal: this.abortController.signal, dispatcher: this.dispatcher });
    // Only append when we actually asked the server to resume from a byte
    // offset — a plain whole-file GET retry must truncate and restart
    // cleanly, or it would double-write and corrupt the segment's temp file.
    const shouldAppend = isRetry && canResumeViaRange;
    if (isRetry && !canResumeViaRange) this.segmentBytesDone[seg.index] = 0; // restarting from zero — reset the counter to match
    const fileStream = fs.createWriteStream(seg.tempPath, { flags: shouldAppend ? "a" : "w" });

    for await (const chunk of res.body) {
      await this.waitIfPaused();
      if (this.abortController.signal.aborted) throw new Error("cancelled");

      await perFileBucket.consume(chunk.length);
      await globalBucket.consume(chunk.length);

      await new Promise<void>((resolve, reject) => {
        fileStream.write(chunk, (err) => (err ? reject(err) : resolve()));
      });

      this.segmentBytesDone[seg.index] = (this.segmentBytesDone[seg.index] ?? 0) + chunk.length;
      events.onProgress(this.downloadedBytes, this.sizeBytes);
    }

    await new Promise<void>((resolve, reject) => fileStream.end((err: unknown) => (err ? reject(err) : resolve())));
  }

  private async mergeSegments(): Promise<void> {
    const first = this.segments[0];
    if (!first) throw new Error("No segments to merge");
    if (this.segments.length === 1) {
      // Cross-filesystem-safe move: the old app crashed here with
      // `Path.rename()` when TEMP_DIR and the save folder were on different
      // drives (audit finding §2.5). copyFile+unlink works across filesystems.
      await fsp.copyFile(first.tempPath, this.finalFilepath);
      return;
    }
    const out = fs.createWriteStream(this.finalFilepath);
    for (const seg of this.segments) {
      await new Promise<void>((resolve, reject) => {
        const read = fs.createReadStream(seg.tempPath);
        read.on("error", reject);
        read.on("end", resolve);
        read.pipe(out, { end: false });
      });
    }
    await new Promise<void>((resolve, reject) => out.end((err: unknown) => (err ? reject(err) : resolve())));
  }

  private async cleanupTemp(): Promise<void> {
    await Promise.all(this.segments.map((s) => fsp.unlink(s.tempPath).catch(() => {})));
  }
}
