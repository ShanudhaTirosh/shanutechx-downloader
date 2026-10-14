import { spawn, type ChildProcess } from "node:child_process";

/**
 * Thin wrapper around Node's built-in child_process.spawn — used instead of
 * a third-party process-runner library (e.g. execa) specifically because
 * several such libraries (execa v9 among them) are ESM-only and break when
 * required from this app's CommonJS-compiled main process at runtime (the
 * same class of bug the old nanoid dependency hit — see queue-manager.ts
 * history). `spawn()` is always called with an argv ARRAY, never a shell
 * string, so this carries no shell-injection risk regardless.
 */
export interface RunResult { stdout: string; stderr: string; exitCode: number | null }

export function runProcess(
  command: string, args: string[],
  opts: { timeoutMs?: number; onStdoutLine?: (line: string) => void; onStderrLine?: (line: string) => void } = {},
): { promise: Promise<RunResult>; kill: (signal?: NodeJS.Signals) => void } {
  let child: ChildProcess;
  let stdoutBuf = "";
  let stderrBuf = "";
  let stdoutRemainder = "";
  let stderrRemainder = "";

  const promise = new Promise<RunResult>((resolve, reject) => {
    const isCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    child = spawn(command, args, { windowsHide: true, shell: isCmd });

    const timeout = opts.timeoutMs
      ? setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Process timed out after ${opts.timeoutMs}ms`)); }, opts.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuf += text;
      if (opts.onStdoutLine) {
        const combined = stdoutRemainder + text;
        const lines = combined.split(/\r?\n/);
        stdoutRemainder = lines.pop() ?? "";
        for (const line of lines) opts.onStdoutLine(line);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuf += text;
      if (opts.onStderrLine) {
        const combined = stderrRemainder + text;
        // ffmpeg writes carriage-return-updated progress lines to stderr —
        // split on \r as well so those single-line updates are still seen.
        const lines = combined.split(/\r?\n|\r/);
        stderrRemainder = lines.pop() ?? "";
        for (const line of lines) opts.onStderrLine(line);
      }
    });

    child.on("error", (err) => { if (timeout) clearTimeout(timeout); reject(err); });
    child.on("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      if (exitCode === 0) resolve({ stdout: stdoutBuf, stderr: stderrBuf, exitCode });
      else reject(Object.assign(new Error(`${command} exited with code ${exitCode}: ${stderrBuf.slice(0, 500)}`), { exitCode, stdout: stdoutBuf, stderr: stderrBuf }));
    });
  });

  return { promise, kill: (signal = "SIGTERM") => child?.kill(signal) };
}
