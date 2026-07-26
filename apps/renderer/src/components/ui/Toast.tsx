import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import clsx from "clsx";

export interface ToastItem {
  id: string;
  message: string;
  kind: "success" | "error" | "info";
}

const iconByKind = { success: CheckCircle2, error: XCircle, info: Info };
const colorByKind = { success: "text-status-success", error: "text-status-danger", info: "text-status-info" };

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = iconByKind[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2 }}
              className="glass-panel flex items-start gap-2.5 px-4 py-3 shadow-2xl"
            >
              <Icon size={18} className={clsx("mt-0.5 shrink-0", colorByKind[t.kind])} />
              <p className="text-sm text-zinc-200 flex-1">{t.message}</p>
              <button onClick={() => onDismiss(t.id)} className="text-zinc-500 hover:text-zinc-300 focus-ring rounded">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
