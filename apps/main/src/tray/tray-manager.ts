import { app, BrowserWindow, Menu, NativeImage, nativeImage, Notification, shell, Tray } from "electron";
import path from "node:path";
import fs from "node:fs";
import { settingsStore } from "../settings/settings-store";
import type { QueueManager } from "../queue/queue-manager";

const isDev = process.env.NODE_ENV === "development";

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
  const idx = Math.min(units.length - 1, Math.max(0, i));
  return `${(bytesPerSec / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

export class TrayManager {
  private tray: Tray | null = null;
  private lastSpeed = 0;
  private lastActiveCount = 0;
  private iconImage: NativeImage | null = null;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private getQueueManager: () => QueueManager | null,
  ) {}

  init(): void {
    if (this.tray) return;

    const iconPath = isDev
      ? path.join(__dirname, "../../../../build/icon.ico")
      : path.join(process.resourcesPath, "icon.ico");

    try {
      if (fs.existsSync(iconPath)) {
        this.iconImage = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      } else {
        this.iconImage = nativeImage.createEmpty();
      }
    } catch {
      this.iconImage = nativeImage.createEmpty();
    }

    this.tray = new Tray(this.iconImage);
    this.tray.setToolTip("SHANUTECHX Downloader\nIdle — No active transfers");

    // Click on tray toggles the main window
    this.tray.on("click", () => this.toggleWindow());

    this.rebuildContextMenu(0, 0);
  }

  private toggleWindow(): void {
    const win = this.getWindow();
    if (!win) return;

    if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
      win.hide();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  }

  updateTray(activeCount: number, speedBps: number): void {
    if (!this.tray) return;
    this.lastActiveCount = activeCount;
    this.lastSpeed = speedBps;

    const tooltip = activeCount > 0
      ? `SHANUTECHX Downloader\n${activeCount} active download${activeCount === 1 ? "" : "s"} · ${formatSpeed(speedBps)}`
      : "SHANUTECHX Downloader\nIdle — No active transfers";

    this.tray.setToolTip(tooltip);
    this.rebuildContextMenu(activeCount, speedBps);
  }

  private rebuildContextMenu(activeCount: number, speedBps: number): void {
    if (!this.tray) return;
    const win = this.getWindow();
    const queue = this.getQueueManager();

    const statusLabel = activeCount > 0
      ? `⚡ ${activeCount} Active (${formatSpeed(speedBps)})`
      : "✔ Idle (No active downloads)";

    const contextMenu = Menu.buildFromTemplate([
      {
        label: statusLabel,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Open SHANUTECHX Downloader",
        click: () => {
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
        },
      },
      {
        label: "Add Download URL...",
        click: () => {
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            win.webContents.send("app:open-add-url");
          }
        },
      },
      { type: "separator" },
      {
        label: "Resume All Downloads",
        enabled: true,
        click: () => {
          queue?.resumeAll();
        },
      },
      {
        label: "Pause All Downloads",
        enabled: activeCount > 0,
        click: () => {
          queue?.pauseAll();
        },
      },
      { type: "separator" },
      {
        label: "Open Downloads Folder",
        click: () => {
          const downloadDir = settingsStore.get().downloadDir;
          if (downloadDir && fs.existsSync(downloadDir)) {
            shell.openPath(downloadDir);
          }
        },
      },
      {
        label: "Settings",
        click: () => {
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            win.webContents.send("app:navigate", "settings");
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit SHANUTECHX Downloader",
        click: () => {
          (app as unknown as { isQuitting?: boolean }).isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  notifyDownloadComplete(filename: string): void {
    const win = this.getWindow();
    // Only show OS desktop notification if window is hidden, minimized, or not focused
    if (win && win.isVisible() && win.isFocused()) return;

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: "Download Finished",
        body: filename,
        silent: false,
      });

      notification.on("click", () => {
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      });

      notification.show();
    }
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
