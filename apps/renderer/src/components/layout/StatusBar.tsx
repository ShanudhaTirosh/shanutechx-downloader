import { useEffect, useState } from "react";
import { ipc } from "../../lib/ipc-client";

function formatSpeed(bps: number): string {
  if (bps === 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bps;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function StatusBar() {
  const [downBps, setDownBps] = useState(0);
  const [upBps, setUpBps] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const unsubscribe = ipc.on("queue:global-speed", (data) => {
      setDownBps(data.downBps);
      setUpBps(data.upBps);
      setActiveCount(data.activeCount);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="h-7 flex items-center gap-4 px-4 text-[11px] text-zinc-500 border-t border-surface-border">
      <span className={downBps > 0 ? "text-emerald-400" : ""}>↓ {formatSpeed(downBps)}</span>
      <span className={upBps > 0 ? "text-sky-400" : ""}>↑ {formatSpeed(upBps)}</span>
      <span className="text-zinc-700">|</span>
      <span className={activeCount > 0 ? "text-zinc-300" : ""}>{activeCount} active</span>
      <span className="flex-1" />
      <span>v0.1.0</span>
    </div>
  );
}

