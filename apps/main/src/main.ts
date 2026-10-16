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
import { initializeAutoUpdater, checkStartupUpdates } from "./ipc/handlers/app";
import { runShutdownSequence, type ShutdownStep } from "./shutdown";
import { getDb, closeDb } from "./db/client";
import { settingsStore, onSettingsChange } from "./settings/settings-store";
import { applyOsLevelSettings } from "./settings/apply-os-level-settings";
import { QueueManager } from "./queue/queue-manager";
import { SocialManager } from "./engines/social-extractor/social-manager";
import { TorrentEngine } from "./engines/torrent-engine/torrent-engine";
import { ConverterManager } from "./engines/converter-engine/converter-manager";
import { initializeBinaries } from "./utils/binary-manager";
import { TrayManager } from "./tray/tray-manager";
import { registerCompleteNotifier } from "./utils/download-complete-actions";

log.initialize();
log.info("SHANUTECHX Downloader starting…");

let mainWindow: BrowserWindow | null = null;
let queueManager: QueueManager | null = null;
let torrentEngine: TorrentEngine | null = null;
let trayManager: TrayManager | null = null;

function handleProtocolUrl(urlStr: string) {
  try {
    if (!urlStr || !urlStr.startsWith("shanutechx://")) return;
    log.info("Received protocol url:", urlStr);
    const parsed = new URL(urlStr);
    const downloadUrl = parsed.searchParams.get("url");
    if (downloadUrl && queueManager) {
      log.info("Queueing download from browser extension / protocol:", downloadUrl);
      try {
        queueManager.start(downloadUrl, undefined, true);
      } catch (e) {
        log.warn("Could not start protocol download:", e);
      }
    }
  } catch (err) {
    log.error("Failed to parse protocol url:", err);
  }
}

const isPrimaryInstance = enforceSingleInstance((argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const protocolUrl = argv.find((arg) => arg.startsWith("shanutechx://"));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }
});

if (isPrimaryInstance) {
  app.setAsDefaultProtocolClient("shanutechx");

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

    // Initialize System Tray Manager
    trayManager = new TrayManager(() => mainWindow, () => queueManager);
    trayManager.init();

    registerCompleteNotifier((filename) => {
      trayManager?.notifyDownloadComplete(filename);
    });

    queueManager.setSpeedListener((activeCount, speedBps) => {
      trayManager?.updateTray(activeCount, speedBps);
    });

    onSettingsChange((applied) => {
      if (applied.minimizeToTray) {
        trayManager?.init();
      }
    });

    // Check if launched directly with protocol URL
    const initialProtocol = process.argv.find((arg) => arg.startsWith("shanutechx://"));
    if (initialProtocol) {
      handleProtocolUrl(initialProtocol);
    }

    app.on("open-url", (event, url) => {
      event.preventDefault();
      handleProtocolUrl(url);
    });
    
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
    void checkStartupUpdates(mainWindow);

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

