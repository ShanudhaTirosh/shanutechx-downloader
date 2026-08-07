import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { ConverterJob } from "./converter-job";
import { resolveBinaries } from "../social-extractor/binaries";
import { reserveUniqueFilepath } from "../../utils/filename";
import { runProcess } from "../../utils/spawn-process";

/**
 * Universal FFmpeg-based converter - 100% offline, no API needed
 * Supports video, audio, and image conversions using local CPU/GPU
 * 
 * Features:
 * - Hardware acceleration (NVIDIA NVENC, Intel QSV, AMD AMF when available)
 * - All major video formats (MP4, MKV, AVI, MOV, WebM, etc.)
 * - All major audio formats (MP3, AAC, FLAC, WAV, OGG, etc.)
 * - Image conversions (JPG, PNG, WebP, GIF, BMP, etc.)
 * - Quality presets (low, medium, high, ultra)
 * - Advanced options (bitrate, resolution, fps, codec selection)
 */

export interface ConversionOptions {
  inputPath: string;
  outputFormat: string;
  outputDir?: string;
  
  // Quality presets
  quality?: "low" | "medium" | "high" | "ultra" | "lossless";
  
  // Video options
  videoCodec?: string;
  videoBitrate?: string; // e.g., "2M", "5000k"
  resolution?: string; // e.g., "1920x1080", "1280x720"
  fps?: number;
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  
  // Audio options
  audioCodec?: string;
  audioBitrate?: string; // e.g., "192k", "320k"
  audioChannels?: number; // 1=mono, 2=stereo
  audioSampleRate?: number; // 44100, 48000, etc.
  
  // Hardware acceleration
  hwAccel?: "auto" | "nvenc" | "qsv" | "amf" | "none";
  
  // Advanced
  customArgs?: string[]; // Additional FFmpeg arguments
}

export interface ConversionTask {
  id: string;
  inputPath: string;
  outputPath: string;
  outputFormat: string;
  status: "queued" | "converting" | "complete" | "failed" | "cancelled";
  progress: number;
  errorMessage?: string;
}

/**
 * Supported format mappings and default codecs
 */
export const FORMAT_CODECS = {
  // Video formats
  mp4: { video: "libx264", audio: "aac", container: "mp4" },
  mkv: { video: "libx264", audio: "aac", container: "matroska" },
  avi: { video: "mpeg4", audio: "mp3", container: "avi" },
  mov: { video: "libx264", audio: "aac", container: "mov" },
  webm: { video: "libvpx-vp9", audio: "libopus", container: "webm" },
  flv: { video: "flv", audio: "mp3", container: "flv" },
  wmv: { video: "wmv2", audio: "wmav2", container: "asf" },
  m4v: { video: "libx264", audio: "aac", container: "mp4" },
  "3gp": { video: "h263", audio: "aac", container: "3gp" },
  ogv: { video: "libtheora", audio: "libvorbis", container: "ogg" },
  
  // Audio formats
  mp3: { audio: "libmp3lame", container: "mp3" },
  aac: { audio: "aac", container: "adts" },
  m4a: { audio: "aac", container: "mp4" },
  wav: { audio: "pcm_s16le", container: "wav" },
  flac: { audio: "flac", container: "flac" },
  ogg: { audio: "libvorbis", container: "ogg" },
  opus: { audio: "libopus", container: "ogg" },
  wma: { audio: "wmav2", container: "asf" },
  alac: { audio: "alac", container: "mp4" },
  
  // Image formats (via FFmpeg)
  jpg: { video: "mjpeg", container: "image2" },
  jpeg: { video: "mjpeg", container: "image2" },
  png: { video: "png", container: "image2" },
  bmp: { video: "bmp", container: "image2" },
  gif: { video: "gif", container: "gif" },
  webp: { video: "libwebp", container: "image2" },
} as const;

/**
 * Hardware acceleration mappings
 */
const HW_ACCEL_ENCODERS = {
  nvenc: {
    h264: "h264_nvenc",
    hevc: "hevc_nvenc",
  },
  qsv: {
    h264: "h264_qsv",
    hevc: "hevc_qsv",
  },
  amf: {
    h264: "h264_amf",
    hevc: "hevc_amf",
  },
};

/**
 * Quality presets for video encoding
 */
