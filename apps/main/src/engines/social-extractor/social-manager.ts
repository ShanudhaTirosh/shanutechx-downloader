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
  constructor(private getWindow: () => BrowserWindow | null) {}

  async extract(url: string): Promise<MediaInfo> {
    const { ytDlp } = resolveBinaries();
    const settings = settingsStore.get();
    return extractMediaInfo(url, ytDlp, settings.ignoreCertificateErrors);
  }

  start(url: string, format: MediaFormatOption): { id: string } {
    const settings = settingsStore.get();
    const { ytDlp } = resolveBinaries();
    const id = randomUUID();

    downloadsRepo.insert({ id, url, filename: format.label, sourceType: "social", format: format.id });

    const job = new SocialDownloadJob(
      id, url, settings.downloadDir, format.ytdlpFormat, ytDlp, settings.ignoreCertificateErrors,
      settings.subtitleLanguages, settings.autoEmbedThumbnail,
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

    return { id };
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

  cancel(id: string): void { this.jobs.get(id)?.cancel(); }
}
