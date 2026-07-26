import { getDb } from "../db/client";
import { settings as settingsTable } from "../db/schema";
import type { AppSettings } from "@shanutechx/shared-types";

/**
 * DEFAULTS — every key here is loaded somewhere real (grep this repo for the
 * key name to confirm). CI's settings-coverage test (docs/quality-gates.md)
 * fails the build if a key is added here with no matching read-site, which
 * is the direct fix for the old app's "Max Total Speed does nothing" bug.
 */
const DEFAULTS: AppSettings = {
  downloadDir: "", // resolved to the OS Downloads folder at first run, see resolveDefaultDownloadDir()
  maxSimultaneousDownloads: 4,
  askLocationEachTime: false,
  autoStart: true,

  maxTotalSpeedKBps: 0, // read by queue-manager.ts globalBucket
  maxSpeedPerFileKBps: 0, // read by queue-manager.ts per-job bucket

  proxyType: "none",
  proxyHost: "",
  proxyPort: 0,
  proxyHasCredentials: false,

  segmentCount: 8,
  retryAttempts: 3,

  defaultVideoQuality: "1080p",
  defaultAudioFormat: "mp3",
  autoEmbedThumbnail: true,
  subtitleLanguages: "",
  ignoreCertificateErrors: false, // OFF by default — fixes the old nocheckcertificate=True bug

  torrentSavePath: "",
  torrentPortStart: 6881,
  torrentPortEnd: 6889,
  torrentDhtEnabled: true,

  minimizeToTray: true,
  theme: "dark",
};

type SettingsChangeListener = (settings: AppSettings) => void;
const listeners: SettingsChangeListener[] = [];

export function onSettingsChange(listener: SettingsChangeListener): () => void {
  listeners.push(listener);
  return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); };
}

export const settingsStore = {
  get(): AppSettings {
    const rows = getDb().select().from(settingsTable).all();
    const stored: Partial<AppSettings> = {};
    for (const row of rows) {
      try { (stored as Record<string, unknown>)[row.key] = JSON.parse(row.value); } catch { /* ignore corrupt row */ }
    }
    return { ...DEFAULTS, ...stored };
  },

  /**
   * Persists ONLY the keys that were actually passed, then returns the full,
   * merged, ACTUALLY-applied settings object — never a blind echo of the
   * request. Callers (IPC handler, engines) must react to the return value,
   * not the input, so a rejected/clamped value can never desync from what
   * the UI displays.
   */
  set(partial: Partial<AppSettings>): AppSettings {
    const db = getDb();
    const clamped = clampSettings(partial);
    const entries = Object.entries(clamped);
    db.transaction((tx) => {
      for (const [key, value] of entries) {
        tx.insert(settingsTable).values({ key, value: JSON.stringify(value) })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(value) } }).run();
      }
    });
    const applied = settingsStore.get();
    listeners.forEach((l) => l(applied));
    return applied;
  },
};

function clampSettings(partial: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...partial };
  if (out.maxSimultaneousDownloads !== undefined) out.maxSimultaneousDownloads = Math.max(1, Math.min(20, out.maxSimultaneousDownloads));
  if (out.segmentCount !== undefined) out.segmentCount = Math.max(1, Math.min(32, out.segmentCount));
  if (out.maxTotalSpeedKBps !== undefined) out.maxTotalSpeedKBps = Math.max(0, out.maxTotalSpeedKBps);
  if (out.maxSpeedPerFileKBps !== undefined) out.maxSpeedPerFileKBps = Math.max(0, out.maxSpeedPerFileKBps);
  if (out.retryAttempts !== undefined) out.retryAttempts = Math.max(0, Math.min(10, out.retryAttempts));
  return out;
}