const QUALITY_PRESETS = {
  low: { crf: 28, bitrate: "1M", audioBitrate: "96k" },
  medium: { crf: 23, bitrate: "2M", audioBitrate: "128k" },
  high: { crf: 20, bitrate: "5M", audioBitrate: "192k" },
  ultra: { crf: 18, bitrate: "8M", audioBitrate: "256k" },
  lossless: { crf: 0, bitrate: null, audioBitrate: "320k" },
};

export class UniversalConverter {
  private tasks = new Map<string, { job: ConverterJob; task: ConversionTask }>();
  
  constructor(private getWindow: () => BrowserWindow | null) {}

  /**
   * Convert any supported format to another format
   */
  async convert(options: ConversionOptions): Promise<{ taskId: string }> {
    const taskId = randomUUID();
    const { ffmpeg } = resolveBinaries();

    // Resolve "auto" hardware acceleration to a real, probed encoder choice
    // (see detectHardwareAcceleration) instead of the old decode-only
    // `-hwaccel auto` flag that never touched the encoder. Priority follows
    // typical desktop availability: NVIDIA NVENC first (fastest, most
    // consistently available across driver versions), then Intel Quick
    // Sync, then AMD AMF. Falls through to CPU encoding if this ffmpeg
    // build has none of them.
    let resolvedHwAccel = options.hwAccel;
    if (options.hwAccel === "auto") {
      const available = await detectHardwareAcceleration(ffmpeg);
      resolvedHwAccel = available.nvenc ? "nvenc" : available.qsv ? "qsv" : available.amf ? "amf" : "none";
    }

    // Determine output path
    const inputExt = path.extname(options.inputPath);
    const inputBase = path.basename(options.inputPath, inputExt);
    const outputDir = options.outputDir || path.dirname(options.inputPath);
    const outputName = `${inputBase}.${options.outputFormat}`;
    const outputPath = await reserveUniqueFilepath(outputDir, outputName);

    // Build FFmpeg arguments
    const ffmpegArgs = this.buildFFmpegArgs({ ...options, hwAccel: resolvedHwAccel });

    const task: ConversionTask = {
      id: taskId,
      inputPath: options.inputPath,
      outputPath,
      outputFormat: options.outputFormat,
      status: "queued",
      progress: 0,
    };

    const job = new ConverterJob();
    this.tasks.set(taskId, { job, task });

    // Notify initial state
    this.notifyProgress(taskId, 0);

    // Start conversion
    void job.run(
      {
        inputPath: options.inputPath,
        outputPath,
        ffmpegArgs,
        ffmpegPath: ffmpeg,
      },
      {
        onProgress: (percent) => {
          task.progress = percent;
          task.status = "converting";
          this.notifyProgress(taskId, percent);
        },
        onDone: () => {
          task.status = "complete";
          task.progress = 100;
          this.notifyStatus(taskId, "complete");
          this.tasks.delete(taskId);
        },
        onError: (message) => {
          task.status = "failed";
          task.errorMessage = message;
          this.notifyStatus(taskId, "failed", message);
          this.tasks.delete(taskId);
        },
      }
    );

    return { taskId };
  }

