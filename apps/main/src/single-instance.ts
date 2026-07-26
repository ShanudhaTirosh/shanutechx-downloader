import { app } from "electron";

/**
 * Cross-platform single-instance lock. The old PyQt app only implemented this
 * on Windows (a named kernel mutex) — Electron's `requestSingleInstanceLock`
 * covers Windows/macOS/Linux with one API, closing that gap outright.
 */
export function enforceSingleInstance(onSecondInstance: () => void): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on("second-instance", onSecondInstance);
  return true;
}
