import { app, BrowserWindow, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { autoUpdater } from "electron-updater";
import { request } from "undici";
import { registerHandler } from "./index";
import { getMissingBinaries, downloadMissingBinaries, ensureYtDlpBinary } from "../../utils/binary-manager";
import { downloadsRepo } from "../../db/downloads-repo";

// Read app version from our own package.json rather than calling app.getVersion().
// In dev mode, app.getVersion() returns the Electron runtime version (e.g. 33.4.11)
// because Electron is the process being run, not the packaged app.
const APP_VERSION = (() => {
  try {
    const pkgPath = path.join(__dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.2.0";
  } catch {
    return "0.2.0";
  }
})();

interface GitHubReleaseResponse {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets?: { name: string; browser_download_url: string; size: number }[];
}

interface UpdateDetails {
  version: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt?: string;
  isDirectExe: boolean;
}

let cachedUpdate: UpdateDetails | null = null;

function isVersionNewer(latestStr: string, currentStr: string): boolean {
  const clean = (s: string) => (s.replace(/^v/i, "").split("-")[0] ?? "").trim();
  const latestParts = clean(latestStr).split(".").map((n) => parseInt(n, 10) || 0);
  const currentParts = clean(currentStr).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < len; i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export async function checkGitHubRelease(): Promise<{
  updateAvailable: boolean;
  version?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
}> {
  try {
    const res = await request("https://api.github.com/repos/ShanudhaTirosh/shanutechx-downloader/releases/latest", {
      headers: {
        "User-Agent": "SHANUTECHX-Downloader-App",
        "Accept": "application/vnd.github.v3+json",
      },
    });

    if (res.statusCode !== 200) {
      return { updateAvailable: false };
    }

    const data = (await res.body.json()) as GitHubReleaseResponse;
    const latestTag = data.tag_name || "";
    const cleanLatest = latestTag.replace(/^v/i, "");
    const isNewer = isVersionNewer(cleanLatest, APP_VERSION);

    let downloadUrl = data.html_url;
    let isDirectExe = false;
    if (data.assets && data.assets.length > 0) {
      const exeAsset = data.assets.find((a) => a.name.endsWith(".exe"));
      if (exeAsset) {
        downloadUrl = exeAsset.browser_download_url;
        isDirectExe = true;
      }
    }

    if (isNewer) {
      cachedUpdate = {
        version: cleanLatest,
        releaseNotes: data.body || "A new version of STX Downloader is ready for update.",
        downloadUrl,
        publishedAt: data.published_at,
        isDirectExe,
      };

      return {
        updateAvailable: true,
        version: cleanLatest,
        releaseNotes: cachedUpdate.releaseNotes,
        downloadUrl,
        publishedAt: data.published_at,
      };
    }

    return { updateAvailable: false };
  } catch (error) {
    console.error("Failed to query GitHub Releases:", error);
    return { updateAvailable: false };
  }
}

function getTargetWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

export function registerAppHandlers(): void {
  registerHandler("app:getVersion", () => ({ version: APP_VERSION }));
  registerHandler("app:getPlatform", () => ({ platform: process.platform }));
  
  registerHandler("app:minimize", () => {
    const win = getTargetWindow();
    if (win) win.minimize();
  });
  
  registerHandler("app:maximize", () => {
    const win = getTargetWindow();
    if (win) win.maximize();
  });
  
  registerHandler("app:unmaximize", () => {
    const win = getTargetWindow();
    if (win) win.unmaximize();
  });
  
  registerHandler("app:close", () => {
    const win = getTargetWindow();
    if (win) win.close();
  });
  
  registerHandler("app:isMaximized", () => {
    const win = getTargetWindow();
    return { maximized: win?.isMaximized() ?? false };
  });
  
  registerHandler("app:selectFile", async (req) => {
    const win = getTargetWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: req.title ?? "Select File",
          filters: req.filters ?? [],
          properties: ["openFile"],
        })
      : await dialog.showOpenDialog({
          title: req.title ?? "Select File",
          filters: req.filters ?? [],
          properties: ["openFile"],
        });
    
    return { filePath: result.canceled ? null : result.filePaths[0] ?? null };
  });

  registerHandler("app:checkBinaries", () => {
    return getMissingBinaries();
  });

  registerHandler("app:downloadBinaries", async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      // Ensure yt-dlp first straight away
      await ensureYtDlpBinary((progress) => {
        win?.webContents.send("binary:download-progress", progress);
      });
      // Then other missing binaries
      await downloadMissingBinaries((progress) => {
        win?.webContents.send("binary:download-progress", progress);
      });
      return { success: true };
    } catch (error) {
      console.error("Failed to download binaries:", error);
      return { success: false };
    }
  });

  registerHandler("app:checkForUpdates", async () => {
    // 1. Check GitHub Releases API directly for latest release info
    const ghCheck = await checkGitHubRelease();
    if (ghCheck.updateAvailable) {
      return ghCheck;
    }

    // 2. Fallback to electron-updater if in packaged environment
    if (app.isPackaged) {
      try {
        const result = await autoUpdater.checkForUpdates();
        if (result && isVersionNewer(result.updateInfo.version, APP_VERSION)) {
          return {
            updateAvailable: true,
            version: result.updateInfo.version,
            releaseNotes: typeof result.updateInfo.releaseNotes === "string" 
              ? result.updateInfo.releaseNotes 
              : result.updateInfo.releaseNotes?.join("\n") ?? "",
          };
        }
      } catch (error) {
        console.error("electron-updater check failed:", error);
      }
    }

    return { updateAvailable: false };
  });

  registerHandler("app:downloadUpdate", async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    
    // If we have a direct .exe installer asset from GitHub Releases:
    if (cachedUpdate && cachedUpdate.isDirectExe && cachedUpdate.downloadUrl.endsWith(".exe")) {
      try {
        const downloadsDir = app.getPath("downloads");
        const installerFilename = `SHANUTECHX-Downloader-Setup-v${cachedUpdate.version}.exe`;
        const targetPath = path.join(downloadsDir, installerFilename);

        console.log(`Downloading update installer from ${cachedUpdate.downloadUrl} to ${targetPath}...`);
        const res = await request(cachedUpdate.downloadUrl, { maxRedirections: 5 });
        if (res.statusCode !== 200) {
          throw new Error(`Failed to download installer: HTTP ${res.statusCode}`);
        }

        const totalBytes = res.headers["content-length"] ? Number(res.headers["content-length"]) : null;
        let downloadedBytes = 0;
        const writeStream = createWriteStream(targetPath);

        res.body.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (totalBytes && win) {
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            win.webContents.send("update:download-progress", { percent });
          }
        });

        await pipeline(res.body, writeStream);
        console.log(`Update downloaded to ${targetPath}`);

        if (win) {
          win.webContents.send("update:download-progress", { percent: 100 });
          win.webContents.send("update:downloaded", undefined);
        }

        // Prompt user to open installer
        const dialogOpts = {
          type: "info" as const,
          title: "Update Downloaded",
          message: `SHANUTECHX Downloader v${cachedUpdate.version} has been downloaded.`,
          detail: "Would you like to run the installer now to update the application?",
          buttons: ["Install Now", "Open Downloads Folder", "Later"],
          defaultId: 0,
        };
        const choice = win ? await dialog.showMessageBox(win, dialogOpts) : await dialog.showMessageBox(dialogOpts);

        if (choice.response === 0) {
          shell.openPath(targetPath);
        } else if (choice.response === 1) {
          shell.showItemInFolder(targetPath);
        }

        return { success: true };
      } catch (err: any) {
        console.error("Failed to download update installer directly:", err);
        if (cachedUpdate?.downloadUrl) {
          shell.openExternal(cachedUpdate.downloadUrl);
        }
        return { success: false, message: err?.message };
      }
    }

    // If packaged with autoUpdater:
    if (app.isPackaged) {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (err: any) {
        console.error("autoUpdater download failed:", err);
      }
    }

    // Default: Open release page in external browser
    if (cachedUpdate?.downloadUrl) {
      shell.openExternal(cachedUpdate.downloadUrl);
      return { success: true, message: "Opening GitHub Release in browser." };
    }

    return { success: false };
  });

  registerHandler("app:showInFolder", (req) => {
    if (!req.filepath) return { success: false };
    let targetPath = req.filepath;

    if (!fs.existsSync(targetPath)) {
      // Auto-heal path: if intermediate fragment suffix like .f251.webm was recorded, find real file (.mkv, .mp4, .mp3, etc.)
      const dir = path.dirname(targetPath);
      const rawBase = path.basename(targetPath);
      const cleanBase = rawBase.replace(/\.f\d+(\.[^.]+)?$/i, "").replace(/\.[^.]+$/, "");
      const idMatch = /\[([^\]]+)\]/.exec(rawBase);
      const mediaId = idMatch?.[1];

      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const mediaExts = new Set([".mp4", ".mkv", ".webm", ".mov", ".mp3", ".m4a", ".flac", ".wav", ".opus", ".aac", ".ogg"]);
          const candidates = files.filter((f) => {
            const ext = path.extname(f).toLowerCase();
            if (!mediaExts.has(ext)) return false;
            if (f.endsWith(".part") || f.endsWith(".ytdl")) return false;
            if (mediaId && f.includes(`[${mediaId}]`)) return true;
            if (cleanBase && f.startsWith(cleanBase)) return true;
            return false;
          });

          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              const statA = fs.statSync(path.join(dir, a));
              const statB = fs.statSync(path.join(dir, b));
              return statB.mtimeMs - statA.mtimeMs;
            });
            targetPath = path.join(dir, candidates[0]!);
            try {
              downloadsRepo.updateFilepathByOldPath(req.filepath, targetPath);
            } catch {}
          }
        }
      } catch (err) {
        console.warn("Auto-heal showInFolder path failed:", err);
      }
    }

    if (!fs.existsSync(targetPath)) {
      // If the file still doesn't exist, but its parent directory exists, open the directory!
      const dir = path.dirname(targetPath);
      if (fs.existsSync(dir)) {
        shell.openPath(dir);
        return { success: true };
      }
      return { success: false };
    }

    shell.showItemInFolder(targetPath);
    return { success: true };
  });

  registerHandler("app:openFile", async (req) => {
    if (!req.filepath) return { success: false, error: "No filepath provided" };
    let targetPath = req.filepath;

    if (!fs.existsSync(targetPath)) {
      const dir = path.dirname(targetPath);
      const rawBase = path.basename(targetPath);
      const cleanBase = rawBase.replace(/\.f\d+(\.[^.]+)?$/i, "").replace(/\.[^.]+$/, "");
      const idMatch = /\[([^\]]+)\]/.exec(rawBase);
      const mediaId = idMatch?.[1];

      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          const mediaExts = new Set([".mp4", ".mkv", ".webm", ".mov", ".mp3", ".m4a", ".flac", ".wav", ".opus", ".aac", ".ogg"]);
          const candidates = files.filter((f) => {
            const ext = path.extname(f).toLowerCase();
            if (!mediaExts.has(ext)) return false;
            if (f.endsWith(".part") || f.endsWith(".ytdl")) return false;
            if (mediaId && f.includes(`[${mediaId}]`)) return true;
            if (cleanBase && f.startsWith(cleanBase)) return true;
            return false;
          });

          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              const statA = fs.statSync(path.join(dir, a));
              const statB = fs.statSync(path.join(dir, b));
              return statB.mtimeMs - statA.mtimeMs;
            });
            targetPath = path.join(dir, candidates[0]!);
            try {
              downloadsRepo.updateFilepathByOldPath(req.filepath, targetPath);
            } catch {}
          }
        }
      } catch {}
    }

    if (!fs.existsSync(targetPath)) return { success: false, error: "File not found" };
    const err = await shell.openPath(targetPath);
    return { success: !err, error: err || undefined };
  });

  registerHandler("app:selectDirectory", async (req) => {
    const win = getTargetWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: req.title ?? "Select Folder",
          defaultPath: req.defaultPath ?? app.getPath("downloads"),
          properties: ["openDirectory", "createDirectory"],
        })
      : await dialog.showOpenDialog({
          title: req.title ?? "Select Folder",
          defaultPath: req.defaultPath ?? app.getPath("downloads"),
          properties: ["openDirectory", "createDirectory"],
        });
    return { dirPath: result.canceled ? null : (result.filePaths[0] ?? null) };
  });
}

