import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runProcess } from "../../utils/spawn-process";
import { reserveUniqueFilepath } from "../../utils/filename";

export interface SocialDownloadEvents {
  onProgress: (downloadedBytes: number, sizeBytes: number | null, speedBps?: number, etaSec?: number | null) => void;
  onStatus: (status: "downloading" | "paused" | "complete" | "failed" | "cancelled", errorMessage?: string) => void;
  onFilename: (filename: string) => void;
}

const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+)\s*([KMGT]?i?B)(?:[^\n]*?at\s+([\d.]+)\s*([KMGT]?i?B)\/s)?(?:[^\n]*?ETA\s+([\d:]+))?/i;

function unitToBytes(value: number, unit: string): number {
  const u = unit.toUpperCase().replace("IB", "").replace("B", "");
  if (u === "T") return value * (1024 ** 4);
  if (u === "G") return value * (1024 ** 3);
  if (u === "M") return value * (1024 ** 2);
  if (u === "K") return value * 1024;
  return value;
}

function parseEtaString(etaStr: string): number | null {
  const parts = etaStr.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  const p0 = parts[0];
  const p1 = parts[1];
  const p2 = parts[2];
  if (parts.length === 2 && p0 !== undefined && p1 !== undefined) return p0 * 60 + p1;
  if (parts.length === 3 && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return p0 * 3600 + p1 * 60 + p2;
  }
  return null;
}

/**
 * One yt-dlp download's lifecycle, driven as a real child process via the
 * native spawn() wrapper (argv array — never a shell string).
 *
 * Pause/resume is implemented via kill-then-restart: when the user pauses,
 * the yt-dlp process receives SIGTERM and exits. The partial download file
 * stays on disk. When the user resumes, a new yt-dlp process starts with
 * --continue so yt-dlp seeks to the byte offset it already downloaded
 * and picks up from there. This is the only reliable cross-platform pause
 * implementation for yt-dlp on Windows (SIGSTOP/SIGCONT are not reliably
 * supported on Windows).
 *
 * Cancellation kills the actual child process and resolves as a genuine
 * "cancelled" status — the old app raised an exception from inside yt-dlp's
 * Python progress hook to fake a cancel, which yt-dlp's own error handling
 * then reported as a generic failure (audit finding §3.7: cancel showed up
 * in history as "Failed: Download cancelled by user"). That class of bug
 * doesn't exist here — cancellation is OS process termination, not an
 * in-process exception trick.
 */
export class SocialDownloadJob {
  private kill: ((signal?: NodeJS.Signals) => void) | null = null;
  private cancelled = false;
  private isPaused = false;
  private resolvedFilename = "";
  // Same coalescing pattern as the HTTP engine (download-job.ts) and the
  // converter engine (converter-job.ts). yt-dlp throttles its own progress
  // line output somewhat, but that's an internal implementation detail of
  // yt-dlp's progress-bar renderer, not a documented contract this app can
  // rely on staying true across yt-dlp versions/formats — coalescing here
  // too means the IPC-flooding fix doesn't quietly regress on a yt-dlp
  // update.
  private static readonly PROGRESS_EMIT_INTERVAL_MS = 120;
  private lastProgressEmitAt = 0;
  // Tracked independently of the throttle above (updated on every matched
  // line, not just emitted ones) so the final `complete` status always has
  // an accurate size/duration to report — see the BUG FIX note on
  // `sizeBytes`/`downloadedBytes` below.
  private lastKnownDownloadedBytes = 0;
  private lastKnownSizeBytes: number | null = null;
  private startedAt = 0;
  // Keep a reference to the event callbacks so resume() can restart the
  // yt-dlp process with the same event wiring.
  private events: SocialDownloadEvents | null = null;

  private lastProgressSampleTime = 0;
  private lastProgressSampleBytes = 0;

  private useCookies: boolean;
  private playerClient = "web_embedded,web,android";
  private bypassCache = false;
  private retriedForbidden = false;
  private retriedCookie = false;
  private retriedWithoutThumbnail = false;

