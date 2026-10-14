import type { BrowserWindow } from "electron";
import { UniversalConverter, getSupportedFormats, CONVERSION_PRESETS, type ConversionOptions } from "./universal-converter";
import { probeMediaFile } from "./media-probe";

/**
 * ConverterManager - 100% offline FFmpeg-based converter
 * Supports all major video, audio, and image format conversions
 * with hardware acceleration (GPU) support when available
 */
export class ConverterManager {
  private converter: UniversalConverter;

  constructor(getWindow: () => BrowserWindow | null) {
    this.converter = new UniversalConverter(getWindow);
  }

  /**
   * Legacy API: Simple audio extraction
   */
  async convert(inputPath: string, kind: "extract-audio" | "mux"): Promise<{ taskId: string }> {
    if (kind === "extract-audio") {
      return this.converter.convert({
        inputPath,
        outputFormat: "mp3",
        audioCodec: "libmp3lame",
        audioBitrate: "192k",
        quality: "high",
      });
    } else {
      // Mux: copy both streams without re-encoding
      return this.converter.convert({
        inputPath,
        outputFormat: "mp4",
        customArgs: ["-c", "copy"],
      });
    }
  }

  /**
   * Universal conversion: any format to any format
   * Supports video, audio, and images with full control
   */
  async universalConvert(
    inputPath: string,
    outputFormat: string,
    options?: Partial<ConversionOptions>
  ): Promise<{ taskId: string }> {
    return this.converter.convert({
      inputPath,
      outputFormat,
      ...options,
    });
  }

  /**
   * Get supported formats by category
   */
  getSupportedFormats(): {
    video: string[];
    audio: string[];
    image: string[];
    all: string[];
  } {
    return getSupportedFormats();
  }

  /**
   * Get conversion presets
   */
  getPresets(): typeof CONVERSION_PRESETS {
    return CONVERSION_PRESETS;
  }

  /**
   * Cancel a conversion task
   */
  cancel(taskId: string): void {
    this.converter.cancel(taskId);
  }

  /**
   * Probe media file details (codecs, duration, resolution, size)
   */
  async probe(filePath: string) {
    return probeMediaFile(filePath);
  }
}
