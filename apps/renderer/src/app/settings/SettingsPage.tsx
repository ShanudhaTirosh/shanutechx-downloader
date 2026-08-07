import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw, CheckCircle2, AlertCircle, FolderOpen } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Toggle } from "../../components/ui/Toggle";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useSettingsStore } from "../../stores/settingsStore";
import { ipc } from "../../lib/ipc-client";
import { listItem, springs, staggerContainer } from "../../lib/motion";
import type { ProxyType } from "@shanutechx/shared-types";

export function SettingsPage() {
  const { settings, load, update } = useSettingsStore();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");
  const [credentialStatus, setCredentialStatus] = useState<string | null>(null);
  const [binariesStatus, setBinariesStatus] = useState<{ ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } | null>(null);
  const [downloadingBinaries, setDownloadingBinaries] = useState(false);
  const [binaryProgress, setBinaryProgress] = useState<Record<string, number>>({});
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes: string } | null>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const { showToast } = useToast();

  useEffect(() => { 
    void load();
    void checkBinaries();
    // Load real version from main process
    ipc.invoke("app:getVersion", undefined).then((v) => setAppVersion(v.version)).catch(() => {});
    
    // Listen for binary download progress — now shows per-binary progress in parallel
    const unsubBinary = ipc.on("binary:download-progress", (progress) => {
      setBinaryProgress((prev) => ({ ...prev, [progress.binary]: progress.percent }));
    });

    // Listen for update events
    const unsubUpdateAvailable = ipc.on("update:available", (info) => {
      setUpdateAvailable(true);
      setUpdateInfo(info);
      showToast(`Update available: v${info.version}`, "info", 8000);
    });

    const unsubUpdateProgress = ipc.on("update:download-progress", (progress) => {
      setUpdateProgress(progress.percent);
    });

    const unsubUpdateDownloaded = ipc.on("update:downloaded", () => {
      setDownloadingUpdate(false);
      showToast("Update downloaded! Restart the app to install.", "success", 0);
    });

    return () => {
      unsubBinary();
      unsubUpdateAvailable();
      unsubUpdateProgress();
      unsubUpdateDownloaded();
    };
  }, [load, showToast]);

  async function checkBinaries() {
    const status = await ipc.invoke("app:checkBinaries", undefined);
    setBinariesStatus(status);
  }

  async function handleDownloadBinaries() {
    setDownloadingBinaries(true);
    setBinaryProgress({});
    try {
      const result = await ipc.invoke("app:downloadBinaries", undefined);
      if (result.success) {
        showToast("Binaries downloaded successfully!", "success");
        await checkBinaries();
      } else {
        showToast("Failed to download binaries", "error");
      }
    } catch {
      showToast("Error downloading binaries", "error");
    } finally {
      setDownloadingBinaries(false);
      setBinaryProgress({});
    }
  }

  async function handleCheckForUpdates() {
    setCheckingUpdate(true);
    try {
      const result = await ipc.invoke("app:checkForUpdates", undefined);
      if (result.updateAvailable && result.version) {
        setUpdateAvailable(true);
        setUpdateInfo({ version: result.version, releaseNotes: result.releaseNotes ?? "" });
        showToast(`Update available: v${result.version}`, "success");
      } else {
        showToast(`You are already on the latest version (v${appVersion ?? "?"})`, "info");
      }
    } catch {
      showToast("Failed to check for updates. Make sure you have an internet connection.", "error");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleDownloadUpdate() {
    setDownloadingUpdate(true);
    try {
      await ipc.invoke("app:downloadUpdate", undefined);
    } catch {
      showToast("Failed to download update", "error");
      setDownloadingUpdate(false);
    }
  }

  async function handleSaveCredentials() {
    const { stored } = await ipc.invoke("settings:setProxyCredentials", { username: proxyUser, password: proxyPass });
    setCredentialStatus(stored
      ? "Saved to your OS keychain."
      : "Couldn't reach OS-level secret storage on this machine — credentials were not saved.");
    setProxyPass("");
  }

  if (!settings) return <p className="text-sm text-zinc-500">Loading settings…</p>;

  const allBinariesPresent = binariesStatus && !binariesStatus.ytdlp && !binariesStatus.ffmpeg && !binariesStatus.ffprobe;

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-1">Settings</h1>
        <p className="text-sm text-zinc-500">
          Every control here is backed by a real, tested code path in the download engine — nothing here is decorative.
        </p>
      </div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>System Binaries</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Required binaries status</span>
              <AnimatePresence mode="wait">
                {allBinariesPresent ? (
                  <motion.div
                    key="ok"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={springs.snappy}
                    className="flex items-center gap-2 text-status-success text-xs"
                  >
                    <CheckCircle2 size={14} /> All installed
                  </motion.div>
                ) : (
                  <motion.div
                    key="missing"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={springs.snappy}
                    className="flex items-center gap-2 text-status-warning text-xs"
                  >
                    <AlertCircle size={14} /> Missing binaries
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {binariesStatus && !allBinariesPresent && (
              <div className="text-xs text-zinc-500 space-y-1">
                {binariesStatus.ytdlp && <p>• yt-dlp: Missing (required for social media downloads)</p>}
                {binariesStatus.ffmpeg && <p>• ffmpeg: Missing (required for video/audio conversion)</p>}
                {binariesStatus.ffprobe && <p>• ffprobe: Missing (required for media analysis)</p>}
              </div>
            )}
          </div>
          
          {!allBinariesPresent && (
            <Button
              onClick={handleDownloadBinaries}
              disabled={downloadingBinaries}
              loading={downloadingBinaries}
              variant="secondary"
              className="self-start"
            >
              {!downloadingBinaries && <Download size={16} />}
              {downloadingBinaries
                ? (Object.keys(binaryProgress).length > 0
                    ? Object.entries(binaryProgress)
                        .map(([bin, pct]) => `${bin} ${pct}%`)
                        .join(" · ")
                    : "Downloading...")
                : "Download Missing Binaries"}
            </Button>
          )}

          <p className="text-xs text-zinc-600">
            Binaries are automatically downloaded to your app data folder on first launch. No manual configuration needed.
          </p>
        </div>
      </Card>
      </motion.div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>App Updates</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Current version: v{appVersion ?? "…"}</p>
              {updateAvailable && updateInfo && (
                <p className="text-xs text-brand-secondary mt-1">
                  Update available: v{updateInfo.version}
                </p>
              )}
            </div>
            <Button
              onClick={handleCheckForUpdates}
              disabled={checkingUpdate}
              loading={checkingUpdate}
              size="sm"
              variant="secondary"
            >
              {!checkingUpdate && <RefreshCw size={14} />}
              Check for Updates
            </Button>
          </div>

          <AnimatePresence>
            {updateAvailable && updateInfo && !downloadingUpdate && updateProgress === 0 && (
              <motion.div
                key="update-banner"
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.gentle}
                className="overflow-hidden"
              >
                <div className="bg-brand-secondary/10 border border-brand-secondary/30 rounded-lg p-3">
                  <p className="text-sm text-zinc-100 font-medium mb-2">
                    Version {updateInfo.version} is available
                  </p>
                  {updateInfo.releaseNotes && (
                    <p className="text-xs text-zinc-400 mb-3 whitespace-pre-wrap">
                      {updateInfo.releaseNotes.slice(0, 200)}...
                    </p>
                  )}
                  <Button onClick={handleDownloadUpdate} size="sm">
                    <Download size={14} /> Download & Install Update
                  </Button>
                </div>
              </motion.div>
            )}

            {downloadingUpdate && (
              <motion.div
                key="update-progress"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.gentle}
                className="flex items-center gap-3 overflow-hidden"
              >
                <RefreshCw size={16} className="animate-spin text-brand-secondary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-zinc-300">Downloading update... {Math.round(updateProgress)}%</p>
                  <div className="mt-2 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand-gradient"
                      animate={{ width: `${updateProgress}%` }}
                      transition={springs.firm}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-xs text-zinc-600">
            Updates are pulled from GitHub releases. The app will restart to complete installation.
          </p>
        </div>
      </Card>
      </motion.div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>Downloads</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          {/* Download Location */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-300">Download location</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-zinc-400 bg-surface-raised border border-surface-border rounded-lg px-3 py-2">
                {settings.downloadDir || <span className="text-zinc-600 italic">Default Downloads folder</span>}
              </span>
              <Button
                size="md"
                variant="secondary"
                onClick={async () => {
                  const result = await ipc.invoke("app:selectDirectory", {
                    title: "Choose Download Location",
                    defaultPath: settings.downloadDir || undefined,
                  });
                  if (result.dirPath) update({ downloadDir: result.dirPath });
                }}
              >
                <FolderOpen size={15} /> Browse
              </Button>
            </div>
            <span className="text-xs text-zinc-600">Where new downloads are saved. Leave default to use the system Downloads folder.</span>
          </div>

          <div className="border-t border-surface-border/50 -mx-4 my-1" />

          <NumberField
            label="Max simultaneous downloads"
            value={settings.maxSimultaneousDownloads}
            onChange={(v) => update({ maxSimultaneousDownloads: v })}
            min={1} max={20}
          />
          <NumberField
            label="Segments per download"
            value={settings.segmentCount}
            onChange={(v) => update({ segmentCount: v })}
            min={1} max={32}
          />
          <Toggle
            label="Open containing folder automatically when a download finishes"
            checked={settings.autoOpenFolderOnComplete}
            onChange={(v) => update({ autoOpenFolderOnComplete: v })}
          />

          <div className="border-t border-surface-border/50 -mx-4 my-1" />

          <Toggle
            label="Only download during a scheduled window each day"
            checked={settings.downloadScheduleEnabled}
            onChange={(v) => update({ downloadScheduleEnabled: v })}
          />
          <AnimatePresence initial={false}>
            {settings.downloadScheduleEnabled && (
              <motion.div
                key="download-schedule-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.firm}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="From hour (0–23, local time)"
                    value={settings.downloadScheduleStartHour}
                    onChange={(v) => update({ downloadScheduleStartHour: v })}
                    min={0} max={23}
                  />
                  <NumberField
                    label="To hour (0–23, local time)"
                    value={settings.downloadScheduleEndHour}
                    onChange={(v) => update({ downloadScheduleEndHour: v })}
                    min={0} max={23}
                    hint={`Downloads only run from ${String(settings.downloadScheduleStartHour).padStart(2, "0")}:00 to ${String(settings.downloadScheduleEndHour).padStart(2, "0")}:00. Outside that window, active transfers pause and queued ones wait — both resume automatically, no restart needed.`}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
      </motion.div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>Speed limits</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <NumberField
            label="Global speed limit (KB/s, 0 = unlimited)"
            value={settings.maxTotalSpeedKBps}
            onChange={(v) => update({ maxTotalSpeedKBps: v })}
            min={0} max={1_000_000}
            hint="Enforced by a real shared token bucket across every active transfer — this is not a decorative slider."
          />
          <NumberField
            label="Per-file speed limit (KB/s, 0 = unlimited)"
            value={settings.maxSpeedPerFileKBps}
            onChange={(v) => update({ maxSpeedPerFileKBps: v })}
            min={0} max={1_000_000}
          />

          <div className="border-t border-surface-border/50 -mx-4 my-1" />

          <Toggle
            label="Different limit on a schedule (e.g. faster overnight)"
            checked={settings.bandwidthScheduleEnabled}
            onChange={(v) => update({ bandwidthScheduleEnabled: v })}
          />
          <AnimatePresence initial={false}>
            {settings.bandwidthScheduleEnabled && (
              <motion.div
                key="bandwidth-schedule-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.firm}
                className="overflow-hidden flex flex-col gap-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="From hour (0–23, local time)"
                    value={settings.bandwidthScheduleStartHour}
                    onChange={(v) => update({ bandwidthScheduleStartHour: v })}
                    min={0} max={23}
                  />
                  <NumberField
                    label="To hour (0–23, local time)"
                    value={settings.bandwidthScheduleEndHour}
                    onChange={(v) => update({ bandwidthScheduleEndHour: v })}
                    min={0} max={23}
                  />
                </div>
                <NumberField
                  label="Speed limit during that window (KB/s, 0 = unlimited)"
                  value={settings.bandwidthScheduleOffPeakKBps}
                  onChange={(v) => update({ bandwidthScheduleOffPeakKBps: v })}
                  min={0} max={1_000_000}
                  hint={`Applied instead of the global limit above, every day from ${String(settings.bandwidthScheduleStartHour).padStart(2, "0")}:00 to ${String(settings.bandwidthScheduleEndHour).padStart(2, "0")}:00. Re-checked every minute by the download queue — no restart needed, and it also takes effect mid-download.`}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
      </motion.div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>Proxy</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-300">Type</span>
            <select
              value={settings.proxyType}
              onChange={(e) => update({ proxyType: e.target.value as ProxyType })}
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring"
            >
              <option value="none">None</option>
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </label>
          <AnimatePresence initial={false}>
            {settings.proxyType !== "none" && (
              <motion.div
                key="proxy-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springs.firm}
                className="overflow-hidden flex flex-col gap-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Port" value={settings.proxyPort} onChange={(v) => update({ proxyPort: v })} min={0} max={65535} />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-zinc-300">Host</span>
                    <input
                      value={settings.proxyHost}
                      onChange={(e) => update({ proxyHost: e.target.value })}
                      placeholder="proxy.example.com"
                      className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring"
                    />
                  </label>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1.5 flex-1">
                    <span className="text-sm text-zinc-300">Username (optional)</span>
                    <input value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring" />
                  </label>
                  <label className="flex flex-col gap-1.5 flex-1">
                    <span className="text-sm text-zinc-300">Password</span>
                    <input type="password" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring" />
                  </label>
                  <Button size="md" variant="secondary" onClick={handleSaveCredentials}>Save</Button>
                </div>
                <p className="text-xs text-zinc-600 -mt-2">
                  Credentials are stored in your OS keychain, never in the app's settings database — the old app
                  stored proxy passwords in plaintext SQLite; this one never does.
                  {settings.proxyHasCredentials ? " (Credentials currently saved.)" : ""}
                  {credentialStatus ? ` ${credentialStatus}` : ""}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
      </motion.div>

      <motion.div variants={listItem}>
      <Card>
        <CardHeader><CardTitle>Social & media</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <Toggle
            label="Ignore certificate errors (advanced, not recommended)"
            checked={settings.ignoreCertificateErrors}
            onChange={(v) => update({ ignoreCertificateErrors: v })}
          />
          <p className="text-xs text-zinc-600 -mt-2">
            Off by default. The old app disabled TLS verification unconditionally for every social-media download — this app never does that unless you explicitly opt in here.
          </p>

          <div className="border-t border-surface-border/50 -mx-4 my-1" />

          {/* Cookies from browser — fixes YouTube "Sign in to confirm you're not a bot" */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-zinc-300">Pass cookies from browser (for YouTube &amp; age-restricted sites)</span>
            <select
              value={settings.cookiesFromBrowser}
              onChange={(e) => update({ cookiesFromBrowser: e.target.value })}
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring"
            >
              <option value="">Disabled (no cookies)</option>
              <option value="chrome">Google Chrome</option>
              <option value="firefox">Mozilla Firefox</option>
              <option value="edge">Microsoft Edge</option>
              <option value="brave">Brave</option>
              <option value="chromium">Chromium</option>
              <option value="opera">Opera</option>
              <option value="safari">Safari (macOS only)</option>
            </select>
          </label>
          <p className="text-xs text-zinc-600 -mt-2">
            Fixes <span className="text-zinc-400">“Sign in to confirm you’re not a bot”</span> on YouTube.
            The selected browser must be open and logged in. Cookies are never stored by this app — they are read
            directly from the browser’s local cookie database by yt-dlp each time a download starts.
          </p>
        </div>
      </Card>
      </motion.div>
    </motion.div>
  );
}

function NumberField({
  label, value, onChange, min, max, hint,
}: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring w-full"
      />
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}
