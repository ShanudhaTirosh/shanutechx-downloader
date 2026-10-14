import { useEffect, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { 
  Download, CheckCircle2, XCircle, XSquare, Gauge, Plus, Link2, 
  History, Trash, Trash2, FolderOpen, HardDrive, Search 
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useUiStore } from "../../stores/uiStore";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { formatBytes } from "../../lib/format";
import { listItem, springs, staggerContainer } from "../../lib/motion";
import type { DownloadRecord } from "@shanutechx/shared-types";

type HistoryFilter = "all" | "complete" | "failed" | "cancelled";

interface StatsData {
  totalCompleted: number;
  totalFailed: number;
  totalBytesDownloaded: number;
}

export function DashboardPage() {
  const { items, refresh, subscribe } = useDownloadsStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const { showToast } = useToast();

  const [historyItems, setHistoryItems] = useState<DownloadRecord[]>([]);
  const [stats, setStats] = useState<StatsData>({ totalCompleted: 0, totalFailed: 0, totalBytesDownloaded: 0 });
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistoryAndStats = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        ipc.invoke("history:list", undefined).catch(() => [] as DownloadRecord[]),
        ipc.invoke("history:stats", undefined).catch(() => ({ totalCompleted: 0, totalFailed: 0, totalBytesDownloaded: 0 })),
      ]);
      setHistoryItems(Array.isArray(list) ? list : []);
      if (s && typeof s.totalCompleted === "number") {
        setStats(s);
      }
    } catch (err) {
      console.error("Failed to load history and stats:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {});
    void loadHistoryAndStats();
    const unsub = subscribe();
    return unsub;
  }, [refresh, subscribe, loadHistoryAndStats]);

  const list = Object.values(items || {});
  const active = list.filter((d) => d && (d.status === "downloading" || d.status === "merging"));

  async function handleRemoveHistory(id: string) {
    try {
      await ipc.invoke("history:remove", { id });
      setHistoryItems((prev) => prev.filter((i) => i.id !== id));
      const s = await ipc.invoke("history:stats", undefined).catch(() => null);
      if (s) setStats(s);
    } catch {
      showToast("Failed to remove item", "error");
    }
  }

  async function handleClearHistory(status?: "complete" | "failed" | "cancelled") {
    const toRemove = status ? historyItems.filter((i) => i.status === status) : historyItems;
    if (toRemove.length === 0) {
      showToast("No items to clear", "info");
      return;
    }

    const confirmed = confirm(`Clear ${toRemove.length} ${status ? status : "all"} items from history?`);
    if (!confirmed) return;

    for (const item of toRemove) {
      await ipc.invoke("history:remove", { id: item.id }).catch(() => {});
    }

    setHistoryItems((prev) => prev.filter((i) => !toRemove.includes(i)));
    const s = await ipc.invoke("history:stats", undefined).catch(() => null);
    if (s) setStats(s);
    showToast(`Cleared ${toRemove.length} items from history`, "success");
  }

  const filteredHistory = useMemo(() => {
    const safeItems = Array.isArray(historyItems) ? historyItems : [];
    return safeItems.filter((i) => {
      if (!i) return false;
      const matchesFilter = filter === "all" ? true : i.status === filter;
      const filename = (i.filename || "").toLowerCase();
      const url = (i.url || "").toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = query ? (filename.includes(query) || url.includes(query)) : true;
      return matchesFilter && matchesSearch;
    });
  }, [historyItems, filter, searchQuery]);

  return (
    <div className="max-w-5xl space-y-7">
      {/* Header */}
      <div>
        <motion.h1
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.gentle}
          className="text-xl font-semibold text-zinc-100 mb-1"
        >
          Dashboard & History
        </motion.h1>
        <p className="text-sm text-zinc-500">Live transfers, aggregate throughput, and complete history ledger.</p>
      </div>

      {/* Metrics Overview Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          icon={Gauge}
          label="Active Transfers"
          value={active.length}
          tone={active.length > 0 ? "active" : undefined}
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={stats.totalCompleted}
          tone="success"
        />
        <StatCard
          icon={XCircle}
          label="Failed / Cancelled"
          value={stats.totalFailed}
          tone="danger"
        />
        <StatCard
          icon={HardDrive}
          label="Total Downloaded"
          valueString={formatBytes(stats.totalBytesDownloaded)}
          tone="brand"
        />
      </div>

      {/* Active Transfers Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Active Transfers</h2>
            {active.length > 0 && (
              <span className="text-xs text-brand-secondary bg-brand-secondary/10 px-2 py-0.5 rounded-full border border-brand-secondary/20">
                {active.length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setActiveTab("downloads")}>
              <Plus size={14} /> Direct Download
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setActiveTab("social")}>
              <Link2 size={14} /> Social Grab
            </Button>
          </div>
        </div>

        {active.length === 0 ? (
          <Card className="text-center py-8 bg-surface-base/40 border-dashed">
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-zinc-400 font-medium">No active downloads running</p>
              <p className="text-[11px] text-zinc-600">Start a download from Direct Downloads or Social Grab to monitor live progress</p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {active.map((item) => (
              <DownloadCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* History Ledger Section */}
      <div className="pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Transfer History</h2>
            <span className="text-xs text-zinc-500">({historyItems.length})</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search filter input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history…"
                className="bg-surface-raised border border-surface-border rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus-ring w-44"
              />
            </div>

            {historyItems.length > 0 && (
              <>
                {filter !== "all" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleClearHistory(filter as "complete" | "failed" | "cancelled")}
                  >
                    <Trash size={13} /> Clear {filter}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => handleClearHistory()}>
                  <Trash size={13} /> Clear all
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mb-4 relative">
          {(["all", "complete", "failed", "cancelled"] as HistoryFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative text-xs px-3 py-1.5 rounded-lg capitalize transition-colors focus-ring ${
                filter === f ? "text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {filter === f && (
                <motion.span
                  layoutId="history-filter-pill"
                  transition={springs.gentle}
                  className="absolute inset-0 bg-brand-gradient rounded-lg -z-10"
                />
              )}
              {f} ({f === "all" ? historyItems.length : historyItems.filter((i) => i.status === f).length})
            </button>
          ))}
        </div>

        {/* History List */}
        {loadingHistory ? (
          <p className="text-sm text-zinc-600 text-center py-12">Loading history…</p>
        ) : filteredHistory.length === 0 ? (
          <Card className="text-center py-10">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-surface-raised flex items-center justify-center text-zinc-600">
                <History size={18} />
              </div>
              <div>
                <p className="text-sm text-zinc-400 mb-0.5">
                  {searchQuery
                    ? "No transfers match your search"
                    : filter === "all"
                    ? "No history records yet"
                    : `No ${filter} downloads`}
                </p>
                <p className="text-xs text-zinc-600">Completed and failed transfers will be recorded here</p>
              </div>
            </div>
          </Card>
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filteredHistory.map((item) => (
                <HistoryItemRow key={item.id} item={item} onRemove={() => handleRemoveHistory(item.id)} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueString,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value?: number;
  valueString?: string;
  tone?: "success" | "danger" | "brand" | "active";
}) {
  const toneClass =
    tone === "success"
      ? "text-status-success bg-status-success/10"
      : tone === "danger"
      ? "text-status-danger bg-status-danger/10"
      : tone === "active"
      ? "text-emerald-400 bg-emerald-500/10"
      : "text-brand-secondary bg-brand-secondary/10";

  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${toneClass}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="h-6 overflow-hidden leading-none flex items-center">
          {valueString !== undefined ? (
            <p className="text-base font-semibold text-zinc-100 truncate">{valueString}</p>
          ) : (
            <p className="text-lg font-semibold text-zinc-100 leading-none">
              {value ?? 0}
            </p>
          )}
        </div>
        <p className="text-xs text-zinc-500 mt-1 truncate">{label}</p>
      </div>
    </Card>
  );
}

function HistoryItemRow({ item, onRemove }: { item: DownloadRecord; onRemove: () => void }) {
  const { showToast } = useToast();
  const Icon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : XSquare;
  const iconColor =
    item.status === "complete" ? "text-status-success" : item.status === "failed" ? "text-status-danger" : "text-zinc-500";

  const formattedDate = useMemo(() => {
    if (!item.createdAt) return "—";
    try {
      return new Date(item.createdAt).toLocaleString();
    } catch {
      return "—";
    }
  }, [item.createdAt]);

  async function handleShowInFolder() {
    if (!item.filepath) return;
    const result = await ipc.invoke("app:showInFolder", { filepath: item.filepath });
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
      className="glass-panel glass-panel-hover flex items-center gap-3 px-4 py-3"
    >
      <Icon size={16} className={`shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{item.filename || item.url || "Untitled transfer"}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {formatBytes(typeof item.sizeBytes === "number" ? item.sizeBytes : null)}
          {typeof item.avgSpeedBps === "number" && item.avgSpeedBps > 0 ? ` · avg ${formatBytes(item.avgSpeedBps)}/s` : ""}
          {" · "}{formattedDate}
          {item.errorMessage ? ` · ${item.errorMessage}` : ""}
        </p>
      </div>
      {item.status === "complete" && item.filepath && (
        <motion.button
          onClick={handleShowInFolder}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          transition={springs.snappy}
          title="Show in folder"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover focus-ring transition-colors"
        >
          <FolderOpen size={14} />
        </motion.button>
      )}
      <motion.button
        onClick={onRemove}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        transition={springs.snappy}
        title="Remove from history"
        className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-status-danger hover:bg-status-danger/10 focus-ring transition-colors"
      >
        <Trash2 size={14} />
      </motion.button>
    </motion.div>
  );
}
