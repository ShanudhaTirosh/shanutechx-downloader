import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers, FolderOpen, Zap, AlertCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { useDownloadsStore } from "../../stores/downloadsStore";
import { useToast } from "../ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { springs } from "../../lib/motion";

interface BatchDownloadModalProps {
  open: boolean;
  onClose: () => void;
}

export function BatchDownloadModal({ open, onClose }: BatchDownloadModalProps) {
  const [text, setText] = useState("");
  const [segments, setSegments] = useState<number>(16);
  const [customDir, setCustomDir] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { batchAdd } = useDownloadsStore();
  const { showToast } = useToast();

  if (!open) return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"));

  async function handleSelectDirectory() {
    try {
      const res = await ipc.invoke("app:selectDirectory", { title: "Select Batch Download Folder" });
      if (res.dirPath) {
        setCustomDir(res.dirPath);
        showToast(`Batch save location set: ${res.dirPath}`, "info");
      }
    } catch {
      showToast("Could not open directory picker", "error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0 || submitting) return;

    setSubmitting(true);
    try {
      const { added } = await batchAdd(lines, customDir || undefined, segments);
      showToast(`Added ${added} download${added === 1 ? "" : "s"} to queue!`, "success");
      setText("");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to queue batch downloads", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={springs.gentle}
          className="relative w-full max-w-lg glass-panel p-6 shadow-2xl border border-white/10 rounded-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                <Layers size={18} />
              </div>
              <h2 className="text-base font-semibold text-zinc-100">Batch Multi-URL Downloader</h2>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-zinc-400">
            Paste multiple HTTP/HTTPS direct download links below (one per line). All links will be queued with parallel multi-connection acceleration.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="https://example.com/file1.iso&#10;https://example.com/archive.zip&#10;https://example.com/video.mp4"
                className="w-full bg-surface-raised/70 border border-white/10 rounded-xl p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary font-mono resize-none"
              />
              <div className="flex justify-between items-center text-[11px] text-zinc-500 mt-1">
                <span>{lines.length} valid URL{lines.length === 1 ? "" : "s"} detected</span>
                {lines.length > 0 && (
                  <button type="button" onClick={() => setText("")} className="hover:text-zinc-300">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Acceleration Threads Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Zap size={13} className="text-cyan-400" /> Parallel Connections per File (Speed Acceleration)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 4, 8, 16, 32].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSegments(s)}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      segments === s
                        ? "bg-brand-primary text-white border-brand-primary shadow-sm"
                        : "bg-surface-raised/50 text-zinc-400 border-white/5 hover:text-zinc-200"
                    }`}
                  >
                    {s} {s === 1 ? "Thread" : "Threads"}
                  </button>
                ))}
              </div>
            </div>

            {/* Folder Picker */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-raised/40 border border-white/5 text-xs">
              <div className="flex items-center gap-2 truncate mr-2">
                <FolderOpen size={14} className="text-zinc-500 shrink-0" />
                <span className="text-zinc-400 truncate">
                  {customDir ? customDir : "Default download directory"}
                </span>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleSelectDirectory}>
                Change Folder
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={lines.length === 0 || submitting} loading={submitting}>
                Queue {lines.length} Download{lines.length === 1 ? "" : "s"}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
