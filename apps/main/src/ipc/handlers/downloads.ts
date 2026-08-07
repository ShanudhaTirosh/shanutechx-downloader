import { registerHandler } from "./index";
import type { QueueManager } from "../../queue/queue-manager";

export function registerDownloadHandlers(queue: QueueManager): void {
  registerHandler("downloads:start", (p) => queue.start(p.url, p.saveDir, p.allowDuplicate));
  registerHandler("downloads:pause", (p) => { queue.pause(p.id); });
  registerHandler("downloads:resume", (p) => { queue.resume(p.id); });
  registerHandler("downloads:cancel", (p) => { queue.cancel(p.id); });
  registerHandler("downloads:list", () => queue.list());
}
