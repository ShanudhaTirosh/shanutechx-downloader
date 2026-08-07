import { registerHandler } from "./index";
import type { SocialManager } from "../../engines/social-extractor/social-manager";

export function registerSocialHandlers(social: SocialManager): void {
  registerHandler("social:extract", (p) => social.extract(p.url));
  registerHandler("social:download", (p) => social.start(p.url, p.format));
  registerHandler("social:pause", (p) => { social.pause(p.id); });
  registerHandler("social:resume", (p) => { social.resume(p.id); });
  registerHandler("social:cancel", (p) => { social.cancel(p.id); });
  // Scheduler: add a social download that starts at a specific time
  registerHandler("social:scheduleNew", (p) => social.scheduleNew(p.url, p.format, p.scheduledFor));
}
