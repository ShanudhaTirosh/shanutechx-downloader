import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Magnet,
  Upload,
  FolderOpen,
  FileUp,
  X,
  CheckCircle2,
  ShieldCheck,
  DownloadCloud,
  Pause,
  Play,
  ArrowDown,
  ArrowUp,
  Zap,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TorrentCard } from "../../components/widgets/TorrentCard";
import { ipc } from "../../lib/ipc-client";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToast } from "../../components/ui/Toast";
import { formatSpeed } from "../../lib/format";
import { shake, shakeKeyframes, springs, staggerContainer } from "../../lib/motion";
import type { TorrentStatus } from "@shanutechx/shared-types";

type TorrentFilter = "all" | "downloading" | "seeding" | "paused";

export function TorrentsPage() {
  const [magnet, setMagnet] = useState("");
  const [customDir, setCustomDir] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [torrentFilter, setTorrentFilter] = useState<TorrentFilter>("all");
  const [torrents, setTorrents] = useState<Record<string, TorrentStatus>>({});
  const { settings, load } = useSettingsStore();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isAddingRef = useRef(false);

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

  const effectiveSaveDir = customDir || (settings ? (settings.torrentSavePath || settings.downloadDir) : "");

  async function handleSelectDirectory() {
    try {
      const res = await ipc.invoke("app:selectDirectory", {
        title: "Select Torrent Save Folder",
        defaultPath: effectiveSaveDir || undefined,
      });
      if (res.dirPath) {
        setCustomDir(res.dirPath);
        showToast(`Torrent save folder: ${res.dirPath}`, "info");
      }
    } catch {
      showToast("Could not open directory picker", "error");
    }
  }

  async function addTorrent(magnetOrPath: string) {
    if (isAddingRef.current || adding || !magnetOrPath.trim() || !effectiveSaveDir) return;
    isAddingRef.current = true;
    setAdding(true);
    try {
      await ipc.invoke("torrents:add", {
        magnetOrPath: magnetOrPath.trim(),
        saveDir: effectiveSaveDir,
      });
      setMagnet("");
      await refresh();
      showToast("Torrent added to client", "success");
    } catch (error) {
      setShakeKey((k) => k + 1);
      showToast(error instanceof Error ? error.message : "Failed to add torrent", "error");
    } finally {
      setAdding(false);
      isAddingRef.current = false;
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!magnet.trim()) return;
    await addTorrent(magnet.trim());
  }

  async function handleBrowseTorrentFile() {
    try {
      const res = await ipc.invoke("app:selectFile", {
        title: "Select .torrent File",
        filters: [{ name: "Torrent Files", extensions: ["torrent"] }],
      });
      if (res.filePath) {
        await addTorrent(res.filePath);
      }
    } catch {
      showToast("Failed to select torrent file", "error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const filePath = (file as any).path || (file as any).name;
      if (filePath) {
        void addTorrent(filePath);
      }
    } else {
      const text = e.dataTransfer.getData("text");
      if (text && (text.startsWith("magnet:") || text.includes(".torrent"))) {
        void addTorrent(text.trim());
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handlePause(infoHash: string) {
    setTorrents((prev) => {
      const existing = prev[infoHash];
      if (!existing) return prev;
      return { ...prev, [infoHash]: { ...existing, paused: true } };
    });
    try {
      await ipc.invoke("torrents:pause", { infoHash });
      await refresh();
      showToast("Torrent paused", "success");
    } catch {
      showToast("Failed to pause torrent", "error");
    }
  }

  async function handleResume(infoHash: string) {
    setTorrents((prev) => {
      const existing = prev[infoHash];
      if (!existing) return prev;
      return { ...prev, [infoHash]: { ...existing, paused: false } };
    });
    try {
      await ipc.invoke("torrents:resume", { infoHash });
      await refresh();
      showToast("Torrent resumed", "success");
    } catch {
      showToast("Failed to resume torrent", "error");
    }
  }

  async function handleRemove(infoHash: string) {
    setTorrents((prev) => {
      const next = { ...prev };
      delete next[infoHash];
      return next;
    });
    showToast("Torrent removed", "success");
    try {
      await ipc.invoke("torrents:remove", { infoHash });
      await refresh();
    } catch {
      // Ignored
    }
  }

  async function handlePauseAll() {
    try {
      await ipc.invoke("torrents:pauseAll", undefined);
      await refresh();
      showToast("All torrents paused", "info");
    } catch {
      showToast("Failed to pause all torrents", "error");
    }
  }

  async function handleResumeAll() {
    try {
      await ipc.invoke("torrents:resumeAll", undefined);
      await refresh();
      showToast("All torrents resumed", "success");
    } catch {
      showToast("Failed to resume all torrents", "error");
    }
  }

  const list = Object.values(torrents);
  const totalDownBps = list.reduce((a, b) => a + (b.downloadRateBps || 0), 0);
  const totalUpBps = list.reduce((a, b) => a + (b.uploadRateBps || 0), 0);
  const downloadingList = list.filter((t) => t.state === "downloading" || t.state === "downloading_metadata");
  const seedingList = list.filter((t) => t.state === "seeding");
  const pausedList = list.filter((t) => t.state === "paused");

  const filteredList = list.filter((t) => {
    if (torrentFilter === "downloading") return t.state === "downloading" || t.state === "downloading_metadata";
    if (torrentFilter === "seeding") return t.state === "seeding";
    if (torrentFilter === "paused") return t.state === "paused";
    return true;
  });

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className="w-full max-w-5xl mx-auto space-y-5 pb-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-1 flex items-center gap-2">
            <Magnet size={20} className="text-cyan-400" /> Torrents
            {(totalDownBps > 0 || totalUpBps > 0) && (
              <span className="flex items-center gap-2 text-xs font-mono ml-2">
                {totalDownBps > 0 && (
                  <span className="inline-flex items-center gap-1 text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                    <ArrowDown size={11} /> {formatSpeed(totalDownBps)}
                  </span>
                )}
                {totalUpBps > 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <ArrowUp size={11} /> {formatSpeed(totalUpBps)}
                  </span>
                )}
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-400">
            Pure peer-to-peer BitTorrent client with DHT, peer exchange, and live swarm tracking
          </p>
        </div>

        {list.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleResumeAll} title="Resume all torrents">
              <Play size={14} /> Resume All
            </Button>
            <Button size="sm" variant="secondary" onClick={handlePauseAll} title="Pause all torrents">
              <Pause size={14} /> Pause All
            </Button>
          </div>
        )}
      </div>

      {/* Feature Pills */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <CheckCircle2 size={13} className="text-cyan-400 shrink-0" /> WebTorrent & LibTorrent
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <CheckCircle2 size={13} className="text-cyan-400 shrink-0" /> Drag & Drop .torrent Files
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <ShieldCheck size={13} className="text-emerald-400 shrink-0" /> DHT & Peer Discovery
        </span>
      </div>

      {/* Input / Add Card */}
      <div className="space-y-3">
        <motion.form
          onSubmit={handleAdd}
          key={shakeKey}
          animate={shakeKey > 0 ? { x: shakeKeyframes } : undefined}
          transition={shake}
          className="glass-panel flex items-center gap-2 p-2"
        >
          <Magnet size={16} className="text-zinc-500 ml-2 shrink-0" />
          <input
            ref={inputRef}
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            placeholder="Paste magnet link or file path…"
            className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2 min-w-0"
          />

          {magnet.length > 0 && (
            <button
              type="button"
              onClick={() => setMagnet("")}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover transition-colors shrink-0"
              title="Clear"
            >
              <X size={14} />
            </button>
          )}

          {/* Directory Badge */}
          {customDir && (
            <span
              className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md border border-cyan-500/20 max-w-[150px] truncate shrink-0"
              title={`Save folder: ${customDir}`}
            >
              <FolderOpen size={12} className="shrink-0" />
              <span className="truncate">{customDir.split(/[\\/]/).pop()}</span>
              <button
                type="button"
                onClick={() => setCustomDir(null)}
                className="hover:text-white"
                title="Reset folder"
              >
                <X size={11} />
              </button>
            </span>
          )}

          {/* Folder picker button */}
          <button
            type="button"
            onClick={handleSelectDirectory}
            title={customDir ? `Saving to: ${customDir}` : "Choose custom download folder"}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
          >
            <FolderOpen size={15} />
          </button>

          {/* Browse .torrent file button */}
          <button
            type="button"
            onClick={handleBrowseTorrentFile}
            title="Browse .torrent file on disk"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-cyan-400 hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
          >
            <FileUp size={15} />
          </button>

          <Button type="submit" disabled={!magnet.trim() || adding} loading={adding} size="md">
            {!adding && <Magnet size={16} />} Add
          </Button>
        </motion.form>

        {/* Drag & Drop banner */}
        <div
          onClick={handleBrowseTorrentFile}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all duration-200 group ${
            isDragging
              ? "border-cyan-500 bg-cyan-500/15 shadow-[0_0_25px_rgba(6,182,212,0.25)] scale-[1.01]"
              : "border-white/10 hover:border-cyan-500/50 bg-[#12121a]/95 hover:bg-[#151524] shadow-lg"
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-300 group-hover:text-white transition-colors">
            <Upload size={14} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Drag & drop .torrent files anywhere here, or click to browse</span>
          </div>
        </div>
      </div>

      {/* Status Filter Pills */}
      {list.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { id: "all", label: "All", count: list.length },
              { id: "downloading", label: "Downloading", count: downloadingList.length },
              { id: "seeding", label: "Seeding", count: seedingList.length },
              { id: "paused", label: "Paused", count: pausedList.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTorrentFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                torrentFilter === tab.id
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised border border-transparent"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  torrentFilter === tab.id
                    ? "bg-cyan-500/25 text-cyan-200"
                    : "bg-surface-raised-hover text-zinc-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {list.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="text-center py-12 bg-surface-raised border border-surface-border">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <DownloadCloud size={22} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-0.5">No active torrents</p>
                  <p className="text-xs text-zinc-500">
                    Add a magnet link or drop a .torrent file to begin peer-to-peer downloading
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : filteredList.length === 0 ? (
          <motion.div key="none-filtered" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="text-center py-10 bg-surface-raised border border-surface-border">
              <p className="text-sm text-zinc-400">No torrents match the &ldquo;{torrentFilter}&rdquo; filter</p>
              <Button size="sm" variant="ghost" onClick={() => setTorrentFilter("all")} className="mt-2 text-xs">
                Show all torrents
              </Button>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="list" variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {filteredList.map((t) => (
                <TorrentCard key={t.infoHash} torrent={t} onPause={handlePause} onResume={handleResume} onRemove={handleRemove} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
