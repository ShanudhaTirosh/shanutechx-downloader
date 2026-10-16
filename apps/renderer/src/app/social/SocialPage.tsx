import { useState, useEffect, useRef } from "react";
import { 
  Link2, Search, Loader2, Download as DownloadIcon, Clipboard, Calendar, 
  FolderOpen, X, CheckCircle2, ShieldCheck, Music, Image as ImageIcon, 
  Film, Sparkles, Check, CheckSquare, Square, Layers, ListPlus, Sliders,
  Video, RefreshCw
} from "lucide-react";
import clsx from "clsx";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { formatBytes, formatEta } from "../../lib/format";
import type { MediaInfo, MediaFormatOption, MediaPhoto } from "@shanutechx/shared-types";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { ScheduleModal } from "../../components/widgets/ScheduleModal";
import { DuplicateDownloadModal } from "../../components/widgets/DuplicateDownloadModal";

export function SocialPage() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [url, setUrl] = useState("");
  const [batchUrlsText, setBatchUrlsText] = useState("");
  const [batchResults, setBatchResults] = useState<{ url: string; info?: MediaInfo; error?: string }[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const [customDir, setCustomDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);

  // Audio configuration state
  const [audioFormatExt, setAudioFormatExt] = useState<string>("mp3");
  const [audioBitrate, setAudioBitrate] = useState<string>("320k");

  // Photo selection state
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isDownloadingPhotos, setIsDownloadingPhotos] = useState(false);
  const [isRenderingSlideshow, setIsRenderingSlideshow] = useState(false);
  const [slideshowDuration, setSlideshowDuration] = useState<number>(3);

  // Set of format IDs currently being downloaded — prevents duplicate jobs
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  // Format currently being scheduled (opens the modal)
  const [schedulingFormat, setSchedulingFormat] = useState<MediaFormatOption | null>(null);
  // Duplicate download modal state
  const [duplicateItem, setDuplicateItem] = useState<{ url: string; format: MediaFormatOption; filename?: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const isExtractingRef = useRef(false);
  const isDownloadingRef = useRef(false);
  const refresh = useDownloadsStore((s) => s.refresh);
  const { settings, load: loadSettings } = useSettingsStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const { showToast } = useToast();

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  // Real read-site for defaultVideoQuality — used to highlight the row that
  // matches the user's configured preference, e.g. "1080p", once info loads.
  const preferredHeight = settings ? Number.parseInt(settings.defaultVideoQuality, 10) || null : null;

  async function handleSelectDirectory() {
    try {
      const res = await ipc.invoke("app:selectDirectory", { title: "Select Save Folder for Social Media" });
      if (res.dirPath) {
        setCustomDir(res.dirPath);
        showToast(`Save location set: ${res.dirPath}`, "info");
      }
    } catch {
      showToast("Could not open directory picker", "error");
    }
  }

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
    if (isExtractingRef.current || loading || !url.trim()) return;
    isExtractingRef.current = true;
    setLoading(true); setError(null); setInfo(null);
    setSelectedPhotoIds(new Set());
    try {
      const result = await ipc.invoke("social:extract", { url: url.trim() });
      setInfo(result);
      if (result.photos && result.photos.length > 0) {
        // Pre-select all photos
        setSelectedPhotoIds(new Set(result.photos.map((p) => p.id)));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (errorMsg.includes("Sign in to confirm") || errorMsg.includes("bot")) {
        setError("YouTube requires sign-in confirmation. Go to Settings > Social & media > select your browser under 'Pass cookies from browser', then try again.");
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
      isExtractingRef.current = false;
    }
  }

  async function handleDownload(format: MediaFormatOption, allowDuplicate = false) {
    if (downloadingIds.has(format.id)) return;
    setDownloadingIds((prev) => new Set(prev).add(format.id));
    try {
      await ipc.invoke("social:download", {
        url: url.trim(),
        format,
        saveDir: customDir || undefined,
        allowDuplicate,
      });
      await refresh();
      showToast(
        `Started downloading "${info?.title || "media"}" in ${format.label}`,
        "success", 4000,
      );
      setTimeout(() => setActiveTab("downloads"), 1500);
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("DUPLICATE_URL")) {
        const parts = errorMsg.split(":");
        const dupFilename = parts[2] || info?.title || "media";
        setDuplicateItem({ url: url.trim(), format, filename: dupFilename });
        return;
      }
      showToast(err instanceof Error ? err.message : "Failed to start download", "error");
    } finally {
      setDownloadingIds((prev) => { const next = new Set(prev); next.delete(format.id); return next; });
    }
  }

  async function handleDownloadCustomAudio() {
    const audioFmt: MediaFormatOption = {
      id: `audio-${audioFormatExt}-${audioBitrate}`,
      label: `Audio (${audioFormatExt.toUpperCase()} ${audioBitrate})`,
      ytdlpFormat: "bestaudio/best",
      postprocessor: "extract-audio",
      quality: audioFormatExt,
    };
    (audioFmt as any).bitrate = audioBitrate;
    await handleDownload(audioFmt);
  }

  async function handleSchedule(format: MediaFormatOption, scheduledFor: string) {
    setSchedulingFormat(null);
    try {
      await ipc.invoke("social:scheduleNew", { url: url.trim(), format, scheduledFor, saveDir: customDir || undefined });
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

  // Toggle photo selection
  function togglePhoto(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPhotos() {
    if (!info?.photos) return;
    if (selectedPhotoIds.size === info.photos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(info.photos.map((p) => p.id)));
    }
  }

  // Download photos
  async function handleDownloadPhotos() {
    if (!info?.photos) return;
    const selected = info.photos.filter((p) => selectedPhotoIds.has(p.id));
    if (selected.length === 0) {
      showToast("Please select at least one photo to download", "error");
      return;
    }

    setIsDownloadingPhotos(true);
    try {
      const res = await ipc.invoke("social:downloadPhotos", {
        photos: selected,
        saveDir: customDir || undefined,
      });
      if (res.success) {
        showToast(`Saved ${res.savedPaths.length} photo(s) to folder`, "success");
      } else {
        showToast("Failed to save photos", "error");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to download photos", "error");
    } finally {
      setIsDownloadingPhotos(false);
    }
  }

  // Render photos to video slideshow
  async function handleRenderSlideshow() {
    if (!info?.photos) return;
    const selected = info.photos.filter((p) => selectedPhotoIds.has(p.id));
    if (selected.length === 0) {
      showToast("Please select photos for the video slideshow", "error");
      return;
    }

    setIsRenderingSlideshow(true);
    try {
      await ipc.invoke("social:renderPhotosToVideo", {
        photos: selected,
        durationPerPhotoSec: slideshowDuration,
        title: info.title || "photo_slideshow",
        saveDir: customDir || undefined,
      });
      showToast("Slideshow video rendering started in Universal Converter!", "info");
      setTimeout(() => setActiveTab("converter"), 1200);
    } catch (err: any) {
      showToast(err?.message || "Failed to create video slideshow", "error");
    } finally {
      setIsRenderingSlideshow(false);
    }
  }

  // Batch extraction
  async function handleBatchExtract() {
    const lines = batchUrlsText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      showToast("Please enter at least one URL", "error");
      return;
    }

    setBatchLoading(true);
    setBatchResults([]);
    try {
      const res = await ipc.invoke("social:batchExtract", { urls: lines });
      setBatchResults(res.results);
      showToast(`Extracted ${res.results.filter((r) => r.info).length} of ${lines.length} URLs`, "info");
    } catch (err: any) {
      showToast(err?.message || "Batch extraction failed", "error");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleBatchDownloadAll(type: "video" | "audio") {
    const valid = batchResults.filter((r) => r.info);
    if (valid.length === 0) return;

    let queuedCount = 0;
    for (const item of valid) {
      if (!item.info) continue;
      const format: MediaFormatOption = type === "video" 
        ? { id: "best", label: "Best Video", ytdlpFormat: "bestvideo+bestaudio/best" }
        : { id: "audio-mp3-320k", label: "Audio (MP3 320k)", ytdlpFormat: "bestaudio/best", postprocessor: "extract-audio", quality: "mp3" };
      
      try {
        await ipc.invoke("social:download", {
          url: item.url,
          format,
          saveDir: customDir || undefined,
        });
        queuedCount++;
      } catch {
        // ignore single failure in batch
      }
    }

    await refresh();
    showToast(`Started batch download for ${queuedCount} items`, "success");
    setTimeout(() => setActiveTab("downloads"), 1500);
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-10">
      {/* Schedule Modal */}
      <ScheduleModal
        open={schedulingFormat !== null}
        title={schedulingFormat ? `Schedule — ${schedulingFormat.label}` : "Schedule Download"}
        onConfirm={(scheduledFor) => schedulingFormat && handleSchedule(schedulingFormat, scheduledFor)}
        onCancel={() => setSchedulingFormat(null)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 mb-1">Social Grab</h1>
          <p className="text-sm text-zinc-400">
            Download videos, audio tracks, and photo carousels from YouTube, TikTok, Instagram, Twitter, and 1800+ sites
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-1 bg-zinc-900/80 p-1 rounded-lg border border-surface-border shrink-0">
          <button
            onClick={() => setMode("single")}
            className={clsx(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              mode === "single" ? "bg-brand-primary text-white" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Link2 size={13} /> Single Link
          </button>
          <button
            onClick={() => setMode("batch")}
            className={clsx(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              mode === "batch" ? "bg-brand-primary text-white" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ListPlus size={13} /> Batch / Playlists
          </button>
        </div>
      </div>
      
      {/* Clean SVG Feature Badges - No Emojis */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> YouTube & TikTok MP3 Audio
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> TikTok & Insta Photo Slides
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> Render Slides to Video
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <ShieldCheck size={13} className="text-cyan-400 shrink-0" /> 100% Local & Private
        </span>
      </div>

      {mode === "single" ? (
        /* SINGLE LINK MODE */
        <>
          <form onSubmit={handleExtract} className="glass-panel flex items-center gap-2 p-2">
            <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a video, song, or photo post URL…"
              className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2 min-w-0"
            />

            {/* Clear URL button */}
            {url.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setUrl("");
                  inputRef.current?.focus();
                }}
                title="Clear URL"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            )}

            {/* Selected custom directory badge */}
            {customDir && (
              <span
                className="flex items-center gap-1.5 text-xs text-brand-secondary bg-brand-secondary/10 px-2.5 py-1 rounded-md border border-brand-secondary/20 max-w-[160px] truncate shrink-0"
                title={`Saving to: ${customDir}`}
              >
                <FolderOpen size={12} className="shrink-0 text-brand-secondary" />
                <span className="truncate">{customDir.split(/[\\/]/).pop() || customDir}</span>
                <button
                  type="button"
                  onClick={() => setCustomDir(null)}
                  className="text-zinc-400 hover:text-zinc-200 ml-0.5 focus:outline-none"
                  title="Reset to default download folder"
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Folder picker button */}
            <button
              type="button"
              onClick={handleSelectDirectory}
              title={customDir ? `Saving to: ${customDir} (click to change)` : "Choose custom download folder"}
              className={clsx(
                "h-8 w-8 flex items-center justify-center rounded-lg transition-colors focus-ring shrink-0",
                customDir
                  ? "text-brand-secondary bg-brand-secondary/15 hover:bg-brand-secondary/25"
                  : "text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover"
              )}
            >
              <FolderOpen size={15} />
            </button>

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
            <Card className="border-status-danger/30 text-sm text-status-danger p-4">{error}</Card>
          )}

          {info && (
            <div className="space-y-4">
              {/* Media Overview Card */}
              <Card className="p-4 bg-surface-raised border border-surface-border">
                <div className="flex gap-4">
                  {info.thumbnail && (
                    <img
                      src={info.thumbnail}
                      alt=""
                      className="w-36 h-24 object-cover rounded-lg shrink-0 border border-surface-border"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-zinc-100 truncate mb-1">{info.title}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                      <span className="text-zinc-300 font-medium">{info.uploader}</span>
                      {info.durationSec > 0 && <span>· {formatEta(info.durationSec)}</span>}
                      <span className="capitalize px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {info.extractor}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 1. PHOTO CAROUSEL SECTION (if post has photos) */}
              {info.photos && info.photos.length > 0 && (
                <Card className="p-4 bg-surface-raised border border-purple-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon size={18} className="text-purple-400" />
                      <h3 className="text-sm font-semibold text-zinc-100">
                        Photo Carousel ({info.photos.length} photos found)
                      </h3>
                    </div>
                    <button
                      onClick={toggleAllPhotos}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                    >
                      {selectedPhotoIds.size === info.photos.length ? (
                        <>
                          <Square size={13} /> Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare size={13} /> Select All ({info.photos.length})
                        </>
                      )}
                    </button>
                  </div>

                  {/* Photo Thumbnails Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-4">
                    {info.photos.map((photo) => {
                      const isSelected = selectedPhotoIds.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          onClick={() => togglePhoto(photo.id)}
                          className={clsx(
                            "relative aspect-square rounded-lg overflow-hidden border cursor-pointer group transition-all",
                            isSelected
                              ? "border-purple-500 ring-2 ring-purple-500/40"
                              : "border-surface-border opacity-60 hover:opacity-100"
                          )}
                        >
                          <img
                            src={photo.thumbnail || photo.url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div
                            className={clsx(
                              "absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center transition-colors",
                              isSelected ? "bg-purple-600 text-white" : "bg-black/60 text-transparent"
                            )}
                          >
                            <Check size={12} strokeWidth={3} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Photo Actions */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-surface-border">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 w-full sm:w-auto">
                      <span className="text-zinc-200 font-medium">{selectedPhotoIds.size}</span> of{" "}
                      <span>{info.photos.length} photos selected</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleDownloadPhotos}
                        disabled={selectedPhotoIds.size === 0 || isDownloadingPhotos}
                        loading={isDownloadingPhotos}
                        className="flex-1 sm:flex-initial"
                      >
                        {!isDownloadingPhotos && <DownloadIcon size={14} />}
                        Download Photos ({selectedPhotoIds.size})
                      </Button>

                      <div className="flex items-center gap-1.5 bg-zinc-900 border border-surface-border rounded-lg px-2 py-1">
                        <span className="text-[11px] text-zinc-400">Duration:</span>
                        <select
                          value={slideshowDuration}
                          onChange={(e) => setSlideshowDuration(Number(e.target.value))}
                          className="bg-transparent text-xs text-zinc-200 outline-none"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value={2}>2s / slide</option>
                          <option value={3}>3s / slide</option>
                          <option value={5}>5s / slide</option>
                        </select>
                      </div>

                      <Button
                        size="sm"
                        onClick={handleRenderSlideshow}
                        disabled={selectedPhotoIds.size === 0 || isRenderingSlideshow}
                        loading={isRenderingSlideshow}
                        className="bg-purple-600 hover:bg-purple-500 text-white flex-1 sm:flex-initial"
                        title="Render selected photos as a video slideshow via FFmpeg"
                      >
                        {!isRenderingSlideshow && <Film size={14} />}
                        Render Slideshow MP4
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* 2. VIDEO QUALITIES SECTION */}
              <Card className="p-4 bg-surface-raised border border-surface-border">
                <div className="flex items-center gap-2 mb-3">
                  <Video size={16} className="text-blue-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                    Video Downloads
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {info.availableQualities.length === 0 ? (
                    <QualityRow
                      label="Best available video stream"
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
                </div>
              </Card>

              {/* 3. DEDICATED AUDIO BITRATE & FORMAT SELECTOR */}
              <Card className="p-4 bg-surface-raised border border-surface-border">
                <div className="flex items-center gap-2 mb-3">
                  <Music size={16} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                    Audio & Song Extraction
                  </p>
                </div>

                <div className="p-3 bg-zinc-900/60 rounded-xl border border-surface-border space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Audio Format</label>
                      <select
                        value={audioFormatExt}
                        onChange={(e) => setAudioFormatExt(e.target.value)}
                        className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus-ring"
                        style={{ colorScheme: "dark" }}
                      >
                        <option value="mp3">MP3 (Universal, Best for Players)</option>
                        <option value="m4a">M4A / AAC (Apple & Mobile Standard)</option>
                        <option value="flac">FLAC (Lossless Studio Quality)</option>
                        <option value="wav">WAV (Uncompressed PCM)</option>
                        <option value="opus">OPUS (Modern Low-Bitrate Voice/Music)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">Audio Bitrate</label>
                      <select
                        value={audioBitrate}
                        onChange={(e) => setAudioBitrate(e.target.value)}
                        className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus-ring"
                        style={{ colorScheme: "dark" }}
                      >
                        <option value="320k">320 kbps (Ultra High Quality CBR)</option>
                        <option value="256k">256 kbps (High Fidelity)</option>
                        <option value="192k">192 kbps (Standard CD Quality)</option>
                        <option value="128k">128 kbps (Compact Storage)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-zinc-400">
                      Extracts crystal-clear audio stream directly with FFmpeg encoding.
                    </span>

                    <Button
                      size="sm"
                      onClick={handleDownloadCustomAudio}
                      disabled={downloadingIds.has(`audio-${audioFormatExt}-${audioBitrate}`)}
                      loading={downloadingIds.has(`audio-${audioFormatExt}-${audioBitrate}`)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      {!downloadingIds.has(`audio-${audioFormatExt}-${audioBitrate}`) && <Music size={14} />} Download Audio ({audioFormatExt.toUpperCase()} {audioBitrate})
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      ) : (
        /* BATCH / PLAYLIST URLS MODE */
        <Card className="p-4 bg-surface-raised border border-surface-border space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">Batch / Playlist URLs</h3>
            <p className="text-xs text-zinc-400">
              Paste multiple video, music, or post URLs (one per line). Extract metadata and queue bulk downloads.
            </p>
          </div>

          <textarea
            value={batchUrlsText}
            onChange={(e) => setBatchUrlsText(e.target.value)}
            rows={5}
            placeholder="https://www.youtube.com/watch?v=...&#10;https://www.tiktok.com/@user/video/...&#10;https://www.instagram.com/p/..."
            className="w-full bg-zinc-900 border border-surface-border rounded-lg p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring outline-none font-mono"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">
              {batchUrlsText.split("\n").filter((l) => l.trim()).length} link(s) entered
            </span>

            <Button
              onClick={handleBatchExtract}
              disabled={!batchUrlsText.trim() || batchLoading}
              loading={batchLoading}
              size="md"
            >
              {!batchLoading && <Search size={15} />}
              {batchLoading ? "Analyzing links…" : "Extract All Links"}
            </Button>
          </div>

          {/* Batch Results Table */}
          {batchResults.length > 0 && (
            <div className="pt-3 border-t border-surface-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                  Extracted Items ({batchResults.length})
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleBatchDownloadAll("audio")}
                  >
                    <Music size={13} /> Download All as MP3
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleBatchDownloadAll("video")}
                  >
                    <DownloadIcon size={13} /> Download All Video
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {batchResults.map((res, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface border border-surface-border text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {res.info?.thumbnail ? (
                        <img
                          src={res.info.thumbnail}
                          alt=""
                          className="w-12 h-8 object-cover rounded shrink-0 border border-surface-border"
                        />
                      ) : (
                        <div className="w-12 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                          <Film size={14} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-zinc-200 font-medium truncate">
                          {res.info ? res.info.title : res.url}
                        </p>
                        <p className="text-zinc-500 truncate">
                          {res.info ? `${res.info.uploader} · ${formatEta(res.info.durationSec)}` : (res.error || "Failed to extract")}
                        </p>
                      </div>
                    </div>

                    {res.info ? (
                      <span className="text-emerald-400 flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={13} /> Ready
                      </span>
                    ) : (
                      <span className="text-rose-400 shrink-0">Failed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {schedulingFormat && (
        <ScheduleModal
          open={!!schedulingFormat}
          onCancel={() => setSchedulingFormat(null)}
          onConfirm={(scheduledFor: string) => void handleSchedule(schedulingFormat, scheduledFor)}
          title={`Schedule ${schedulingFormat.label}`}
        />
      )}

      {duplicateItem && (
        <DuplicateDownloadModal
          isOpen={!!duplicateItem}
          url={duplicateItem.url}
          filename={duplicateItem.filename}
          onConfirm={() => {
            const item = duplicateItem;
            setDuplicateItem(null);
            void handleDownload(item.format, true);
          }}
          onCancel={() => setDuplicateItem(null)}
        />
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