  /**
   * Build FFmpeg arguments based on conversion options
   */
  private buildFFmpegArgs(options: ConversionOptions): string[] {
    const args: string[] = [];
    const format = options.outputFormat.toLowerCase();
    const codecInfo = FORMAT_CODECS[format as keyof typeof FORMAT_CODECS];

    if (!codecInfo) {
      throw new Error(`Unsupported output format: ${format}`);
    }

    // NOTE: no `-hwaccel <method>` decode flag here on purpose. ffmpeg only
    // honors `-hwaccel` when it appears *before* `-i` on the command line,
    // but ConverterJob currently assembles argv as `-i <input> ...ffmpegArgs`
    // — these args always land after `-i`, so a decode-side hwaccel flag
    // would silently do nothing (or in some builds, error) rather than
    // accelerate anything. Wiring it up correctly needs ConverterJob to
    // accept a separate pre-input argument list; tracked as a follow-up
    // rather than shipped half-working. The encoder selection below (GPU
    // *encode*, picked from the ffmpeg build's actually-probed capabilities
    // in detectHardwareAcceleration) is unaffected by this and does work —
    // encoding is the more expensive half of most conversions anyway.

    // Video codec and settings
    if ("video" in codecInfo && codecInfo.video) {
      let videoCodec = options.videoCodec || codecInfo.video;
      
      // Apply hardware encoder if requested
      if (options.hwAccel && options.hwAccel !== "none" && options.hwAccel !== "auto") {
        const hwEncoders = HW_ACCEL_ENCODERS[options.hwAccel];
        if (videoCodec === "libx264") {
          videoCodec = hwEncoders?.h264 || videoCodec;
        } else if (videoCodec === "libx265") {
          videoCodec = hwEncoders?.hevc || videoCodec;
        }
      }
      
      args.push("-c:v", videoCodec);

      // Quality settings
      if (options.quality) {
        const preset = QUALITY_PRESETS[options.quality];
        if (videoCodec.includes("x264") || videoCodec.includes("x265")) {
          args.push("-crf", preset.crf.toString());
        }
        if (preset.bitrate && !options.videoBitrate) {
          args.push("-b:v", preset.bitrate);
        }
      }

      // Video bitrate
      if (options.videoBitrate) {
        args.push("-b:v", options.videoBitrate);
      }

      // Resolution
      if (options.resolution) {
        args.push("-s", options.resolution);
      }

      // FPS
      if (options.fps) {
        args.push("-r", options.fps.toString());
      }

      // Encoding preset (speed vs quality tradeoff)
      if (options.preset && (videoCodec === "libx264" || videoCodec === "libx265")) {
        args.push("-preset", options.preset);
      }
    } else {
      // Audio-only or image output: disable video
      args.push("-vn");
    }

    // Audio codec and settings
    if ("audio" in codecInfo && codecInfo.audio) {
      const audioCodec = options.audioCodec || codecInfo.audio;
      args.push("-c:a", audioCodec);

      // Audio bitrate
      const audioBitrate = options.audioBitrate || 
        (options.quality ? QUALITY_PRESETS[options.quality].audioBitrate : "192k");
      args.push("-b:a", audioBitrate);

      // Audio channels
      if (options.audioChannels) {
        args.push("-ac", options.audioChannels.toString());
      }

      // Sample rate
      if (options.audioSampleRate) {
        args.push("-ar", options.audioSampleRate.toString());
      }
    } else {
      // Video-only or image output: disable audio
      args.push("-an");
    }

    // Container format
    if (codecInfo.container) {
      args.push("-f", codecInfo.container);
    }

    // Custom arguments (advanced users)
    if (options.customArgs && options.customArgs.length > 0) {
      args.push(...options.customArgs);
    }

    return args;
  }

  /**
   * Cancel a conversion task
   */
  cancel(taskId: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      entry.job.cancel();
      entry.task.status = "cancelled";
      this.tasks.delete(taskId);
      this.notifyStatus(taskId, "cancelled");
    }
  }

  /**
   * Get task status
   */
  getTask(taskId: string): ConversionTask | undefined {
    return this.tasks.get(taskId)?.task;
  }

  private notifyProgress(taskId: string, percent: number): void {
    const win = this.getWindow();
    if (win) {
      win.webContents.send("download:progress", {
        id: taskId,
        downloadedBytes: percent,
        totalBytes: 100,
        speedBps: 0,
        etaSec: null,
      });
    }
  }

  private notifyStatus(taskId: string, status: "complete" | "failed" | "cancelled", errorMessage?: string): void {
    const win = this.getWindow();
    if (win) {
      win.webContents.send("download:status", {
        id: taskId,
        status,
        errorMessage,
      });
    }
  }
}

/**
 * Get all supported input/output format combinations
 */
export function getSupportedFormats(): {
  video: string[];
  audio: string[];
  image: string[];
  all: string[];
} {
  const formats = Object.keys(FORMAT_CODECS);
  
  return {
    video: formats.filter(f => {
      const codec = FORMAT_CODECS[f as keyof typeof FORMAT_CODECS];
      return "video" in codec && codec.video;
    }),
    audio: formats.filter(f => {
      const codec = FORMAT_CODECS[f as keyof typeof FORMAT_CODECS];
      return !("video" in codec) && "audio" in codec;
    }),
    image: ["jpg", "jpeg", "png", "bmp", "gif", "webp"],
    all: formats,
  };
}

/**
 * Conversion presets for common use cases
 */
