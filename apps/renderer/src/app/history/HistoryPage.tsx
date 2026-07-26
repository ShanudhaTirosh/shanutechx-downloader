import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, XSquare, Trash2, History, Trash } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { formatBytes } from "../../lib/format";
import type { DownloadRecord } from "@shanutechx/shared-types";

type Filter = "all" | "complete" | "failed" | "cancelled";

export function HistoryPage() {
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    const list = await ipc.invoke("history:list", undefined);
    setItems(list);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleRemove(id: string) {
    await ipc.invoke("history:remove", { id });
    setItems((prev) => prev.filter((i) => i.id !== id));
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
    showToast(`Cleared ${toRemove.length} items from history`, "success");
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-1">History</h1>
          <p className="text-sm text-zinc-500">Completed, failed, and cancelled transfers.</p>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
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
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "complete", "failed", "cancelled"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors focus-ring ${
              filter === f ? "bg-brand-gradient text-white" : "bg-surface-raised text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f} ({f === "all" ? items.length : items.filter(i => i.status === f).length})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600 text-center py-16">Loading…</p>
      ) : filtered.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => <HistoryRow key={item.id} item={item} onRemove={() => handleRemove(item.id)} />)}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item, onRemove }: { item: DownloadRecord; onRemove: () => void }) {
  const Icon = item.status === "complete" ? CheckCircle2 : item.status === "failed" ? XCircle : XSquare;
  const iconColor = item.status === "complete" ? "text-status-success" : item.status === "failed" ? "text-status-danger" : "text-zinc-500";

  return (
    <div className="glass-panel glass-panel-hover flex items-center gap-3 px-4 py-3">
      <Icon size={16} className={`shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{item.filename || item.url}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {formatBytes(item.sizeBytes)}
          {item.avgSpeedBps ? ` · avg ${formatBytes(item.avgSpeedBps)}/s` : ""}
          {" · "}{new Date(item.createdAt).toLocaleString()}
          {item.errorMessage ? ` · ${item.errorMessage}` : ""}
        </p>
      </div>
      <button onClick={onRemove} className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-status-danger hover:bg-status-danger/10 focus-ring transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

