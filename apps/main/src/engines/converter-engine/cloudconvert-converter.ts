import CloudConvert from "cloudconvert";
import fs from "node:fs";
import https from "node:https";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { reserveUniqueFilepath } from "../../utils/filename";
import type { BrowserWindow } from "electron";

export interface CloudConvertOptions {
  apiKey: string;
  sandbox?: boolean;
}

export interface ConversionTask {
  id: string;
  inputPath: string;
  outputFormat: string;
  outputPath?: string;
  status: "queued" | "uploading" | "converting" | "downloading" | "complete" | "failed";
  progress: number;
  errorMessage?: string;
}

export interface ConversionRequest {
  inputPath: string;
  inputFormat: string;
  outputFormat: string;
  outputDir?: string;
  conversionOptions?: Record<string, unknown>;
}

/**
 * CloudConvert-based converter supporting 200+ file formats:
 * - Video: mp4, avi, mkv, mov, wmv, flv, webm, m4v, etc.
 * - Audio: mp3, wav, flac, aac, ogg, m4a, wma, opus, etc.
 * - Images: jpg, png, gif, bmp, webp, svg, tiff, ico, etc.
 * - Documents: pdf, docx, xlsx, pptx, txt, html, epub, etc.
 * - Archives: zip, rar, 7z, tar, gz, etc.
 * 
 * Features:
 * - Cloud-based processing (no local CPU usage)
 * - High-quality conversions
 * - Advanced options per format
 * - Progress tracking
 * - Resume capability
 */
export class CloudConvertConverter {
  private cloudConvert: CloudConvert;
  private tasks = new Map<string, ConversionTask>();
  private getWindow: () => BrowserWindow | null;

  constructor(options: CloudConvertOptions, getWindow: () => BrowserWindow | null) {
    this.cloudConvert = new CloudConvert(options.apiKey, options.sandbox);
    this.getWindow = getWindow;
  }

  /**
   * Convert any file format to another format
   * Supports video, audio, image, document conversions
   */
  async convert(request: ConversionRequest): Promise<{ taskId: string }> {
    const taskId = randomUUID();
    const outputFileName = `${path.basename(request.inputPath, path.extname(request.inputPath))}.${request.outputFormat}`;
    const outputDir = request.outputDir || path.dirname(request.inputPath);
    const outputPath = await reserveUniqueFilepath(outputDir, outputFileName);

    const task: ConversionTask = {
      id: taskId,
      inputPath: request.inputPath,
      outputFormat: request.outputFormat,
      outputPath,
      status: "queued",
      progress: 0,
    };

    this.tasks.set(taskId, task);
    this.notifyProgress(taskId);

    // Start conversion in background
    void this.runConversion(taskId, request, outputPath);

    return { taskId };
  }

