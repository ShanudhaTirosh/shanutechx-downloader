import { registerHandler } from "./index";
import type { QueueManager } from "../../queue/queue-manager";

export function registerDownloadHandlers(queue: QueueManager): void {
  registerHandler("downloads:start", (p) => queue.start(p.url, p.saveDir, p.allowDuplicate, p.segmentCount));
  registerHandler("downloads:batchStart", (p) => queue.batchStart(p.urls, p.saveDir, p.segmentCount));
  registerHandler("downloads:pause", (p) => { queue.pause(p.id); });
  registerHandler("downloads:resume", (p) => { queue.resume(p.id); });
  registerHandler("downloads:cancel", (p) => { queue.cancel(p.id); });
  registerHandler("downloads:pauseAll", () => { queue.pauseAll(); });
  registerHandler("downloads:resumeAll", () => { queue.resumeAll(); });
  registerHandler("downloads:cancelAll", () => { queue.cancelAll(); });
  registerHandler("downloads:list", () => queue.list());
  // Scheduler — add a new download that starts at a specific time
  registerHandler("downloads:scheduleNew", (p) => queue.scheduleNew(p.url, p.scheduledFor, p.allowDuplicate));
  // Reschedule or clear the schedule on an existing queued download
  registerHandler("downloads:schedule", (p) => { queue.setSchedule(p.id, p.scheduledFor); });
}
