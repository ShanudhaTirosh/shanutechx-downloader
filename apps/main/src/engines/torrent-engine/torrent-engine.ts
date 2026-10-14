import type { BrowserWindow } from "electron";
import { loadWebTorrent } from "./webtorrent-loader";
import { settingsStore } from "../../settings/settings-store";
import { findOpenPort } from "../../utils/find-open-port";
import type { TorrentStatus } from "@shanutechx/shared-types";

interface WTTorrent {
  infoHash: string; name: string; progress: number;
  downloadSpeed: number; uploadSpeed: number; downloaded: number; length: number;
  numPeers: number; done: boolean; paused: boolean;
  timeRemaining: number;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  pause: () => void; resume: () => void; destroy: (cb?: () => void) => void;
}
interface WTClient {
  add: (torrentId: string, opts: { path: string }, cb?: (t: WTTorrent) => void) => WTTorrent;
  torrents: WTTorrent[];
  destroy: (cb?: () => void) => void;
}

/**
 * Wraps WebTorrent instead of a native libtorrent binding — this removes the
 * single biggest packaging-risk item from the old app's audit: whether a
 * native torrent binary's shared-library dependencies actually get bundled
 * correctly by the platform packager (§Phase 5 of the rebuild plan). WebTorrent
 * is pure JS/Node; there's no native binary to fail to bundle.
 *
 * NOTE ON TESTING: this engine's protocol-level behavior (DHT peer discovery,
 * tracker announces, real swarm downloads) requires reaching arbitrary public
 * trackers/peers over the internet — the sandboxed build environment used
 * while scaffolding this app is restricted to a fixed allow-list of package
 * registry domains and cannot reach them. What IS verified: the module loads
 * correctly under this app's CJS runtime (the exact ESM-interop question that
 * mattered), and a client instantiates and can hash/seed a local file. Real
 * swarm behavior should be manually verified with `pnpm dev` on a normal
 * network before this ships — see docs/testing-checklist.md.
 */
export class TorrentEngine {
  private client: WTClient | null = null;
  private torrents = new Map<string, WTTorrent>();
  private lastBroadcast = 0;

  constructor(private getWindow: () => BrowserWindow | null) {}

  private async getClient(): Promise<WTClient> {
    if (this.client) return this.client;
    const WebTorrent = await loadWebTorrent();
    const settings = settingsStore.get();
    // Real port-RANGE wiring — the old app's equivalent setting had a
    // malformed listen-address string AND silently ignored the "end" half
    // of the range entirely (audit §3.10). Here the full [start, end] range
    // is actually scanned for a free port, not just `start` alone.
    const port = await findOpenPort(settings.torrentPortStart, settings.torrentPortEnd);
    this.client = new (WebTorrent as unknown as new (opts: unknown) => WTClient)({
      dht: settings.torrentDhtEnabled,
      torrentPort: port,
      dhtPort: port,
    });
    this.pollStatus();
    return this.client;
  }

  async add(magnetOrPath: string, saveDir: string): Promise<{ infoHash: string }> {
    const client = await this.getClient();
    return new Promise((resolve, reject) => {
      try {
        const torrent = client.add(magnetOrPath, { path: saveDir }, (t) => {
          this.torrents.set(t.infoHash, t);
          resolve({ infoHash: t.infoHash });
        });
        
        torrent.on("error", (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });

        // Some WebTorrent versions resolve infoHash synchronously before the
        // metadata callback fires (magnet links need DHT lookup first) — track
        // it either way so pause/resume/remove work immediately.
        if (torrent.infoHash) {
          this.torrents.set(torrent.infoHash, torrent);
          resolve({ infoHash: torrent.infoHash });
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  pause(infoHash: string): void { this.torrents.get(infoHash)?.pause(); }
  resume(infoHash: string): void { this.torrents.get(infoHash)?.resume(); }
  remove(infoHash: string): void {
    this.torrents.get(infoHash)?.destroy();
    this.torrents.delete(infoHash);
  }

  list(): TorrentStatus[] {
    return Array.from(this.torrents.values()).map(toStatus);
  }

  async shutdown(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => this.client!.destroy(() => resolve()));
  }

  private pollStatus(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastBroadcast < 1000) return;
      this.lastBroadcast = now;
      const win = this.getWindow();
      if (!win) return;
      for (const t of this.torrents.values()) win.webContents.send("torrent:status", toStatus(t));
    }, 1000);
  }
}

function toStatus(t: WTTorrent): TorrentStatus {
  return {
    infoHash: t.infoHash,
    name: t.name || t.infoHash,
    progress: Math.round(t.progress * 100),
    downloadRateBps: t.downloadSpeed,
    uploadRateBps: t.uploadSpeed,
    totalDownloaded: t.downloaded,
    totalSize: t.length,
    numPeers: t.numPeers,
    // BUG FIX: a completed torrent was always reported as "finished", never
    // "seeding" — but WebTorrent keeps uploading to peers after completion
    // unless explicitly destroyed. Two real consequences of the old mapping:
    // (1) the UI's pause button only shows for "downloading" | "seeding",
    // so a finished torrent could never be paused again once done; (2) the
    // seeding "still active" indicator in TorrentCard never lit up, since
    // that state was never actually emitted.
    state: t.done ? (t.paused ? "paused" : "seeding") : t.paused ? "paused" : t.numPeers === 0 ? "downloading_metadata" : "downloading",
    etaSec: t.timeRemaining && Number.isFinite(t.timeRemaining) ? t.timeRemaining / 1000 : null,
  };
}