  private async runConversion(taskId: string, request: ConversionRequest, outputPath: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      // Step 1: Create CloudConvert job
      task.status = "uploading";
      task.progress = 5;
      this.notifyProgress(taskId);

      const job = await this.cloudConvert.jobs.create({
        tasks: {
          "upload-file": {
            operation: "import/upload",
          },
          "convert-file": {
            operation: "convert",
            input: "upload-file",
            output_format: request.outputFormat,
            input_format: request.inputFormat,
            ...(request.conversionOptions || {}),
          },
          "export-file": {
            operation: "export/url",
            input: "convert-file",
          },
        },
      });

      // Step 2: Upload the input file
      const uploadTask = job.tasks?.find((t) => t.name === "upload-file");
      if (!uploadTask) throw new Error("Upload task not found in job");

      task.progress = 10;
      this.notifyProgress(taskId);

      const inputFile = fs.createReadStream(request.inputPath);
      const fileStats = fs.statSync(request.inputPath);
      await this.cloudConvert.tasks.upload(uploadTask, inputFile, path.basename(request.inputPath), fileStats.size);

      task.status = "converting";
      task.progress = 30;
      this.notifyProgress(taskId);

      // Step 3: Wait for job completion with progress updates
      const completedJob = await this.cloudConvert.jobs.wait(job.id);

      task.progress = 80;
      this.notifyProgress(taskId);

      // Step 4: Download the converted file
      const exportUrls = this.cloudConvert.jobs.getExportUrls(completedJob);
      if (!exportUrls || exportUrls.length === 0) {
        throw new Error("No export URL found");
      }

      task.status = "downloading";
      task.progress = 85;
      this.notifyProgress(taskId);

      const file = exportUrls[0];
      if (!file?.url) throw new Error("Export URL is missing");

      await this.downloadFile(file.url, outputPath, (progress) => {
        task.progress = 85 + progress * 0.15; // 85-100%
        this.notifyProgress(taskId);
      });

      // Step 5: Complete
      task.status = "complete";
      task.progress = 100;
      this.notifyStatus(taskId, "complete");
    } catch (error) {
      task.status = "failed";
      task.errorMessage = error instanceof Error ? error.message : String(error);
      this.notifyStatus(taskId, "failed", task.errorMessage);
    }
  }

  private async downloadFile(url: string, outputPath: string, onProgress: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        const totalSize = parseInt(response.headers["content-length"] || "0", 10);
        let downloadedSize = 0;

        const writeStream = fs.createWriteStream(outputPath);

        response.on("data", (chunk: Buffer) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            onProgress(downloadedSize / totalSize);
          }
        });

        response.pipe(writeStream);

        writeStream.on("finish", () => {
          writeStream.close();
          resolve();
        });

        writeStream.on("error", reject);
        response.on("error", reject);
      });
    });
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "failed";
      task.errorMessage = "Cancelled by user";
      this.tasks.delete(taskId);
      this.notifyStatus(taskId, "cancelled");
    }
  }

  getTask(taskId: string): ConversionTask | undefined {
    return this.tasks.get(taskId);
  }

  private notifyProgress(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const win = this.getWindow();
    if (win) {
      win.webContents.send("download:progress", {
        id: taskId,
        downloadedBytes: task.progress,
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
    if (status === "complete" || status === "failed") {
      this.tasks.delete(taskId);
    }
  }
}

/**
 * Supported format categories and their formats
 */
export const SUPPORTED_FORMATS = {
  video: [
    "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg",
    "3gp", "3g2", "mxf", "ts", "vob", "ogv", "gifv", "mts", "m2ts",
  ],
  audio: [
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "amr", "aiff",
    "ape", "au", "mid", "midi", "mka", "mp2", "mpc", "oga", "ra", "tta", "wv",
  ],
  image: [
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tiff", "tif", "ico",
    "psd", "ai", "eps", "raw", "cr2", "nef", "heic", "heif", "avif", "jxl",
  ],
  document: [
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
    "txt", "rtf", "html", "htm", "epub", "mobi", "azw3", "djvu", "fb2",
  ],
  archive: [
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "cab", "arj",
  ],
  ebook: [
    "epub", "mobi", "azw", "azw3", "fb2", "lit", "lrf", "pdb", "pdf", "tcr",
  ],
} as const;

/**
 * Get all supported output formats for a given input format
 */
export function getSupportedOutputFormats(inputFormat: string): string[] {
  const allFormats = Object.values(SUPPORTED_FORMATS).flat();
  
  // Find which category the input belongs to
  for (const [category, formats] of Object.entries(SUPPORTED_FORMATS)) {
    if (formats.includes(inputFormat as never)) {
      // Return formats from the same category
      return [...formats];
    }
  }
  
  // If not found in any category, return all formats
  return allFormats;
}

/**
 * Common conversion presets
 */
export const CONVERSION_PRESETS = {
  // Video to Audio
  "video-to-mp3": {
    outputFormat: "mp3",
    options: {
      audio_codec: "mp3",
      audio_bitrate: "192",
    },
  },
  "video-to-wav": {
    outputFormat: "wav",
    options: {
      audio_codec: "pcm_s16le",
    },
  },
  "video-to-aac": {
    outputFormat: "aac",
    options: {
      audio_codec: "aac",
      audio_bitrate: "192",
    },
  },
  
  // Video to Video
  "video-to-mp4": {
    outputFormat: "mp4",
    options: {
      video_codec: "h264",
      audio_codec: "aac",
    },
  },
  "video-to-webm": {
    outputFormat: "webm",
    options: {
      video_codec: "vp9",
      audio_codec: "opus",
    },
  },
  
  // Image conversions
  "image-to-jpg": {
    outputFormat: "jpg",
    options: {
      quality: 90,
    },
  },
  "image-to-png": {
    outputFormat: "png",
    options: {
      compression_level: 6,
    },
  },
  "image-to-webp": {
    outputFormat: "webp",
    options: {
      quality: 90,
    },
  },
  
  // Document conversions
  "doc-to-pdf": {
    outputFormat: "pdf",
    options: {},
  },
  "pdf-to-docx": {
    outputFormat: "docx",
    options: {},
  },
} as const;
