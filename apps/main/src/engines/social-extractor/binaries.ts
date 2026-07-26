import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

/**
 * Locates the yt-dlp / ffmpeg binaries. In a packaged app these ship inside
 * `resources/bin/<platform>/` (wired up via electron-builder's `extraResources`
 * — see electron-builder.yml); in dev, we fall back to whatever's on PATH so
 * contributors don't need to vendor binaries just to run `pnpm dev`.
 *
 * This closes the old app's "ffmpeg not found, feature silently breaks"
 * gap (audit §config.py finding) — resolvePaths() is called once at startup
 * and its result is surfaced to the UI (see social:checkBinaries channel)
 * instead of failing invisibly deep inside a conversion task.
 */
export interface BinaryPaths { ytDlp: string; ffmpeg: string }

function bundledBinDir(): string {
  const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  return path.join(process.resourcesPath ?? "", "bin", platform);
}

export function resolveBinaries(): BinaryPaths {
  const isPackaged = app.isPackaged;
  const ext = process.platform === "win32" ? ".exe" : "";

  const bundledYtDlp = path.join(bundledBinDir(), `yt-dlp${ext}`);
  const bundledFfmpeg = path.join(bundledBinDir(), `ffmpeg${ext}`);

  return {
    ytDlp: isPackaged && fs.existsSync(bundledYtDlp) ? bundledYtDlp : "yt-dlp",
    ffmpeg: isPackaged && fs.existsSync(bundledFfmpeg) ? bundledFfmpeg : "ffmpeg",
  };
}
