import { Minus, Square, X, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ipc } from "../../lib/ipc-client";
import { springs } from "../../lib/motion";

/**
 * Custom title bar for the frameless BrowserWindow (see apps/main/src/window.ts).
 * Implements minimize, maximize/restore, and close controls via IPC channels.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    // Detect platform
    ipc.invoke("app:getPlatform", undefined)
      .then((res) => setIsWindows(res.platform === "win32"))
      .catch(() => {
        setIsWindows(navigator.userAgent.includes("Windows"));
      });

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
      onDoubleClick={handleMaximize}
      className="h-10 flex items-center justify-between pl-4 pr-0 select-none border-b border-surface-border bg-[#0a0a0f] relative z-50"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-brand-gradient shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
        <span className="text-xs font-semibold tracking-wide text-zinc-300">SHANUTECHX Downloader</span>
      </div>

      {/* Window Controls (Minimize, Maximize / Restore, Close) */}
      <div className="flex items-center h-full ml-auto" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Minimize Button */}
        <button
          type="button"
          onClick={handleMinimize}
          className="h-full w-[46px] flex items-center justify-center text-zinc-400 hover:bg-white/10 hover:text-zinc-100 active:bg-white/15 transition-colors focus:outline-none"
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="11" height="1" viewBox="0 0 11 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="11" height="1" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize / Restore Button */}
        <button
          type="button"
          onClick={handleMaximize}
          className="h-full w-[46px] flex items-center justify-center text-zinc-400 hover:bg-white/10 hover:text-zinc-100 active:bg-white/15 transition-colors focus:outline-none"
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            // Two overlapping boxes (restore glyph from reference image)
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.5 8.5H0.5V0.5H8.5V2.5" stroke="currentColor" strokeWidth="1" />
              <rect x="2.5" y="2.5" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="#0a0a0f" />
            </svg>
          ) : (
            // Single box (maximize glyph from reference image)
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="h-full w-[46px] flex items-center justify-center text-zinc-400 hover:bg-[#e81123] hover:text-white active:bg-[#c4101e] transition-colors focus:outline-none"
          title="Close"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

