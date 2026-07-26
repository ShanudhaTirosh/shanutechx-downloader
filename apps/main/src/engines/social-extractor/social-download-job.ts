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
          events.onProgress(Math.round((percent / 100) * totalBytes), totalBytes);
        }
      },
    });
    this.kill = kill;

    try {
      await promise;
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

  static async reserveDestination(saveDir: string, suggestedName: string): Promise<string> {
    return reserveUniqueFilepath(saveDir, suggestedName);
  }
}
