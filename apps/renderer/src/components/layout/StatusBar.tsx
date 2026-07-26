export function StatusBar() {
  // Phase 1+: subscribe to "queue:global-speed" via ipc.on and render real
  // down/up throughput + active count here instead of these placeholders.
  return (
    <div className="h-7 flex items-center gap-4 px-4 text-[11px] text-zinc-500 border-t border-surface-border">
      <span>↓ 0 B/s</span>
      <span>↑ 0 B/s</span>
      <span className="text-zinc-700">|</span>
      <span>0 active</span>
      <span className="flex-1" />
      <span>v0.1.0</span>
    </div>
  );
}
