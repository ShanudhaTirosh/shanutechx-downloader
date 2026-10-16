import { BrowserWindow, shell, Tray, Menu, nativeImage, app } from "electron";
import path from "node:path";
import { settingsStore } from "./settings/settings-store";

const isDev = process.env.NODE_ENV === "development";
let tray: Tray | null = null;

export function createMainWindow(): BrowserWindow {
  const iconPath = isDev
    ? path.join(__dirname, "../../../../build/icon.ico")
    : path.join(process.resourcesPath, "icon.ico");
  
  const win = new BrowserWindow({
    title: "STX Downloader",
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0a0a0f", // matches surface.base — avoids a white flash on launch
    show: false,
    frame: false, // frameless window with fully custom controls in TitleBar.tsx
    titleBarStyle: "hidden",
    icon: iconPath, // Set window icon
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Broadcast maximize state changes to renderer for title bar button state
  win.on("maximize", () => {
    win.webContents.send("window:maximized-change", { maximized: true });
  });
  win.on("unmaximize", () => {
    win.webContents.send("window:maximized-change", { maximized: false });
  });

  // Real read-site for `minimizeToTray` — when enabled, closing the window
  // hides it to the system tray instead of quitting; the tray icon/menu
  // provides quick access, live status, and quitting.
  win.on("close", (event) => {
    if (settingsStore.get().minimizeToTray && !(app as unknown as { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      win.hide();
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
