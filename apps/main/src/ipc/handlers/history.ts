import { registerHandler } from "./index";
import { downloadsRepo } from "../../db/downloads-repo";

export function registerHistoryHandlers(): void {
  registerHandler("history:list", () => downloadsRepo.list());
  registerHandler("history:stats", () => downloadsRepo.stats());
  registerHandler("history:remove", (p) => { downloadsRepo.remove(p.id); });
  registerHandler("history:clear", () => { downloadsRepo.clearAll(); });
  registerHandler("history:export", () => {
    const list = downloadsRepo.list();
    return {
      json: JSON.stringify(list, null, 2),
      count: list.length,
    };
  });
  registerHandler("history:import", (p) => {
    try {
      const records = JSON.parse(p.json);
      if (Array.isArray(records)) {
        const imported = downloadsRepo.importRecords(records);
        return { imported, success: true };
      }
      return { imported: 0, success: false };
    } catch {
      return { imported: 0, success: false };
    }
  });
}
