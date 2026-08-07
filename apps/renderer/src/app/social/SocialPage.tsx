import { useState, useEffect, useRef } from "react";
import { Link2, Search, Loader2, Download as DownloadIcon, Clipboard, Calendar } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { formatBytes, formatEta } from "../../lib/format";
import type { MediaInfo, MediaFormatOption } from "@shanutechx/shared-types";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { ScheduleModal } from "../../components/widgets/ScheduleModal";

export function SocialPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  // Set of format IDs currently being downloaded — prevents double-clicking
  // Download from spawning two identical yt-dlp jobs.
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  // Format currently being scheduled (opens the modal)
  const [schedulingFormat, setSchedulingFormat] = useState<MediaFormatOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = useDownloadsStore((s) => s.refresh);
  const { settings, load: loadSettings } = useSettingsStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const { showToast } = useToast();

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Real read-site for defaultVideoQuality — used to highlight the row that
  // matches the user's configured preference, e.g. "1080p", once info loads.
  const preferredHeight = settings ? Number.parseInt(settings.defaultVideoQuality, 10) || null : null;

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        inputRef.current?.focus();
      }
    } catch {
      showToast("Could not read clipboard — try pasting manually (Ctrl+V)", "error");
    }
  }

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(null); setInfo(null);
    try {
      const result = await ipc.invoke("social:extract", { url: url.trim() });
      setInfo(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (errorMsg.includes("Sign in to confirm") || errorMsg.includes("bot")) {
        setError("YouTube requires sign-in confirmation. Go to Settings → Social & media → select your browser under 'Pass cookies from browser', then try again.");
      } else if (errorMsg.includes("Unsupported URL")) {
        setError("This platform isn't supported. Try YouTube, TikTok, Instagram, or other major sites.");
      } else if (errorMsg.includes("network") || errorMsg.includes("timeout")) {
        setError("Network error. Check your connection and try again.");
      } else if (errorMsg.includes("yt-dlp")) {
        setError("Media extractor error. The video may be private, deleted, or region-locked.");
      } else {
        setError(`Couldn't extract info: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(format: MediaFormatOption) {
    if (downloadingIds.has(format.id)) return;
    setDownloadingIds((prev) => new Set(prev).add(format.id));
    try {
      await ipc.invoke("social:download", { url: url.trim(), format });
      await refresh();
      showToast(
        `Started downloading "${info?.title || "media"}" in ${format.label}`,
        "success", 4000,
      );
      setTimeout(() => setActiveTab("downloads"), 1500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start download", "error");
    } finally {
      setDownloadingIds((prev) => { const next = new Set(prev); next.delete(format.id); return next; });
    }
  }

  async function handleSchedule(format: MediaFormatOption, scheduledFor: string) {
    setSchedulingFormat(null);
    try {
      await ipc.invoke("social:scheduleNew", { url: url.trim(), format, scheduledFor });
      await refresh();
      const when = new Date(scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      showToast(
        `Scheduled "${info?.title || "media"}" (${format.label}) for ${when}`,
        "success", 6000,
      );
      setActiveTab("downloads");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to schedule", "error");
    }
  }

  return (
    <div className="max-w-3xl">
      {/* Schedule Modal */}
      <ScheduleModal
        open={schedulingFormat !== null}
        title={schedulingFormat ? `Schedule — ${schedulingFormat.label}` : "Schedule Download"}
        onConfirm={(scheduledFor) => schedulingFormat && handleSchedule(schedulingFormat, scheduledFor)}
        onCancel={() => setSchedulingFormat(null)}
      />

      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Social Grab</h1>
      <p className="text-sm text-zinc-500 mb-2">
        Paste a link from YouTube, TikTok, Instagram, Twitter, Pornhub, and 1800+ other sites.
      </p>
      <p className="text-xs text-zinc-600 mb-6">
        ✓ Video platforms · ✓ Social media · ✓ Adult content · ✓ Live streams · All downloads are private and processed locally
      </p>

      <form onSubmit={handleExtract} className="glass-panel flex items-center gap-2 p-2 mb-6">
        <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a video/post URL…"
          className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
        />
        {/* Paste button */}
        <button
          type="button"
          onClick={handlePaste}
          title="Paste from clipboard"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
        >
          <Clipboard size={15} />
        </button>
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
              <QualityRow
                label="Best available"
                formatId="best"
                downloading={downloadingIds.has("best")}
                onDownload={() => handleDownload({ id: "best", label: "Best", ytdlpFormat: "bestvideo+bestaudio/best" })}
                onSchedule={() => setSchedulingFormat({ id: "best", label: "Best", ytdlpFormat: "bestvideo+bestaudio/best" })}
              />
            ) : (
              info.availableQualities.map((q) => {
                const format: MediaFormatOption = {
                  id: q.formatId,
                  label: `${q.height}p`,
                  ytdlpFormat: `${q.formatId}+bestaudio/${q.formatId}/best`,
                };
                return (
                  <QualityRow
                    key={q.formatId}
                    label={`${q.height}p (${q.ext})`}
                    size={formatBytes(q.filesizeBytes)}
                    preferred={preferredHeight !== null && q.height === preferredHeight}
                    formatId={q.formatId}
                    downloading={downloadingIds.has(q.formatId)}
                    onDownload={() => handleDownload(format)}
                    onSchedule={() => setSchedulingFormat(format)}
                  />
                );
              })
            )}
            {/* Audio only row */}
            {(() => {
              const audioFormat: MediaFormatOption = { id: "audio", label: "Audio", ytdlpFormat: "bestaudio/best", postprocessor: settings?.defaultAudioFormat ?? "mp3" };
              return (
                <QualityRow
                  label={`Audio only (${(settings?.defaultAudioFormat ?? "mp3").toUpperCase()})`}
                  formatId="audio"
                  downloading={downloadingIds.has("audio")}
                  onDownload={() => handleDownload(audioFormat)}
                  onSchedule={() => setSchedulingFormat(audioFormat)}
                />
              );
            })()}
          </div>
        </Card>
      )}
    </div>
  );
}

function QualityRow({
  label, size, onDownload, onSchedule, preferred, downloading, formatId,
}: {
  label: string;
  size?: string;
  onDownload: () => void;
  onSchedule: () => void;
  preferred?: boolean;
  downloading?: boolean;
  formatId: string;
}) {
  void formatId;
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 glass-panel-hover ${preferred ? "ring-1 ring-brand-secondary/50" : ""}`}>
      <span className="text-sm text-zinc-200">
        {label}
        {preferred && <span className="ml-2 text-[10px] text-brand-secondary uppercase tracking-wide">Preferred</span>}
      </span>
      <div className="flex items-center gap-2">
        {size && <span className="text-xs text-zinc-500">{size}</span>}
        {/* Schedule button */}
        <button
          type="button"
          onClick={onSchedule}
          title="Schedule for later"
          className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-brand-secondary hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
        >
          <Calendar size={13} />
        </button>
        <Button size="sm" variant="secondary" onClick={onDownload} disabled={downloading} loading={downloading}>
          {!downloading && <DownloadIcon size={13} />} {downloading ? "Starting…" : "Download"}
        </Button>
      </div>
    </div>
  );
}
