import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { request } from "undici";
import type { BrowserWindow } from "electron";
import { extractMediaInfo } from "./extract-info";
import { SocialDownloadJob } from "./social-download-job";
import { resolveBinaries } from "./binaries";
import { ensureYtDlpBinary, ensureFfmpegBinary, getBinaryPaths } from "../../utils/binary-manager";
import { runProcess } from "../../utils/spawn-process";
import { downloadsRepo } from "../../db/downloads-repo";
import { settingsStore } from "../../settings/settings-store";
import { runPostDownloadActions } from "../../utils/download-complete-actions";
import type { MediaFormatOption, MediaInfo } from "@shanutechx/shared-types";

export class SocialManager {
  private jobs = new Map<string, SocialDownloadJob>();
  // Scheduled social jobs: id → { url, format } stored in memory for fast lookup
  private scheduledFormats = new Map<string, { format: MediaFormatOption; saveDir?: string }>();
  private scheduleTimer: NodeJS.Timeout;

  constructor(private getWindow: () => BrowserWindow | null) {
    // Check every 30 seconds for social downloads whose time has arrived.
    this.scheduleTimer = setInterval(() => this.runScheduleTick(), 30_000);
    this.scheduleTimer.unref?.();
  }

  private runScheduleTick(): void {
    const ready = downloadsRepo.listScheduledReady();
    for (const rec of ready) {
      if (rec.sourceType !== "social") continue;
      const entry = this.scheduledFormats.get(rec.id);
      if (!entry) continue; // format info was lost (e.g. app restarted) — skip
      downloadsRepo.setScheduledFor(rec.id, null); // clear schedule → status stays 'queued'
      this.scheduledFormats.delete(rec.id);
      this._launch(rec.id, rec.url, entry.format, entry.saveDir);
    }
  }

  async extract(url: string): Promise<MediaInfo> {
    const ytDlp = await ensureYtDlpBinary((progress) => {
      this.getWindow()?.webContents.send("binary:download-progress", progress);
    });
    const settings = settingsStore.get();
    return extractMediaInfo(url, ytDlp, settings.ignoreCertificateErrors, settings.cookiesFromBrowser);
  }

