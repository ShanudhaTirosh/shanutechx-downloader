import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpCircle, Download, ExternalLink, X, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { ipc } from "../../lib/ipc-client";
import { springs } from "../../lib/motion";

interface UpdateInfo {
  version: string;
  releaseNotes: string;
  downloadUrl?: string;
  publishedAt?: string;
}

export function UpdateModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("0.2.0");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    // Fetch current app version
    ipc.invoke("app:getVersion", undefined)
      .then((v) => setCurrentVersion(v.version))
      .catch(() => {});

    // Listen for background update detection
    const unsubAvailable = ipc.on("update:available", (info) => {
      setUpdateInfo(info);
      setIsOpen(true);
      setIsDownloaded(false);
      setDownloadPercent(null);
    });

    const unsubProgress = ipc.on("update:download-progress", (p) => {
      setIsDownloading(true);
      setDownloadPercent(p.percent);
    });

    const unsubDownloaded = ipc.on("update:downloaded", () => {
      setIsDownloading(false);
      setIsDownloaded(true);
      setDownloadPercent(100);
    });

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubDownloaded();
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    setIsDownloading(true);
    setDownloadPercent(0);
    try {
      await ipc.invoke("app:downloadUpdate", undefined);
    } catch (err) {
      console.error("Failed to start update download:", err);
      setIsDownloading(false);
    }
  }, []);

  const handleOpenGitHub = useCallback(() => {
    if (updateInfo?.downloadUrl) {
      window.open(updateInfo.downloadUrl, "_blank");
    } else {
      window.open("https://github.com/ShanudhaTirosh/shanutechx-downloader/releases/latest", "_blank");
    }
  }, [updateInfo]);

  if (!isOpen || !updateInfo) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={springs.gentle}
          className="glass-panel w-full max-w-lg p-6 relative border-brand-secondary/30 shadow-2xl shadow-brand-primary/10"
        >
          {/* Close button */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded-lg hover:bg-surface-raised"
          >
            <X size={16} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3.5 mb-4">
            <div className="h-11 w-11 rounded-xl bg-brand-gradient flex items-center justify-center text-white shadow-lg shadow-brand-primary/30">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                New Update Available
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-brand-secondary/10 border border-brand-secondary/25 text-brand-secondary">
                  v{updateInfo.version}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Current: <span className="text-zinc-300 font-mono">v{currentVersion}</span> → Latest: <span className="text-brand-secondary font-mono">v{updateInfo.version}</span>
              </p>
            </div>
          </div>

          {/* Release Notes */}
          <div className="mb-5">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">What&apos;s New:</p>
            <div className="max-h-48 overflow-y-auto p-3.5 rounded-xl bg-surface-base/80 border border-surface-border text-xs text-zinc-300 space-y-1.5 whitespace-pre-wrap leading-relaxed">
              {updateInfo.releaseNotes}
            </div>
          </div>

          {/* Download Progress Bar if downloading */}
          {isDownloading && (
            <div className="mb-5 p-3 rounded-xl bg-surface-base/60 border border-surface-border">
              <div className="flex items-center justify-between text-xs text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin text-brand-secondary" />
                  Downloading update installer…
                </span>
                <span className="font-mono text-brand-secondary font-medium">{downloadPercent ?? 0}%</span>
              </div>
              <div className="h-1.5 w-full bg-surface-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-brand-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${downloadPercent ?? 0}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          )}

          {isDownloaded && (
            <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-status-success/10 border border-status-success/20 text-status-success text-xs">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Update downloaded! The installer is ready to run.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleOpenGitHub}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <ExternalLink size={14} /> Release on GitHub
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsOpen(false)}
                disabled={isDownloading}
              >
                Later
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleUpdate}
                disabled={isDownloading}
                loading={isDownloading}
              >
                {!isDownloading && <Download size={14} />}
                {isDownloaded ? "Launch Installer" : "Update Now"}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
