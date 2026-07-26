import { ProxyAgent, type Dispatcher } from "undici";
import { secretsVault } from "../secrets/secrets-vault";
import type { AppSettings } from "@shanutechx/shared-types";

const PROXY_CREDENTIAL_ACCOUNT = "proxy-credentials";

/**
 * Builds an undici ProxyAgent from settings, pulling credentials from the OS
 * keychain (never from the settings DB — see secrets-vault.ts). Returns
 * undefined when no proxy is configured, so callers can pass it straight
 * through as `{ dispatcher }` without an extra branch.
 */
export async function buildProxyDispatcher(settings: AppSettings): Promise<Dispatcher | undefined> {
  if (settings.proxyType === "none" || !settings.proxyHost) return undefined;

  const uri = `${settings.proxyType}://${settings.proxyHost}:${settings.proxyPort}`;
  let auth: string | undefined;

  if (settings.proxyHasCredentials) {
    const stored = await secretsVault.get(PROXY_CREDENTIAL_ACCOUNT);
    if (stored) {
      const [username, password] = stored.split("\u0000");
      auth = Buffer.from(`${username}:${password}`).toString("base64");
    }
  }

  return new ProxyAgent({ uri, ...(auth ? { token: `Basic ${auth}` } : {}) });
}

export async function storeProxyCredentials(username: string, password: string): Promise<boolean> {
  // Null-byte-separated single value — @napi-rs/keyring stores one secret
  // string per (service, account) pair, not a structured object.
  return secretsVault.set(PROXY_CREDENTIAL_ACCOUNT, `${username}\u0000${password}`);
}

export async function clearProxyCredentials(): Promise<void> {
  await secretsVault.delete(PROXY_CREDENTIAL_ACCOUNT);
}
