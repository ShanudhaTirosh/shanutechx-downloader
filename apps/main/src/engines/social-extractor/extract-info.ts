import { runProcess } from "../../utils/spawn-process";
import type { MediaInfo } from "@shanutechx/shared-types";

interface YtDlpFormat {
  format_id: string;
  ext: string;
  height?: number;
  width?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  tbr?: number;
  fps?: number;
  url?: string;
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  thumbnails?: { url: string; width?: number; height?: number }[];
  formats?: YtDlpFormat[];
  ext?: string;
}

interface YtDlpFlatInfo {
  id?: string;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url: string; width?: number; height?: number }[];
  webpage_url?: string;
  extractor?: string;
  ext?: string;
  filesize?: number;
  filesize_approx?: number;
  _type?: string;
  entries?: YtDlpEntry[];
  formats?: YtDlpFormat[];
}

/**
 * Always invokes yt-dlp with an ARGUMENT ARRAY via execa — never a shell
 * string. This is the direct fix for the old app's implicit shell-invocation
 * risk class; there is no string concatenation of user-supplied URLs into a
 * command line anywhere in this file.
 */
export async function extractMediaInfo(
  url: string,
  ytDlpPath: string,
  ignoreCertificateErrors: boolean,
  cookiesFromBrowser?: string,
): Promise<MediaInfo> {
  const args = ["--dump-json", "--no-warnings", "--socket-timeout", "25"];
  if (ignoreCertificateErrors) args.push("--no-check-certificate");
  if (cookiesFromBrowser && cookiesFromBrowser.trim()) {
    args.push("--cookies-from-browser", cookiesFromBrowser.trim());
  }
  args.push(url);

  const { promise } = runProcess(ytDlpPath, args, { timeoutMs: 35_000 });
  const { stdout } = await promise;
  
  // yt-dlp might output multiple JSON lines for playlists or single JSON for single items
  const firstJsonLine = stdout.trim().split("\n")[0] ?? "{}";
  const info: YtDlpFlatInfo = JSON.parse(firstJsonLine);

  // 1. Video formats
  const videoFormats = (info.formats ?? [])
    .filter((f) => f.vcodec && f.vcodec !== "none" && f.height)
    .map((f) => ({
      height: f.height!,
      formatId: f.format_id,
      ext: f.ext,
      filesizeBytes: f.filesize ?? f.filesize_approx ?? null,
    }))
    .sort((a, b) => b.height - a.height);

  // Deduplicate by height, keeping best
  const seenHeights = new Set<number>();
  const dedupedVideoFormats = videoFormats.filter((f) => {
    if (seenHeights.has(f.height)) return false;
    seenHeights.add(f.height);
    return true;
  });

  // 2. Audio-only formats and bitrates
  const rawAudioFormats = (info.formats ?? [])
    .filter((f) => (!f.vcodec || f.vcodec === "none") && f.acodec && f.acodec !== "none")
    .map((f) => ({
      formatId: f.format_id,
      ext: f.ext,
      abr: f.abr ? Math.round(f.abr) : (f.tbr ? Math.round(f.tbr) : undefined),
      acodec: f.acodec,
      filesizeBytes: f.filesize ?? f.filesize_approx ?? null,
    }))
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));

  // Deduplicate audio by approximate bitrate and ext
  const seenAudioKeys = new Set<string>();
  const availableAudioQualities = rawAudioFormats.filter((a) => {
    const key = `${a.ext}-${a.abr ?? 0}`;
    if (seenAudioKeys.has(key)) return false;
    seenAudioKeys.add(key);
    return true;
  });

  // Standard fallback audio profiles if yt-dlp only has unseparated audio
  if (availableAudioQualities.length === 0) {
    availableAudioQualities.push(
      { formatId: "bestaudio", ext: "mp3", abr: 320, acodec: "mp3", filesizeBytes: null },
      { formatId: "bestaudio", ext: "m4a", abr: 256, acodec: "aac", filesizeBytes: null },
      { formatId: "bestaudio", ext: "flac", abr: undefined, acodec: "flac", filesizeBytes: null },
      { formatId: "bestaudio", ext: "wav", abr: undefined, acodec: "pcm", filesizeBytes: null },
    );
  }

  // 3. Photo carousel / image detection (e.g. TikTok photo slides, Instagram multi-image)
  const photos: { id: string; url: string; thumbnail?: string; title?: string }[] = [];
  
  // Check if entries contains photos
  if (info.entries && Array.isArray(info.entries)) {
    info.entries.forEach((entry, idx) => {
      const photoUrl = entry.url || entry.thumbnail || entry.thumbnails?.[entry.thumbnails.length - 1]?.url;
      if (photoUrl) {
        photos.push({
          id: entry.id || `photo-${idx + 1}`,
          url: photoUrl,
          thumbnail: entry.thumbnail || photoUrl,
          title: entry.title || `Photo ${idx + 1}`,
        });
      }
    });
  }

  // Check thumbnails if no video streams exist and multiple thumbnails are provided
  if (photos.length === 0 && dedupedVideoFormats.length === 0 && info.thumbnails && info.thumbnails.length > 0) {
    // Collect non-trivial distinct thumbnails
    const distinctUrls = new Set<string>();
    for (const t of info.thumbnails) {
      if (t.url && !distinctUrls.has(t.url)) {
        distinctUrls.add(t.url);
        photos.push({
          id: `thumb-${photos.length + 1}`,
          url: t.url,
          thumbnail: t.url,
          title: `Image ${photos.length + 1}`,
        });
      }
    }
  }

  const isPhotoPost = photos.length > 0;

  return {
    title: info.title ?? "Untitled",
    uploader: info.uploader ?? "Unknown",
    durationSec: info.duration ?? 0,
    thumbnail: info.thumbnail ?? (photos[0]?.thumbnail || ""),
    webpageUrl: info.webpage_url ?? url,
    extractor: info.extractor ?? "unknown",
    ext: info.ext ?? "mp4",
    filesizeBytes: info.filesize ?? info.filesize_approx ?? null,
    isPlaylist: info._type === "playlist",
    availableQualities: dedupedVideoFormats,
    availableAudioQualities,
    photos: photos.length > 0 ? photos : undefined,
    isPhotoPost,
  };
}
