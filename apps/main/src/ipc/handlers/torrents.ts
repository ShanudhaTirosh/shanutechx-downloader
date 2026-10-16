import { registerHandler } from "./index";
import type { TorrentEngine } from "../../engines/torrent-engine/torrent-engine";

export function registerTorrentHandlers(torrents: TorrentEngine): void {
  registerHandler("torrents:add", async (p) => {
    try {
      return await torrents.add(p.magnetOrPath, p.saveDir);
    } catch (error) {
      throw new Error(`Failed to add torrent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
  
  registerHandler("torrents:list", () => torrents.list());
  
  registerHandler("torrents:pause", (p) => {
    torrents.pause(p.infoHash);
    return { success: true };
  });
  
  registerHandler("torrents:resume", (p) => {
    torrents.resume(p.infoHash);
    return { success: true };
  });
  
  registerHandler("torrents:remove", (p) => {
    torrents.remove(p.infoHash);
    return { success: true };
  });

  registerHandler("torrents:pauseAll", () => torrents.pauseAll());
  registerHandler("torrents:resumeAll", () => torrents.resumeAll());
}
