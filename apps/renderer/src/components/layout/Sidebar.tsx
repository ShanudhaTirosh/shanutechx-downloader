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
      animate={{ width: sidebarExpanded ? 220 : 72 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-full border-r border-surface-border bg-surface-base/60 backdrop-blur-sm shrink-0"
    >
      <nav className="flex-1 flex flex-col gap-1.5 p-3 mt-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={!sidebarExpanded ? label : undefined}
              className={clsx(
                "relative flex items-center gap-3 h-11 rounded-lg text-sm font-medium transition-all duration-200 focus-ring",
                sidebarExpanded ? "px-3" : "px-0 justify-center",
                active 
                  ? "text-white shadow-lg shadow-brand-secondary/25" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-raised-hover",
              )}
            >
              {active && (
                <motion.div
                  layoutId="active-nav-pill"
                  className="absolute inset-0 bg-brand-gradient rounded-lg -z-10"
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
              <Icon size={19} className="shrink-0" strokeWidth={2.5} />
              {sidebarExpanded && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="truncate"
                >
                  {label}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-surface-border/50" />

      <button
        onClick={toggleSidebar}
        className={clsx(
          "flex items-center gap-3 h-10 m-3 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover focus-ring transition-colors",
          sidebarExpanded ? "px-3" : "px-0 justify-center"
        )}
      >
        <ChevronsLeft 
          size={18} 
          className={clsx(
            "transition-transform duration-300", 
            !sidebarExpanded && "rotate-180"
          )} 
        />
        {sidebarExpanded && <span className="text-xs font-medium">Collapse</span>}
      </button>
    </motion.aside>
  );
}