  constructor(
    private id: string,
    private url: string,
    private saveDir: string,
    private formatSelector: string,
    private ytDlpPath: string,
    private ignoreCertificateErrors: boolean,
    private subtitleLanguages: string,
    private autoEmbedThumbnail: boolean,
    private cookiesFromBrowser: string,
    private isAudioExtract?: boolean,
    private audioFormat?: string,
    private audioQuality?: string,
    private ffmpegPath?: string,
  ) {
    this.useCookies = Boolean(this.cookiesFromBrowser && this.cookiesFromBrowser.trim());
  }

  cancel(): void {
    this.cancelled = true;
    this.isPaused = false;
    this.kill?.("SIGTERM");
  }

  /**
   * Pause: kill the current yt-dlp process. The partial download file stays
   * on disk so --continue can resume from where it stopped. The "paused"
   * status is emitted from runInternal() after the process exits.
   */
  pause(): void {
    if (this.cancelled || this.isPaused) return;
    this.isPaused = true;
    this.kill?.("SIGTERM");
  }

  /**
   * Resume: re-spawn yt-dlp with --continue so it picks up where it left off.
   * Only meaningful after pause() has been called.
   */
  resume(): void {
    if (this.cancelled || !this.isPaused) return;
    this.isPaused = false;
    if (this.events) {
      void this.runInternal(this.events, true);
    }
  }

  async run(events: SocialDownloadEvents): Promise<void> {
    this.events = events;
    this.startedAt = Date.now();
    await this.runInternal(events, false);
  }

