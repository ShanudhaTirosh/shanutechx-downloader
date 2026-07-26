import { registerHandler } from "./index";
import type { ConverterManager } from "../../engines/converter-engine/converter-manager";

export function registerConverterHandlers(converter: ConverterManager): void {
  registerHandler("converter:convert", (p) => converter.convert(p.inputPath, p.kind));
  
  registerHandler("converter:cloudconvert", (p) => 
    converter.cloudConvertFile(
      p.inputPath,
      p.inputFormat,
      p.outputFormat,
      p.outputDir,
      p.conversionOptions
    )
  );
  
  registerHandler("converter:getSupportedFormats", (p) => ({
    formats: converter.getSupportedFormats(p.inputFormat),
  }));
  
  registerHandler("converter:getPresets", () => ({
    presets: converter.getPresets(),
  }));
}