export const CONVERSION_PRESETS = {
  // Video to Audio (extract audio)
  "extract-audio-mp3-high": {
    outputFormat: "mp3",
    audioCodec: "libmp3lame",
    audioBitrate: "320k",
  },
  "extract-audio-mp3-medium": {
    outputFormat: "mp3",
    audioCodec: "libmp3lame",
    audioBitrate: "192k",
  },
  "extract-audio-aac": {
    outputFormat: "m4a",
    audioCodec: "aac",
    audioBitrate: "256k",
  },
  "extract-audio-flac": {
    outputFormat: "flac",
    audioCodec: "flac",
  },
  
  // Video to Video (common conversions)
  "video-to-mp4-high": {
    outputFormat: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    quality: "high" as const,
    preset: "medium" as const,
  },
  "video-to-mp4-small": {
    outputFormat: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    quality: "low" as const,
    preset: "fast" as const,
  },
  "video-to-webm": {
    outputFormat: "webm",
    videoCodec: "libvpx-vp9",
    audioCodec: "libopus",
    quality: "high" as const,
  },
  
  // Resolution presets
  "downscale-1080p": {
    resolution: "1920x1080",
    quality: "high" as const,
  },
  "downscale-720p": {
    resolution: "1280x720",
    quality: "medium" as const,
  },
  "downscale-480p": {
    resolution: "854x480",
    quality: "medium" as const,
  },
  
  // Audio to Audio
  "audio-to-mp3": {
    outputFormat: "mp3",
    audioCodec: "libmp3lame",
    audioBitrate: "192k",
  },
  "audio-to-aac": {
    outputFormat: "m4a",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
  "audio-to-flac": {
    outputFormat: "flac",
    audioCodec: "flac",
  },
  "audio-to-wav": {
    outputFormat: "wav",
    audioCodec: "pcm_s16le",
  },
  
  // Image conversions
  "image-to-jpg-high": {
    outputFormat: "jpg",
    quality: "high" as const,
  },
  "image-to-png": {
    outputFormat: "png",
  },
  "image-to-webp": {
    outputFormat: "webp",
    quality: "high" as const,
  },
} as const;

/**
 * Detect available hardware-accelerated encoders by actually probing this
 * machine's ffmpeg build, instead of guessing.
 *
 * BUG FIX: this used to be a stub that always returned all-false ("This
 * would need to actually probe FFmpeg encoders. For now, return a
 * placeholder") — meaning the "auto" hardware-acceleration option never
 * did anything beyond adding a decode-side `-hwaccel auto` flag. The video
 * *encoder* (the far more expensive half of a conversion) always stayed on
 * CPU libx264/libx265 regardless of what GPU was in the machine or what the
 * "Use GPU acceleration" toggle in Settings claimed to do. `ffmpeg -encoders`
 * lists every encoder this specific ffmpeg build was compiled with — a
 * locally-built or minimal ffmpeg may lack nvenc/qsv/amf support even on
 * hardware that could otherwise support it, so probing beats assuming.
 *
 * Result is memoized per ffmpeg binary path: encoder support doesn't change
 * between conversions in the same app session, so there's no reason to
 * re-spawn ffmpeg -encoders (a real subprocess, non-trivial to parse) on
 * every single conversion.
 */
const hwAccelCache = new Map<string, Promise<{ nvenc: boolean; qsv: boolean; amf: boolean }>>();

export async function detectHardwareAcceleration(
  ffmpegPath: string,
): Promise<{ nvenc: boolean; qsv: boolean; amf: boolean }> {
  const cached = hwAccelCache.get(ffmpegPath);
  if (cached) return cached;

  const probe = (async () => {
    try {
      const { promise } = runProcess(ffmpegPath, ["-hide_banner", "-encoders"], { timeoutMs: 10_000 });
      const { stdout } = await promise;
      return {
        nvenc: stdout.includes("h264_nvenc") || stdout.includes("hevc_nvenc"),
        qsv: stdout.includes("h264_qsv") || stdout.includes("hevc_qsv"),
        amf: stdout.includes("h264_amf") || stdout.includes("hevc_amf"),
      };
    } catch {
      // ffmpeg missing, unreadable, or -encoders unsupported by this build
      // — fail closed to "no hardware encoders" rather than throwing, since
      // this is a best-effort optimization, not a required capability.
      return { nvenc: false, qsv: false, amf: false };
    }
  })();

  hwAccelCache.set(ffmpegPath, probe);
  return probe;
}
