import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { extractMediaInfo } from "./extract-info";
import { SocialDownloadJob } from "./social-download-job";
import { resolveBinaries } from "./binaries";
import { downloadsRepo } from "../../db/downloads-repo";
import { settingsStore } from "../../settings/settings-store";
import { runPostDownloadActions } from "../../utils/download-complete-actions";
import type { MediaFormatOption, MediaInfo } from "@shanutechx/shared-types";

export class SocialManager {
  private jobs = new Map<string, SocialDownloadJob>();
  // Scheduled social jobs: id → { url, format } stored in memory for fast lookup
  private scheduledFormats = new Map<string, MediaFormatOption>();
  private scheduleTimer: NodeJS.Timeout;

  constructor(private getWindow: () => BrowserWindow | null) {
    // Check every 30 seconds for social downloads whose time has arrived.
    // Uses a different interval from QueueManager (which is every 60s) so
    // there's no single point of contention — the two managers are independent.
    this.scheduleTimer = setInterval(() => this.runScheduleTick(), 30_000);
    this.scheduleTimer.unref?.();
  }

  private runScheduleTick(): void {
    const ready = downloadsRepo.listScheduledReady();
    for (const rec of ready) {
      if (rec.sourceType !== "social") continue;
      const format = this.scheduledFormats.get(rec.id);
      if (!format) continue; // format info was lost (e.g. app restarted) — skip
      downloadsRepo.setScheduledFor(rec.id, null); // clear schedule → status stays 'queued'
      this.scheduledFormats.delete(rec.id);
      this._launch(rec.id, rec.url, format);
    }
  }

  async extract(url: string): Promise<MediaInfo> {
    const { ytDlp } = resolveBinaries();
    const settings = settingsStore.get();
    return extractMediaInfo(url, ytDlp, settings.ignoreCertificateErrors, settings.cookiesFromBrowser);
  }

  start(url: string, format: MediaFormatOption): { id: string } {
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: format.label, sourceType: "social", format: format.id });
    this._launch(id, url, format);
    return { id };
  }

  /**
   * Add a social download that stays queued until scheduledFor arrives.
   * The format is kept in memory (this.scheduledFormats) so the scheduler
   * tick can start it. If the app is restarted before the time arrives,
   * the scheduled entry will remain in the DB as 'queued' — the user can
   * cancel or start it manually from the downloads list.
   */
  scheduleNew(url: string, format: MediaFormatOption, scheduledFor: string): { id: string } {
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: format.label, sourceType: "social", format: format.id, scheduledFor });
    this.scheduledFormats.set(id, format);
    return { id };
  }

  private _launch(id: string, url: string, format: MediaFormatOption): void {
    const settings = settingsStore.get();
    const { ytDlp } = resolveBinaries();

    const job = new SocialDownloadJob(
      id, url, settings.downloadDir, format.ytdlpFormat, ytDlp, settings.ignoreCertificateErrors,
      settings.subtitleLanguages, settings.autoEmbedThumbnail, settings.cookiesFromBrowser,
    );
    this.jobs.set(id, job);

    job.run({
      onFilename: (filename) => downloadsRepo.setResolvedMeta(id, filename, null, 1),
      onProgress: (downloadedBytes, sizeBytes) => {
        downloadsRepo.updateProgress(id, downloadedBytes, sizeBytes);
        this.getWindow()?.webContents.send("download:progress", { id, downloadedBytes, totalBytes: sizeBytes, speedBps: 0, etaSec: null });
      },
      onStatus: (status, errorMessage) => {
        if (status === "complete") {
          downloadsRepo.complete(id, job.filepath, job.sizeBytes ?? 0, job.avgSpeedBps);
          runPostDownloadActions(job.filepath);
        } else if (status === "paused") {
          // 'paused' is a real first-class status for social downloads —
          // the yt-dlp process was intentionally killed, partial file stays on
          // disk, and resume() will restart with --continue.
          downloadsRepo.updateStatus(id, "paused");
        } else {
          // 'cancelled' is a REAL status here, not remapped to 'failed' the
          // way the old app's exception-based cancel hack forced it to be.
          downloadsRepo.updateStatus(id, status, errorMessage ?? null);
        }
        this.getWindow()?.webContents.send("download:status", { id, status, errorMessage });
        if (status !== "downloading" && status !== "paused") this.jobs.delete(id);
      },
    });
  }

  pause(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.pause();
      // Status event will be emitted by the job once the yt-dlp process exits.
    }
  }

  resume(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.resume();
      // Status event will be emitted by the job when yt-dlp restarts.
    }
  }

  cancel(id: string): void {
    // If it's still in the scheduled-but-not-started state, remove from
    // the in-memory map and cancel the DB row.
    if (this.scheduledFormats.has(id)) {
      this.scheduledFormats.delete(id);
      downloadsRepo.updateStatus(id, "cancelled");
      this.getWindow()?.webContents.send("download:status", { id, status: "cancelled" });
      return;
    }
    this.jobs.get(id)?.cancel();
  }

  destroy(): void {
    clearInterval(this.scheduleTimer);
    for (const job of this.jobs.values()) job.cancel();
  }
}
