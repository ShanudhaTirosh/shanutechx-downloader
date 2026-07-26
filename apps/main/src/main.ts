import { app, BrowserWindow, Menu } from "electron";
import log from "electron-log";

// MUST run before any app.getPath() call. Electron's default app.getName()
// reads package.json's "name" field verbatim — for this monorepo that's the
// scoped npm name "@shanutechx/main", whose literal "/" was silently
// creating a nested, wrong userData directory (~/.config/@shanutechx/main/
// instead of a clean ~/.config/shanutechx-downloader/). Caught by actually
// booting a real packaged build and inspecting where the DB landed.
app.setName("SHANUTECHX Downloader");

import { createMainWindow } from "./window";
import { enforceSingleInstance } from "./single-instance";
import { registerAllHandlers } from "./ipc/handlers";
import { initializeAutoUpdater } from "./ipc/handlers/app";
import { runShutdownSequence, type ShutdownStep } from "./shutdown";
import { getDb, closeDb } from "./db/client";
import { settingsStore, onSettingsChange } from "./settings/settings-store";
import { applyOsLevelSettings } from "./settings/apply-os-level-settings";
import { QueueManager } from "./queue/queue-manager";
import { SocialManager } from "./engines/social-extractor/social-manager";
import { TorrentEngine } from "./engines/torrent-engine/torrent-engine";
import { ConverterManager } from "./engines/converter-engine/converter-manager";
import { initializeBinaries } from "./utils/binary-manager";

log.initialize();
log.info("SHANUTECHX Downloader starting…");

let mainWindow: BrowserWindow | null = null;
let queueManager: QueueManager | null = null;
let torrentEngine: TorrentEngine | null = null;

const isPrimaryInstance = enforceSingleInstance(() => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

if (isPrimaryInstance) {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null); // custom title bar owns the app chrome

    getDb(); // opens the single long-lived connection, runs schema setup

    // Resolve the real OS Downloads folder on first run only — never
    // overwrite a user's chosen directory on subsequent launches.
    const current = settingsStore.get();
    if (!current.downloadDir) {
      settingsStore.set({ downloadDir: app.getPath("downloads") });
    }
    applyOsLevelSettings(settingsStore.get());
    onSettingsChange(applyOsLevelSettings);

    // Initialize engines and register handlers BEFORE creating the window
    // to avoid race conditions where the renderer tries to invoke handlers
    // before they're registered
    queueManager = new QueueManager(() => mainWindow);
    const socialManager = new SocialManager(() => mainWindow);
    torrentEngine = new TorrentEngine(() => mainWindow);
    const converterManager = new ConverterManager(() => mainWindow);
    registerAllHandlers(queueManager, socialManager, torrentEngine, converterManager);

    mainWindow = createMainWindow();
    
    // Initialize binaries (yt-dlp, ffmpeg, ffprobe) after window is created
    // so we can send progress updates
    try {
      log.info("Checking for required binaries...");
      const downloaded = await initializeBinaries((progress) => {
        mainWindow?.webContents.send("binary:download-progress", progress);
      });
      if (downloaded) {
        log.info("Binaries downloaded successfully");
      } else {
        log.info("All binaries already present");
      }
    } catch (error) {
      log.error("Failed to initialize binaries:", error);
      // Continue anyway - app will show error when user tries to use features
    }

    // Initialize auto-updater for GitHub releases
    initializeAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  let shuttingDown = false;
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();

    const steps: ShutdownStep[] = [
      {
        phase: "pausing-active-transfers", timeoutMs: 3000,
        run: async () => { await queueManager?.pauseAllForShutdown(); },
      },
      {
        phase: "persisting-state", timeoutMs: 3000,
        run: async () => { await torrentEngine?.shutdown(); },
      },
      {
        phase: "db-flush", timeoutMs: 2000,
        run: async () => { closeDb(); },
      },
    ];

    runShutdownSequence(steps).finally(() => app.exit(0));
  });
}

