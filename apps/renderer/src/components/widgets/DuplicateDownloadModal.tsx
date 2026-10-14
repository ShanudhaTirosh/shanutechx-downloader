import { motion, AnimatePresence } from "framer-motion";
import { Copy, X, Plus, AlertCircle, FileDown } from "lucide-react";
import { Button } from "../ui/Button";
import { springs } from "../../lib/motion";

interface DuplicateDownloadModalProps {
  isOpen: boolean;
  url: string;
  filename?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicateDownloadModal({
  isOpen,
  url,
  filename,
  onConfirm,
  onCancel,
}: DuplicateDownloadModalProps) {
  if (!isOpen) return null;

  // Suggest a (1) filename preview
  const displayName = filename || (() => {
    try {
      const u = new URL(url);
      const base = u.pathname.split("/").filter(Boolean).pop();
      return base || url;
    } catch {
      return url;
    }
  })();

  const dotIdx = displayName.lastIndexOf(".");
  const suggestedDuplicateName = dotIdx > 0
    ? `${displayName.slice(0, dotIdx)} (1)${displayName.slice(dotIdx)}`
    : `${displayName} (1)`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={springs.snappy}
          className="relative w-full max-w-md bg-surface-raised border border-surface-border rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col gap-4 z-10"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Copy size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Duplicate Download</h3>
                <p className="text-xs text-zinc-400">Item already exists in downloads</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-surface-overlay transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-zinc-300 leading-relaxed">
            You've already downloaded or are currently downloading this URL. Would you like to download another copy?
          </p>

          {/* File renaming preview box */}
          <div className="bg-surface-base border border-surface-border rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <FileDown size={14} className="text-brand-secondary shrink-0" />
              <span>Will be saved with unique copy suffix:</span>
            </div>
            <div className="bg-surface-raised px-3 py-1.5 rounded border border-brand-primary/30 text-xs font-mono text-brand-secondary truncate">
              {suggestedDuplicateName}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 mt-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onConfirm();
              }}
            >
              <Plus size={15} /> Download as (1)
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
