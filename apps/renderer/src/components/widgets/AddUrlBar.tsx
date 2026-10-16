import { useState, type ClipboardEvent, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Link2, Clipboard, Calendar, FolderOpen, X, Layers, Zap } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useToast } from "../ui/Toast";
import { useUiStore } from "../../stores/uiStore";
import { shake, shakeKeyframes } from "../../lib/motion";
import { ScheduleModal } from "./ScheduleModal";
import { DuplicateDownloadModal } from "./DuplicateDownloadModal";
import { BatchDownloadModal } from "./BatchDownloadModal";
import { ipc } from "../../lib/ipc-client";

// Common video/social media domains that should use Social Grab instead
const SOCIAL_MEDIA_DOMAINS = [
  'youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'twitter.com', 'x.com',
  'facebook.com', 'fb.com', 'reddit.com', 'pornhub.com', 'xvideos.com', 'xhamster.com',
  'redtube.com', 'youporn.com', 'xnxx.com', 'spankbang.com', 'vimeo.com', 'dailymotion.com',
  'twitch.tv', 'chaturbate.com', 'stripchat.com', 'cam4.com', 'onlyfans.com'
];

function isSocialMediaUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    return SOCIAL_MEDIA_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AddUrlBar() {
  const [url, setUrl] = useState("");
  const [customDir, setCustomDir] = useState<string | null>(null);
  const [segments, setSegments] = useState<number>(16);
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    open: boolean;
    url: string;
    filename?: string;
    isSchedule?: boolean;
    scheduledFor?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const addUrl = useDownloadsStore((s) => s.addUrl);
  const refresh = useDownloadsStore((s) => s.refresh);
  const { showToast } = useToast();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  function triggerShake() {
    setShakeKey((k) => k + 1);
  }

  async function handleSelectDirectory() {
    try {
      const res = await ipc.invoke("app:selectDirectory", { title: "Select Download Folder" });
      if (res.dirPath) {
        setCustomDir(res.dirPath);
        showToast(`Save location set: ${res.dirPath}`, "info");
      }
    } catch {
      showToast("Could not open directory picker", "error");
    }
  }

  async function handlePasteButton() {
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

  // Pasting a list of URLs (one per line — e.g. copied from a spreadsheet or
  // a text file) adds all of them at once instead of dumping the whole
  // blob into the single-line input as unusable text. Single-URL pastes
  // fall through to the browser's normal paste behavior untouched.
  async function handleMultiUrlPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return; // normal single-URL paste — let the browser handle it

    e.preventDefault();
    const valid = lines.filter(isValidUrl);
    const social = valid.filter(isSocialMediaUrl);
    const direct = valid.filter((u) => !isSocialMediaUrl(u));
    const invalidCount = lines.length - valid.length;

    if (direct.length === 0) {
      triggerShake();
      showToast(
        social.length > 0
          ? `All ${social.length} pasted links are video/social platform URLs — use the Social Grab tab for those.`
          : "None of the pasted lines look like valid URLs.",
        "error",
      );
      return;
    }

    setSubmitting(true);
    let added = 0;
    for (const u of direct) {
      try {
        // Batch add intentionally skips the duplicate-confirmation prompt
        // (allowDuplicate: true) — a blocking confirm() per line for a
        // pasted list of 20 URLs would be unusable. If the same URL is in
        // there twice, both get added; if that's ever a problem in
        // practice, dedupe here.
        await addUrl(u, true, customDir || undefined);
        added += 1;
      } catch {
        // keep going — one bad URL in a batch shouldn't stop the rest
      }
    }
    setSubmitting(false);

    const skipped = [social.length > 0 ? `${social.length} social/video link${social.length > 1 ? "s" : ""} (use Social Grab)` : null, invalidCount > 0 ? `${invalidCount} invalid` : null]
      .filter(Boolean)
      .join(", ");
    showToast(`Added ${added} download${added === 1 ? "" : "s"}${skipped ? ` — skipped ${skipped}` : ""}`, added > 0 ? "success" : "error");
  }

  async function submit(targetUrl: string, allowDuplicate = false) {
    try {
      await addUrl(targetUrl, allowDuplicate, customDir || undefined, segments);
      setUrl("");
      showToast(`Download added (${segments} parallel streams)!`, "success", 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add download";
      const duplicateMatch = /^DUPLICATE_URL:/.exec(message);
      if (duplicateMatch) {
        const parts = message.split(":");
        const filename = parts.slice(2).join(":") || undefined;
        setDuplicateModal({ open: true, url: targetUrl, filename });
        return;
      }
      triggerShake();
      showToast(message, "error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || isSubmittingRef.current || submitting) return;

    if (isSocialMediaUrl(url.trim())) {
      triggerShake();
      showToast(
        "This looks like a video platform URL. Please use the Social Grab tab for YouTube, TikTok, Instagram, and other video sites.",
        "error",
        6000
      );
      setTimeout(() => setActiveTab("social"), 1500);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      await submit(url.trim());
    } finally {
      setSubmitting(false);
      setTimeout(() => { isSubmittingRef.current = false; }, 350);
    }
  }

  async function handleSchedule(scheduledFor: string) {
    setScheduleOpen(false);
    const trimmed = url.trim();
    if (!trimmed) return;
    if (isSocialMediaUrl(trimmed)) {
      showToast("Use Social Grab to schedule video/social platform downloads.", "error", 5000);
      return;
    }
    try {
      await ipc.invoke("downloads:scheduleNew", { url: trimmed, scheduledFor });
      await refresh();
      setUrl("");
      const when = new Date(scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      showToast(`Scheduled for ${when}`, "success", 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to schedule";
      const dup = /^DUPLICATE_URL:/.exec(message);
      if (dup) {
        const parts = message.split(":");
        const filename = parts.slice(2).join(":") || undefined;
        setDuplicateModal({ open: true, url: trimmed, filename, isSchedule: true, scheduledFor });
        return;
      }
      showToast(message, "error");
    }
  }

  return (
    <>
      <BatchDownloadModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
      />
      <ScheduleModal
        open={scheduleOpen}
        title="Schedule Download"
        onConfirm={handleSchedule}
        onCancel={() => setScheduleOpen(false)}
      />
      <DuplicateDownloadModal
        isOpen={Boolean(duplicateModal?.open)}
        url={duplicateModal?.url || ""}
        filename={duplicateModal?.filename}
        onConfirm={async () => {
          if (!duplicateModal) return;
          const { url: dupUrl, isSchedule, scheduledFor: dupScheduledFor } = duplicateModal;
          setDuplicateModal(null);
          if (isSchedule && dupScheduledFor) {
            await ipc.invoke("downloads:scheduleNew", { url: dupUrl, scheduledFor: dupScheduledFor, allowDuplicate: true });
            await refresh();
            setUrl("");
            showToast("Scheduled duplicate copy successfully!", "success");
          } else {
            await submit(dupUrl, true);
          }
        }}
        onCancel={() => setDuplicateModal(null)}
      />
      <motion.form
        onSubmit={handleSubmit}
        key={shakeKey}
        animate={shakeKey > 0 ? { x: shakeKeyframes } : undefined}
        transition={shake}
        className="glass-panel flex items-center gap-2 p-2 mb-6"
      >
        <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handleMultiUrlPaste as unknown as React.ClipboardEventHandler<HTMLInputElement>}
          placeholder="Paste a direct file URL — or a list of URLs, one per line, to add them all…"
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

        {/* Custom Folder button */}
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

        {/* Acceleration Threads Selector button */}
        <button
          type="button"
          onClick={() => {
            const next = segments === 1 ? 4 : segments === 4 ? 8 : segments === 8 ? 16 : segments === 16 ? 32 : 1;
            setSegments(next);
            showToast(`Parallel streams set to ${next}x threads`, "info", 2000);
          }}
          title={`Parallel Connections: ${segments} threads (Click to cycle: 1, 4, 8, 16, 32)`}
          className="h-8 px-2 flex items-center gap-1 rounded-lg text-xs font-semibold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors focus-ring shrink-0"
        >
          <Zap size={13} className="text-cyan-400" />
          <span>{segments}x</span>
        </button>

        {/* Paste button */}
        <button
          type="button"
          onClick={handlePasteButton}
          title="Paste from clipboard"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
        >
          <Clipboard size={15} />
        </button>

        {/* Batch multi-URL downloader modal button */}
        <button
          type="button"
          onClick={() => setBatchOpen(true)}
          title="Batch download multiple URLs"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-brand-primary hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
        >
          <Layers size={15} />
        </button>

        {/* Schedule button — opens datetime picker */}
        <button
          type="button"
          onClick={() => {
            if (!url.trim()) { showToast("Paste a URL first, then click Schedule.", "error"); return; }
            setScheduleOpen(true);
          }}
          title="Schedule download for later"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-brand-secondary hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
        >
          <Calendar size={15} />
        </button>

        <Button type="submit" disabled={!url.trim() || submitting} loading={submitting} size="md">
          {!submitting && <Plus size={16} />} Add
        </Button>
      </motion.form>
    </>
  );
}
