import { useEffect } from "react";
import { Download, CheckCircle2, XCircle, Gauge, Plus, Link2, Folder } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useUiStore } from "../../stores/uiStore";

export function DashboardPage() {
  const { items, refresh, subscribe } = useDownloadsStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  useEffect(() => {
    void refresh();
    return subscribe();
  }, [refresh, subscribe]);

  const list = Object.values(items);
  const active = list.filter((d) => d.status === "downloading" || d.status === "merging");
  const completed = list.filter((d) => d.status === "complete").length;
  const failed = list.filter((d) => d.status === "failed").length;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Dashboard</h1>
      <p className="text-sm text-zinc-500 mb-6">Live overview of active transfers and system status.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={Gauge} label="Active" value={String(active.length)} />
        <StatCard icon={CheckCircle2} label="Completed" value={String(completed)} tone="success" />
        <StatCard icon={XCircle} label="Failed" value={String(failed)} tone="danger" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Download size={15} className="text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-300">Active transfers</h2>
      </div>
      {active.length === 0 ? (
        <Card className="text-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-surface-raised flex items-center justify-center text-zinc-600">
              <Download size={20} />
            </div>
            <div>
              <p className="text-sm text-zinc-400 mb-1">No active downloads</p>
              <p className="text-xs text-zinc-600">Start a download to see real-time progress here</p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="secondary" onClick={() => setActiveTab("downloads")}>
                <Plus size={14} /> New Download
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setActiveTab("social")}>
                <Link2 size={14} /> Social Grab
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((item) => <DownloadCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone?: "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-status-success" : tone === "danger" ? "text-status-danger" : "text-brand-secondary";
  return (
    <Card className="flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl bg-surface-raised flex items-center justify-center ${toneClass}`}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-lg font-semibold text-zinc-100 leading-none">{value}</p>
        <p className="text-xs text-zinc-500 mt-1">{label}</p>
      </div>
    </Card>
  );
}

