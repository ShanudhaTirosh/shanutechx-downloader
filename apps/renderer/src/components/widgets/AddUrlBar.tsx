import { useState } from "react";
import { Plus, Link2 } from "lucide-react";
import { Button } from "../ui/Button";
import { useDownloadsStore } from "../../stores/downloadsStore";

export function AddUrlBar() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const addUrl = useDownloadsStore((s) => s.addUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try { await addUrl(url.trim()); setUrl(""); } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex items-center gap-2 p-2 mb-6">
      <Link2 size={16} className="text-zinc-500 ml-2 shrink-0" />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a download URL…"
        className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-600 py-2"
      />
      <Button type="submit" disabled={!url.trim() || submitting} size="md">
        <Plus size={16} /> Add
      </Button>
    </form>
  );
}
