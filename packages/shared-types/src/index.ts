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
  /** ISO datetime string — null means "start immediately". When set, the download stays queued until this time. */
  scheduledFor: string | null;
  /** Estimated seconds remaining, computed in real-time or null when unknown */
  etaSec?: number | null;
}

export interface MediaFormatOption {
  id: string;
  label: string;
  ytdlpFormat: string;
  postprocessor?: string;
  quality?: string;
}

export interface MediaAudioQuality {
  formatId: string;
  ext: string;
  abr?: number; // e.g. 320, 256, 192, 128
  acodec?: string;
  filesizeBytes?: number | null;
}

export interface MediaPhoto {
  id: string;
  url: string;
  thumbnail?: string;
  title?: string;
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
  availableAudioQualities?: MediaAudioQuality[];
  photos?: MediaPhoto[];
  isPhotoPost?: boolean;
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

  /**
   * Time-of-day override for the global speed limit — e.g. "cap me during
   * the day, but let it run faster overnight". When enabled, the effective
   * global limit becomes `bandwidthScheduleOffPeakKBps` (not
   * `maxTotalSpeedKBps`) during the [start, end) window each day; outside
   * the window, `maxTotalSpeedKBps` applies as normal. The window wraps
   * past midnight when end <= start (e.g. 22 → 6 means 10pm–6am).
   * Read by queue-manager.ts's schedule tick.
   */
  bandwidthScheduleEnabled: boolean;
  bandwidthScheduleStartHour: number; // 0-23, local time
  bandwidthScheduleEndHour: number; // 0-23, local time
  bandwidthScheduleOffPeakKBps: number; // 0 = unlimited

  /**
   * Only run downloads during a window each day (e.g. "only download
   * 1am-6am" to stay off a metered/shared connection during the day).
   * Outside the window, active transfers are auto-paused and queued ones
   * stay queued; both auto-resume when the window reopens. Read by
   * queue-manager.ts's schedule tick — same window-wrapping rule as the
   * bandwidth schedule above.
   */
  downloadScheduleEnabled: boolean;
  downloadScheduleStartHour: number; // 0-23, local time
  downloadScheduleEndHour: number; // 0-23, local time

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

  /**
   * Pass cookies from the specified browser to yt-dlp for sites that require
   * login (e.g. YouTube age-restricted videos, private playlists).
   * Empty string = disabled. Supported values: 'chrome', 'firefox', 'edge',
   * 'brave', 'safari', 'chromium', 'opera'.
   * Passed as --cookies-from-browser <value> to yt-dlp.
   */
  cookiesFromBrowser: string;

  torrentSavePath: string;
  torrentPortStart: number;
  torrentPortEnd: number;
  torrentDhtEnabled: boolean;

  minimizeToTray: boolean;
  theme: "dark" | "light";

  /** Read by download-complete-actions.ts, called from both queue-manager.ts (HTTP) and social-manager.ts (yt-dlp) on a "complete" status. */
  autoOpenFolderOnComplete: boolean;
}

// ── IPC contract ──────────────────────────────────────────────────────────────

export interface DownloadStartPayload {
  url: string;
  saveDir?: string;
  segmentCount?: number;
  /** Skip the duplicate-URL check (used for confirmed re-adds and batch/multi-URL paste). */
  allowDuplicate?: boolean;
}

export interface IpcInvokeMap {
  /**
   * Resolves normally with a new id. If the URL matches an existing
   * non-terminal-failed download and `allowDuplicate` wasn't set, rejects
   * with an Error whose message is exactly `DUPLICATE_URL:<existingId>` —
   * callers pattern-match that prefix to offer "add anyway?" rather than
   * showing it as a generic failure.
   */
  "downloads:start": { req: DownloadStartPayload; res: { id: string } };
  "downloads:pause": { req: { id: string }; res: void };
  "downloads:resume": { req: { id: string }; res: void };
  "downloads:cancel": { req: { id: string }; res: void };
  "downloads:list": { req: void; res: DownloadRecord[] };
  /** Set or clear a scheduled start time on an existing download. Pass scheduledFor: null to start immediately. */
  "downloads:schedule": { req: { id: string; scheduledFor: string | null }; res: void };
  /** Add a new download that is pre-scheduled. Returns the download id. */
  "downloads:scheduleNew": { req: { url: string; scheduledFor: string; allowDuplicate?: boolean }; res: { id: string } };
  /** Add a new social download that is pre-scheduled. */
  "social:scheduleNew": { req: { url: string; format: import("./index").MediaFormatOption; scheduledFor: string; saveDir?: string }; res: { id: string } };

  "settings:get": { req: void; res: AppSettings };
  /** Returns the settings as ACTUALLY applied — never a blind echo of the request */
  "settings:set": { req: Partial<AppSettings>; res: AppSettings };
  /** Write-only — credentials never round-trip back to the renderer. Resolves
   *  to false if OS-level secret storage isn't available on this machine. */
  "settings:setProxyCredentials": { req: { username: string; password: string }; res: { stored: boolean } };
  "settings:clearProxyCredentials": { req: void; res: void };

