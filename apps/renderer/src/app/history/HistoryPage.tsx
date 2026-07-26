import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, XSquare, Trash2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { ipc } from "../../lib/ipc-client";
import { formatBytes } from "../../lib/format";
import type { DownloadRecord } from "@shanutechx/shared-types";

type Filter = "all" | "complete" | "failed" | "cancelled";

export function HistoryPage() {
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

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

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">History</h1>
      <p className="text-sm text-zinc-500 mb-6">Completed, failed, and cancelled transfers.</p>

      <div className="flex gap-2 mb-4">
        {(["all", "complete", "failed", "cancelled"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors focus-ring ${
              filter === f ? "bg-brand-gradient text-white" : "bg-surface-raised text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600 text-center py-16">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16 text-sm text-zinc-600">Nothing here yet.</Card>
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
      <button onClick={onRemove} className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-status-danger hover:bg-status-danger/10 focus-ring">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
