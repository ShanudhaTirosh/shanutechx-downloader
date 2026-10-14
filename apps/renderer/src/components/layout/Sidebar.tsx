import { useState } from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, Download, Clapperboard, Magnet, AudioLines, Settings, ChevronsLeft, Pin } from "lucide-react";
import clsx from "clsx";
import { useUiStore, type TabId } from "../../stores/uiStore";
import { springs } from "../../lib/motion";

const NAV_ITEMS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "downloads", label: "Direct Downloads", icon: Download },
  { id: "social", label: "Social Grab", icon: Clapperboard },
  { id: "torrents", label: "Torrents", icon: Magnet },
  { id: "converter", label: "Converter", icon: AudioLines },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarExpanded, toggleSidebar } = useUiStore();
  const [isHovered, setIsHovered] = useState(false);

  // Auto-expand on hover when collapsed, or stay open when locked
  const expanded = sidebarExpanded || isHovered;

  return (
    <motion.aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      animate={{ width: expanded ? 220 : 72 }}
      transition={springs.gentle}
      className="flex flex-col h-full border-r border-surface-border bg-surface-base/80 backdrop-blur-md shrink-0 select-none z-20"
    >
      <nav className="flex-1 flex flex-col gap-1.5 p-3 mt-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <motion.button
              key={id}
              onClick={() => setActiveTab(id)}
              title={!expanded ? label : undefined}
              whileTap={{ scale: 0.96 }}
              transition={springs.snappy}
              className={clsx(
                "relative flex items-center gap-3 h-11 rounded-lg text-sm font-medium transition-colors duration-200 focus-ring",
                expanded ? "px-3" : "px-0 justify-center",
                active 
                  ? "text-white shadow-lg shadow-brand-secondary/25" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-raised-hover",
              )}
            >
              {active && (
                <motion.div
                  layoutId="active-nav-pill"
                  className="absolute inset-0 bg-brand-gradient rounded-lg -z-10"
                  transition={springs.gentle}
                />
              )}
              <Icon size={19} className="shrink-0" strokeWidth={2.5} />
              {expanded && (
                <motion.span 
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="truncate"
                >
                  {label}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="border-t border-surface-border/50" />

      {/* Pin / Auto-collapse mode toggle */}
      <motion.button
        onClick={toggleSidebar}
        whileTap={{ scale: 0.95 }}
        transition={springs.snappy}
        title={sidebarExpanded ? "Switch to auto-collapse on hover" : "Pin sidebar open"}
        className={clsx(
          "flex items-center gap-3 h-10 m-3 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised-hover focus-ring transition-colors",
          expanded ? "px-3" : "px-0 justify-center"
        )}
      >
        <motion.span
          animate={{ rotate: sidebarExpanded ? 0 : 180 }}
          transition={springs.gentle}
          className="inline-flex shrink-0"
        >
          {sidebarExpanded ? <ChevronsLeft size={17} /> : <Pin size={16} />}
        </motion.span>
        {expanded && (
          <motion.span 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs font-medium truncate"
          >
            {sidebarExpanded ? "Auto-collapse" : "Pin Open"}
          </motion.span>
        )}
      </motion.button>
    </motion.aside>
  );
}
