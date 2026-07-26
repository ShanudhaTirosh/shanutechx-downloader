/**
 * @shanutechx/shared-types
 *
 * Single source of truth for every value that crosses the main <-> renderer
 * IPC boundary. Both apps/main and apps/renderer import from here — if a
 * channel's payload shape changes, both sides fail to typecheck until fixed.
 * This is the direct fix for the old app's "settings exist in the DB but
 * nothing reads them" class of bug: the contract is compiled, not implied.
 */

// ── Domain enums ────────────────────────────────────────────────────────────

export type DownloadStatus =
  | "queued"
  | "resolving"
  | "downloading"
  | "paused"
  | "merging"
  | "complete"
  | "failed"
  | "cancelled";

export type SourceType = "http" | "social" | "torrent";

export type ProxyType = "none" | "http" | "socks5";

// ── Core records ─────────────────────────────────────────────────────────────

export interface DownloadRecord {
  id: string;
  url: string;
  filename: string;
  filepath: string | null;
  sizeBytes: number | null; // null = unknown total (never fabricate a "1 byte" total)
  downloadedBytes: number;
  speedBps: number; // instantaneous, computed once in QueueManager
  avgSpeedBps: number | null; // computed once, on completion, from real elapsed time
  sourceType: SourceType;
  platform: string | null;
  status: DownloadStatus;
  format: string | null;
  quality: string | null;
  errorMessage: string | null;
  segments: number;
  createdAt: string;
  completedAt: string | null;
}

export interface MediaFormatOption {
  id: string;
  label: string;
  ytdlpFormat: string;
  postprocessor?: string;
  quality?: string;
}

export interface MediaInfo {
  title: string;
  uploader: string;
  durationSec: number;
  thumbnail: string;
  webpageUrl: string;
  extractor: string;
  ext: string;
  filesizeBytes: number | null;
  isPlaylist: boolean;
  availableQualities: { height: number; formatId: string; ext: string; filesizeBytes: number | null }[];
}

export interface TorrentStatus {
  infoHash: string;
  name: string;
  progress: number; // 0-100
  downloadRateBps: number;
  uploadRateBps: number;
  totalDownloaded: number;
  totalSize: number;
  numPeers: number;
  state: "queued" | "downloading_metadata" | "downloading" | "seeding" | "finished" | "paused" | "error";
  etaSec: number | null;
}

// ── Settings (every key here MUST have a real, tested read-site — see docs/quality-gates.md) ─

export interface AppSettings {
  downloadDir: string;
  maxSimultaneousDownloads: number;
  askLocationEachTime: boolean;
  autoStart: boolean;

  /** Real global token-bucket limiter — applies across ALL active transfers, KB/s, 0 = unlimited */
  maxTotalSpeedKBps: number;
  /** Real per-file limiter, KB/s, 0 = unlimited. Divided across active segments internally. */
  maxSpeedPerFileKBps: number;

  proxyType: ProxyType;
  proxyHost: string;
  proxyPort: number;
  /** Never read/written to the settings table directly — resolved via the SecretsVault (keytar) at use time */
  proxyHasCredentials: boolean;

  segmentCount: number;
  retryAttempts: number;

  defaultVideoQuality: string;
  defaultAudioFormat: string;
  autoEmbedThumbnail: boolean;
  subtitleLanguages: string;
  ignoreCertificateErrors: boolean; // explicit opt-in, OFF by default (fixes old nocheckcertificate=True bug)

  torrentSavePath: string;
  torrentPortStart: number;
  torrentPortEnd: number;
  torrentDhtEnabled: boolean;

  minimizeToTray: boolean;
  theme: "dark"; // light mode reserved for a future release

  // CloudConvert API settings
  cloudConvertApiKey: string;
  cloudConvertSandbox: boolean;
  useCloudConvert: boolean; // Toggle between FFmpeg and CloudConvert
}

// ── IPC contract ──────────────────────────────────────────────────────────────

