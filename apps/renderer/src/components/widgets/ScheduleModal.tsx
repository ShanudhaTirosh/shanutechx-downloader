import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, X, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/Button";
import { springs } from "../../lib/motion";

interface ScheduleModalProps {
  /** Title shown at the top */
  title?: string;
  /** Called when the user confirms with a chosen datetime. ISO string. */
  onConfirm: (scheduledFor: string) => void;
  /** Called when the user dismisses without scheduling */
  onCancel: () => void;
  open: boolean;
}

/** Round up to next 5-minute boundary for a sensible default */
function defaultScheduleTime(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 5) * 5);
  // Local datetime-local input format: "YYYY-MM-DDTHH:MM"
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minimum datetime-local value: now + 1 minute */
function minScheduleTime(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleModal({ title = "Schedule Download", onConfirm, onCancel, open }: ScheduleModalProps) {
  const [value, setValue] = useState(defaultScheduleTime);

  // Reset to a fresh default whenever the modal opens
  useEffect(() => {
    if (open) setValue(defaultScheduleTime());
  }, [open]);

  function handleConfirm() {
    if (!value) return;
    // Convert local datetime-local value to a full ISO string
    const iso = new Date(value).toISOString();
    onConfirm(iso);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="schedule-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.gentle}
            onClick={onCancel}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          {/* Panel */}
          <motion.div
            key="schedule-panel"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={springs.snappy}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm glass-panel p-5 flex flex-col gap-5 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-100">
                  <Calendar size={18} className="text-brand-secondary" />
                  <span className="font-semibold text-sm">{title}</span>
                </div>
                <button
                  onClick={onCancel}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-surface-raised-hover transition-colors focus-ring"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Picker */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <Clock size={12} /> Start at
                </label>
                <input
                  type="datetime-local"
                  value={value}
                  min={minScheduleTime()}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full bg-surface-raised border border-surface-border rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus-ring"
                  style={{ colorScheme: "dark" }}
                />
                <p className="text-xs text-zinc-600 mt-1">
                  The download will be queued and automatically start at the selected time, even if the app is idle.
                  Make sure the app stays running.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end">
                <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={handleConfirm} disabled={!value}>
                  <CheckCircle2 size={14} /> Schedule
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
