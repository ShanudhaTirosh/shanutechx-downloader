import type { IpcInvokeChannel, IpcInvokeMap, IpcEventChannel, IpcEventMap } from "@shanutechx/shared-types";

declare global {
  interface Window {
    shanutechx: {
      invoke: <C extends IpcInvokeChannel>(channel: C, payload: IpcInvokeMap[C]["req"]) => Promise<IpcInvokeMap[C]["res"]>;
      on: <C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void) => () => void;
    };
  }
}

export const ipc = {
  invoke: <C extends IpcInvokeChannel>(channel: C, payload: IpcInvokeMap[C]["req"]) =>
    window.shanutechx.invoke(channel, payload),
  on: <C extends IpcEventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void) =>
    window.shanutechx.on(channel, listener),
};