export interface DownloadStartPayload {
  url: string;
  saveDir?: string;
  segmentCount?: number;
}

export interface IpcInvokeMap {
  "downloads:start": { req: DownloadStartPayload; res: { id: string } };
  "downloads:pause": { req: { id: string }; res: void };
  "downloads:resume": { req: { id: string }; res: void };
  "downloads:cancel": { req: { id: string }; res: void };
  "downloads:list": { req: void; res: DownloadRecord[] };

  "settings:get": { req: void; res: AppSettings };
  /** Returns the settings as ACTUALLY applied — never a blind echo of the request */
  "settings:set": { req: Partial<AppSettings>; res: AppSettings };
  /** Write-only — credentials never round-trip back to the renderer. Resolves
   *  to false if OS-level secret storage isn't available on this machine. */
  "settings:setProxyCredentials": { req: { username: string; password: string }; res: { stored: boolean } };
  "settings:clearProxyCredentials": { req: void; res: void };

  "social:extract": { req: { url: string }; res: MediaInfo };
  "social:download": { req: { url: string; format: MediaFormatOption }; res: { id: string } };

  "torrents:add": { req: { magnetOrPath: string; saveDir: string }; res: { infoHash: string } };
  "torrents:list": { req: void; res: TorrentStatus[] };
  "torrents:pause": { req: { infoHash: string }; res: { success: boolean } };
  "torrents:resume": { req: { infoHash: string }; res: { success: boolean } };
  "torrents:remove": { req: { infoHash: string }; res: { success: boolean } };

  "converter:convert": { req: { inputPath: string; kind: "extract-audio" | "mux" }; res: { taskId: string } };
  "converter:cloudconvert": { 
    req: { 
      inputPath: string; 
      inputFormat: string; 
      outputFormat: string; 
      outputDir?: string;
      conversionOptions?: Record<string, unknown>;
    }; 
    res: { taskId: string } 
  };
  "converter:getSupportedFormats": { req: { inputFormat: string }; res: { formats: string[] } };
  "converter:getPresets": { req: void; res: { presets: Record<string, { outputFormat: string; options: Record<string, unknown> }> } };

  "history:list": { req: void; res: DownloadRecord[] };
  "history:stats": { req: void; res: { totalCompleted: number; totalFailed: number; totalBytesDownloaded: number } };
  "history:remove": { req: { id: string }; res: void };

  "app:getVersion": { req: void; res: { version: string } };
  "app:minimize": { req: void; res: void };
  "app:maximize": { req: void; res: void };
  "app:unmaximize": { req: void; res: void };
  "app:close": { req: void; res: void };
  "app:isMaximized": { req: void; res: { maximized: boolean } };
  "app:selectFile": { req: { title?: string; filters?: { name: string; extensions: string[] }[] }; res: { filePath: string | null } };
  "app:checkBinaries": { req: void; res: { ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } };
  "app:downloadBinaries": { req: void; res: { success: boolean } };
  "app:checkForUpdates": { req: void; res: { updateAvailable: boolean; version?: string; releaseNotes?: string } };
  "app:downloadUpdate": { req: void; res: void };
}

export type IpcInvokeChannel = keyof IpcInvokeMap;

export interface IpcEventMap {
  "download:progress": {
    id: string;
    downloadedBytes: number;
    totalBytes: number | null;
    speedBps: number;
    etaSec: number | null;
  };
  "download:status": { id: string; status: DownloadStatus; errorMessage?: string };
  "queue:global-speed": { downBps: number; upBps: number; activeCount: number };
  "torrent:status": TorrentStatus;
  "window:maximized-change": { maximized: boolean };
  "binary:download-progress": { binary: string; percent: number; downloadedBytes: number; totalBytes: number | null };
  "update:available": { version: string; releaseNotes: string };
  "update:download-progress": { percent: number };
  "update:downloaded": void;
}

export type IpcEventChannel = keyof IpcEventMap;
