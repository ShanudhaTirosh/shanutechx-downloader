import { useState, type ClipboardEvent, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Link2, Clipboard } from "lucide-react";
import { Button } from "../ui/Button";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useToast } from "../ui/Toast";
import { useUiStore } from "../../stores/uiStore";
import { shake, shakeKeyframes } from "../../lib/motion";

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
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const addUrl = useDownloadsStore((s) => s.addUrl);
  const { showToast } = useToast();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  function triggerShake() {
    setShakeKey((k) => k + 1);
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
        await addUrl(u, true);
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
      await addUrl(targetUrl, allowDuplicate);
      setUrl("");
      showToast("Download added successfully!", "success", 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add download";
      const duplicateMatch = /^DUPLICATE_URL:/.exec(message);
      if (duplicateMatch) {
        // A blocking confirm() here (rather than a toast-only warning) is
        // deliberate — this is a decision the person needs to make before
        // anything happens, not a fire-and-forget notification.
        const proceed = confirm("You've already downloaded (or are downloading) this URL. Add another copy anyway?");
        if (proceed) {
          await submit(targetUrl, true);
          return;
        }
        return;
      }
      triggerShake();
      showToast(message, "error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    if (isSocialMediaUrl(url.trim())) {
      triggerShake();
      showToast(
        "This looks like a video platform URL. Please use the Social Grab tab for YouTube, TikTok, Instagram, Pornhub, and other video sites.",
        "error",
        6000
      );
      setTimeout(() => setActiveTab("social"), 1500);
      return;
    }

    setSubmitting(true);
    await submit(url.trim());
    setSubmitting(false);
  }

  return (
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
        className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
      />
      {/* Paste button — one-click clipboard read */}
      <button
        type="button"
        onClick={handlePasteButton}
        title="Paste from clipboard"
        className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover transition-colors focus-ring shrink-0"
      >
        <Clipboard size={15} />
      </button>
      <Button type="submit" disabled={!url.trim() || submitting} loading={submitting} size="md">
        {!submitting && <Plus size={16} />} Add
      </Button>
    </motion.form>
  );
}