  private async runInternal(events: SocialDownloadEvents, isContinue: boolean): Promise<void> {
    const appTempDir = path.join(os.tmpdir(), "shanutechx-downloader", "ytdlp-temp");
    await fs.promises.mkdir(appTempDir, { recursive: true });

    const outputTemplate = "%(title).150B [%(id)s].%(ext)s";
    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(this.url);

    const args = [
      "-f", this.formatSelector,
      "--newline",
      "--no-warnings",
      "--restrict-filenames", "--windows-filenames",
      "--concurrent-fragments", "5",
      "--socket-timeout", "30",
      "--retries", "5",
      "--fragment-retries", "10",
      "--paths", `home:${this.saveDir}`,
      "--paths", `temp:${appTempDir}`,
      "-o", outputTemplate,
    ];

    if (this.bypassCache) {
      args.push("--no-cache-dir");
    }

    if (isYouTube) {
      args.push("--extractor-args", `youtube:player-client=${this.playerClient}`);
    }

    // Configure FFmpeg location for stream muxing and audio postprocessing
    if (this.ffmpegPath) {
      args.push("--ffmpeg-location", path.dirname(this.ffmpegPath));
    }

    // Ensure video merges use containers that natively support thumbnails and chapters
    if (!this.isAudioExtract) {
      args.push("--merge-output-format", "mp4/mkv");
      args.push("--remux-video", "mkv/mp4");
    }

    // Audio extraction mode
    if (this.isAudioExtract) {
      args.push("-x");
      if (this.audioFormat) {
        args.push("--audio-format", this.audioFormat);
      }
      if (this.audioQuality) {
        args.push("--audio-quality", this.audioQuality);
      }
    }

    // Use yt-dlp's built-in resume capability when restarting after a pause or retry.
    if (isContinue) args.push("--continue");
    if (this.ignoreCertificateErrors) args.push("--no-check-certificate");

    const canEmbedThumbnail =
      this.autoEmbedThumbnail &&
      !this.retriedWithoutThumbnail &&
      !(this.isAudioExtract && (this.audioFormat === "wav" || this.audioFormat === "aac"));

    if (canEmbedThumbnail) {
      args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
    }

    if (this.subtitleLanguages.trim()) {
      args.push("--write-subs", "--embed-subs", "--sub-langs", this.subtitleLanguages.trim());
    }
    // Pass browser cookies when configured and not locked/disabled
    if (this.useCookies && this.cookiesFromBrowser.trim()) {
      args.push("--cookies-from-browser", this.cookiesFromBrowser.trim());
    }
    args.push(this.url);

    events.onStatus("downloading");
    if (!isContinue) this.startedAt = Date.now();

    const { promise, kill } = runProcess(this.ytDlpPath, args, {
      onStdoutLine: (line) => {
        // 1. Merger destination: [Merger] Merging formats into "..."
        const mergerMatch = /\[Merger\]\s+Merging formats into\s+["']?([^"'\r\n]+)["']?/i.exec(line);
        if (mergerMatch?.[1]) {
          this.resolvedFilename = path.basename(mergerMatch[1].trim());
          events.onFilename(this.resolvedFilename);
        }

        // 2. Audio extraction destination: [ExtractAudio] Destination: ...
        const extractMatch = /\[ExtractAudio\]\s+Destination:\s+["']?([^"'\r\n]+)["']?/i.exec(line);
        if (extractMatch?.[1]) {
          this.resolvedFilename = path.basename(extractMatch[1].trim());
          events.onFilename(this.resolvedFilename);
        }

        // 3. MoveFiles destination: [MoveFiles] Moving file .+ to "..."
        const moveMatch = /\[MoveFiles\]\s+Moving file\s+.+?\s+to\s+["']?([^"'\r\n]+)["']?/i.exec(line);
        if (moveMatch?.[1]) {
          this.resolvedFilename = path.basename(moveMatch[1].trim());
          events.onFilename(this.resolvedFilename);
        }

        // 4. Already downloaded: [download] ... has already been downloaded
        const alreadyMatch = /\[download\]\s+["']?([^"'\r\n]+)["']?\s+has already been downloaded/i.exec(line);
        if (alreadyMatch?.[1]) {
          this.resolvedFilename = path.basename(alreadyMatch[1].trim());
          events.onFilename(this.resolvedFilename);
        }

        // 5. Standard Destination: ...
        const destMatch = /(?:Destination:\s+|Adding thumbnail to\s+["']?)([^"'\r\n]+)/i.exec(line);
        if (destMatch?.[1]) {
          const fname = path.basename(destMatch[1].trim());
          // Don't overwrite a finalized merged name (.mp4/.mkv/.mp3) with an intermediate stream fragment (.f251.webm)
          const currentIsFinal = this.resolvedFilename && /\.(mp4|mkv|mp3|m4a|flac|wav)$/i.test(this.resolvedFilename);
          if (!currentIsFinal || !fname.includes(".f")) {
            this.resolvedFilename = fname;
            events.onFilename(this.resolvedFilename);
          }
        }
        const progressMatch = PROGRESS_RE.exec(line);
        if (progressMatch?.[1] && progressMatch[2] && progressMatch[3]) {
          const percent = Number(progressMatch[1]);
          const totalBytes = unitToBytes(Number(progressMatch[2]), progressMatch[3]);
          this.lastKnownDownloadedBytes = Math.round((percent / 100) * totalBytes);
          this.lastKnownSizeBytes = totalBytes;

          let speedBps: number | undefined = undefined;
          if (progressMatch[4] && progressMatch[5]) {
            speedBps = Math.round(unitToBytes(Number(progressMatch[4]), progressMatch[5]));
          }

          let etaSec: number | null = null;
          if (progressMatch[6]) {
            etaSec = parseEtaString(progressMatch[6]);
          }

          const now = Date.now();
          if (speedBps === undefined && this.lastProgressSampleTime > 0) {
            const elapsed = (now - this.lastProgressSampleTime) / 1000;
            if (elapsed > 0.1) {
              const deltaBytes = this.lastKnownDownloadedBytes - this.lastProgressSampleBytes;
              if (deltaBytes > 0) {
                speedBps = Math.round(deltaBytes / elapsed);
              }
            }
          }
          if (speedBps && speedBps > 0 && etaSec === null && totalBytes > this.lastKnownDownloadedBytes) {
            etaSec = Math.round((totalBytes - this.lastKnownDownloadedBytes) / speedBps);
          }

          if (now - this.lastProgressEmitAt < SocialDownloadJob.PROGRESS_EMIT_INTERVAL_MS) return;
          this.lastProgressEmitAt = now;
          this.lastProgressSampleTime = now;
          this.lastProgressSampleBytes = this.lastKnownDownloadedBytes;

          events.onProgress(this.lastKnownDownloadedBytes, totalBytes, speedBps, etaSec);
        }
      },
    });
    this.kill = kill;

    try {
      await promise;
      if (this.isPaused) {
        events.onStatus("paused");
        return;
      }
      this.verifyAndResolveFileOnDisk(events);
      if (this.lastKnownSizeBytes !== null) events.onProgress(this.lastKnownSizeBytes, this.lastKnownSizeBytes);
      events.onStatus("complete");
    } catch (err: any) {
      if (this.isPaused) {
        // SIGTERM from pause() causes a non-zero exit which runProcess wraps
        // as an Error — but it's a deliberate pause, not a failure.
        events.onStatus("paused");
        return;
      }
      if (this.cancelled) {
        events.onStatus("cancelled");
        return;
      }

      const errText = `${err?.message ?? ""} ${err?.stderr ?? ""}`;
      const isCookieErr =
        errText.toLowerCase().includes("could not copy") ||
        errText.toLowerCase().includes("cookie") ||
        errText.toLowerCase().includes("dpapi") ||
        errText.toLowerCase().includes("database is locked") ||
        errText.toLowerCase().includes("sharing violation") ||
        errText.toLowerCase().includes("permission denied");

      const isForbidden =
        errText.toLowerCase().includes("403") ||
        errText.toLowerCase().includes("forbidden");

      const isThumbnailErr =
        errText.toLowerCase().includes("supported filetypes") ||
        errText.toLowerCase().includes("thumbnail embedding") ||
        errText.toLowerCase().includes("embedthumbnail");

      // Auto-recovery 1: Cookie database locked / unreadable (Chrome running or DPAPI)
      if (this.useCookies && !this.retriedCookie && isCookieErr) {
        console.warn(`[social-job:${this.id}] Cookie database locked or inaccessible (${errText.slice(0, 160)}). Retrying download without browser cookies...`);
        this.retriedCookie = true;
        this.useCookies = false;
        return await this.runInternal(events, true);
      }

      // Auto-recovery 2: 403 Forbidden on stream data (YouTube SABR anti-bot or token block)
      if (isYouTube && !this.retriedForbidden && isForbidden) {
        console.warn(`[social-job:${this.id}] Encountered 403 Forbidden on video data. Retrying with fallback player client (ios,android,web)...`);
        this.retriedForbidden = true;
        this.playerClient = "ios,android,web";
        this.bypassCache = true;
        return await this.runInternal(events, true);
      }

      // Auto-recovery 3: Postprocessing thumbnail embedding unsupported for container
      if (isThumbnailErr) {
        this.verifyAndResolveFileOnDisk(events);
        // If the audio or video file is already on disk and non-empty, the download succeeded;
        // only the thumbnail embedding metadata tag step failed.
        if (this.filepath && fs.existsSync(this.filepath)) {
          try {
            const stat = fs.statSync(this.filepath);
            if (stat.size > 0) {
              console.info(`[social-job:${this.id}] Thumbnail embedding postprocessing failed, but file exists on disk (${stat.size} bytes). Marking complete.`);
              if (this.lastKnownSizeBytes !== null) events.onProgress(this.lastKnownSizeBytes, this.lastKnownSizeBytes);
              events.onStatus("complete");
              return;
            }
          } catch {
            // fall through to retry
          }
        }

        if (!this.retriedWithoutThumbnail) {
          console.warn(`[social-job:${this.id}] Postprocessing: thumbnail embedding not supported for this format. Retrying without thumbnail...`);
          this.retriedWithoutThumbnail = true;
          this.autoEmbedThumbnail = false;
          return await this.runInternal(events, true);
        }
      }

      events.onStatus("failed", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Verifies that the resolved filename exists on disk and is non-empty.
   * If yt-dlp merged formats (.mkv / .mp4), extracted audio (.mp3 / .m4a), or renamed
   * intermediate streams (.f251.webm, .f247.webm) without a matching log, this scans
   * saveDir to locate the real, finalized file and updates resolvedFilename and size.
   */
  private verifyAndResolveFileOnDisk(events: SocialDownloadEvents): void {
    try {
      if (this.filepath && fs.existsSync(this.filepath)) {
        const stat = fs.statSync(this.filepath);
        if (stat.isFile() && stat.size > 0) {
          this.lastKnownSizeBytes = stat.size;
          return;
        }
      }

      if (!fs.existsSync(this.saveDir)) return;
      const files = fs.readdirSync(this.saveDir);

      const rawBase = this.resolvedFilename;
      const cleanBase = rawBase
        ? rawBase.replace(/\.f\d+(\.[^.]+)?$/i, "").replace(/\.[^.]+$/, "")
        : "";

      const ytIdMatch = /(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/.exec(this.url);
      const ytId = ytIdMatch?.[1];

      const mediaExts = new Set([".mp4", ".mkv", ".webm", ".mov", ".mp3", ".m4a", ".flac", ".wav", ".opus", ".aac", ".ogg"]);
      const candidates: { filename: string; fullPath: string; mtime: number; size: number }[] = [];

      for (const file of files) {
        if (file.endsWith(".part") || file.endsWith(".ytdl") || file.endsWith(".temp")) continue;
        const ext = path.extname(file).toLowerCase();
        if (!mediaExts.has(ext)) continue;

        const full = path.join(this.saveDir, file);
        try {
          const st = fs.statSync(full);
          if (!st.isFile() || st.size === 0) continue;

          let matched = false;
          if (cleanBase && file.startsWith(cleanBase)) {
            matched = true;
          } else if (ytId && file.includes(`[${ytId}]`)) {
            matched = true;
          }

          if (matched) {
            candidates.push({ filename: file, fullPath: full, mtime: st.mtimeMs, size: st.size });
          }
        } catch {
          // ignore
        }
      }

      // Clean up any stray thumbnail image files left behind in the save directory
      for (const file of files) {
        if (/\.(jpe?g|webp|png)$/i.test(file)) {
          if ((cleanBase && file.startsWith(cleanBase)) || (ytId && file.includes(`[${ytId}]`))) {
            try {
              fs.unlinkSync(path.join(this.saveDir, file));
            } catch {}
          }
        }
      }

      if (candidates.length > 0) {
        if (this.isAudioExtract) {
          const audioExt = (this.audioFormat || "mp3").toLowerCase();
          const audioCand = candidates.find((c) => c.filename.toLowerCase().endsWith("." + audioExt));
          if (audioCand) {
            this.resolvedFilename = audioCand.filename;
            this.lastKnownSizeBytes = audioCand.size;
            events.onFilename(this.resolvedFilename);
            return;
          }
        }

        candidates.sort((a, b) => b.mtime - a.mtime);
        const best = candidates[0]!;
        console.info(`[social-job:${this.id}] Resolved finalized file on disk: "${this.resolvedFilename}" -> "${best.filename}" (${best.size} bytes)`);
        this.resolvedFilename = best.filename;
        this.lastKnownSizeBytes = best.size;
        events.onFilename(this.resolvedFilename);
      }
    } catch (e) {
      console.warn(`[social-job:${this.id}] Error in verifyAndResolveFileOnDisk:`, e);
    }
  }

  get filepath(): string {
    return this.resolvedFilename ? path.join(this.saveDir, this.resolvedFilename) : "";
  }

  /**
   * BUG FIX: social-manager.ts used to call `downloadsRepo.complete(id,
   * filepath, 0, 0)` — hardcoded zeros — so every finished social/yt-dlp
   * download showed 0 bytes and 0 avg speed in History, regardless of the
   * actual file. yt-dlp's `--newline` progress lines are the only source of
   * size/timing info available (no upfront Content-Length the way the HTTP
   * engine has one), so these report the last value parsed from them —
   * accurate for the vast majority of downloads, occasionally slightly off
   * for the rare file that finishes between the last progress line and
   * process exit, which real byte-accuracy would need querying the actual
   * file on disk rather than parsing yt-dlp's own display output for.
   */
  get sizeBytes(): number | null { return this.lastKnownSizeBytes; }
  get avgSpeedBps(): number {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    return elapsedSec > 0 && this.lastKnownSizeBytes ? this.lastKnownSizeBytes / elapsedSec : 0;
  }

  static async reserveDestination(saveDir: string, suggestedName: string): Promise<string> {
    return reserveUniqueFilepath(saveDir, suggestedName);
  }
}
