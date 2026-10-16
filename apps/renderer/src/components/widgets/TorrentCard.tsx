import { motion } from "framer-motion";
import { Pause, Play, Trash2, ArrowDown, ArrowUp, FolderOpen, Clock, Share2 } from "lucide-react";
import type { TorrentStatus } from "@shanutechx/shared-types";
import { Button } from "../ui/Button";
import { ProgressRing } from "../ui/ProgressRing";
import { formatBytes, formatSpeed, formatEta } from "../../lib/format";
import { listItem, springs } from "../../lib/motion";
import { ipc } from "../../lib/ipc-client";
import { useToast } from "../ui/Toast";

interface TorrentCardProps {
  torrent: TorrentStatus;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string) => void;
}

export function TorrentCard({ torrent: t, onPause, onResume, onRemove }: TorrentCardProps) {
  const { showToast } = useToast();
  const isSeeding = t.state === "seeding";
  const isDownloading = t.state === "downloading";
  const isPaused = t.state === "paused";

  async function handleShowInFolder() {
    if (!t.path) return;
    try {
      const result = await ipc.invoke("app:showInFolder", { filepath: t.path });
      if (!result.success) showToast("Couldn't open torrent folder", "error");
    } catch {
      showToast("Couldn't open torrent folder", "error");
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
      className="glass-panel glass-panel-hover flex flex-col p-4 gap-3 relative overflow-hidden"
    >
      <div className="flex items-center gap-4">
        <motion.div
          animate={isSeeding ? { opacity: [1, 0.65, 1] } : undefined}
          transition={isSeeding ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : undefined}
          className="shrink-0"
        >
          <ProgressRing percent={t.progress} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{t.name}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
              isSeeding
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : isDownloading
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                : isPaused
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                : "bg-surface-raised text-zinc-400 border border-white/5"
            }`}>
              {t.state.replace("_", " ")}
            </span>
            <span>{formatBytes(t.totalDownloaded)} / {formatBytes(t.totalSize)}</span>
            <span>·</span>
            <span className="inline-flex items-center text-cyan-400 font-mono">
              <ArrowDown size={11} className="mr-0.5" />
              {formatSpeed(t.downloadRateBps)}
            </span>
            {t.uploadRateBps > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center text-emerald-400 font-mono">
                  <ArrowUp size={11} className="mr-0.5" />
                  {formatSpeed(t.uploadRateBps)}
                </span>
              </>
            )}
            <span>·</span>
            <span>{t.numPeers} peers</span>
            {t.ratio !== undefined && t.ratio > 0 && (
              <>
                <span>·</span>
                <span className="text-zinc-400 font-mono">Ratio: {t.ratio}</span>
              </>
            )}
            {t.etaSec !== null && t.etaSec > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-zinc-300">
                  <Clock size={11} className="text-zinc-500" />
                  {formatEta(t.etaSec)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {t.path && (
            <Button onClick={handleShowInFolder} size="sm" variant="secondary" title="Open folder on disk">
              <FolderOpen size={15} />
            </Button>
          )}
          {isPaused ? (
            <Button onClick={() => onResume(t.infoHash)} size="sm" variant="secondary" title="Resume">
              <Play size={15} />
            </Button>
          ) : isDownloading || isSeeding ? (
            <Button onClick={() => onPause(t.infoHash)} size="sm" variant="secondary" title="Pause">
              <Pause size={15} />
            </Button>
          ) : null}
          <Button onClick={() => onRemove(t.infoHash)} size="sm" variant="secondary" title="Remove torrent">
            <motion.span whileHover={{ rotate: [0, -8, 8, -4, 0] }} transition={springs.snappy} className="inline-flex">
              <Trash2 size={15} />
            </motion.span>
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {(isDownloading || isSeeding) && (
        <div className="w-full bg-surface-raised h-1.5 rounded-full overflow-hidden relative">
          <motion.div
            className={`h-full rounded-full transition-all duration-300 ${
              isSeeding ? "bg-emerald-500" : "bg-gradient-to-r from-cyan-500 to-brand-primary"
            }`}
            style={{ width: `${t.progress}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}
