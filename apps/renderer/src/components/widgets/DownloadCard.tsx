import { Pause, Play, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { DownloadRecord } from "@shanutechx/shared-types";
import { ProgressRing } from "../ui/ProgressRing";
import { formatBytes, formatSpeed } from "../../lib/format";
import { useDownloadsStore } from "../../stores/downloadsStore";

const STATUS_LABEL: Record<DownloadRecord["status"], string> = {
  queued: "Queued", resolving: "Resolving…", downloading: "Downloading",
  paused: "Paused", merging: "Merging…", complete: "Complete", failed: "Failed", cancelled: "Cancelled",
};

export function DownloadCard({ item }: { item: DownloadRecord }) {
  const { pause, resume, cancel } = useDownloadsStore();
  const percent = item.sizeBytes ? Math.min(100, (item.downloadedBytes / item.sizeBytes) * 100) : null;
  const isActive = item.status === "downloading" || item.status === "merging";
  const isPaused = item.status === "paused";
  const isDone = item.status === "complete" || item.status === "failed" || item.status === "cancelled";

  return (
    <div className="glass-panel glass-panel-hover flex items-center gap-4 p-4">
      <ProgressRing percent={item.status === "merging" ? null : percent} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{item.filename || item.url}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
          <StatusBadge status={item.status} />
          <span>{formatBytes(item.downloadedBytes)} / {formatBytes(item.sizeBytes)}</span>
          {isActive && <span>· {formatSpeed(item.speedBps)}</span>}
          {item.errorMessage && <span className="text-status-danger truncate">· {item.errorMessage}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isActive && (
          <IconButton onClick={() => pause(item.id)} title="Pause"><Pause size={15} /></IconButton>
        )}
        {isPaused && (
          <IconButton onClick={() => resume(item.id)} title="Resume"><Play size={15} /></IconButton>
        )}
        {!isDone && (
          <IconButton onClick={() => cancel(item.id)} title="Cancel" danger><X size={15} /></IconButton>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DownloadRecord["status"] }) {
  const icon = status === "complete" ? <CheckCircle2 size={12} className="text-status-success" />
    : status === "failed" ? <XCircle size={12} className="text-status-danger" />
    : (status === "downloading" || status === "merging") ? <Loader2 size={12} className="animate-spin text-brand-secondary" />
    : null;
  return <span className="inline-flex items-center gap-1">{icon}{STATUS_LABEL[status]}</span>;
}

function IconButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "h-8 w-8 flex items-center justify-center rounded-lg focus-ring transition-colors",
        danger ? "text-zinc-500 hover:text-status-danger hover:bg-status-danger/10" : "text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover",
      )}
    >
      {children}
    </button>
  );
}
