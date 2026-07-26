import { motion } from "framer-motion";
import { LayoutDashboard, Download, Clapperboard, Magnet, AudioLines, History, Settings, ChevronsLeft } from "lucide-react";
import clsx from "clsx";
import { useUiStore, type TabId } from "../../stores/uiStore";

const NAV_ITEMS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "social", label: "Social Grab", icon: Clapperboard },
  { id: "torrents", label: "Torrents", icon: Magnet },
  { id: "converter", label: "Converter", icon: AudioLines },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarExpanded, toggleSidebar } = useUiStore();

  return (
    <motion.aside
      animate={{ width: sidebarExpanded ? 220 : 64 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-full border-r border-surface-border bg-surface-raised/40 shrink-0"
    >
      <nav className="flex-1 flex flex-col gap-1 p-2 mt-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                "relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm transition-colors focus-ring",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-raised-hover",
              )}
            >
              {active && (
                <motion.div
                  layoutId="active-nav-pill"
                  className="absolute inset-0 bg-brand-gradient rounded-xl -z-10"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
              <Icon size={18} className="shrink-0" />
              {sidebarExpanded && <span className="truncate font-medium">{label}</span>}
            </button>
          );
        })}
      </nav>

      <button
        onClick={toggleSidebar}
        className="flex items-center gap-3 h-10 px-3 m-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover focus-ring"
      >
        <ChevronsLeft size={18} className={clsx("transition-transform duration-200", !sidebarExpanded && "rotate-180")} />
        {sidebarExpanded && <span className="text-xs">Collapse</span>}
      </button>
    </motion.aside>
  );
}
