import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { ConverterJob } from "./converter-job";
import { CloudConvertConverter, getSupportedOutputFormats, CONVERSION_PRESETS } from "./cloudconvert-converter";
import { resolveBinaries } from "../social-extractor/binaries";
import { reserveUniqueFilepath } from "../../utils/filename";
import { settingsStore } from "../../settings/settings-store";

const KIND_ARGS: Record<"extract-audio" | "mux", string[]> = {
  "extract-audio": ["-vn", "-acodec", "libmp3lame", "-q:a", "2"],
  "mux": ["-c", "copy"],
};

export class ConverterManager {
  private jobs = new Map<string, ConverterJob>();
  private cloudConvert: CloudConvertConverter | null = null;

  constructor(private getWindow: () => BrowserWindow | null) {
    this.initializeCloudConvert();
  }

  private initializeCloudConvert(): void {
    const settings = settingsStore.get();
    if (settings.useCloudConvert && settings.cloudConvertApiKey) {
      this.cloudConvert = new CloudConvertConverter(
        {
          apiKey: settings.cloudConvertApiKey,
          sandbox: settings.cloudConvertSandbox,
        },
        this.getWindow
      );
    }
  }

  /**
   * Legacy FFmpeg-based conversion (extract-audio, mux)
   */
  async convert(inputPath: string, kind: "extract-audio" | "mux"): Promise<{ taskId: string }> {
    const { ffmpeg } = resolveBinaries();
    const taskId = randomUUID();
    const ext = kind === "extract-audio" ? ".mp3" : path.extname(inputPath);
    const outputName = `${path.basename(inputPath, path.extname(inputPath))}${ext}`;
    const outputPath = await reserveUniqueFilepath(path.dirname(inputPath), outputName);

    const job = new ConverterJob();
    this.jobs.set(taskId, job);

    void job.run(
      { inputPath, outputPath, ffmpegArgs: KIND_ARGS[kind], ffmpegPath: ffmpeg },
      {
        onProgress: (percent) => this.getWindow()?.webContents.send("download:progress", { id: taskId, downloadedBytes: percent, totalBytes: 100, speedBps: 0, etaSec: null }),
        onDone: () => { this.getWindow()?.webContents.send("download:status", { id: taskId, status: "complete" }); this.jobs.delete(taskId); },
        onError: (message) => { this.getWindow()?.webContents.send("download:status", { id: taskId, status: "failed", errorMessage: message }); this.jobs.delete(taskId); },
      },
    );

    return { taskId };
  }

  /**
   * CloudConvert-based conversion (any format to any format)
   * Supports video, audio, images, documents, archives, ebooks
   */
  async cloudConvertFile(
    inputPath: string,
    inputFormat: string,
    outputFormat: string,
    outputDir?: string,
    conversionOptions?: Record<string, unknown>
  ): Promise<{ taskId: string }> {
    // Re-initialize if settings changed
    if (!this.cloudConvert) {
      this.initializeCloudConvert();
    }

    if (!this.cloudConvert) {
      throw new Error("CloudConvert is not configured. Please add your API key in Settings.");
    }

    return this.cloudConvert.convert({
      inputPath,
      inputFormat,
      outputFormat,
      outputDir,
      conversionOptions,
    });
  }

  /**
   * Get supported output formats for a given input format
   */
  getSupportedFormats(inputFormat: string): string[] {
    return getSupportedOutputFormats(inputFormat);
  }

  /**
   * Get conversion presets
   */
  getPresets(): typeof CONVERSION_PRESETS {
    return CONVERSION_PRESETS;
  }

  cancel(taskId: string): void {
    // Try FFmpeg job first
    const ffmpegJob = this.jobs.get(taskId);
    if (ffmpegJob) {
      ffmpegJob.cancel();
      return;
    }

    // Try CloudConvert job
    if (this.cloudConvert) {
      this.cloudConvert.cancel(taskId);
    }
  }
}
