import { shell } from "electron";
import fs from "node:fs";
import { settingsStore } from "../settings/settings-store";

/**
 * Called from every engine's "complete" transition (queue-manager.ts for
 * HTTP downloads, social-manager.ts for yt-dlp downloads) so the behavior —
 * and the settings-read — lives in exactly one place instead of being
 * copy-pasted per engine and risking drift.
 */
export function runPostDownloadActions(filepath: string): void {
  const settings = settingsStore.get();
  if (settings.autoOpenFolderOnComplete && filepath && fs.existsSync(filepath)) {
    shell.showItemInFolder(filepath);
  }
}
