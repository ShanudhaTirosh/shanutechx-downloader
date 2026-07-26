import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { request } from "undici";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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

  // ffmpeg URLs (using ffbinaries.com - direct exe downloads, no archives)
  let ffmpegUrl = "";
  let ffprobeUrl = "";
  
  if (platform === "win32") {
    // ffbinaries provides direct .exe downloads for Windows
    ffmpegUrl = arch === "x64"
      ? "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip"
      : "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip";
    ffprobeUrl = arch === "x64"
      ? "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-win-64.zip"
      : "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-win-64.zip";
  } else if (platform === "darwin") {
    ffmpegUrl = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-osx-64.zip";
    ffprobeUrl = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-osx-64.zip";
  } else {
    ffmpegUrl = arch === "x64"
      ? "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip"
      : "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-arm-64.zip";
    ffprobeUrl = arch === "x64"
      ? "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-linux-64.zip"
      : "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-linux-arm-64.zip";
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
  console.log(`Downloading ${binaryName} from ${url}...`);
  const response = await request(url, { maxRedirections: 5 });
  
  if (response.statusCode !== 200) {
    throw new Error(`Failed to download ${binaryName}: HTTP ${response.statusCode}`);
  }

  const totalBytes = response.headers["content-length"] 
    ? Number(response.headers["content-length"]) 
    : null;
  
  let downloadedBytes = 0;

  // Check if it's a zip file
  const isZip = url.endsWith('.zip');
  const tempPath = isZip ? `${outputPath}.zip` : `${outputPath}.tmp`;
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
  console.log(`Downloaded ${binaryName} (${downloadedBytes} bytes)`);

  // If it's a zip file, extract it
  if (isZip) {
    console.log(`Extracting ${binaryName} from zip...`);
    await extractZip(tempPath, outputPath, binaryName);
    await fsp.unlink(tempPath);
    console.log(`Extracted ${binaryName} successfully`);
  } else {
    await fsp.rename(tempPath, outputPath);
  }

  // Make executable on Unix-like systems
  if (process.platform !== "win32") {
    await fsp.chmod(outputPath, 0o755);
  }
}

/**
 * Extract a zip file to get the binary
 */
async function extractZip(zipPath: string, outputPath: string): Promise<void> {
  const tempDir = path.join(BINARIES_DIR, 'temp_extract');
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    if (process.platform === "win32") {
      // Use PowerShell's Expand-Archive on Windows
      await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`);
    } else {
      // Use unzip on Unix-like systems
      await execAsync(`unzip -o "${zipPath}" -d "${tempDir}"`);
    }

    // Find the extracted binary - search recursively
    const findBinary = async (dir: string): Promise<string | null> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile()) {
          // Check if it's the binary we're looking for
          const name = entry.name.toLowerCase();
          if (name === 'ffmpeg.exe' || name === 'ffprobe.exe' || 
              name === 'ffmpeg' || name === 'ffprobe') {
            return fullPath;
          }
        } else if (entry.isDirectory()) {
          // Search subdirectories
          const found = await findBinary(fullPath);
          if (found) return found;
        }
      }
      
      return null;
    };

    const binaryPath = await findBinary(tempDir);

    if (!binaryPath) {
      // List what we found for debugging
      const files = await fsp.readdir(tempDir);
      console.error('Files in extracted zip:', files);
      throw new Error(`Could not find binary in extracted zip. Found files: ${files.join(', ')}`);
    }

    // Move the binary to the final location
    await fsp.rename(binaryPath, outputPath);
  } finally {
    // Clean up temp directory
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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
    console.log('Downloading yt-dlp...');
    await downloadBinary(urls.ytdlp, YTDLP_PATH, "yt-dlp", onProgress);
    console.log('yt-dlp downloaded successfully');
  }

  if (missing.ffmpeg) {
    console.log('Downloading ffmpeg...');
    await downloadBinary(urls.ffmpeg, FFMPEG_PATH, "ffmpeg", onProgress);
    console.log('ffmpeg downloaded successfully');
  }

  if (missing.ffprobe) {
    console.log('Downloading ffprobe...');
    await downloadBinary(urls.ffprobe, FFPROBE_PATH, "ffprobe", onProgress);
    console.log('ffprobe downloaded successfully');
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
