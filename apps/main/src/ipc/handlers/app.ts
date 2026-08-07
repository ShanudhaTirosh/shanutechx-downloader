import { app, BrowserWindow, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { registerHandler } from "./index";
import { getMissingBinaries, downloadMissingBinaries } from "../../utils/binary-manager";

// Read app version from our own package.json rather than calling app.getVersion().
// In dev mode, app.getVersion() returns the Electron runtime version (e.g. 33.4.11)
// because Electron is the process being run, not the packaged app.
const APP_VERSION = (() => {
  try {
    // In compiled output: __dirname = apps/main/dist → package.json is one level up
    // In tsx dev mode: __dirname = apps/main/src → package.json is also one level up
    const pkgPath = path.join(__dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.2.0";
  } catch {
    return "0.2.0";
  }
})();

export function registerAppHandlers(): void {
  registerHandler("app:getVersion", () => ({ version: APP_VERSION }));
  
  registerHandler("app:minimize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });
  
  registerHandler("app:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.maximize();
  });
  
  registerHandler("app:unmaximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.unmaximize();
  });
  
  registerHandler("app:close", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
  
  registerHandler("app:isMaximized", () => {
    const win = BrowserWindow.getFocusedWindow();
    return { maximized: win?.isMaximized() ?? false };
  });
  
  registerHandler("app:selectFile", async (req) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { filePath: null };
    
    const result = await dialog.showOpenDialog(win, {
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
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo.version !== app.getVersion()) {
        return {
          updateAvailable: true,
          version: result.updateInfo.version,
          releaseNotes: typeof result.updateInfo.releaseNotes === "string" 
            ? result.updateInfo.releaseNotes 
            : result.updateInfo.releaseNotes?.join("\n") ?? "",
        };
      }
      return { updateAvailable: false };
    } catch (error) {
      console.error("Update check failed:", error);
      return { updateAvailable: false };
    }
  });

  registerHandler("app:downloadUpdate", async () => {
    await autoUpdater.downloadUpdate();
  });

  registerHandler("app:showInFolder", (req) => {
    // Guard existence ourselves rather than letting shell.showItemInFolder
    // fail silently/inconsistently across platforms for a path whose file
    // was since moved or deleted (e.g. cleared from history but the row
    // hadn't refreshed client-side yet).
    if (!req.filepath || !fs.existsSync(req.filepath)) return { success: false };
    shell.showItemInFolder(req.filepath);
    return { success: true };
  });

  registerHandler("app:selectDirectory", async (req) => {
    const win = BrowserWindow.getFocusedWindow();
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
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "ShanudhaTirosh",
    repo: "shanutechx-downloader",
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send("update:available", {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" 
        ? info.releaseNotes 
        : info.releaseNotes?.join("\n") ?? "",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send("update:download-progress", {
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send("update:downloaded", undefined);
  });
}


