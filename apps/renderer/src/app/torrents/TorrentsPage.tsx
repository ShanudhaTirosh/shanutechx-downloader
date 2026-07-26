import { useEffect, useState } from "react";
import { Magnet, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ProgressRing } from "../../components/ui/ProgressRing";
import { ipc } from "../../lib/ipc-client";
import { formatBytes, formatSpeed } from "../../lib/format";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToast } from "../../components/ui/Toast";
import type { TorrentStatus } from "@shanutechx/shared-types";

export function TorrentsPage() {
  const [magnet, setMagnet] = useState("");
  const [adding, setAdding] = useState(false);
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
    } catch (error) {
      showToast("Failed to pause torrent", "error");
    }
  }

  async function handleResume(infoHash: string) {
    try {
      await ipc.invoke("torrents:resume", { infoHash });
      await refresh();
      showToast("Torrent resumed", "success");
    } catch (error) {
      showToast("Failed to resume torrent", "error");
    }
  }

  async function handleRemove(infoHash: string) {
    try {
      await ipc.invoke("torrents:remove", { infoHash });
      await refresh();
      showToast("Torrent removed", "success");
    } catch (error) {
      showToast("Failed to remove torrent", "error");
    }
  }

  const list = Object.values(torrents);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Torrents</h1>
      <p className="text-sm text-zinc-500 mb-6">Add magnet links or .torrent files and manage active swarms.</p>

      <form onSubmit={handleAdd} className="glass-panel flex items-center gap-2 p-2 mb-6">
        <Magnet size={16} className="text-zinc-500 ml-2 shrink-0" />
        <input
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="Paste a magnet link…"
          className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
        />
        <Button type="submit" disabled={!magnet.trim() || adding} size="md">
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Magnet size={16} />} Add
        </Button>
      </form>

      {list.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((t) => (
            <div key={t.infoHash} className="glass-panel flex items-center gap-4 p-4">
              <ProgressRing percent={t.progress} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{t.name}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatBytes(t.totalDownloaded)} / {formatBytes(t.totalSize)} · {formatSpeed(t.downloadRateBps)} ↓ · {t.numPeers} peers · {t.state}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {t.state === "paused" ? (
                  <Button
                    onClick={() => handleResume(t.infoHash)}
                    size="sm"
                    variant="secondary"
                    title="Resume"
                  >
                    <Play size={16} />
                  </Button>
                ) : t.state === "downloading" || t.state === "seeding" ? (
                  <Button
                    onClick={() => handlePause(t.infoHash)}
                    size="sm"
                    variant="secondary"
                    title="Pause"
                  >
                    <Pause size={16} />
                  </Button>
                ) : null}
                <Button
                  onClick={() => handleRemove(t.infoHash)}
                  size="sm"
                  variant="secondary"
                  title="Remove"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
