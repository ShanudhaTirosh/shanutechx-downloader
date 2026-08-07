import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, CheckCircle2, XCircle, Gauge, Plus, Link2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useUiStore } from "../../stores/uiStore";
import { listItem, springs, staggerContainer } from "../../lib/motion";

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
      <motion.h1
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className="text-xl font-semibold text-zinc-100 mb-1"
      >
        Dashboard
      </motion.h1>
      <p className="text-sm text-zinc-500 mb-6">Live overview of active transfers and system status.</p>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-3 gap-4 mb-6">
        <motion.div variants={listItem}><StatCard icon={Gauge} label="Active" value={active.length} /></motion.div>
        <motion.div variants={listItem}><StatCard icon={CheckCircle2} label="Completed" value={completed} tone="success" /></motion.div>
        <motion.div variants={listItem}><StatCard icon={XCircle} label="Failed" value={failed} tone="danger" /></motion.div>
      </motion.div>

      <div className="flex items-center gap-2 mb-3">
        <Download size={15} className="text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-300">Active transfers</h2>
      </div>
      <AnimatePresence mode="wait">
        {active.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
          </motion.div>
        ) : (
          <motion.div key="list" variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {active.map((item) => <DownloadCard key={item.id} item={item} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: number; tone?: "success" | "danger" }) {
  const toneClass = tone === "success" ? "text-status-success" : tone === "danger" ? "text-status-danger" : "text-brand-secondary";
  return (
    <Card className="flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl bg-surface-raised flex items-center justify-center ${toneClass}`}>
        <Icon size={17} />
      </div>
      <div>
        <div className="h-6 overflow-hidden leading-none">
          {/* A count "rolls" up/down on a firm spring whenever it changes,
              instead of just snapping to the new number. */}
          <AnimatePresence mode="popLayout">
            <motion.p
              key={value}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={springs.firm}
              className="text-lg font-semibold text-zinc-100 leading-none"
            >
              {value}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="text-xs text-zinc-500 mt-1">{label}</p>
      </div>
    </Card>
  );
}
