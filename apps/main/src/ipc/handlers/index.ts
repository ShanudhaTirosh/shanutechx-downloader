import { ipcMain } from "electron";
import type { IpcInvokeChannel, IpcInvokeMap } from "@shanutechx/shared-types";
import type { QueueManager } from "../../queue/queue-manager";
import type { SocialManager } from "../../engines/social-extractor/social-manager";
import { registerDownloadHandlers } from "./downloads";
import { registerSettingsHandlers } from "./settings";
import { registerAppHandlers } from "./app";
import { registerSocialHandlers } from "./social";
import { registerHistoryHandlers } from "./history";
import { registerTorrentHandlers } from "./torrents";
import { registerConverterHandlers } from "./converter";
import type { TorrentEngine } from "../../engines/torrent-engine/torrent-engine";
import type { ConverterManager } from "../../engines/converter-engine/converter-manager";

/**
 * Typed registration helper — a handler literally cannot compile if its
 * signature doesn't match the shared contract in @shanutechx/shared-types.
 * Engine modules (download-engine, social-extractor, torrent-engine,
 * converter-engine) register their handlers through this.
 */
export function registerHandler<C extends IpcInvokeChannel>(
  channel: C,
  handler: (payload: IpcInvokeMap[C]["req"]) => Promise<IpcInvokeMap[C]["res"]> | IpcInvokeMap[C]["res"],
): void {
  ipcMain.handle(channel, (_event, payload) => handler(payload));
}

export function registerAllHandlers(queue: QueueManager, social: SocialManager, torrents: TorrentEngine, converter: ConverterManager): void {
  registerDownloadHandlers(queue);
  registerSettingsHandlers();
  registerAppHandlers();
  registerSocialHandlers(social);
  registerHistoryHandlers();
  registerTorrentHandlers(torrents);
  registerConverterHandlers(converter);
}
