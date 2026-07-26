import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/Toast";
import { useUiStore } from "./stores/uiStore";
import { useSettingsStore } from "./stores/settingsStore";
import { DashboardPage } from "./app/dashboard/DashboardPage";
import { DownloadsPage } from "./app/downloads/DownloadsPage";
import { SocialPage } from "./app/social/SocialPage";
import { TorrentsPage } from "./app/torrents/TorrentsPage";
import { ConverterPage } from "./app/converter/ConverterPage";
import { HistoryPage } from "./app/history/HistoryPage";
import { SettingsPage } from "./app/settings/SettingsPage";

const PAGES = {
  dashboard: DashboardPage,
  downloads: DownloadsPage,
  social: SocialPage,
  torrents: TorrentsPage,
  converter: ConverterPage,
  history: HistoryPage,
  settings: SettingsPage,
} as const;

export default function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const Page = PAGES[activeTab];
  const { settings, load } = useSettingsStore();

  useEffect(() => { void load(); }, [load]);

  // Real read-site for the `theme` setting — applied as a DOM attribute so
  // future theme variants (a light mode) just need a CSS block keyed off
  // this attribute, not a UI rewrite. Only "dark" exists today, but this is
  // where it's actually consumed rather than sitting unread in the DB.
  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  return (
    <ToastProvider>
      <AppShell>
        <Page />
      </AppShell>
    </ToastProvider>
  );
}

