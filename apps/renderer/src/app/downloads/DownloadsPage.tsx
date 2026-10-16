import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight } from "lucide-react";
import { AddUrlBar } from "../../components/widgets/AddUrlBar";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { springs, staggerContainer } from "../../lib/motion";

export function DownloadsPage() {
  const { items, refresh, subscribe } = useDownloadsStore();
  const list = Object.values(items).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  useEffect(() => {
    void refresh();
    return subscribe();
  }, [refresh, subscribe]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <motion.h1
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className="text-xl font-semibold text-zinc-100 mb-1"
      >
        Direct Downloads
      </motion.h1>
      <p className="text-sm text-zinc-500 mb-2">
        Download files directly from HTTP/HTTPS URLs with accelerated multi-segment streaming.
      </p>
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-surface-raised/40 px-3 py-2 rounded-lg border border-white/5 mb-6">
        <AlertCircle size={14} className="text-amber-400 shrink-0" />
        <span>For YouTube, TikTok, Instagram, Twitter, or video sites</span>
        <ArrowRight size={12} className="text-zinc-500" />
        <span>Use the <strong className="text-brand-secondary font-medium">Social Grab</strong> tab</span>
      </div>
      <AddUrlBar />
      <AnimatePresence mode="wait">
        {list.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-zinc-600 text-center py-16"
          >
            No downloads yet — paste a URL above to get started.
          </motion.p>
        ) : (
          <motion.div key="list" variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {list.map((item) => <DownloadCard key={item.id} item={item} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
