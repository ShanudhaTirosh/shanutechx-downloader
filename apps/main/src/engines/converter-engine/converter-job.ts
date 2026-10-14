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

export interface ConvertProgressData {
  speed?: string;
  timemark?: string;
  fps?: number;
}

export interface ConvertEvents {
  onProgress: (percent: number, data?: ConvertProgressData) => void;
  onDone: (outputPath: string) => void;
  onError: (message: string) => void;
}

// ffmpeg's `-progress` output has a well-documented quirk: `out_time_ms` is
// unreliable/inconsistently scaled across ffmpeg builds (some emit it as
// actual microseconds despite the name). `out_time_us` is the one field
// that's consistently microseconds, so we key off that one — verified
// against a real local ffmpeg build's `-progress pipe:1` output, not assumed.
const TIME_US_RE = /out_time_us=(\d+)/;
const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const SPEED_RE = /speed=\s*([\d.]+x)/;
const FPS_RE = /fps=\s*([\d.]+)/;
const OUT_TIME_RE = /out_time=\s*([\d:.]+)/;

/**
 * Wraps a single ffmpeg invocation via the native spawn wrapper (argv array,
 * never a shell string — safe even though inputPath/outputPath can contain
 * characters derived from an untrusted video title).
 */
export class ConverterJob {
  private killFn: ((signal?: NodeJS.Signals) => void) | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  // Same flooding risk as the HTTP download engine (Phase 1 fix): ffmpeg's
  // `-progress` output emits a full key=value block roughly once per frame,
  // which for high-fps footage converting faster than real time can be
  // dozens of onProgress calls per second straight into IPC. Coalesce the
  // same way, with a guaranteed final emit on completion (already handled
  // by the unconditional `onProgress(100)` after the process exits).
  private static readonly PROGRESS_EMIT_INTERVAL_MS = 120;
  private lastProgressEmitAt = 0;

  cancel(): void { this.killFn?.("SIGTERM"); }

  async run(opts: ConvertOptions, events: ConvertEvents): Promise<void> {
    const args = ["-i", opts.inputPath, ...opts.ffmpegArgs, "-progress", "pipe:1", "-y", opts.outputPath];
    let totalDurationMs: number | null = null;
    let currentSpeed: string | undefined;
    let currentTimemark: string | undefined;
    let currentFps: number | undefined;
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
        const spMatch = SPEED_RE.exec(line);
        if (spMatch?.[1]) currentSpeed = spMatch[1];
        const fpsMatch = FPS_RE.exec(line);
        if (fpsMatch?.[1]) currentFps = parseFloat(fpsMatch[1]);
        const otMatch = OUT_TIME_RE.exec(line);
        if (otMatch?.[1]) currentTimemark = otMatch[1].split(".")[0];

        const timeMatch = TIME_US_RE.exec(line); // "N/A" lines simply won't match — no NaN risk
        if (timeMatch?.[1] && totalDurationMs) {
          const currentMs = Number(timeMatch[1]) / 1000; // microseconds -> ms
          const now = Date.now();
          if (now - this.lastProgressEmitAt < ConverterJob.PROGRESS_EMIT_INTERVAL_MS) return;
          this.lastProgressEmitAt = now;
          events.onProgress(Math.min(99, (currentMs / totalDurationMs) * 100), {
            speed: currentSpeed,
            timemark: currentTimemark,
            fps: currentFps,
          });
        }
      },
    });
    this.killFn = kill;

    try {
      await promise;
      events.onProgress(100, {
        speed: currentSpeed,
        timemark: currentTimemark,
        fps: currentFps,
      });
      events.onDone(opts.outputPath);
    } catch (err) {
      events.onError(err instanceof Error ? err.message : String(err));
    } finally {
      if (this.stallTimer) clearTimeout(this.stallTimer);
    }
  }
}
