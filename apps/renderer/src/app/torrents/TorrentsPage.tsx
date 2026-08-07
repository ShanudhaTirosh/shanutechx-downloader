import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Magnet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TorrentCard } from "../../components/widgets/TorrentCard";
import { ipc } from "../../lib/ipc-client";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToast } from "../../components/ui/Toast";
import { shake, shakeKeyframes, springs, staggerContainer } from "../../lib/motion";
import type { TorrentStatus } from "@shanutechx/shared-types";

export function TorrentsPage() {
  const [magnet, setMagnet] = useState("");
  const [adding, setAdding] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [torrents, setTorrents] = useState<Record<string, TorrentStatus>>({});
  const { settings, load } = useSettingsStore();
  const { showToast } = useToast();

  useEffect(() => {
    void load();
    void refresh();
    const off = ipc.on("torrent:status", (t) => setTorrents((prev) => ({ ...prev, [t.infoHash]: t })));
    return off;
  }, [load]);

  async function refresh() {
    const list = await ipc.invoke("torrents:list", undefined);
    setTorrents(Object.fromEntries(list.map((t) => [t.infoHash, t])));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!magnet.trim() || !settings) return;
    setAdding(true);
    try {
      await ipc.invoke("torrents:add", { magnetOrPath: magnet.trim(), saveDir: settings.torrentSavePath || settings.downloadDir });
      setMagnet("");
      await refresh();
      showToast("Torrent added successfully", "success");
    } catch (error) {
      setShakeKey((k) => k + 1);
      showToast(error instanceof Error ? error.message : "Failed to add torrent", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handlePause(infoHash: string) {
    try {
      await ipc.invoke("torrents:pause", { infoHash });
      await refresh();
      showToast("Torrent paused", "success");
    } catch {
      showToast("Failed to pause torrent", "error");
    }
  }

  async function handleResume(infoHash: string) {
    try {
      await ipc.invoke("torrents:resume", { infoHash });
      await refresh();
      showToast("Torrent resumed", "success");
    } catch {
      showToast("Failed to resume torrent", "error");
    }
  }

  async function handleRemove(infoHash: string) {
    try {
      await ipc.invoke("torrents:remove", { infoHash });
      await refresh();
      showToast("Torrent removed", "success");
    } catch {
      showToast("Failed to remove torrent", "error");
    }
  }

  const list = Object.values(torrents);

  return (
    <div className="max-w-3xl">
      <motion.h1
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className="text-xl font-semibold text-zinc-100 mb-1"
      >
        Torrents
      </motion.h1>
      <p className="text-sm text-zinc-500 mb-6">Add magnet links or .torrent files and manage active swarms.</p>

      <motion.form
        onSubmit={handleAdd}
        key={shakeKey}
        animate={shakeKey > 0 ? { x: shakeKeyframes } : undefined}
        transition={shake}
        className="glass-panel flex items-center gap-2 p-2 mb-6"
      >
        <Magnet size={16} className="text-zinc-500 ml-2 shrink-0" />
        <input
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="Paste a magnet link…"
          className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
        />
        <Button type="submit" disabled={!magnet.trim() || adding} loading={adding} size="md">
          {!adding && <Magnet size={16} />} Add
        </Button>
      </motion.form>

      <AnimatePresence mode="wait">
        {list.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="text-center py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-surface-raised flex items-center justify-center text-zinc-600">
                  <Magnet size={20} />
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-1">No active torrents</p>
                  <p className="text-xs text-zinc-600">
                    Add a magnet link or .torrent file to start downloading
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="list" variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {list.map((t) => (
                <TorrentCard key={t.infoHash} torrent={t} onPause={handlePause} onResume={handleResume} onRemove={handleRemove} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
