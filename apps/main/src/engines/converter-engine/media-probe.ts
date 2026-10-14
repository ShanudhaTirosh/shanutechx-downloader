import fsp from "node:fs/promises";
import path from "node:path";
import type { MediaFileInfo } from "@shanutechx/shared-types";
import { getBinaryPaths, binaryExists } from "../../utils/binary-manager";
import { runProcess } from "../../utils/spawn-process";

const VIDEO_EXTENSIONS = new Set([
  "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "mpg", "mpeg", "ts", "vob", "ogv"
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "alac", "aiff"
]);

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "ico", "svg"
]);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatBitrate(bps: string | number): string {
  const num = typeof bps === "string" ? parseInt(bps, 10) : bps;
  if (isNaN(num) || num <= 0) return "";
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(num / 1_000)} kbps`;
}

export async function probeMediaFile(filePath: string): Promise<MediaFileInfo> {
  const stat = await fsp.stat(filePath);
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  const filename = path.basename(filePath);

  let category: "video" | "audio" | "image" | "unknown" = "unknown";
  if (VIDEO_EXTENSIONS.has(ext)) {
    category = "video";
  } else if (AUDIO_EXTENSIONS.has(ext)) {
    category = "audio";
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    category = "image";
  }

  const result: MediaFileInfo = {
    path: filePath,
    filename,
    extension: ext,
    sizeBytes: stat.size,
    formattedSize: formatBytes(stat.size),
    category,
  };

  const binaries = getBinaryPaths();

  // Try ffprobe first for rich JSON metadata
  if (binaryExists(binaries.ffprobe)) {
    try {
      const { promise } = runProcess(
        binaries.ffprobe,
        [
          "-v", "quiet",
          "-print_format", "json",
          "-show_format",
          "-show_streams",
          filePath
        ],
        { timeoutMs: 6000 }
      );
      const { stdout } = await promise;
      const data = JSON.parse(stdout);

      if (data.format) {
        if (data.format.format_name) {
          result.format = data.format.format_name.split(",")[0].toUpperCase();
        }
        if (data.format.duration) {
          const dur = parseFloat(data.format.duration);
          if (!isNaN(dur) && dur > 0) {
            result.durationSec = dur;
            result.formattedDuration = formatDuration(dur);
          }
        }
      }

      if (Array.isArray(data.streams)) {
        // Find video stream
        const vStream = data.streams.find((s: { codec_type?: string; disposition?: { attached_pic?: number } }) =>
          s.codec_type === "video" && !s.disposition?.attached_pic
        );
        if (vStream) {
          if (category === "unknown") result.category = "video";
          result.videoCodec = vStream.codec_name;
          if (vStream.width && vStream.height) {
            result.width = vStream.width;
            result.height = vStream.height;
            result.resolution = `${vStream.width}x${vStream.height}`;
          }
          if (vStream.r_frame_rate) {
            const parts = vStream.r_frame_rate.split("/");
            if (parts.length === 2 && Number(parts[1]) > 0) {
              const fps = Math.round((Number(parts[0]) / Number(parts[1])) * 10) / 10;
              if (fps > 0) result.fps = fps;
            }
          }
          if (vStream.bit_rate) {
            result.videoBitrate = formatBitrate(vStream.bit_rate);
          }
        }

        // Find audio stream
        const aStream = data.streams.find((s: { codec_type?: string }) => s.codec_type === "audio");
        if (aStream) {
          if (category === "unknown" && !vStream) result.category = "audio";
          result.audioCodec = aStream.codec_name;
          if (aStream.bit_rate) {
            result.audioBitrate = formatBitrate(aStream.bit_rate);
          }
        }
      }

      return result;
    } catch {
      // Fall through to ffmpeg probe or return basic stats
    }
  }

  // Fallback to ffmpeg -hide_banner -i
  if (binaryExists(binaries.ffmpeg)) {
    try {
      const { promise } = runProcess(
        binaries.ffmpeg,
        ["-hide_banner", "-i", filePath],
        { timeoutMs: 6000 }
      );
      // ffmpeg prints file info to stderr
      let stderrOutput = "";
      try {
        await promise;
      } catch (err: any) {
        stderrOutput = err.stderr || "";
      }

      const durMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderrOutput);
      if (durMatch) {
        const sec = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
        result.durationSec = sec;
        result.formattedDuration = formatDuration(sec);
      }

      const videoMatch = /Stream #\d+:\d+.*Video:\s*([a-zA-Z0-9_-]+).*?(\d{2,5}x\d{2,5})/.exec(stderrOutput);
      if (videoMatch && videoMatch[1] && videoMatch[2]) {
        result.videoCodec = videoMatch[1];
        result.resolution = videoMatch[2];
        const parts = videoMatch[2].split("x").map(Number);
        result.width = parts[0];
        result.height = parts[1];
      }

      const audioMatch = /Stream #\d+:\d+.*Audio:\s*([a-zA-Z0-9_-]+)/.exec(stderrOutput);
      if (audioMatch) {
        result.audioCodec = audioMatch[1];
      }
    } catch {
      // Keep basic stat information
    }
  }

  return result;
}
