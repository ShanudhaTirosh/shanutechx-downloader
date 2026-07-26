import { create } from "zustand";
import type { AppSettings } from "@shanutechx/shared-types";
import { ipc } from "../lib/ipc-client";

interface SettingsState {
  settings: AppSettings | null;
  load: () => Promise<void>;
  /** Always sets `settings` from the RESPONSE, never from the request — the
   *  backend may clamp/reject a value, and the UI must reflect what actually
   *  applied (the structural fix for the old app's dead "Max Total Speed"). */
  update: (partial: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  load: async () => { set({ settings: await ipc.invoke("settings:get", undefined) }); },
  update: async (partial) => { set({ settings: await ipc.invoke("settings:set", partial) }); },
}));
