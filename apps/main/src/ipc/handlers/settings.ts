import { registerHandler } from "./index";
import { settingsStore } from "../../settings/settings-store";
import { storeProxyCredentials, clearProxyCredentials } from "../../utils/proxy-agent";

export function registerSettingsHandlers(): void {
  registerHandler("settings:get", () => settingsStore.get());
  // Returns what was ACTUALLY applied (post-validation/clamping) — the
  // renderer must render this return value, never assume the request landed
  // unchanged. This is the structural fix for shipping another dead toggle.
  registerHandler("settings:set", (p) => settingsStore.set(p));

  registerHandler("settings:setProxyCredentials", async (p) => {
    const stored = await storeProxyCredentials(p.username, p.password);
    // proxyHasCredentials is a non-secret flag in the regular settings store
    // — the actual username/password never touch it (see secrets-vault.ts).
    settingsStore.set({ proxyHasCredentials: stored });
    return { stored };
  });

  registerHandler("settings:clearProxyCredentials", async () => {
    await clearProxyCredentials();
    settingsStore.set({ proxyHasCredentials: false });
  });
}
