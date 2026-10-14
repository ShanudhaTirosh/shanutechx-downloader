import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Pause, Play, X, CheckCircle2, XCircle, Loader2, FolderOpen, Clock } from "lucide-react";
import clsx from "clsx";
import type { DownloadRecord } from "@shanutechx/shared-types";
import { ProgressRing } from "../ui/ProgressRing";
import { formatBytes, formatSpeed, formatEta } from "../../lib/format";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { ipc } from "../../lib/ipc-client";
import { useToast } from "../ui/Toast";
import { listItem, springs } from "../../lib/motion";

const STATUS_LABEL: Record<DownloadRecord["status"], string> = {
  queued: "Queued", resolving: "Resolving…", downloading: "Downloading",
  paused: "Paused", merging: "Merging…", complete: "Complete", failed: "Failed", cancelled: "Cancelled",
};

/** Human-readable relative countdown: "in 3 h 22 min", "in 45 min", "Starting soon…" */
function useCountdown(scheduledFor: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!scheduledFor) { setLabel(null); return; }

    function update() {
      const diffMs = new Date(scheduledFor!).getTime() - Date.now();
      if (diffMs <= 0) { setLabel("Starting soon…"); return; }
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      if (hours > 0) setLabel(`in ${hours} h ${mins} min`);
      else if (mins > 0) setLabel(`in ${mins} min`);
      else setLabel("Starting soon…");
    }

    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [scheduledFor]);

  return label;
}

export function DownloadCard({ item }: { item: DownloadRecord }) {
  const { pause, resume, cancel } = useDownloadsStore();
  const { showToast } = useToast();
  const percent = item.sizeBytes ? Math.min(100, (item.downloadedBytes / item.sizeBytes) * 100) : null;
  const isActive = item.status === "downloading" || item.status === "merging";
  const isPaused = item.status === "paused";
  const isDone = item.status === "complete" || item.status === "failed" || item.status === "cancelled";
  const isSocial = item.sourceType === "social";
  const isScheduled = item.status === "queued" && !!item.scheduledFor;
  const countdown = useCountdown(item.scheduledFor ?? null);

  async function handleShowInFolder() {
    if (!item.filepath) return;
    const result = await ipc.invoke("app:showInFolder", { filepath: item.filepath });
    if (!result.success) showToast("Couldn't find that file — it may have been moved or deleted", "error");
  }

  async function handlePause() {
    if (isSocial) { await ipc.invoke("social:pause", { id: item.id }); }
    else { await pause(item.id); }
  }

  async function handleResume() {
    if (isSocial) { await ipc.invoke("social:resume", { id: item.id }); }
    else { await resume(item.id); }
  }

  async function handleCancel() {
    if (isSocial) { await ipc.invoke("social:cancel", { id: item.id }); }
    else { await cancel(item.id); }
  }

  /** Clear schedule and start the download now */
  async function handleStartNow() {
    await ipc.invoke("downloads:schedule", { id: item.id, scheduledFor: null });
  }

  return (
    <motion.div
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ y: -2 }}
      className={clsx(
        "glass-panel glass-panel-hover flex flex-col p-4 gap-3 relative overflow-hidden group",
        isScheduled && "border-brand-secondary/40",
        isActive && "border-brand-primary/30 shadow-[0_0_20px_rgba(99,102,241,0.08)]",
      )}
    >
      <div className="flex items-center gap-4">
        <motion.div
          animate={item.status === "complete" ? { scale: [1, 1.12, 1] } : undefined}
          transition={springs.bouncy}
          className="shrink-0"
        >
          <ProgressRing percent={item.status === "merging" ? null : percent} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{item.filename || item.url}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 flex-wrap">
            {isScheduled ? (
              <>
                <span className="inline-flex items-center gap-1 text-brand-secondary">
                  <Clock size={11} /> Scheduled
                </span>
                {countdown && <span>· {countdown}</span>}
                {item.scheduledFor && (
                  <span className="text-zinc-600">
                    · {new Date(item.scheduledFor).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </>
            ) : (
              <>
                <StatusBadge status={item.status} />
                <span>{formatBytes(item.downloadedBytes)} / {formatBytes(item.sizeBytes)}</span>
                {isActive && (
                  <>
                    <span className="text-zinc-300 font-medium">· {formatSpeed(item.speedBps)}</span>
                    {item.etaSec !== undefined && item.etaSec !== null && item.etaSec > 0 && (
                      <span className="inline-flex items-center gap-1 text-cyan-400">
                        <Clock size={11} /> {formatEta(item.etaSec)}
                      </span>
                    )}
                  </>
                )}
                {item.errorMessage && <span className="text-status-danger truncate">· {item.errorMessage}</span>}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.status === "complete" && item.filepath && (
            <IconButton onClick={handleShowInFolder} title="Show in folder"><FolderOpen size={15} /></IconButton>
          )}
          {/* Scheduled: show "Start Now" and Cancel */}
          {isScheduled && (
            <>
              <IconButton onClick={handleStartNow} title="Start now">
                <Play size={15} />
              </IconButton>
              <IconButton onClick={handleCancel} title="Cancel" danger><X size={15} /></IconButton>
            </>
          )}
          {/* Active: pause */}
          {isActive && (
            <IconButton onClick={handlePause} title="Pause"><Pause size={15} /></IconButton>
          )}
          {/* Paused (not scheduled): resume */}
          {isPaused && !isScheduled && (
            <IconButton onClick={handleResume} title="Resume"><Play size={15} /></IconButton>
          )}
          {/* Queued (not scheduled): cancel */}
          {!isDone && !isScheduled && item.status === "queued" && (
            <IconButton onClick={handleCancel} title="Cancel" danger><X size={15} /></IconButton>
          )}
          {/* Active: cancel too */}
          {(isActive || isPaused) && (
            <IconButton onClick={handleCancel} title="Cancel" danger><X size={15} /></IconButton>
          )}
        </div>
      </div>

      {/* Motion Progress Bar for active or paused downloads */}
      {(isActive || isPaused) && (
        <div className="w-full bg-surface-raised h-1.5 rounded-full overflow-hidden relative">
          <motion.div
            className={clsx(
              "h-full rounded-full transition-all duration-300",
              isPaused
                ? "bg-zinc-600"
                : "bg-gradient-to-r from-brand-primary via-brand-secondary to-cyan-400",
            )}
            style={{ width: `${percent ?? (item.status === "merging" ? 100 : 0)}%` }}
          />
          {isActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: DownloadRecord["status"] }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-status-success font-medium">
        <CheckCircle2 size={12} />
        Complete
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-status-danger font-medium">
        <XCircle size={12} />
        Failed
      </span>
    );
  }
  if (status === "downloading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Downloading
      </span>
    );
  }
  if (status === "merging") {
    return (
      <span className="inline-flex items-center gap-1 text-brand-secondary font-medium">
        <Loader2 size={12} className="animate-spin" />
        Merging…
      </span>
    );
  }
  return <span className="inline-flex items-center gap-1">{STATUS_LABEL[status]}</span>;
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
