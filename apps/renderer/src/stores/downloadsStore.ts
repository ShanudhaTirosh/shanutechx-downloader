import { create } from "zustand";
import type { DownloadRecord } from "@shanutechx/shared-types";
import { ipc } from "../lib/ipc-client";

interface DownloadsState {
  items: Record<string, DownloadRecord>;
  addUrl: (url: string, allowDuplicate?: boolean, saveDir?: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  subscribe: () => () => void;
}

/**
 * The renderer's ONLY copy of download state — always overwritten by what
 * main broadcasts (`download:progress` / `download:status`), never mutated
 * speculatively. This is what makes "stale UI card" bugs structurally
 * impossible, unlike an app that optimistically updates local state.
 */
export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: {},

  addUrl: async (url, allowDuplicate, saveDir) => {
    // Lets a DUPLICATE_URL rejection from the main process (see
    // QueueManager.start / shared-types) propagate up uncaught — callers
    // (AddUrlBar) pattern-match that prefix to offer "add anyway?" and
    // retry with allowDuplicate: true, rather than this store papering
    // over it as a silent success or a generic failure.
    const { id } = await ipc.invoke("downloads:start", { url, allowDuplicate, saveDir });
    await get().refresh(); // pick up the "queued" row immediately, before the first progress event
    void id;
  },

  pause: async (id) => {
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      return { items: { ...s.items, [id]: { ...existing, status: "paused", speedBps: 0 } } };
    });
    await ipc.invoke("downloads:pause", { id });
  },
  resume: async (id) => {
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      return { items: { ...s.items, [id]: { ...existing, status: "downloading" } } };
    });
    await ipc.invoke("downloads:resume", { id });
  },
  cancel: async (id) => {
    set((s) => {
      const existing = s.items[id];
      if (!existing) return s;
      return { items: { ...s.items, [id]: { ...existing, status: "cancelled", speedBps: 0 } } };
    });
    await ipc.invoke("downloads:cancel", { id });
  },

  refresh: async () => {
    const list = await ipc.invoke("downloads:list", undefined);
    set({ items: Object.fromEntries(list.map((d) => [d.id, d])) });
  },

  subscribe: () => {
    const offProgress = ipc.on("download:progress", (p) => {
      set((s) => {
        const existing = s.items[p.id];
        if (!existing) return s;
        return {
          items: {
            ...s.items,
            [p.id]: {
              ...existing,
              downloadedBytes: p.downloadedBytes,
              sizeBytes: p.totalBytes,
              speedBps: p.speedBps,
              etaSec: p.etaSec ?? existing.etaSec,
            },
          },
        };
      });
    });
    const offStatus = ipc.on("download:status", (p) => {
      set((s) => {
        const existing = s.items[p.id];
        if (!existing) return s;
        return { items: { ...s.items, [p.id]: { ...existing, status: p.status, errorMessage: p.errorMessage ?? null } } };
      });
      if (p.status === "complete" || p.status === "failed") void get().refresh(); // pick up final size/avgSpeed/filepath from DB
    });
    return () => { offProgress(); offStatus(); };
  },
}));
