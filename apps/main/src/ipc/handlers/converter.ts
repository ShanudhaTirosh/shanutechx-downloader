import { registerHandler } from "./index";
import type { ConverterManager } from "../../engines/converter-engine/converter-manager";

export function registerConverterHandlers(converter: ConverterManager): void {
  registerHandler("converter:convert", (p) => converter.convert(p.inputPath, p.kind));
  
  registerHandler("converter:universalConvert", (p) => 
    converter.universalConvert(p.inputPath, p.outputFormat, {
      quality: p.quality,
      videoCodec: p.videoCodec,
      videoBitrate: p.videoBitrate,
      resolution: p.resolution,
      fps: p.fps,
      preset: p.preset,
      audioCodec: p.audioCodec,
      audioBitrate: p.audioBitrate,
      audioChannels: p.audioChannels,
      audioSampleRate: p.audioSampleRate,
      hwAccel: p.hwAccel,
      outputDir: p.outputDir,
      customArgs: p.customArgs,
    })
  );
  
  registerHandler("converter:getSupportedFormats", () => converter.getSupportedFormats());
  
  registerHandler("converter:getPresets", () => ({
    presets: converter.getPresets(),
  }));

  registerHandler("converter:probe", (p) => converter.probe(p.filePath));

  registerHandler("converter:cancel", (p) => {
    converter.cancel(p.taskId);
  });
}