  start(url: string, format: MediaFormatOption, saveDir?: string, allowDuplicate?: boolean): { id: string } {
    if (!allowDuplicate) {
      const existing = downloadsRepo.findActiveOrCompleteByUrl(url);
      if (existing) {
        const existingIsAudio = existing.format?.startsWith("audio") || (existing.filename && /\.(mp3|m4a|flac|wav|opus|aac)$/i.test(existing.filename));
        const requestedIsAudio = format.id.startsWith("audio") || format.postprocessor === "extract-audio";
        const isSameTrackType = Boolean(existingIsAudio) === Boolean(requestedIsAudio);

        if (existing.format === format.id || isSameTrackType) {
          throw new Error(`DUPLICATE_URL:${existing.id}:${existing.filename || format.label}`);
        }
      }
    }
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: format.label, sourceType: "social", format: format.id });
    this._launch(id, url, format, saveDir);
    return { id };
  }

  /**
   * Add a social download that stays queued until scheduledFor arrives.
   */
  scheduleNew(url: string, format: MediaFormatOption, scheduledFor: string, saveDir?: string): { id: string } {
    const id = randomUUID();
    downloadsRepo.insert({ id, url, filename: format.label, sourceType: "social", format: format.id, scheduledFor });
    this.scheduledFormats.set(id, { format, saveDir });
    return { id };
  }

  private async _launch(id: string, url: string, format: MediaFormatOption, saveDir?: string): Promise<void> {
    const settings = settingsStore.get();
    const ytDlp = await ensureYtDlpBinary((progress) => {
      this.getWindow()?.webContents.send("binary:download-progress", progress);
    });
    const effectiveSaveDir = saveDir || settings.downloadDir;

    const isAudioExtract = 
      format.postprocessor === "extract-audio" || 
      format.id === "audio" || 
      format.id.startsWith("audio-") ||
      Boolean(format.quality && ["mp3", "m4a", "flac", "wav", "aac", "opus"].includes(format.quality.toLowerCase()));

    const audioExt = format.quality || (format.id.includes("-") ? format.id.split("-")[1] : (settings.defaultAudioFormat || "mp3"));
    const audioBitrate = (format as any).bitrate || "320k";

    const paths = getBinaryPaths();
    let ffmpegPath = paths.ffmpeg;
    if (!fs.existsSync(ffmpegPath) && (isAudioExtract || settings.autoEmbedThumbnail)) {
      try {
        ffmpegPath = await ensureFfmpegBinary((progress) => {
          this.getWindow()?.webContents.send("binary:download-progress", progress);
        });
      } catch (err) {
        console.warn("Could not auto-download FFmpeg for post-processing:", err);
      }
    }

    const job = new SocialDownloadJob(
      id, url, effectiveSaveDir, format.ytdlpFormat, ytDlp, settings.ignoreCertificateErrors,
      settings.subtitleLanguages, settings.autoEmbedThumbnail, settings.cookiesFromBrowser,
      isAudioExtract, audioExt, audioBitrate, ffmpegPath,
    );
    this.jobs.set(id, job);

    job.run({
      onFilename: (filename) => downloadsRepo.setResolvedMeta(id, filename, null, 1),
      onProgress: (downloadedBytes, sizeBytes, speedBps, etaSec) => {
        downloadsRepo.updateProgress(id, downloadedBytes, sizeBytes);
        this.getWindow()?.webContents.send("download:progress", {
          id,
          downloadedBytes,
          totalBytes: sizeBytes,
          speedBps: speedBps ?? 0,
          etaSec: etaSec ?? null
        });
      },
      onStatus: (status, errorMessage) => {
        if (status === "complete") {
          downloadsRepo.complete(id, job.filepath, job.sizeBytes ?? 0, job.avgSpeedBps);
          runPostDownloadActions(job.filepath);
        } else if (status === "paused") {
          downloadsRepo.updateStatus(id, "paused");
        } else {
          downloadsRepo.updateStatus(id, status, errorMessage ?? null);
        }
        this.getWindow()?.webContents.send("download:status", { id, status, errorMessage });
        if (status !== "downloading" && status !== "paused") this.jobs.delete(id);
      },
    });
  }

  async downloadPhotos(
    photos: { id: string; url: string; title?: string }[],
    saveDir?: string
  ): Promise<{ success: boolean; savedPaths: string[] }> {
    const settings = settingsStore.get();
    const effectiveSaveDir = saveDir || settings.downloadDir;
    await fs.promises.mkdir(effectiveSaveDir, { recursive: true });

    const savedPaths: string[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (!p || !p.url) continue;

      try {
        const extMatch = p.url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
        const ext = extMatch?.[1] ? extMatch[1].toLowerCase() : "jpg";
        const filename = `${p.title ? p.title.replace(/[^\w.-]/g, "_") : `photo_${timestamp}_${i + 1}`}.${ext}`;
        const targetPath = path.join(effectiveSaveDir, filename);

        const res = await request(p.url, { maxRedirections: 5 });
        if (res.statusCode === 200) {
          const fileStream = createWriteStream(targetPath);
          await pipeline(res.body, fileStream);
          savedPaths.push(targetPath);
        }
      } catch (err) {
        console.error(`Failed to download photo ${i + 1}:`, err);
      }
    }

    return {
      success: savedPaths.length > 0,
      savedPaths,
    };
  }

  async renderPhotosToVideo(
    photos: { id: string; url: string }[],
    audioUrl?: string,
    durationPerPhotoSec = 3,
    saveDir?: string,
    title = "slideshow"
  ): Promise<{ taskId: string }> {
    const taskId = randomUUID();
    const settings = settingsStore.get();
    const effectiveSaveDir = saveDir || settings.downloadDir;
    await fs.promises.mkdir(effectiveSaveDir, { recursive: true });

    const tmpDir = path.join(os.tmpdir(), `shanutechx_slideshow_${taskId}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const outputPath = path.join(
      effectiveSaveDir,
      `${title.replace(/[^\w.-]/g, "_")}_${Date.now()}.mp4`
    );

    const win = this.getWindow();

    // Run rendering asynchronously in background
    (async () => {
      try {
        win?.webContents.send("converter:status", { taskId, status: "converting" });

        // 1. Download photos to tmp dir
        const localImgPaths: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (!p?.url) continue;
          const imgFile = path.join(tmpDir, `slide_${String(i).padStart(4, "0")}.jpg`);
          const res = await request(p.url, { maxRedirections: 5 });
          if (res.statusCode === 200) {
            const fileStream = createWriteStream(imgFile);
            await pipeline(res.body, fileStream);
            localImgPaths.push(imgFile);
          }
          win?.webContents.send("converter:progress", {
            taskId,
            percent: Math.round(((i + 1) / (photos.length * 2)) * 100),
          });
        }

        if (localImgPaths.length === 0) {
          throw new Error("No photos could be downloaded for video rendering.");
        }

        // 2. Download audio if provided
        let localAudioPath: string | null = null;
        if (audioUrl) {
          try {
            const audioFile = path.join(tmpDir, "audio_track.mp3");
            const res = await request(audioUrl, { maxRedirections: 5 });
            if (res.statusCode === 200) {
              const fileStream = createWriteStream(audioFile);
              await pipeline(res.body, fileStream);
              localAudioPath = audioFile;
            }
          } catch (audioErr) {
            console.warn("Failed to download slideshow audio track:", audioErr);
          }
        }

        // 3. Build FFmpeg concat script
        const concatTxtPath = path.join(tmpDir, "concat.txt");
        let concatContent = "";
        for (const img of localImgPaths) {
          // Double backslashes for FFmpeg Windows concat file
          const safePath = img.replace(/\\/g, "/");
          concatContent += `file '${safePath}'\nduration ${durationPerPhotoSec}\n`;
        }
        // Concat demuxer needs last file repeated
        const lastImg = localImgPaths[localImgPaths.length - 1];
        if (lastImg) {
          concatContent += `file '${lastImg.replace(/\\/g, "/")}'\n`;
        }
        await fs.promises.writeFile(concatTxtPath, concatContent, "utf-8");

        // 4. Run FFmpeg
        const paths = getBinaryPaths();
        let ffmpegPath = paths.ffmpeg;
        if (!fs.existsSync(ffmpegPath)) {
          try {
            ffmpegPath = await ensureFfmpegBinary((progress) => {
              this.getWindow()?.webContents.send("binary:download-progress", progress);
            });
          } catch (err) {
            console.warn("Could not auto-download FFmpeg for slideshow rendering:", err);
          }
        }

        const ffmpegArgs = [
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", concatTxtPath,
        ];

        if (localAudioPath) {
          ffmpegArgs.push("-i", localAudioPath, "-c:a", "aac", "-b:a", "192k", "-shortest");
        }

        ffmpegArgs.push(
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-vf", "scale='if(gt(a,16/9),1920,-2)':'if(gt(a,16/9),-2,1080)',pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
          "-r", "30",
          outputPath
        );

        const { promise } = runProcess(ffmpegPath, ffmpegArgs);
        await promise;

        win?.webContents.send("converter:progress", { taskId, percent: 100 });
        win?.webContents.send("converter:status", { taskId, status: "complete", outputPath });

        // Clean up tmp dir
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      } catch (err: any) {
        console.error("Slideshow rendering error:", err);
        win?.webContents.send("converter:status", {
          taskId,
          status: "failed",
          errorMessage: err?.message || "Slideshow rendering failed",
        });
      }
    })();

    return { taskId };
  }

  async batchExtract(urls: string[]): Promise<{ results: { url: string; info?: MediaInfo; error?: string }[] }> {
    const results: { url: string; info?: MediaInfo; error?: string }[] = [];
    const ytDlp = await ensureYtDlpBinary((progress) => {
      this.getWindow()?.webContents.send("binary:download-progress", progress);
    });
    const settings = settingsStore.get();

    for (const url of urls) {
      const cleanUrl = url.trim();
      if (!cleanUrl) continue;
      try {
        const info = await extractMediaInfo(
          cleanUrl,
          ytDlp,
          settings.ignoreCertificateErrors,
          settings.cookiesFromBrowser
        );
        results.push({ url: cleanUrl, info });
      } catch (err: any) {
        results.push({ url: cleanUrl, error: err?.message || "Extraction failed" });
      }
    }

    return { results };
  }

  pause(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.pause();
    }
    downloadsRepo.updateStatus(id, "paused");
    this.getWindow()?.webContents.send("download:status", { id, status: "paused" });
  }

  resume(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.resume();
    }
    downloadsRepo.updateStatus(id, "downloading");
    this.getWindow()?.webContents.send("download:status", { id, status: "downloading" });
  }

  cancel(id: string): void {
    if (this.scheduledFormats.has(id)) {
      this.scheduledFormats.delete(id);
    }
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.delete(id);
      job.cancel();
    }
    downloadsRepo.updateStatus(id, "cancelled");
    this.getWindow()?.webContents.send("download:status", { id, status: "cancelled" });
  }

  destroy(): void {
    clearInterval(this.scheduleTimer);
    for (const job of this.jobs.values()) job.cancel();
  }
}
