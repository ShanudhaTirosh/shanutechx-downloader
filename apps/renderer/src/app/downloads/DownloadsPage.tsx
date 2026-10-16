import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  Pause,
  XCircle,
  Zap,
  HardDrive,
  FileText,
  Music,
  Video,
  Archive,
  Terminal,
  Filter,
  Clapperboard,
  Download,
  Layers,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { AddUrlBar } from "../../components/widgets/AddUrlBar";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useUiStore } from "../../stores/uiStore";
import { Button } from "../../components/ui/Button";
import { formatBytes, formatSpeed } from "../../lib/format";
import { springs, staggerContainer } from "../../lib/motion";
import type { DownloadRecord } from "@shanutechx/shared-types";

type StatusFilter = "all" | "active" | "paused" | "complete" | "queued";
type CategoryFilter = "all" | "video" | "audio" | "archive" | "document" | "software";

function getFileCategory(filename: string): CategoryFilter {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v"].includes(ext)) return "video";
  if (["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "tgz"].includes(ext)) return "archive";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub", "csv"].includes(ext)) return "document";
  if (["exe", "msi", "dmg", "apk", "deb", "rpm", "bin", "sh", "appimage"].includes(ext)) return "software";
  return "all";
}

export function DownloadsPage() {
  const { items, refresh, subscribe, pauseAll, resumeAll, cancelAll } = useDownloadsStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  useEffect(() => {
    void refresh();
    return subscribe();
  }, [refresh, subscribe]);

  const allHttpItems = Object.values(items)
    .filter((item) => (item.sourceType || "http") === "http")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Compute live statistics
  const activeItems = allHttpItems.filter((i) => i.status === "downloading" || i.status === "merging");
  const pausedItems = allHttpItems.filter((i) => i.status === "paused");
  const completedItems = allHttpItems.filter((i) => i.status === "complete");
  const queuedItems = allHttpItems.filter((i) => i.status === "queued");

  const totalSpeedBps = activeItems.reduce((acc, i) => acc + (i.speedBps || 0), 0);
  const totalDownloaded = allHttpItems.reduce((acc, i) => acc + (i.downloadedBytes || 0), 0);

  // Apply filters
  const filteredList = allHttpItems.filter((item) => {
    // Status filter
    if (statusFilter === "active" && item.status !== "downloading" && item.status !== "merging") return false;
    if (statusFilter === "paused" && item.status !== "paused") return false;
    if (statusFilter === "complete" && item.status !== "complete") return false;
    if (statusFilter === "queued" && item.status !== "queued") return false;

    // Category filter
    if (categoryFilter !== "all") {
      const cat = getFileCategory(item.filename || item.url);
      if (cat !== categoryFilter) return false;
    }

    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 pb-12">
      {/* Header and Stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="text-xl font-semibold text-zinc-100 mb-1 flex items-center gap-2"
          >
            <Download size={20} className="text-brand-primary shrink-0" />
            <span>Direct Downloads</span>
            {totalSpeedBps > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-mono animate-pulse">
                <Zap size={12} className="fill-current" /> {formatSpeed(totalSpeedBps)}
              </span>
            )}
          </motion.h1>
          <p className="text-sm text-zinc-400 flex items-center gap-2 flex-wrap">
            <span>Multi-threaded parallel downloader with stream acceleration.</span>
            <button
              type="button"
              onClick={() => setActiveTab("social")}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors underline decoration-cyan-400/30 underline-offset-2"
            >
              <Clapperboard size={12} />
              <span>Looking for YouTube or video sites? Switch to Social Grab &rarr;</span>
            </button>
          </p>
        </div>

        {/* Global Queue Controls */}
        {allHttpItems.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void resumeAll()}
              title="Resume all paused downloads"
              className="hover:text-emerald-400"
            >
              <Play size={14} /> Resume All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void pauseAll()}
              disabled={activeItems.length === 0}
              title="Pause all active downloads"
              className="hover:text-amber-400"
            >
              <Pause size={14} /> Pause All
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (confirm("Cancel and stop all active/queued transfers?")) {
                  void cancelAll();
                }
              }}
              disabled={activeItems.length === 0 && queuedItems.length === 0 && pausedItems.length === 0}
              title="Cancel all active/queued transfers"
              className="hover:text-rose-400"
            >
              <XCircle size={14} /> Cancel All
            </Button>
          </div>
        )}
      </div>

      {/* Direct Download Input Bar with Thread Selection & Batch Modal */}
      <AddUrlBar />

      {/* Filtering Toolbar */}
      {allHttpItems.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#12121e] border border-white/15 shadow-lg shadow-black/50">
              {(
                [
                  { id: "all", label: "All", count: allHttpItems.length, icon: Layers, gradient: "bg-gradient-to-r from-violet-600 to-indigo-600 shadow-[0_0_14px_rgba(124,58,237,0.45)]" },
                  { id: "active", label: "Active", count: activeItems.length, icon: Zap, gradient: "bg-gradient-to-r from-cyan-600 to-blue-600 shadow-[0_0_14px_rgba(6,182,212,0.45)]" },
                  { id: "paused", label: "Paused", count: pausedItems.length, icon: Pause, gradient: "bg-gradient-to-r from-amber-600 to-orange-600 shadow-[0_0_14px_rgba(245,158,11,0.45)]" },
                  { id: "queued", label: "Queued", count: queuedItems.length, icon: Clock, gradient: "bg-gradient-to-r from-purple-600 to-pink-600 shadow-[0_0_14px_rgba(168,85,247,0.45)]" },
                  { id: "complete", label: "Completed", count: completedItems.length, icon: CheckCircle2, gradient: "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-[0_0_14px_rgba(16,185,129,0.45)]" },
                ] as const
              ).map((f) => {
                const Icon = f.icon;
                const isSelected = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`relative text-xs px-3 py-1.5 rounded-lg transition-all focus-ring flex items-center gap-1.5 ${
                      isSelected ? "text-white font-semibold" : "text-zinc-300 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="downloads-status-pill"
                        transition={springs.gentle}
                        className={`absolute inset-0 rounded-lg -z-10 ${f.gradient}`}
                      />
                    )}
                    <Icon size={13} className={isSelected ? "text-white" : "text-zinc-400"} />
                    <span>{f.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono transition-colors ${
                        isSelected
                          ? "bg-black/30 text-white border border-white/25 font-bold shadow-inner"
                          : "bg-white/[0.08] text-zinc-300 border border-white/10"
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Subtle separator */}
            <div className="hidden sm:block h-5 w-px bg-white/15" />

            {/* Category Pills */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#12121e] border border-white/15 shadow-lg shadow-black/50 text-xs overflow-x-auto scrollbar-none">
              {(
                [
                  { id: "all" as const, label: "All Types", icon: Layers },
                  { id: "video" as const, label: "Videos", icon: Video },
                  { id: "audio" as const, label: "Audio", icon: Music },
                  { id: "archive" as const, label: "Archives", icon: Archive },
                  { id: "document" as const, label: "Docs", icon: FileText },
                  { id: "software" as const, label: "Programs", icon: Terminal },
                ]
              ).map((cat) => {
                const Icon = cat.icon;
                const isSelected = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                      isSelected
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                        : "text-zinc-300 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    <Icon size={12} className={isSelected ? "text-white" : "text-zinc-400"} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Downloads List */}
      <AnimatePresence mode="wait">
        {filteredList.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-16 text-zinc-600 glass-panel rounded-2xl p-8"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-surface-raised flex items-center justify-center text-zinc-600">
                <HardDrive size={22} />
              </div>
              <p className="text-sm font-medium text-zinc-400">
                {allHttpItems.length === 0
                  ? "No direct downloads yet"
                  : `No downloads matching current filters`}
              </p>
              <p className="text-xs text-zinc-600 max-w-sm">
                {allHttpItems.length === 0
                  ? "Paste any direct HTTP/HTTPS URL above or use Batch Add to download multiple files at once."
                  : "Try switching back to 'All' to view all your transfers."}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {filteredList.map((item) => (
                <DownloadCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
