import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { DownloadJob } from "../engines/download-engine/download-job";
import { TokenBucket } from "../utils/token-bucket";
import { downloadsRepo } from "../db/downloads-repo";
import { settingsStore, onSettingsChange } from "../settings/settings-store";
import { buildProxyDispatcher } from "../utils/proxy-agent";
import { runPostDownloadActions } from "../utils/download-complete-actions";
import type { DownloadRecord, AppSettings } from "@shanutechx/shared-types";

interface ActiveEntry { job: DownloadJob; perFileBucket: TokenBucket }

/** Shared by both schedule types below — is `hour` inside [start, end), wrapping past midnight when end <= start? */
function isInHourWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false; // zero-width window — schedule is effectively off
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Pure so it's trivially testable and so both the "settings changed" path
 * and the once-a-minute clock tick can share the exact same rule — no risk
 * of the two diverging on what "off-peak" means.
 */
export function computeEffectiveGlobalKBps(settings: AppSettings, now: Date): number {
  if (!settings.bandwidthScheduleEnabled) return settings.maxTotalSpeedKBps;
  const inWindow = isInHourWindow(now.getHours(), settings.bandwidthScheduleStartHour, settings.bandwidthScheduleEndHour);
  return inWindow ? settings.bandwidthScheduleOffPeakKBps : settings.maxTotalSpeedKBps;
}

