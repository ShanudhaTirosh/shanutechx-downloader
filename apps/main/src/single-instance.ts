import { app } from "electron";

/**
 * Cross-platform single-instance lock. The old PyQt app only implemented this
 * on Windows (a named kernel mutex) — Electron's `requestSingleInstanceLock`
 * covers Windows/macOS/Linux with one API, closing that gap outright.
 */
export function enforceSingleInstance(onSecondInstance: (argv: string[]) => void): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on("second-instance", (_event, argv) => onSecondInstance(argv));
  return true;
}
