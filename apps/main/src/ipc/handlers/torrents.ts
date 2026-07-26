import { registerHandler } from "./index";
import type { TorrentEngine } from "../../engines/torrent-engine/torrent-engine";

export function registerTorrentHandlers(torrents: TorrentEngine): void {
  registerHandler("torrents:add", (p) => torrents.add(p.magnetOrPath, p.saveDir));
  registerHandler("torrents:list", () => torrents.list());
}
