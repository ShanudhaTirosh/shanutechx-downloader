import path from "node:path";
import { runProcess } from "../../utils/spawn-process";
import { reserveUniqueFilepath } from "../../utils/filename";

export interface SocialDownloadEvents {
  onProgress: (downloadedBytes: number, sizeBytes: number | null) => void;
  onStatus: (status: "downloading" | "complete" | "failed" | "cancelled", errorMessage?: string) => void;
  onFilename: (filename: string) => void;
}

const PROGRESS_RE = /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+)(K|M|G)iB/i;

function unitToBytes(value: number, unit: string): number {
  const mult = unit.toUpperCase() === "G" ? 1024 ** 3 : unit.toUpperCase() === "M" ? 1024 ** 2 : 1024;
  return value * mult;
}

/**
 * One yt-dlp download's lifecycle, driven as a real child process via the
 * native spawn() wrapper (argv array — never a shell string).
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

  constructor(
    private id: string,
    private url: string,
    private saveDir: string,
    private formatSelector: string,
    private ytDlpPath: string,
    private ignoreCertificateErrors: boolean,
    private subtitleLanguages: string,
    private autoEmbedThumbnail: boolean,
  ) {}

  cancel(): void {
    this.cancelled = true;
    this.kill?.("SIGTERM");
  }

  async run(events: SocialDownloadEvents): Promise<void> {
    const outputTemplate = path.join(this.saveDir, "%(title).150B [%(id)s].%(ext)s");
    const args = [
      "-f", this.formatSelector,
      "--newline",
      "--no-warnings",
      "--restrict-filenames", "--windows-filenames",
      "-o", outputTemplate,
    ];
    if (this.ignoreCertificateErrors) args.push("--no-check-certificate");
    if (this.autoEmbedThumbnail) args.push("--embed-thumbnail");
    if (this.subtitleLanguages.trim()) {
      args.push("--write-subs", "--embed-subs", "--sub-langs", this.subtitleLanguages.trim());
    }
    args.push(this.url);

    events.onStatus("downloading");
    this.startedAt = Date.now();

    const { promise, kill } = runProcess(this.ytDlpPath, args, {
      onStdoutLine: (line) => {
        const destMatch = /Destination:\s+(.+)/.exec(line);
        if (destMatch?.[1]) {
          this.resolvedFilename = path.basename(destMatch[1].trim());
          events.onFilename(this.resolvedFilename);
        }
        const progressMatch = PROGRESS_RE.exec(line);
        if (progressMatch?.[1] && progressMatch[2] && progressMatch[3]) {
          const percent = Number(progressMatch[1]);
          const totalBytes = unitToBytes(Number(progressMatch[2]), progressMatch[3]);
          this.lastKnownDownloadedBytes = Math.round((percent / 100) * totalBytes);
          this.lastKnownSizeBytes = totalBytes;

          const now = Date.now();
          if (now - this.lastProgressEmitAt < SocialDownloadJob.PROGRESS_EMIT_INTERVAL_MS) return;
          this.lastProgressEmitAt = now;
          events.onProgress(this.lastKnownDownloadedBytes, totalBytes);
        }
      },
    });
    this.kill = kill;

    try {
      await promise;
      // Guaranteed final flush, same as the HTTP and converter engines —
      // if the last progress line landed inside the throttle window, the
      // UI shouldn't sit on a stale under-100% number once yt-dlp has
      // actually finished.
      if (this.lastKnownSizeBytes !== null) events.onProgress(this.lastKnownSizeBytes, this.lastKnownSizeBytes);
      events.onStatus("complete");
    } catch (err) {
      if (this.cancelled) {
        events.onStatus("cancelled");
      } else {
        events.onStatus("failed", err instanceof Error ? err.message : String(err));
      }
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
