import { motion } from "framer-motion";
import { Pause, Play, X, CheckCircle2, XCircle, Loader2, FolderOpen } from "lucide-react";
import clsx from "clsx";
import type { DownloadRecord } from "@shanutechx/shared-types";
import { ProgressRing } from "../ui/ProgressRing";
import { formatBytes, formatSpeed } from "../../lib/format";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { ipc } from "../../lib/ipc-client";
import { useToast } from "../ui/Toast";
import { listItem, springs } from "../../lib/motion";

// framer-motion propagates stagger timing to children only when they opt in
// via named `variants`, so DownloadCard exposes itself as "initial" /
// "animate" / "exit" rather than taking inline animation props — this lets
// DownloadsPage's staggerContainer drive the timing when the whole list
// mounts, while a single card added later still animates in on its own.

const STATUS_LABEL: Record<DownloadRecord["status"], string> = {
  queued: "Queued", resolving: "Resolving…", downloading: "Downloading",
  paused: "Paused", merging: "Merging…", complete: "Complete", failed: "Failed", cancelled: "Cancelled",
};

export function DownloadCard({ item }: { item: DownloadRecord }) {
  const { pause, resume, cancel } = useDownloadsStore();
  const { showToast } = useToast();
  const percent = item.sizeBytes ? Math.min(100, (item.downloadedBytes / item.sizeBytes) * 100) : null;
  const isActive = item.status === "downloading" || item.status === "merging";
  const isPaused = item.status === "paused";
  const isDone = item.status === "complete" || item.status === "failed" || item.status === "cancelled";
  const isSocial = item.sourceType === "social";

  async function handleShowInFolder() {
    if (!item.filepath) return;
    const result = await ipc.invoke("app:showInFolder", { filepath: item.filepath });
    if (!result.success) showToast("Couldn't find that file — it may have been moved or deleted", "error");
  }

  // For social/yt-dlp downloads, pause and resume use the dedicated social
  // IPC channels (which kill and restart the yt-dlp process with --continue).
  // For HTTP and torrent downloads, they use the existing queue channels.
  async function handlePause() {
    if (isSocial) {
      await ipc.invoke("social:pause", { id: item.id });
    } else {
      await pause(item.id);
    }
  }

  async function handleResume() {
    if (isSocial) {
      await ipc.invoke("social:resume", { id: item.id });
    } else {
      await resume(item.id);
    }
  }

  async function handleCancel() {
    if (isSocial) {
      await ipc.invoke("social:cancel", { id: item.id });
    } else {
      await cancel(item.id);
    }
  }

  return (
    <motion.div
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ y: -2 }}
      className="glass-panel glass-panel-hover flex items-center gap-4 p-4"
    >
      <motion.div
        // A quick "arrival" pop the instant a download finishes — small,
        // physical confirmation instead of just a colour/icon swap.
        animate={item.status === "complete" ? { scale: [1, 1.12, 1] } : undefined}
        transition={springs.bouncy}
      >
        <ProgressRing percent={item.status === "merging" ? null : percent} />
      </motion.div>
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
        {item.status === "complete" && item.filepath && (
          <IconButton onClick={handleShowInFolder} title="Show in folder"><FolderOpen size={15} /></IconButton>
        )}
        {isActive && (
          <IconButton onClick={handlePause} title="Pause"><Pause size={15} /></IconButton>
        )}
        {isPaused && (
          <IconButton onClick={handleResume} title="Resume"><Play size={15} /></IconButton>
        )}
        {!isDone && (
          <IconButton onClick={handleCancel} title="Cancel" danger><X size={15} /></IconButton>
        )}
      </div>
    </motion.div>
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
    <motion.button
      onClick={onClick}
      title={title}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      transition={springs.snappy}
      className={clsx(
        "h-8 w-8 flex items-center justify-center rounded-lg focus-ring transition-colors",
        danger ? "text-zinc-500 hover:text-status-danger hover:bg-status-danger/10" : "text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover",
      )}
    >
      {children}
    </motion.button>
  );
}
