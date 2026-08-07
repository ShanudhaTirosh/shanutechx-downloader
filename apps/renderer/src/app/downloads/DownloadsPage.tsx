import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
    <div className="max-w-3xl">
      <motion.h1
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className="text-xl font-semibold text-zinc-100 mb-1"
      >
        Direct Downloads
      </motion.h1>
      <p className="text-sm text-zinc-500 mb-2">
        Download files directly from HTTP/HTTPS URLs - perfect for direct file links.
      </p>
      <p className="text-xs text-zinc-600 mb-6">
        ⚠️ For YouTube, TikTok, Instagram, Pornhub, or other video platforms → Use <strong className="text-brand-secondary">Social Grab</strong> tab instead
      </p>
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
