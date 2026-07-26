/**
 * Explicit, bounded, observable shutdown state machine — replaces the old
 * app's "set a flag and hope, with a blind 5s os._exit() watchdog as a
 * backstop" approach, which could kill the process mid-write.
 *
 * Each phase has its own timeout and logs a specific reason if it's exceeded,
 * instead of one shared timer racing against unrelated work.
 */
import log from "electron-log";

export type ShutdownPhase =
  | "idle"
  | "pausing-active-transfers"
  | "persisting-state"
  | "db-flush"
  | "ready-to-quit";

export interface ShutdownStep {
  phase: ShutdownPhase;
  timeoutMs: number;
  run: () => Promise<void>;
}

export async function runShutdownSequence(steps: ShutdownStep[]): Promise<void> {
  for (const step of steps) {
    const start = Date.now();
    try {
      await withTimeout(step.run(), step.timeoutMs, step.phase);
    } catch (err) {
      log.error(`[shutdown] phase "${step.phase}" did not complete cleanly:`, err);
      // Deliberately continue to the next phase rather than force-killing the
      // whole process — DB flush is always the last step and is the only one
      // allowed to be authoritative about what's safely persisted.
    } finally {
      log.info(`[shutdown] phase "${step.phase}" took ${Date.now() - start}ms`);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms in phase "${label}"`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
