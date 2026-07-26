import { Minus, Square, X, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc-client";

/**
 * Custom title bar for the frameless BrowserWindow (see apps/main/src/window.ts).
 * Implements minimize, maximize/restore, and close controls via IPC channels.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Get initial maximized state
    ipc.invoke("app:isMaximized", undefined).then((result) => setIsMaximized(result.maximized));

    // Listen for maximize state changes
    const unsubscribe = ipc.on("window:maximized-change", (data) => {
      setIsMaximized(data.maximized);
    });

    return unsubscribe;
  }, []);

  const handleMinimize = () => {
    ipc.invoke("app:minimize", undefined);
  };

  const handleMaximize = () => {
    if (isMaximized) {
      ipc.invoke("app:unmaximize", undefined);
    } else {
      ipc.invoke("app:maximize", undefined);
    }
  };

  const handleClose = () => {
    ipc.invoke("app:close", undefined);
  };

  return (
    <div
      className="h-10 flex items-center justify-between pl-4 pr-2 select-none border-b border-surface-border"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-brand-gradient" />
        <span className="text-xs font-semibold tracking-wide text-zinc-300">SHANUTECHX Downloader</span>
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="h-7 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:bg-surface-raised-hover hover:text-zinc-100 focus-ring transition-colors"
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-7 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:bg-surface-raised-hover hover:text-zinc-100 focus-ring transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 size={13} /> : <Square size={13} />}
        </button>
        <button
          onClick={handleClose}
          className="h-7 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:bg-red-600 hover:text-white focus-ring transition-colors"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

