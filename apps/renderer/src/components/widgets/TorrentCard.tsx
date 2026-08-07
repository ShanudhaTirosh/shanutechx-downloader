import { motion } from "framer-motion";
import { Pause, Play, Trash2 } from "lucide-react";
import type { TorrentStatus } from "@shanutechx/shared-types";
import { Button } from "../ui/Button";
import { ProgressRing } from "../ui/ProgressRing";
import { formatBytes, formatSpeed } from "../../lib/format";
import { listItem, springs } from "../../lib/motion";

interface TorrentCardProps {
  torrent: TorrentStatus;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string) => void;
}

export function TorrentCard({ torrent: t, onPause, onResume, onRemove }: TorrentCardProps) {
  const isSeeding = t.state === "seeding";

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
        // A slow, subtle breathing pulse while a torrent is uploading to
        // peers post-download — distinguishes "still active" (seeding) from
        // "genuinely idle" at a glance, without any extra text.
        animate={isSeeding ? { opacity: [1, 0.55, 1] } : undefined}
        transition={isSeeding ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
        <ProgressRing percent={t.progress} />
      </motion.div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{t.name}</p>
        <p className="text-xs text-zinc-500 mt-1">
          {formatBytes(t.totalDownloaded)} / {formatBytes(t.totalSize)} · {formatSpeed(t.downloadRateBps)} ↓ · {t.numPeers} peers · {t.state}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {t.state === "paused" ? (
          <Button onClick={() => onResume(t.infoHash)} size="sm" variant="secondary" title="Resume">
            <Play size={16} />
          </Button>
        ) : t.state === "downloading" || t.state === "seeding" ? (
          <Button onClick={() => onPause(t.infoHash)} size="sm" variant="secondary" title="Pause">
            <Pause size={16} />
          </Button>
        ) : null}
        <Button onClick={() => onRemove(t.infoHash)} size="sm" variant="secondary" title="Remove">
          <motion.span whileHover={{ rotate: [0, -8, 8, -4, 0] }} transition={springs.snappy} className="inline-flex">
            <Trash2 size={16} />
          </motion.span>
        </Button>
      </div>
    </motion.div>
  );
}
