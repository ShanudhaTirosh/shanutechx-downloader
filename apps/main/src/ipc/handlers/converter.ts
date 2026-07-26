import { registerHandler } from "./index";
import type { ConverterManager } from "../../engines/converter-engine/converter-manager";

export function registerConverterHandlers(converter: ConverterManager): void {
  registerHandler("converter:convert", (p) => converter.convert(p.inputPath, p.kind));
}
