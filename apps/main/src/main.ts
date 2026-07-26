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
import { runShutdownSequence, type ShutdownStep } from "./shutdown";
import { getDb, closeDb } from "./db/client";
import { settingsStore, onSettingsChange } from "./settings/settings-store";
import { applyOsLevelSettings } from "./settings/apply-os-level-settings";
import { QueueManager } from "./queue/queue-manager";
import { SocialManager } from "./engines/social-extractor/social-manager";
import { TorrentEngine } from "./engines/torrent-engine/torrent-engine";
import { ConverterManager } from "./engines/converter-engine/converter-manager";

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
  app.whenReady().then(() => {
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

    mainWindow = createMainWindow();
    queueManager = new QueueManager(() => mainWindow);
    const socialManager = new SocialManager(() => mainWindow);
    torrentEngine = new TorrentEngine(() => mainWindow);
    const converterManager = new ConverterManager(() => mainWindow);
    registerAllHandlers(queueManager, socialManager, torrentEngine, converterManager);

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
