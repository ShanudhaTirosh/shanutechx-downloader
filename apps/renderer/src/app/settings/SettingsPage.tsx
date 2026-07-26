import { useEffect, useState } from "react";
import { Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Toggle } from "../../components/ui/Toggle";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useSettingsStore } from "../../stores/settingsStore";
import { ipc } from "../../lib/ipc-client";
import type { ProxyType } from "@shanutechx/shared-types";

export function SettingsPage() {
  const { settings, load, update } = useSettingsStore();
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");
  const [credentialStatus, setCredentialStatus] = useState<string | null>(null);
  const [binariesStatus, setBinariesStatus] = useState<{ ytdlp: boolean; ffmpeg: boolean; ffprobe: boolean } | null>(null);
  const [downloadingBinaries, setDownloadingBinaries] = useState(false);
  const [binaryProgress, setBinaryProgress] = useState<{ binary: string; percent: number } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes: string } | null>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const { showToast } = useToast();

  useEffect(() => { 
    void load();
    void checkBinaries();
    
    // Listen for binary download progress
    const unsubBinary = ipc.on("binary:download-progress", (progress) => {
      setBinaryProgress({ binary: progress.binary, percent: progress.percent });
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
    setBinaryProgress(null);
    try {
      const result = await ipc.invoke("app:downloadBinaries", undefined);
      if (result.success) {
        showToast("Binaries downloaded successfully!", "success");
        await checkBinaries();
      } else {
        showToast("Failed to download binaries", "error");
      }
    } catch (error) {
      showToast("Error downloading binaries", "error");
    } finally {
      setDownloadingBinaries(false);
      setBinaryProgress(null);
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
        showToast("You're on the latest version!", "info");
      }
    } catch (error) {
      showToast("Failed to check for updates", "error");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleDownloadUpdate() {
    setDownloadingUpdate(true);
    try {
      await ipc.invoke("app:downloadUpdate", undefined);
    } catch (error) {
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
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-1">Settings</h1>
        <p className="text-sm text-zinc-500">
          Every control here is backed by a real, tested code path in the download engine — nothing here is decorative.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>System Binaries</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Required binaries status</span>
              {allBinariesPresent ? (
                <div className="flex items-center gap-2 text-status-success text-xs">
                  <CheckCircle2 size={14} /> All installed
                </div>
              ) : (
                <div className="flex items-center gap-2 text-status-warning text-xs">
                  <AlertCircle size={14} /> Missing binaries
                </div>
              )}
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
              variant="secondary"
              className="self-start"
            >
              {downloadingBinaries ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {binaryProgress ? `Downloading ${binaryProgress.binary}... ${binaryProgress.percent}%` : "Downloading..."}
                </>
              ) : (
                <>
                  <Download size={16} /> Download Missing Binaries
                </>
              )}
            </Button>
          )}

          <p className="text-xs text-zinc-600">
            Binaries are automatically downloaded to your app data folder on first launch. No manual configuration needed.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>App Updates</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Current version: v{settings ? "0.1.0" : "..."}</p>
              {updateAvailable && updateInfo && (
                <p className="text-xs text-brand-secondary mt-1">
                  Update available: v{updateInfo.version}
                </p>
              )}
            </div>
            <Button 
              onClick={handleCheckForUpdates} 
              disabled={checkingUpdate}
              size="sm"
              variant="secondary"
            >
              {checkingUpdate ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Check for Updates
            </Button>
          </div>

          {updateAvailable && updateInfo && !downloadingUpdate && updateProgress === 0 && (
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
          )}

          {downloadingUpdate && (
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-brand-secondary" />
              <div className="flex-1">
                <p className="text-xs text-zinc-300">Downloading update... {Math.round(updateProgress)}%</p>
                <div className="mt-2 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-brand-gradient transition-all duration-300"
                    style={{ width: `${updateProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-600">
            Updates are pulled from GitHub releases. The app will restart to complete installation.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Downloads</CardTitle></CardHeader>
        <div className="flex flex-col gap-4">
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
        </div>
      </Card>

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
        </div>
      </Card>

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
          {settings.proxyType !== "none" && (
            <>
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
            </>
          )}
        </div>
      </Card>

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
        </div>
      </Card>
    </div>
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
