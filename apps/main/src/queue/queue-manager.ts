import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { DownloadJob } from "../engines/download-engine/download-job";
import { TokenBucket } from "../utils/token-bucket";
import { downloadsRepo } from "../db/downloads-repo";
import { settingsStore, onSettingsChange } from "../settings/settings-store";
import { buildProxyDispatcher } from "../utils/proxy-agent";
import type { DownloadRecord } from "@shanutechx/shared-types";

interface ActiveEntry { job: DownloadJob; perFileBucket: TokenBucket }

/**
 * Single source of truth for all download state. The renderer never guesses
 * at progress/status locally — it only ever reflects what this class
 * broadcasts, which is what makes "stale UI card" bugs structurally
 * impossible (vs. the old app's independently-updated UI state).
 */
export class QueueManager {
  private active = new Map<string, ActiveEntry>();
  private queued: string[] = [];
  private globalBucket: TokenBucket;
  private getWindow: () => BrowserWindow | null;
  private lastGlobalSpeedBroadcast = 0;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
    const s = settingsStore.get();
    this.globalBucket = new TokenBucket(s.maxTotalSpeedKBps * 1024);

    onSettingsChange((applied) => {
      // Real-time effect: dragging the speed slider changes throughput
      // immediately — no restart required, no dead setting (audit fix, §2.7).
      this.globalBucket.setRate(applied.maxTotalSpeedKBps * 1024);
    });
  }

  list(): DownloadRecord[] {
    const persisted = downloadsRepo.list();
    return persisted.map((rec) => {
      const active = this.active.get(rec.id);
      if (!active) return rec;
      return { ...rec, downloadedBytes: active.job.downloadedBytes, status: "downloading" as const };
    });
  }

  start(url: string, saveDirOverride?: string): { id: string } {
    const settings = settingsStore.get();
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: url, sourceType: "http", segments: settings.segmentCount });

    void this.resolveSaveDir(settings, saveDirOverride).then((saveDir) => {
      if (this.active.size < settings.maxSimultaneousDownloads) {
        this.launch(id, url, saveDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
      } else {
        this.queued.push(id);
        downloadsRepo.updateStatus(id, "queued");
      }
    });
    return { id };
  }

  private async resolveSaveDir(settings: ReturnType<typeof settingsStore.get>, override?: string): Promise<string> {
    if (override) return override;
    // Real native save-location prompt when the user has asked to be asked
    // every time — wired to a genuine dialog.showOpenDialog call, not a
    // setting that's saved but never actually consulted.
    if (settings.askLocationEachTime) {
      const { dialog } = await import("electron");
      const win = this.getWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath: settings.downloadDir })
        : await dialog.showOpenDialog({ properties: ["openDirectory"], defaultPath: settings.downloadDir });
      if (!result.canceled && result.filePaths[0]) return result.filePaths[0];
    }
    return settings.downloadDir;
  }

  private launch(id: string, url: string, saveDir: string, segmentCount: number, perFileKBps: number): void {
    const perFileBucket = new TokenBucket(perFileKBps * 1024);

    // Resolve the proxy dispatcher BEFORE constructing/running the job —
    // setting it after run() has already started would race resolveMeta()'s
    // first request, which could fire with no dispatcher at all.
    void buildProxyDispatcher(settingsStore.get()).then((dispatcher) => {
      const job = new DownloadJob(id, url, saveDir, segmentCount, dispatcher, settingsStore.get().retryAttempts);
      this.active.set(id, { job, perFileBucket });
      this.runJob(id, job, perFileBucket);
    });
  }

  private runJob(id: string, job: DownloadJob, perFileBucket: TokenBucket): void {
    job.run(
      {
        onResolved: (filename, sizeBytes, segments) => {
          downloadsRepo.setResolvedMeta(id, filename, sizeBytes, segments);
        },
        onProgress: (downloadedBytes, sizeBytes) => {
          downloadsRepo.updateProgress(id, downloadedBytes, sizeBytes);
          this.broadcastProgress(id, downloadedBytes, sizeBytes);
        },
        onStatus: (status, errorMessage) => {
          if (status === "complete") {
            const { filepath, sizeBytes, avgSpeedBps } = job.result;
            downloadsRepo.complete(id, filepath, sizeBytes, avgSpeedBps);
          } else if (status === "downloading" || status === "merging") {
            downloadsRepo.updateStatus(id, status as "downloading");
          } else {
            downloadsRepo.updateStatus(id, status, errorMessage);
          }
          this.broadcastStatus(id, status, errorMessage);
          if (status === "complete" || status === "failed" || status === "cancelled") {
            this.active.delete(id);
            this.lastSample.delete(id);
            this.currentSpeeds.delete(id);
            this.promoteNextQueued();
          }
        },
      },
      this.globalBucket,
      perFileBucket,
    );
  }

  private promoteNextQueued(): void {
    const settings = settingsStore.get();
    while (this.active.size < settings.maxSimultaneousDownloads && this.queued.length > 0) {
      const nextId = this.queued.shift()!;
      const record = downloadsRepo.get(nextId);
      if (record) this.launch(nextId, record.url, settings.downloadDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
    }
  }

  pause(id: string): void { this.active.get(id)?.job.pause(); downloadsRepo.updateStatus(id, "paused"); }
  resume(id: string): void { this.active.get(id)?.job.resume(); downloadsRepo.updateStatus(id, "downloading"); }
  cancel(id: string): void {
    const entry = this.active.get(id);
    if (entry) { entry.job.cancel(); return; }
    this.queued = this.queued.filter((qid) => qid !== id);
    downloadsRepo.updateStatus(id, "cancelled");
  }

  /** Called from the shutdown state machine's "pausing-active-transfers" phase. */
  async pauseAllForShutdown(): Promise<void> {
    for (const { job } of this.active.values()) job.pause();
  }

  private lastSample = new Map<string, { bytes: number; time: number }>();
  private currentSpeeds = new Map<string, number>();

  private broadcastProgress(id: string, downloadedBytes: number, sizeBytes: number | null): void {
    const win = this.getWindow();
    const now = Date.now();

    // Real instantaneous speed: bytes advanced since the last sample for
    // THIS download, divided by elapsed time — not a placeholder.
    const prev = this.lastSample.get(id);
    let speedBps = this.currentSpeeds.get(id) ?? 0;
    if (prev) {
      const elapsedSec = (now - prev.time) / 1000;
      if (elapsedSec > 0.05) { // ignore near-zero intervals — avoids divide-by-tiny-number spikes
        speedBps = Math.max(0, (downloadedBytes - prev.bytes) / elapsedSec);
        this.currentSpeeds.set(id, speedBps);
        this.lastSample.set(id, { bytes: downloadedBytes, time: now });
      }
    } else {
      this.lastSample.set(id, { bytes: downloadedBytes, time: now });
    }

    // Calculate ETA: remaining bytes divided by current speed
    let etaSec: number | null = null;
    if (sizeBytes && speedBps > 0) {
      const remainingBytes = sizeBytes - downloadedBytes;
      etaSec = Math.max(0, remainingBytes / speedBps);
    }

    win?.webContents.send("download:progress", { id, downloadedBytes, totalBytes: sizeBytes, speedBps, etaSec });

    if (now - this.lastGlobalSpeedBroadcast > 500) {
      this.lastGlobalSpeedBroadcast = now;
      const downBps = Array.from(this.currentSpeeds.values()).reduce((a, b) => a + b, 0);
      win?.webContents.send("queue:global-speed", { downBps, upBps: 0, activeCount: this.active.size });
    }
  }

  private broadcastStatus(id: string, status: string, errorMessage?: string): void {
    this.getWindow()?.webContents.send("download:status", { id, status, errorMessage });
  }
}
