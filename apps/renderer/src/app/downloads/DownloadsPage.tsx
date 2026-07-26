import { useEffect } from "react";
import { AddUrlBar } from "../../components/widgets/AddUrlBar";
import { DownloadCard } from "../../components/widgets/DownloadCard";
import { useDownloadsStore } from "../../stores/downloadsStore";

export function DownloadsPage() {
  const { items, refresh, subscribe } = useDownloadsStore();
  const list = Object.values(items).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  useEffect(() => {
    void refresh();
    return subscribe();
  }, [refresh, subscribe]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Direct Downloads</h1>
      <p className="text-sm text-zinc-500 mb-2">
        Download files directly from HTTP/HTTPS URLs - perfect for direct file links.
      </p>
      <p className="text-xs text-zinc-600 mb-6">
        ⚠️ For YouTube, TikTok, Instagram, Pornhub, or other video platforms → Use <strong className="text-brand-secondary">Social Grab</strong> tab instead
      </p>
      <AddUrlBar />
      {list.length === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-16">No downloads yet — paste a URL above to get started.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((item) => <DownloadCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
