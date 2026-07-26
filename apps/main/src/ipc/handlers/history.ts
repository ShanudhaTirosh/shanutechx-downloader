import { registerHandler } from "./index";
import { downloadsRepo } from "../../db/downloads-repo";

export function registerHistoryHandlers(): void {
  registerHandler("history:list", () => downloadsRepo.list());
  registerHandler("history:stats", () => downloadsRepo.stats());
  registerHandler("history:remove", (p) => { downloadsRepo.remove(p.id); });
}
