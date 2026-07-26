import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { request } from "undici";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

/**
 * Manages automatic download and setup of yt-dlp and ffmpeg binaries
 * in the application's resources directory. No user configuration needed.
 */

const BINARIES_DIR = path.join(app.getPath("userData"), "binaries");
const YTDLP_PATH = path.join(BINARIES_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const FFMPEG_PATH = path.join(BINARIES_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FFPROBE_PATH = path.join(BINARIES_DIR, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");

interface DownloadProgress {
  binary: "yt-dlp" | "ffmpeg" | "ffprobe";
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Get download URLs for platform-specific binaries
 */
function getBinaryUrls(): { ytdlp: string; ffmpeg: string; ffprobe: string } {
  const platform = process.platform;
  const arch = process.arch;

  // yt-dlp URLs
  let ytdlpUrl = "";
  if (platform === "win32") {
    ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  } else if (platform === "darwin") {
    ytdlpUrl = arch === "arm64"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
      : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
  } else {
    ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  }

  // ffmpeg URLs (using ffmpeg-static-electron compatible builds)
  let ffmpegUrl = "";
  let ffprobeUrl = "";
  
  if (platform === "win32") {
    const winArch = arch === "x64" ? "win-x64" : "win-ia32";
    ffmpegUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-${winArch}`;
    ffprobeUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffprobe-${winArch}`;
  } else if (platform === "darwin") {
    const macArch = arch === "arm64" ? "darwin-arm64" : "darwin-x64";
    ffmpegUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-${macArch}`;
    ffprobeUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffprobe-${macArch}`;
  } else {
    const linuxArch = arch === "x64" ? "linux-x64" : arch === "arm64" ? "linux-arm64" : "linux-ia32";
    ffmpegUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-${linuxArch}`;
    ffprobeUrl = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffprobe-${linuxArch}`;
  }

  return { ytdlp: ytdlpUrl, ffmpeg: ffmpegUrl, ffprobe: ffprobeUrl };
}

/**
 * Download a binary from a URL with progress tracking
 */
async function downloadBinary(
  url: string,
  outputPath: string,
  binaryName: "yt-dlp" | "ffmpeg" | "ffprobe",
  onProgress?: ProgressCallback
): Promise<void> {
  const response = await request(url, { maxRedirections: 5 });
  
  if (response.statusCode !== 200) {
    throw new Error(`Failed to download ${binaryName}: HTTP ${response.statusCode}`);
  }

  const totalBytes = response.headers["content-length"] 
    ? Number(response.headers["content-length"]) 
    : null;
  
  let downloadedBytes = 0;

  const tempPath = `${outputPath}.tmp`;
  const writeStream = createWriteStream(tempPath);

  response.body.on("data", (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    if (onProgress && totalBytes) {
      onProgress({
        binary: binaryName,
        downloadedBytes,
        totalBytes,
        percent: Math.round((downloadedBytes / totalBytes) * 100),
      });
    }
  });

  await pipeline(response.body, writeStream);
  await fsp.rename(tempPath, outputPath);

  // Make executable on Unix-like systems
  if (process.platform !== "win32") {
    await fsp.chmod(outputPath, 0o755);
  }
}

/**
 * Check if a binary exists and is executable
 */
function binaryExists(binaryPath: string): boolean {
  try {
    return fs.existsSync(binaryPath) && fs.statSync(binaryPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure binaries directory exists
 */
async function ensureBinariesDir(): Promise<void> {
  await fsp.mkdir(BINARIES_DIR, { recursive: true });
}

/**
 * Check which binaries are missing
 */
export function getMissingBinaries(): {
  ytdlp: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
} {
  return {
    ytdlp: !binaryExists(YTDLP_PATH),
    ffmpeg: !binaryExists(FFMPEG_PATH),
    ffprobe: !binaryExists(FFPROBE_PATH),
  };
}

/**
 * Download all missing binaries
 */
export async function downloadMissingBinaries(onProgress?: ProgressCallback): Promise<void> {
  await ensureBinariesDir();
  
  const missing = getMissingBinaries();
  const urls = getBinaryUrls();

  if (missing.ytdlp) {
    await downloadBinary(urls.ytdlp, YTDLP_PATH, "yt-dlp", onProgress);
  }

  if (missing.ffmpeg) {
    await downloadBinary(urls.ffmpeg, FFMPEG_PATH, "ffmpeg", onProgress);
  }

  if (missing.ffprobe) {
    await downloadBinary(urls.ffprobe, FFPROBE_PATH, "ffprobe", onProgress);
  }
}

/**
 * Get paths to binaries (for use in application)
 */
export function getBinaryPaths(): {
  ytdlp: string;
  ffmpeg: string;
  ffprobe: string;
} {
  return {
    ytdlp: YTDLP_PATH,
    ffmpeg: FFMPEG_PATH,
    ffprobe: FFPROBE_PATH,
  };
}

/**
 * Initialize binaries on app start - download if missing
 */
export async function initializeBinaries(onProgress?: ProgressCallback): Promise<boolean> {
  try {
    const missing = getMissingBinaries();
    const hasMissing = missing.ytdlp || missing.ffmpeg || missing.ffprobe;

    if (hasMissing) {
      await downloadMissingBinaries(onProgress);
      return true; // Downloaded binaries
    }

    return false; // All binaries already present
  } catch (error) {
    console.error("Failed to initialize binaries:", error);
    throw error;
  }
}
