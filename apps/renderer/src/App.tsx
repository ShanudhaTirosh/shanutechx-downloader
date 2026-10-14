import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { UpdateModal } from "./components/widgets/UpdateModal";
import { useUiStore } from "./stores/uiStore";
import { useSettingsStore } from "./stores/settingsStore";
import { DashboardPage } from "./app/dashboard/DashboardPage";
import { DownloadsPage } from "./app/downloads/DownloadsPage";
import { SocialPage } from "./app/social/SocialPage";
import { TorrentsPage } from "./app/torrents/TorrentsPage";
import { ConverterPage } from "./app/converter/ConverterPage";
import { SettingsPage } from "./app/settings/SettingsPage";

const PAGES = {
  dashboard: DashboardPage,
  downloads: DownloadsPage,
  social: SocialPage,
  torrents: TorrentsPage,
  converter: ConverterPage,
  history: DashboardPage,
  settings: SettingsPage,
} as const;

export default function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const Page = PAGES[activeTab] || DashboardPage;
  const { settings, load } = useSettingsStore();

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  return (
    <ToastProvider>
      <AppShell>
        <ErrorBoundary key={activeTab}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <Page />
          </motion.div>
        </ErrorBoundary>
        <UpdateModal />
      </AppShell>
    </ToastProvider>
  );
}
