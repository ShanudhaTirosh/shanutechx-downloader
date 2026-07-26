import { Minus, Square, X } from "lucide-react";

/**
 * Custom title bar for the frameless BrowserWindow (see apps/main/src/window.ts).
 * Wire the three buttons to IPC window controls in Phase 0.5 (win.minimize()/
 * maximize()/close() via a small "window:*" IPC channel — omitted from the
 * shared IPC contract here since it's UI chrome, not app data).
 */
export function TitleBar() {
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
        {[Minus, Square, X].map((Icon, i) => (
          <button
            key={i}
            className="h-7 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:bg-surface-raised-hover hover:text-zinc-100 focus-ring"
          >
            <Icon size={13} />
          </button>
        ))}
      </div>
    </div>
  );
}
