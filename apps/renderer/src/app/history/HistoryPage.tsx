import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, XSquare, Trash2, History, Trash, FolderOpen, HardDrive, Play } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { formatBytes } from "../../lib/format";
import { listItem, springs, staggerContainer } from "../../lib/motion";
import type { DownloadRecord } from "@shanutechx/shared-types";

type Filter = "all" | "complete" | "failed" | "cancelled";
type SourceFilter = "all" | "http" | "social" | "torrent";

export function HistoryPage() {
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [stats, setStats] = useState<{ totalCompleted: number; totalFailed: number; totalBytesDownloaded: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        ipc.invoke("history:list", undefined),
        ipc.invoke("history:stats", undefined),
      ]);
      setItems(list);
      setStats(s);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleRemove(id: string) {
    await ipc.invoke("history:remove", { id });
    setItems((prev) => prev.filter((i) => i.id !== id));
    void ipc.invoke("history:stats", undefined).then(setStats);
  }

  async function handleClearAll(status?: "complete" | "failed" | "cancelled") {
    const toRemove = status ? items.filter((i) => i.status === status) : items;
    if (toRemove.length === 0) {
      showToast("No items to clear", "info");
      return;
    }

    const confirmed = confirm(
      `Clear ${toRemove.length} ${status ? status : "all"} items from history?`
    );
    if (!confirmed) return;

    for (const item of toRemove) {
      await ipc.invoke("history:remove", { id: item.id });
    }
    
    setItems((prev) => prev.filter((i) => !toRemove.includes(i)));
    void ipc.invoke("history:stats", undefined).then(setStats);
    showToast(`Cleared ${toRemove.length} items from history`, "success");
  }

  const filtered = items.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (sourceFilter !== "all" && (i.sourceType || "http") !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 pb-10">
      <div className="flex items-end justify-between mb-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="text-xl font-semibold text-zinc-100 mb-1"
          >
            History
          </motion.h1>
          <p className="text-sm text-zinc-500">Completed, failed, and cancelled transfers.</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                const res = await ipc.invoke("history:export", undefined);
                const blob = new Blob([res.json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `shanutechx-history-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                showToast(`Exported ${res.count} history records to JSON`, "success");
              } catch {
                showToast("Failed to export history", "error");
              }
            }}
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const res = await ipc.invoke("history:import", { json: text });
                  if (res.success) {
                    showToast(`Imported ${res.imported} history records`, "success");
                    await load();
                  } else {
                    showToast("Invalid history file format", "error");
                  }
                } catch {
                  showToast("Failed to import history", "error");
                }
              };
              input.click();
            }}
          >
            Import JSON
          </Button>
          {items.length > 0 && (
            <>
              {filter !== "all" && (
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => handleClearAll(filter as "complete" | "failed" | "cancelled")}
                >
                  <Trash size={14} /> Clear {filter}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => handleClearAll()}>
                <Trash size={14} /> Clear all
              </Button>
            </>
          )}
        </div>
      </div>

      {/* History Metrics & Statistics */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass-panel p-3.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-status-success/10 flex items-center justify-center text-status-success shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Completed</p>
              <p className="text-base font-semibold text-zinc-100">{stats.totalCompleted}</p>
            </div>
          </div>
          <div className="glass-panel p-3.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-status-danger/10 flex items-center justify-center text-status-danger shrink-0">
              <XCircle size={18} />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Failed</p>
              <p className="text-base font-semibold text-zinc-100">{stats.totalFailed}</p>
            </div>
          </div>
          <div className="glass-panel p-3.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-secondary/10 flex items-center justify-center text-brand-secondary shrink-0">
              <HardDrive size={18} />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Downloaded</p>
              <p className="text-base font-semibold text-zinc-100">{formatBytes(stats.totalBytesDownloaded)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter controls: Status and Source */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-raised/40 border border-border-subtle">
          {(["all", "complete", "failed", "cancelled"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative text-xs px-3 py-1.5 rounded-lg capitalize transition-colors focus-ring ${
                filter === f ? "text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {filter === f && (
                <motion.span
                  layoutId="history-status-pill"
                  transition={springs.gentle}
                  className="absolute inset-0 bg-brand-gradient rounded-lg -z-10"
                />
              )}
              {f} ({f === "all" ? items.length : items.filter(i => i.status === f).length})
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-raised/40 border border-border-subtle">
          {(
            [
              { id: "all", label: "All Sources" },
              { id: "http", label: "Direct" },
              { id: "social", label: "Social Grab" },
              { id: "torrent", label: "Torrents" },
            ] as const
          ).map((sf) => (
            <button
              key={sf.id}
              onClick={() => setSourceFilter(sf.id)}
              className={`relative text-xs px-3 py-1.5 rounded-lg transition-colors focus-ring ${
                sourceFilter === sf.id ? "text-white font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {sourceFilter === sf.id && (
                <motion.span
                  layoutId="history-source-pill"
                  transition={springs.gentle}
                  className="absolute inset-0 bg-white/10 rounded-lg -z-10 border border-white/15"
                />
              )}
              {sf.label} ({sf.id === "all" ? items.length : items.filter(i => (i.sourceType || "http") === sf.id).length})
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.p key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-zinc-600 text-center py-16">
            Loading…
          </motion.p>
        ) : filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="text-center py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-surface-raised flex items-center justify-center text-zinc-600">
                  <History size={20} />
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-1">
                    {filter === "all" ? "No history yet" : `No ${filter} downloads`}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {filter === "all" 
                      ? "Your completed and failed downloads will appear here"
                      : `Switch to "all" to see your full history`
                    }
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key={filter} variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((item) => <HistoryRow key={item.id} item={item} onRemove={() => handleRemove(item.id)} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryRow({ item, onRemove }: { item: DownloadRecord; onRemove: () => void }) {
  const { showToast } = useToast();
  const Icon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : XSquare;
  const iconColor = item.status === "complete" ? "text-status-success" : item.status === "failed" ? "text-status-danger" : "text-zinc-500";

  async function handleShowInFolder() {
    if (!item.filepath) return;
    const result = await ipc.invoke("app:showInFolder", { filepath: item.filepath });
    if (!result.success) showToast("Couldn't find that file — it may have been moved or deleted", "error");
  }

  async function handleOpenFile() {
    if (!item.filepath) return;
    const result = await ipc.invoke("app:openFile", { filepath: item.filepath });
    if (!result.success) showToast("Couldn't find that file — it may have been moved or deleted", "error");
  }

  return (
    <motion.div
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ y: -1 }}
      onDoubleClick={item.status === "complete" ? handleOpenFile : undefined}
      className="glass-panel glass-panel-hover flex items-center gap-3 px-4 py-3 select-none cursor-default"
    >
      <Icon size={16} className={`shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-zinc-200 truncate">{item.filename || item.url}</p>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
              item.sourceType === "social"
                ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/20"
                : item.sourceType === "torrent"
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
            }`}
          >
            {item.sourceType === "social" ? (item.platform ? `${item.platform}` : "Social") : item.sourceType === "torrent" ? "Torrent" : "Direct"}
          </span>
          {item.quality && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-surface-raised text-zinc-400 border border-border-subtle">
              {item.quality}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          {formatBytes(item.sizeBytes)}
          {item.avgSpeedBps ? ` · avg ${formatBytes(item.avgSpeedBps)}/s` : ""}
          {" · "}{new Date(item.createdAt).toLocaleString()}
          {item.errorMessage ? ` · ${item.errorMessage}` : ""}
        </p>
      </div>
      {item.status === "complete" && item.filepath && (
        <div className="flex items-center gap-1">
          <motion.button
            onClick={handleOpenFile}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            transition={springs.snappy}
            title="Open file / Play media"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-surface-raised-hover focus-ring transition-colors"
          >
            <Play size={14} />
          </motion.button>
          <motion.button
            onClick={handleShowInFolder}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            transition={springs.snappy}
            title="Show in folder"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-200 hover:bg-surface-raised-hover focus-ring transition-colors"
          >
            <FolderOpen size={14} />
          </motion.button>
        </div>
      )}
      <motion.button
        onClick={onRemove}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        transition={springs.snappy}
        title="Remove from history"
        className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-status-danger hover:bg-status-danger/10 focus-ring transition-colors"
      >
        <Trash2 size={14} />
      </motion.button>
    </motion.div>
  );
}
