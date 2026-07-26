import { getBinaryPaths } from "../../utils/binary-manager";

/**
 * Locates the yt-dlp / ffmpeg binaries. Now uses the binary-manager which
 * automatically downloads binaries to the app's userData directory on first run.
 * No need for manual configuration or bundling binaries in the app package.
 *
 * This closes the old app's "ffmpeg not found, feature silently breaks"
 * gap (audit §config.py finding) — binaries are automatically downloaded
 * on first launch and paths are resolved consistently.
 */
export interface BinaryPaths { ytDlp: string; ffmpeg: string }

export function resolveBinaries(): BinaryPaths {
  const paths = getBinaryPaths();
  return {
    ytDlp: paths.ytdlp,
    ffmpeg: paths.ffmpeg,
  };
}