export function initializeAutoUpdater(): void {
  // Configure auto-updater to use GitHub releases
  try {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "ShanudhaTirosh",
      repo: "shanutechx-downloader",
    });

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    (autoUpdater as any).on("update-available", (info: any) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("update:available", {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === "string" 
          ? info.releaseNotes 
          : info.releaseNotes?.join("\n") ?? "",
      });
    });

    (autoUpdater as any).on("download-progress", (progress: any) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("update:download-progress", {
        percent: progress.percent,
      });
    });

    (autoUpdater as any).on("update-downloaded", () => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send("update:downloaded", undefined);
    });
  } catch (err) {
    console.error("AutoUpdater setup skipped:", err);
  }
}

/**
 * Automatically check for GitHub releases on app startup
 */
export async function checkStartupUpdates(win: BrowserWindow | null): Promise<void> {
  // Wait 4 seconds after app starts so user sees clean UI first
  setTimeout(async () => {
    try {
      const check = await checkGitHubRelease();
      if (check.updateAvailable && check.version) {
        console.log(`Update available on GitHub: v${check.version}`);
        win?.webContents.send("update:available", {
          version: check.version,
          releaseNotes: check.releaseNotes || "",
          downloadUrl: check.downloadUrl,
          publishedAt: check.publishedAt,
        });
      }
    } catch (err) {
      console.error("Startup update check error:", err);
    }
  }, 4000);
}
