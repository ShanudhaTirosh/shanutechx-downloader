import type { AppSettings } from "@shanutechx/shared-types";
/**
 * Applies OS-level side effects for settings that aren't just data — called
 * once at startup and again on every settings:set. Keeping this separate
 * from settingsStore.set() itself avoids import cycles (this needs `electron`,
 * which settings-store.ts deliberately stays free of so it can be unit-tested
 * without an Electron runtime).
 */
export function applyOsLevelSettings(s: AppSettings): void {
  try {
    const { app } = require("electron") as typeof import("electron");
    app.setLoginItemSettings({ openAtLogin: s.autoStart });
  } catch {
    /* not running under Electron (e.g. a unit test) — nothing to apply */
  }
}
