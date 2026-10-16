import { create } from "zustand";
import type { DownloadRecord } from "@shanutechx/shared-types";
import { ipc } from "../lib/ipc-client";

interface DownloadsState {
  items: Record<string, DownloadRecord>;
  addUrl: (url: string, allowDuplicate?: boolean, saveDir?: string, segmentCount?: number) => Promise<void>;
  batchAdd: (urls: string[], saveDir?: string, segmentCount?: number) => Promise<{ added: number }>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  cancelAll: () => Promise<void>;
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

  addUrl: async (url, allowDuplicate, saveDir, segmentCount) => {
    // Lets a DUPLICATE_URL rejection from the main process (see
    // QueueManager.start / shared-types) propagate up uncaught — callers
    // (AddUrlBar) pattern-match that prefix to offer "add anyway?" and
    // retry with allowDuplicate: true, rather than this store papering
    // over it as a silent success or a generic failure.
    const { id } = await ipc.invoke("downloads:start", { url, allowDuplicate, saveDir, segmentCount });
    await get().refresh(); // pick up the "queued" row immediately, before the first progress event
    void id;
  },

  batchAdd: async (urls, saveDir, segmentCount) => {
    const res = await ipc.invoke("downloads:batchStart", { urls, saveDir, segmentCount });
    await get().refresh();
    return res;
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

  pauseAll: async () => {
    set((s) => {
      const updated = { ...s.items };
      for (const id in updated) {
        if (updated[id]?.status === "downloading") {
          updated[id] = { ...updated[id]!, status: "paused", speedBps: 0 };
        }
      }
      return { items: updated };
    });
    await ipc.invoke("downloads:pauseAll", undefined);
    await get().refresh();
  },

  resumeAll: async () => {
    await ipc.invoke("downloads:resumeAll", undefined);
    await get().refresh();
  },

  cancelAll: async () => {
    set((s) => {
      const updated = { ...s.items };
      for (const id in updated) {
        if (updated[id]?.status === "downloading" || updated[id]?.status === "queued" || updated[id]?.status === "paused") {
          updated[id] = { ...updated[id]!, status: "cancelled", speedBps: 0 };
        }
      }
      return { items: updated };
    });
    await ipc.invoke("downloads:cancelAll", undefined);
    await get().refresh();
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
