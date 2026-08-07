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

  // yt-dlp URLs - direct exe download
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

  // ffmpeg URLs - using gyan.dev builds for Windows (direct exe in zip)
  let ffmpegUrl = "";
  let ffprobeUrl = "";
  
  if (platform === "win32") {
    // Using gyan.dev builds - essentials contains just ffmpeg.exe, ffprobe.exe, ffplay.exe
    const baseUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
    ffmpegUrl = baseUrl;
    ffprobeUrl = baseUrl; // Same zip contains both
  } else if (platform === "darwin") {
    // evermeet.cx for macOS
    ffmpegUrl = "https://evermeet.cx/ffmpeg/getrelease/zip";
    ffprobeUrl = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip";
  } else {
    // John Van Sickle's builds for Linux
    const linuxArch = arch === "x64" ? "amd64" : "arm64";
    const baseUrl = `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${linuxArch}-static.tar.xz`;
    ffmpegUrl = baseUrl;
    ffprobeUrl = baseUrl; // Same archive contains both
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
async function extractZip(zipPath: string, outputPath: string, binaryName: string): Promise<void> {
  const tempDir = path.join(BINARIES_DIR, 'temp_extract');
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    console.log(`Extracting zip to ${tempDir}...`);
    if (process.platform === "win32") {
      // Use PowerShell's Expand-Archive on Windows
      const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`;
      console.log(`Running: ${command}`);
      await execAsync(command);
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
          console.log(`Found file: ${entry.name}`);
          if (name === 'ffmpeg.exe' || name === 'ffprobe.exe' || 
              name === 'ffmpeg' || name === 'ffprobe') {
            console.log(`Found binary: ${fullPath}`);
            return fullPath;
          }
        } else if (entry.isDirectory()) {
          // Search subdirectories
          console.log(`Searching directory: ${entry.name}`);
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
      throw new Error(`Could not find ${binaryName} binary in extracted zip. Found files: ${files.join(', ')}`);
    }

    // Move the binary to the final location
    console.log(`Moving binary from ${binaryPath} to ${outputPath}`);
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
 * Download all missing binaries in parallel.
 * All three binaries (yt-dlp, ffmpeg, ffprobe) download simultaneously —
 * previously they were sequential which meant 3x the wait time.
 */
export async function downloadMissingBinaries(onProgress?: ProgressCallback): Promise<void> {
  await ensureBinariesDir();
  
  const missing = getMissingBinaries();
  const urls = getBinaryUrls();

  const tasks: Promise<void>[] = [];

  if (missing.ytdlp) {
    console.log('Queuing yt-dlp download...');
    tasks.push(
      downloadBinary(urls.ytdlp, YTDLP_PATH, "yt-dlp", onProgress)
        .then(() => console.log('yt-dlp downloaded successfully'))
    );
  }

  // On Windows, ffmpeg and ffprobe come from the same zip — download once.
  if (process.platform === "win32" && (missing.ffmpeg || missing.ffprobe)) {
    if (urls.ffmpeg === urls.ffprobe) {
      console.log('Queuing ffmpeg bundle download (includes ffmpeg and ffprobe)...');
      tasks.push(
        downloadAndExtractFFmpegBundle(urls.ffmpeg, onProgress)
          .then(() => console.log('ffmpeg and ffprobe downloaded successfully'))
      );
    } else {
      if (missing.ffmpeg) {
        tasks.push(
          downloadBinary(urls.ffmpeg, FFMPEG_PATH, "ffmpeg", onProgress)
            .then(() => console.log('ffmpeg downloaded successfully'))
        );
      }
      if (missing.ffprobe) {
        tasks.push(
          downloadBinary(urls.ffprobe, FFPROBE_PATH, "ffprobe", onProgress)
            .then(() => console.log('ffprobe downloaded successfully'))
        );
      }
    }
  } else {
    // Other platforms — download ffmpeg and ffprobe in parallel too
    if (missing.ffmpeg) {
      tasks.push(
        downloadBinary(urls.ffmpeg, FFMPEG_PATH, "ffmpeg", onProgress)
          .then(() => console.log('ffmpeg downloaded successfully'))
      );
    }
    if (missing.ffprobe) {
      tasks.push(
        downloadBinary(urls.ffprobe, FFPROBE_PATH, "ffprobe", onProgress)
          .then(() => console.log('ffprobe downloaded successfully'))
      );
    }
  }

  // Run all downloads at the same time
  await Promise.all(tasks);
}

/**
 * Download and extract ffmpeg bundle that contains both ffmpeg and ffprobe
 */
async function downloadAndExtractFFmpegBundle(url: string, onProgress?: ProgressCallback): Promise<void> {
  console.log(`Downloading ffmpeg bundle from ${url}...`);
  const response = await request(url, { maxRedirections: 5 });
  
  if (response.statusCode !== 200) {
    throw new Error(`Failed to download ffmpeg bundle: HTTP ${response.statusCode}`);
  }

  const totalBytes = response.headers["content-length"] 
    ? Number(response.headers["content-length"]) 
    : null;
  
  let downloadedBytes = 0;
  const tempPath = path.join(BINARIES_DIR, 'ffmpeg-bundle.zip');
  const writeStream = createWriteStream(tempPath);

  response.body.on("data", (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    if (onProgress && totalBytes) {
      onProgress({
        binary: "ffmpeg",
        downloadedBytes,
        totalBytes,
        percent: Math.round((downloadedBytes / totalBytes) * 100),
      });
    }
  });

  await pipeline(response.body, writeStream);
  console.log(`Downloaded ffmpeg bundle (${downloadedBytes} bytes)`);

  // Extract both binaries
  console.log(`Extracting ffmpeg bundle...`);
  await extractFFmpegBundle(tempPath);
  await fsp.unlink(tempPath);
  console.log(`Extracted ffmpeg and ffprobe successfully`);
}

/**
 * Extract ffmpeg bundle to get both ffmpeg and ffprobe
 */
async function extractFFmpegBundle(zipPath: string): Promise<void> {
  const tempDir = path.join(BINARIES_DIR, 'temp_extract');
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    console.log(`Extracting bundle to ${tempDir}...`);
    if (process.platform === "win32") {
      const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`;
      console.log(`Running: ${command}`);
      await execAsync(command);
    } else {
      await execAsync(`unzip -o "${zipPath}" -d "${tempDir}"`);
    }

    // Find ffmpeg and ffprobe - search recursively
    const binaries: { ffmpeg?: string; ffprobe?: string } = {};
    
    const findBinaries = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          console.log(`Found file: ${entry.name}`);
          
          if ((name === 'ffmpeg.exe' || name === 'ffmpeg') && !binaries.ffmpeg) {
            console.log(`Found ffmpeg: ${fullPath}`);
            binaries.ffmpeg = fullPath;
          } else if ((name === 'ffprobe.exe' || name === 'ffprobe') && !binaries.ffprobe) {
            console.log(`Found ffprobe: ${fullPath}`);
            binaries.ffprobe = fullPath;
          }
          
          // Stop if we found both
          if (binaries.ffmpeg && binaries.ffprobe) return;
        } else if (entry.isDirectory()) {
          await findBinaries(fullPath);
          if (binaries.ffmpeg && binaries.ffprobe) return;
        }
      }
    };

    await findBinaries(tempDir);

    if (!binaries.ffmpeg && !binaries.ffprobe) {
      const files = await fsp.readdir(tempDir);
      throw new Error(`Could not find ffmpeg or ffprobe in bundle. Found files: ${files.join(', ')}`);
    }

    // Move binaries to final locations
    if (binaries.ffmpeg) {
      console.log(`Moving ffmpeg from ${binaries.ffmpeg} to ${FFMPEG_PATH}`);
      await fsp.rename(binaries.ffmpeg, FFMPEG_PATH);
    }
    
    if (binaries.ffprobe) {
      console.log(`Moving ffprobe from ${binaries.ffprobe} to ${FFPROBE_PATH}`);
      await fsp.rename(binaries.ffprobe, FFPROBE_PATH);
    }
  } finally {
    // Clean up temp directory
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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
