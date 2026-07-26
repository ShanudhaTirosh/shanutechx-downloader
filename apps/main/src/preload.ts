import { contextBridge, ipcRenderer } from "electron";
import type { IpcInvokeChannel, IpcInvokeMap, IpcEventChannel, IpcEventMap } from "@shanutechx/shared-types";

/**
 * The renderer's ONLY door into the main process. No `fs`, `child_process`,
 * or `net` is ever exposed — every capability is a narrow, typed function.
 * This is what makes `nodeIntegration: false` + `contextIsolation: true`
 * (see window.ts) actually meaningful rather than cosmetic.
 */
const api = {
  invoke: <C extends IpcInvokeChannel>(
    channel: C,
    payload: IpcInvokeMap[C]["req"],
  ): Promise<IpcInvokeMap[C]["res"]> => ipcRenderer.invoke(channel, payload),

  on: <C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventMap[C]) => void,
  ): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcEventMap[C]) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

export type ShanutechxBridge = typeof api;

contextBridge.exposeInMainWorld("shanutechx", api);
