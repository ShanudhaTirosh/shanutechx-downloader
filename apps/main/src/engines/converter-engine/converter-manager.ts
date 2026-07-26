import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { ConverterJob } from "./converter-job";
import { resolveBinaries } from "../social-extractor/binaries";
import { reserveUniqueFilepath } from "../../utils/filename";

const KIND_ARGS: Record<"extract-audio" | "mux", string[]> = {
  "extract-audio": ["-vn", "-acodec", "libmp3lame", "-q:a", "2"],
  "mux": ["-c", "copy"],
};

export class ConverterManager {
  private jobs = new Map<string, ConverterJob>();
  constructor(private getWindow: () => BrowserWindow | null) {}

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

  cancel(taskId: string): void { this.jobs.get(taskId)?.cancel(); }
}
