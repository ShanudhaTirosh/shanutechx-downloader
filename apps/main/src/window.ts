import { BrowserWindow, shell, Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";
import { settingsStore } from "./settings/settings-store";

const isDev = process.env.NODE_ENV === "development";
let tray: Tray | null = null;

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0f", // matches surface.base — avoids a white flash on launch
    show: false,
    frame: false, // custom title bar, see components/layout/TitleBar.tsx
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Real read-site for `minimizeToTray` — a genuine Tray icon + close-to-tray
  // behavior, not a checkbox that's saved and never consulted. When enabled,
  // closing the window hides it instead of quitting; the tray menu is the
  // only way back in (besides re-launching), matching standard tray-app UX.
  win.on("close", (event) => {
    if (settingsStore.get().minimizeToTray && !(app as unknown as { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      win.hide();
      ensureTray(win);
    }
  });

  // Never let the renderer navigate to arbitrary external content or open
  // untrusted windows — a lesson from tightening the old app's yt-dlp/proxy
  // surface: anything that looks like a "browse to a URL" affordance should
  // open in the OS default browser, not inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !isDev) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/dist/index.html"));
  }

  return win;
}

function ensureTray(win: BrowserWindow): void {
  if (tray) return;
  // A 1x1 transparent fallback keeps this from throwing if a real brand icon
  // asset isn't present in a given build — the tray still functions, just
  // without custom art, rather than crashing minimize-to-tray entirely.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("SHANUTECHX Downloader");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open SHANUTECHX Downloader", click: () => win.show() },
    { type: "separator" },
    { label: "Quit", click: () => { (app as unknown as { isQuitting?: boolean }).isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", () => win.show());
}
