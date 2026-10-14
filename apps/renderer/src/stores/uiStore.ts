import { create } from "zustand";

export type TabId = "dashboard" | "downloads" | "social" | "torrents" | "converter" | "history" | "settings";

interface UiState {
  activeTab: TabId;
  sidebarExpanded: boolean;
  commandPaletteOpen: boolean;
  setActiveTab: (tab: TabId) => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "dashboard",
  sidebarExpanded: true,
  commandPaletteOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab === "history" ? "dashboard" : tab }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
