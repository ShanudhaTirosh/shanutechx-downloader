import { runProcess } from "../../utils/spawn-process";

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  /** e.g. ["-vn", "-acodec", "libmp3lame", "-q:a", "2"] for audio extraction */
  ffmpegArgs: string[];
  ffmpegPath: string;
  /** Stall-detection: if no progress output for this long, treat as stuck
   *  (audit fix — the old app's converter had no such detection at all). */
  stallTimeoutMs?: number;
}

export interface ConvertEvents {
  onProgress: (percent: number) => void;
  onDone: (outputPath: string) => void;
  onError: (message: string) => void;
}

// ffmpeg's `-progress` output has a well-documented quirk: `out_time_ms` is
// unreliable/inconsistently scaled across ffmpeg builds (some emit it as
// actual microseconds despite the name). `out_time_us` is the one field
// that's consistently microseconds, so we key off that one — verified
// against a real local ffmpeg build's `-progress pipe:1` output, not assumed.
const TIME_US_RE = /out_time_us=(\d+)/;
const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/;

/**
 * Wraps a single ffmpeg invocation via the native spawn wrapper (argv array,
 * never a shell string — safe even though inputPath/outputPath can contain
 * characters derived from an untrusted video title).
 */
export class ConverterJob {
  private killFn: ((signal?: NodeJS.Signals) => void) | null = null;
  private stallTimer: NodeJS.Timeout | null = null;

  cancel(): void { this.killFn?.("SIGTERM"); }

  async run(opts: ConvertOptions, events: ConvertEvents): Promise<void> {
    const args = ["-i", opts.inputPath, ...opts.ffmpegArgs, "-progress", "pipe:1", "-y", opts.outputPath];
    let totalDurationMs: number | null = null;
    const stallTimeoutMs = opts.stallTimeoutMs ?? 60_000;

    const resetStallTimer = () => {
      if (this.stallTimer) clearTimeout(this.stallTimer);
      this.stallTimer = setTimeout(() => {
        events.onError(`No progress for ${stallTimeoutMs / 1000}s — ffmpeg appears stuck; cancel and retry.`);
        this.cancel();
      }, stallTimeoutMs);
    };
    resetStallTimer();

    const { promise, kill } = runProcess(opts.ffmpegPath, args, {
      onStderrLine: (line) => {
        if (totalDurationMs === null) {
          const durMatch = DURATION_RE.exec(line);
          if (durMatch?.[1] && durMatch[2] && durMatch[3]) {
            totalDurationMs = (Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])) * 1000;
          }
        }
      },
      onStdoutLine: (line) => {
        resetStallTimer();
        const timeMatch = TIME_US_RE.exec(line); // "N/A" lines simply won't match — no NaN risk
        if (timeMatch?.[1] && totalDurationMs) {
          const currentMs = Number(timeMatch[1]) / 1000; // microseconds -> ms
          events.onProgress(Math.min(99, (currentMs / totalDurationMs) * 100));
        }
      },
    });
    this.killFn = kill;

    try {
      await promise;
      events.onProgress(100);
      events.onDone(opts.outputPath);
    } catch (err) {
      events.onError(err instanceof Error ? err.message : String(err));
    } finally {
      if (this.stallTimer) clearTimeout(this.stallTimer);
    }
  }
}
