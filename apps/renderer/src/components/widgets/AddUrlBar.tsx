import { useState } from "react";
import { Plus, Link2, AlertCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useToast } from "../ui/Toast";
import { useUiStore } from "../../stores/uiStore";

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

export function AddUrlBar() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const addUrl = useDownloadsStore((s) => s.addUrl);
  const { showToast } = useToast();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    
    // Check if this is a social media/video platform URL
    if (isSocialMediaUrl(url.trim())) {
      showToast(
        "This looks like a video platform URL. Please use the Social Grab tab for YouTube, TikTok, Instagram, Pornhub, and other video sites.",
        "error",
        6000
      );
      // Optionally auto-switch to Social Grab tab
      setTimeout(() => {
        setActiveTab("social");
      }, 1500);
      return;
    }
    
    setSubmitting(true);
    try { 
      await addUrl(url.trim()); 
      setUrl(""); 
      showToast("Download added successfully!", "success", 3000);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to add download",
        "error"
      );
    } finally { 
      setSubmitting(false); 
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex items-center gap-2 p-2 mb-6">
      <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a direct file download URL (e.g., https://example.com/file.zip)…"
        className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
      />
      <Button type="submit" disabled={!url.trim() || submitting} size="md">
        <Plus size={16} /> Add
      </Button>
    </form>
  );
}