/** Also pure, for the same reason — see computeEffectiveGlobalKBps. */
export function isDownloadingAllowedNow(settings: AppSettings, now: Date): boolean {
  if (!settings.downloadScheduleEnabled) return true;
  return isInHourWindow(now.getHours(), settings.downloadScheduleStartHour, settings.downloadScheduleEndHour);
}

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
  private scheduleTimer: NodeJS.Timeout;
  // Ids this class paused itself when the download-schedule window closed —
  // separate from a user-initiated pause specifically so the schedule can
  // resume ONLY what it paused when the window reopens, never something the
  // user paused on purpose for an unrelated reason. Any explicit user
  // pause/resume/cancel call removes the id from this set (see below).
  private autoPausedIds = new Set<string>();
  private lastAllowedNow: boolean;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
    const s = settingsStore.get();
    this.globalBucket = new TokenBucket(computeEffectiveGlobalKBps(s, new Date()) * 1024);
    this.lastAllowedNow = isDownloadingAllowedNow(s, new Date());

    onSettingsChange((applied) => {
      // Real-time effect: dragging the speed slider changes throughput
      // immediately — no restart required, no dead setting (audit fix, §2.7).
      this.globalBucket.setRate(computeEffectiveGlobalKBps(applied, new Date()) * 1024);
    });

    // Re-evaluate every minute so both schedules flip automatically at the
    // scheduled hour even with no settings change to trigger it — e.g. a
    // download that's been running since 9pm should speed up on its own at
    // 1am without the user touching Settings, and a download schedule
    // should pause/resume transfers on its own at the boundary. .unref() so
    // a leftover timer (there shouldn't be one; QueueManager is a singleton
    // for the app's lifetime) can never keep the process alive on quit.
    this.scheduleTimer = setInterval(() => this.runScheduleTick(), 60_000);
    this.scheduleTimer.unref?.();
  }

  private runScheduleTick(): void {
    const settings = settingsStore.get();
    const now = new Date();
    this.globalBucket.setRate(computeEffectiveGlobalKBps(settings, now) * 1024);

    // Promote any scheduled downloads whose time has arrived — applies to
    // BOTH HTTP and social downloads stored in the DB with a scheduledFor
    // timestamp. Social downloads that need yt-dlp are launched via their
    // stored format in downloadsRepo.get(), but we only handle HTTP here;
    // social scheduled launches are delegated to SocialManager.
    const readyScheduled = downloadsRepo.listScheduledReady();
    for (const rec of readyScheduled) {
      if (rec.sourceType === "http") {
        // Clear the schedule time and start immediately
        downloadsRepo.setScheduledFor(rec.id, null);
        if (this.active.size < settings.maxSimultaneousDownloads && isDownloadingAllowedNow(settings, now)) {
          this.launch(rec.id, rec.url, settings.downloadDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
        } else {
          this.queued.push(rec.id);
        }
      }
      // Social/torrent scheduled items: the scheduled_for column was cleared
      // by their own managers (social-manager.ts) which also listen to this tick.
    }

    const allowedNow = isDownloadingAllowedNow(settings, now);
    if (allowedNow === this.lastAllowedNow) return;
    this.lastAllowedNow = allowedNow;

    if (!allowedNow) {
      for (const [id, entry] of this.active) {
        entry.job.pause();
        downloadsRepo.updateStatus(id, "paused");
        this.broadcastStatus(id, "paused");
        this.autoPausedIds.add(id);
      }
    } else {
      for (const id of this.autoPausedIds) {
        this.active.get(id)?.job.resume();
        downloadsRepo.updateStatus(id, "downloading");
        this.broadcastStatus(id, "downloading");
      }
      this.autoPausedIds.clear();
      this.promoteNextQueued();
    }
  }

  list(): DownloadRecord[] {
    const persisted = downloadsRepo.list();
    return persisted.map((rec) => {
      const active = this.active.get(rec.id);
      if (!active) return rec;
      return { ...rec, downloadedBytes: active.job.downloadedBytes, status: "downloading" as const };
    });
  }

  start(url: string, saveDirOverride?: string, allowDuplicate?: boolean): { id: string } {
    if (!allowDuplicate) {
      const existing = downloadsRepo.findActiveOrCompleteByUrl(url);
      if (existing) throw new Error(`DUPLICATE_URL:${existing.id}:${existing.filename || url}`);
    }
    const settings = settingsStore.get();
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: url, sourceType: "http", segments: settings.segmentCount });
    void this.resolveSaveDir(settings, saveDirOverride).then((saveDir) => {
      if (this.active.size < settings.maxSimultaneousDownloads && isDownloadingAllowedNow(settings, new Date())) {
        this.launch(id, url, saveDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
      } else {
        this.queued.push(id);
        downloadsRepo.updateStatus(id, "queued");
      }
    });
    return { id };
  }

  /**
   * Add an HTTP download scheduled for a future time. The download stays
   * queued in the DB until the scheduler tick promotes it.
   */
  scheduleNew(url: string, scheduledFor: string, allowDuplicate?: boolean): { id: string } {
    if (!allowDuplicate) {
      const existing = downloadsRepo.findActiveOrCompleteByUrl(url);
      if (existing) throw new Error(`DUPLICATE_URL:${existing.id}`);
    }
    const settings = settingsStore.get();
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: url, sourceType: "http", segments: settings.segmentCount, scheduledFor });
    return { id };
  }

  /** Update the scheduled start time on an existing queued download. Passing null starts it immediately. */
  setSchedule(id: string, scheduledFor: string | null): void {
    downloadsRepo.setScheduledFor(id, scheduledFor);
    if (scheduledFor === null) {
      // Start immediately
      const rec = downloadsRepo.get(id);
      const settings = settingsStore.get();
      if (rec && rec.status === "queued" && !this.queued.includes(id)) {
        if (this.active.size < settings.maxSimultaneousDownloads && isDownloadingAllowedNow(settings, new Date())) {
          this.launch(id, rec.url, settings.downloadDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
        } else {
          this.queued.push(id);
        }
      }
    }
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
            runPostDownloadActions(filepath);
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
    if (!isDownloadingAllowedNow(settings, new Date())) return; // outside the allowed window — stay queued
    while (this.active.size < settings.maxSimultaneousDownloads && this.queued.length > 0) {
      const nextId = this.queued.shift()!;
      const record = downloadsRepo.get(nextId);
      if (record) this.launch(nextId, record.url, settings.downloadDir, settings.segmentCount, settings.maxSpeedPerFileKBps);
    }
  }

  pause(id: string): void {
    this.autoPausedIds.delete(id);
    this.active.get(id)?.job.pause();
    downloadsRepo.updateStatus(id, "paused");
    this.broadcastStatus(id, "paused");
  }

  resume(id: string): void {
    this.autoPausedIds.delete(id);
    this.active.get(id)?.job.resume();
    downloadsRepo.updateStatus(id, "downloading");
    this.broadcastStatus(id, "downloading");
  }

  cancel(id: string): void {
    this.autoPausedIds.delete(id);
    const entry = this.active.get(id);
    if (entry) {
      entry.job.cancel();
      downloadsRepo.updateStatus(id, "cancelled");
      this.broadcastStatus(id, "cancelled");
      return;
    }
    this.queued = this.queued.filter((qid) => qid !== id);
    downloadsRepo.updateStatus(id, "cancelled");
    this.broadcastStatus(id, "cancelled");
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

    const prev = this.lastSample.get(id);
    let speedBps = this.currentSpeeds.get(id) ?? 0;
    if (prev) {
      const elapsedSec = (now - prev.time) / 1000;
      if (elapsedSec > 0.08) {
        const instantSpeed = Math.max(0, (downloadedBytes - prev.bytes) / elapsedSec);
        // Exponential moving average for jitter-free, accurate speed readout
        speedBps = speedBps > 0 ? Math.round(speedBps * 0.65 + instantSpeed * 0.35) : Math.round(instantSpeed);
        this.currentSpeeds.set(id, speedBps);
        this.lastSample.set(id, { bytes: downloadedBytes, time: now });
      }
    } else {
      this.lastSample.set(id, { bytes: downloadedBytes, time: now });
    }

    // Accurate ETA calculation
    let etaSec: number | null = null;
    if (sizeBytes && sizeBytes > downloadedBytes && speedBps > 512) {
      const remainingBytes = sizeBytes - downloadedBytes;
      etaSec = Math.max(0, Math.round(remainingBytes / speedBps));
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
