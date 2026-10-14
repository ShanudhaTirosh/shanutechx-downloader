import { randomUUID } from "node:crypto";
import path from "node:path";
import fsp from "node:fs/promises";
import type { BrowserWindow } from "electron";
import { ConverterJob, type ConvertProgressData } from "./converter-job";
import { resolveBinaries } from "../social-extractor/binaries";
import { reserveUniqueFilepath } from "../../utils/filename";
import { runProcess } from "../../utils/spawn-process";
import { ensureFfmpegBinary, binaryExists } from "../../utils/binary-manager";

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
    av1: "av1_nvenc",
  },
  qsv: {
    h264: "h264_qsv",
    hevc: "hevc_qsv",
    av1: "av1_qsv",
  },
  amf: {
    h264: "h264_amf",
    hevc: "hevc_amf",
    av1: "av1_amf",
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
   * Convert any supported format to another format with strict media category validation
   */
  async convert(options: ConversionOptions): Promise<{ taskId: string }> {
    const taskId = randomUUID();
    let { ffmpeg } = resolveBinaries();

    // Ensure ffmpeg binary is present; download automatically if missing
    if (!binaryExists(ffmpeg)) {
      ffmpeg = await ensureFfmpegBinary();
    }

    // Media type compatibility validation:
    // Audio can only convert to audio; Image can only convert to image; Video can convert to video, audio, or image
    const rawInputExt = path.extname(options.inputPath).replace(/^\./, "").toLowerCase();
    const targetFmt = options.outputFormat.toLowerCase();

    const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "alac", "aiff"]);
    const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff"]);
    const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "ogv", "ts", "mpg", "mpeg"]);

    const isInputAudio = AUDIO_EXTS.has(rawInputExt);
    const isInputImage = IMAGE_EXTS.has(rawInputExt);
    const isOutputAudio = AUDIO_EXTS.has(targetFmt);
    const isOutputImage = IMAGE_EXTS.has(targetFmt);

    if (isInputAudio && !isOutputAudio) {
      throw new Error(`Invalid conversion: Audio files (.${rawInputExt}) can only be converted to audio formats (e.g. MP3, AAC, WAV, FLAC). Converting audio to video or image is not supported.`);
    }

    if (isInputImage && !isOutputImage) {
      throw new Error(`Invalid conversion: Image files (.${rawInputExt}) can only be converted to other image formats (e.g. JPG, PNG, WebP). Converting static images to video or audio is not supported.`);
    }

    // Resolve "auto" hardware acceleration to a real, probed encoder choice
    let resolvedHwAccel = options.hwAccel;
    if (options.hwAccel === "auto") {
      const available = await detectHardwareAcceleration(ffmpeg);
      resolvedHwAccel = available.nvenc ? "nvenc" : available.qsv ? "qsv" : available.amf ? "amf" : "none";
    }

    // Determine output path
    const inputExt = path.extname(options.inputPath);
    const inputBase = path.basename(options.inputPath, inputExt);
    const outputDir = options.outputDir || path.dirname(options.inputPath);
    await fsp.mkdir(outputDir, { recursive: true });

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
        onProgress: (percent, data) => {
          task.progress = percent;
          task.status = "converting";
          this.notifyProgress(taskId, percent, data);
        },
        onDone: () => {
          task.status = "complete";
          task.progress = 100;
          this.notifyStatus(taskId, "complete", outputPath);
          this.tasks.delete(taskId);
        },
        onError: async (message) => {
          task.status = "failed";
          task.errorMessage = message;
          this.notifyStatus(taskId, "failed", outputPath, message);
          this.tasks.delete(taskId);
          try {
            const st = await fsp.stat(outputPath).catch(() => null);
            if (st && st.size === 0) {
              await fsp.unlink(outputPath).catch(() => {});
            }
          } catch {}
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
        const hwEncoders = HW_ACCEL_ENCODERS[options.hwAccel as keyof typeof HW_ACCEL_ENCODERS];
        if (videoCodec === "libx264") {
          videoCodec = hwEncoders?.h264 || videoCodec;
        } else if (videoCodec === "libx265" || videoCodec === "hevc") {
          videoCodec = hwEncoders?.hevc || videoCodec;
        } else if (videoCodec.includes("av1")) {
          videoCodec = hwEncoders?.av1 || videoCodec;
        }
      }
      
      args.push("-c:v", videoCodec);

      // Quality settings
      if (options.quality) {
        const preset = QUALITY_PRESETS[options.quality];
        if (videoCodec.includes("x264") || videoCodec.includes("x265") || videoCodec.includes("av1")) {
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
      const outputPath = entry.task.outputPath;
      this.tasks.delete(taskId);
      this.notifyStatus(taskId, "cancelled", outputPath);
      setTimeout(async () => {
        try {
          await fsp.unlink(outputPath).catch(() => {});
        } catch {}
      }, 500);
    }
  }

  /**
   * Get task status
   */
  getTask(taskId: string): ConversionTask | undefined {
    return this.tasks.get(taskId)?.task;
  }

  private notifyProgress(taskId: string, percent: number, data?: ConvertProgressData): void {
    const win = this.getWindow();
    if (win) {
      win.webContents.send("converter:progress", {
        taskId,
        percent,
        speed: data?.speed,
        timemark: data?.timemark,
        fps: data?.fps,
      });
      win.webContents.send("download:progress", {
        id: taskId,
        downloadedBytes: percent,
        totalBytes: 100,
        speedBps: 0,
        etaSec: null,
      });
    }
  }

  private notifyStatus(taskId: string, status: "complete" | "failed" | "cancelled", outputPath?: string, errorMessage?: string): void {
    const win = this.getWindow();
    if (win) {
      win.webContents.send("converter:status", {
        taskId,
        status,
        outputPath,
        errorMessage,
      });
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
  
  // Video Codec presets (H.264, H.265, AV1)
  "video-to-hevc-high": {
    outputFormat: "mp4",
    videoCodec: "libx265",
    audioCodec: "aac",
    quality: "high" as const,
    preset: "medium" as const,
  },
  "video-to-av1-high": {
    outputFormat: "mp4",
    videoCodec: "libsvtav1",
    audioCodec: "aac",
    quality: "high" as const,
  },
  "video-to-h264-universal": {
    outputFormat: "mp4",
    videoCodec: "libx264",
    audioCodec: "aac",
    quality: "high" as const,
    preset: "medium" as const,
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
 * machine's ffmpeg build, including H.264, HEVC, and AV1.
 */
const hwAccelCache = new Map<string, Promise<{ nvenc: boolean; qsv: boolean; amf: boolean; av1: boolean }>>();

export async function detectHardwareAcceleration(
  ffmpegPath: string,
): Promise<{ nvenc: boolean; qsv: boolean; amf: boolean; av1: boolean }> {
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
        av1: stdout.includes("av1_nvenc") || stdout.includes("av1_qsv") || stdout.includes("av1_amf"),
      };
    } catch {
      return { nvenc: false, qsv: false, amf: false, av1: false };
    }
  })();

  hwAccelCache.set(ffmpegPath, probe);
  return probe;
}
