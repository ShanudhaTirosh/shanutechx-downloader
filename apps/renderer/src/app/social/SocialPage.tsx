import { useState, useEffect } from "react";
import { Link2, Search, Loader2, Download as DownloadIcon } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ipc } from "../../lib/ipc-client";
import { formatBytes, formatEta } from "../../lib/format";
import type { MediaInfo, MediaFormatOption } from "@shanutechx/shared-types";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useSettingsStore } from "../../stores/settingsStore";

export function SocialPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const refresh = useDownloadsStore((s) => s.refresh);
  const { settings, load: loadSettings } = useSettingsStore();

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Real read-site for defaultVideoQuality — used to highlight the row that
  // matches the user's configured preference, e.g. "1080p", once info loads.
  const preferredHeight = settings ? Number.parseInt(settings.defaultVideoQuality, 10) || null : null;

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(null); setInfo(null);
    try {
      const result = await ipc.invoke("social:extract", { url: url.trim() });
      setInfo(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't extract info from that URL.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(format: MediaFormatOption) {
    await ipc.invoke("social:download", { url: url.trim(), format });
    await refresh();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Social Grab</h1>
      <p className="text-sm text-zinc-500 mb-6">Paste a link from YouTube, TikTok, Instagram, and 1000+ other sites.</p>

      <form onSubmit={handleExtract} className="glass-panel flex items-center gap-2 p-2 mb-6">
        <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a video/post URL…"
          className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
        />
        <Button type="submit" disabled={!url.trim() || loading} size="md">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? "Extracting…" : "Extract"}
        </Button>
      </form>

      {error && (
        <Card className="mb-6 border-status-danger/30 text-sm text-status-danger">{error}</Card>
      )}

      {info && (
        <Card className="flex flex-col gap-4">
          <div className="flex gap-4">
            {info.thumbnail && <img src={info.thumbnail} alt="" className="w-32 h-20 object-cover rounded-lg shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 truncate">{info.title}</p>
              <p className="text-xs text-zinc-500 mt-1">{info.uploader} · {formatEta(info.durationSec)} · {info.extractor}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Quality</p>
            {info.availableQualities.length === 0 ? (
              <QualityRow label="Best available" onDownload={() => handleDownload({ id: "best", label: "Best", ytdlpFormat: "bestvideo+bestaudio/best" })} />
            ) : (
              info.availableQualities.map((q) => (
                <QualityRow
                  key={q.formatId}
                  label={`${q.height}p (${q.ext})`}
                  size={formatBytes(q.filesizeBytes)}
                  preferred={preferredHeight !== null && q.height === preferredHeight}
                  onDownload={() => handleDownload({ id: q.formatId, label: `${q.height}p`, ytdlpFormat: `${q.formatId}+bestaudio/best` })}
                />
              ))
            )}
            <QualityRow
              label={`Audio only (${(settings?.defaultAudioFormat ?? "mp3").toUpperCase()})`}
              onDownload={() => handleDownload({ id: "audio", label: "Audio", ytdlpFormat: "bestaudio/best", postprocessor: settings?.defaultAudioFormat ?? "mp3" })}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function QualityRow({ label, size, onDownload, preferred }: { label: string; size?: string; onDownload: () => void; preferred?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 glass-panel-hover ${preferred ? "ring-1 ring-brand-secondary/50" : ""}`}>
      <span className="text-sm text-zinc-200">{label}{preferred && <span className="ml-2 text-[10px] text-brand-secondary uppercase tracking-wide">Preferred</span>}</span>
      <div className="flex items-center gap-3">
        {size && <span className="text-xs text-zinc-500">{size}</span>}
        <Button size="sm" variant="secondary" onClick={onDownload}><DownloadIcon size={13} /> Download</Button>
      </div>
    </div>
  );
}
