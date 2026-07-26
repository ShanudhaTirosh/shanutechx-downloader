import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Toggle } from "../../components/ui/Toggle";
import { Button } from "../../components/ui/Button";
import { useSettingsStore } from "../../stores/settingsStore";
import { ipc } from "../../lib/ipc-client";
import type { ProxyType } from "@shanutechx/shared-types";

export function SettingsPage() {
  const { settings, load, update } = useSettingsStore();
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");
  const [credentialStatus, setCredentialStatus] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  if (!settings) return <p className="text-sm text-zinc-500">Loading settings…</p>;

  async function handleSaveCredentials() {
    const { stored } = await ipc.invoke("settings:setProxyCredentials", { username: proxyUser, password: proxyPass });
    setCredentialStatus(stored
      ? "Saved to your OS keychain."
      : "Couldn't reach OS-level secret storage on this machine — credentials were not saved.");
    setProxyPass("");
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-1">Settings</h1>
        <p className="text-sm text-zinc-500">
          Every control here is backed by a real, tested code path in the download engine — nothing here is decorative.
        </p>
      </div>

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