  "social:extract": { req: { url: string }; res: MediaInfo };
  "social:download": { req: { url: string; format: MediaFormatOption; saveDir?: string; allowDuplicate?: boolean }; res: { id: string } };
  "social:pause": { req: { id: string }; res: void };
  "social:resume": { req: { id: string }; res: void };
  "social:cancel": { req: { id: string }; res: void };

  "torrents:add": { req: { magnetOrPath: string; saveDir: string }; res: { infoHash: string } };
  "torrents:list": { req: void; res: TorrentStatus[] };
  "torrents:pause": { req: { infoHash: string }; res: { success: boolean } };
  "torrents:resume": { req: { infoHash: string }; res: { success: boolean } };
  "torrents:remove": { req: { infoHash: string }; res: { success: boolean } };

  "converter:convert": { req: { inputPath: string; kind: "extract-audio" | "mux" }; res: { taskId: string } };
  "converter:universalConvert": { 
    req: { 
      inputPath: string; 
      outputFormat: string;
      quality?: "low" | "medium" | "high" | "ultra" | "lossless";
      videoCodec?: string;
      videoBitrate?: string;
      resolution?: string;
      fps?: number;
      preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
      audioCodec?: string;
      audioBitrate?: string;
      audioChannels?: number;
      audioSampleRate?: number;
      hwAccel?: "auto" | "nvenc" | "qsv" | "amf" | "none";
      outputDir?: string;
      customArgs?: string[];
    }; 
    res: { taskId: string } 
  };
  "converter:getSupportedFormats": { req: void; res: { video: string[]; audio: string[]; image: string[]; all: string[] } };
  "converter:getPresets": { req: void; res: { presets: Record<string, unknown> } };
  "converter:probe": { req: { filePath: string }; res: MediaFileInfo };
  "converter:cancel": { req: { taskId: string }; res: void };

  "history:list": { req: void; res: DownloadRecord[] };
  "history:stats": { req: void; res: { totalCompleted: number; totalFailed: number; totalBytesDownloaded: number } };
  "history:remove": { req: { id: string }; res: void };
  "history:clear": { req: void; res: void };
  "history:export": { req: void; res: { json: string; count: number } };
  "history:import": { req: { json: string }; res: { imported: number; success: boolean } };

  "social:downloadPhotos": { req: { photos: { id: string; url: string; title?: string }[]; saveDir?: string }; res: { success: boolean; savedPaths: string[] } };
  "social:renderPhotosToVideo": { req: { photos: { id: string; url: string }[]; audioUrl?: string; durationPerPhotoSec?: number; saveDir?: string; title?: string }; res: { taskId: string } };
  "social:batchExtract": { req: { urls: string[] }; res: { results: { url: string; info?: MediaInfo; error?: string }[] } };

  "app:getVersion": { req: void; res: { version: string } };
  "app:getPlatform": { req: void; res: { platform: string } };
  "app:minimize": { req: void; res: void };
  "app:maximize": { req: void; res: void };
  "app:unmaximize": { req: void; res: void };
  "app:close": { req: void; res: void };
  "app:isMaximized": { req: void; res: { maximized: boolean } };
  "app:selectFile": { req: { title?: string; filters?: { name: string; extensions: string[] }[] }; res: { filePath: string | null } };
  "app:checkBinaries": { req: void; res: { ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } };
  "app:downloadBinaries": { req: void; res: { success: boolean } };
  "app:checkForUpdates": { req: void; res: { updateAvailable: boolean; version?: string; releaseNotes?: string; downloadUrl?: string; publishedAt?: string } };
  "app:downloadUpdate": { req: void; res: { success: boolean; message?: string } };
  /** Reveals the file in the OS file manager (Explorer/Finder/etc), selected. Silently no-ops if the path no longer exists. */
  "app:showInFolder": { req: { filepath: string }; res: { success: boolean } };
  "app:selectDirectory": { req: { title?: string; defaultPath?: string }; res: { dirPath: string | null } };
}

export interface MediaFileInfo {
  path: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  formattedSize: string;
  category: "video" | "audio" | "image" | "unknown";
  format?: string;
  durationSec?: number;
  formattedDuration?: string;
  width?: number;
  height?: number;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioBitrate?: string;
  videoBitrate?: string;
  fps?: number;
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
  "converter:progress": {
    taskId: string;
    percent: number;
    speed?: string;
    timemark?: string;
    fps?: number;
  };
  "converter:status": {
    taskId: string;
    status: "converting" | "complete" | "failed" | "cancelled";
    outputPath?: string;
    errorMessage?: string;
  };
  "queue:global-speed": { downBps: number; upBps: number; activeCount: number };
  "torrent:status": TorrentStatus;
  "window:maximized-change": { maximized: boolean };
  "binary:download-progress": { binary: string; percent: number; downloadedBytes: number; totalBytes: number | null };
  "update:available": { version: string; releaseNotes: string; downloadUrl?: string; publishedAt?: string };
  "update:download-progress": { percent: number };
  "update:downloaded": void;
}

export type IpcEventChannel = keyof IpcEventMap;
