import log from "electron-log";

/**
 * OS-keychain-backed secret storage (Windows Credential Manager / macOS
 * Keychain / Linux Secret Service via @napi-rs/keyring). This is the direct
 * fix for the old app's plaintext-in-SQLite proxy password (audit §3.13).
 *
 * @napi-rs/keyring ships prebuilt per-platform binaries (N-API), unlike
 * `keytar` which requires node-gyp compilation and — like every other native
 * module in this repo — Electron-ABI rebuilding via postinstall. Using a
 * prebuilt-binary package here sidesteps that entire class of friction for
 * this one dependency.
 *
 * Secret storage requires a real OS keychain/Secret Service daemon to be
 * running — unavailable in this project's sandboxed build environment
 * (verified: the package loads and calls the real native API correctly, but
 * fails with a platform-level AccessDenied here since there's no D-Bus
 * Secret Service session). Every method degrades gracefully instead of
 * throwing into IPC handlers or UI code — proxy-credential features simply
 * report "unavailable" rather than crashing the app.
 */
const SERVICE_NAME = "com.shanutechx.downloader";

let keyringModule: typeof import("@napi-rs/keyring") | null | undefined;

async function getKeyring() {
  if (keyringModule !== undefined) return keyringModule;
  try {
    keyringModule = await import("@napi-rs/keyring");
  } catch (err) {
    log.warn("[secrets-vault] @napi-rs/keyring unavailable on this platform:", err);
    keyringModule = null;
  }
  return keyringModule;
}

export const secretsVault = {
  async isAvailable(): Promise<boolean> {
    const mod = await getKeyring();
    if (!mod) return false;
    try {
      const probe = new mod.Entry(SERVICE_NAME, "__availability_probe__");
      probe.setPassword("probe");
      probe.deletePassword();
      return true;
    } catch {
      return false;
    }
  },

  async set(account: string, secret: string): Promise<boolean> {
    const mod = await getKeyring();
    if (!mod) return false;
    try {
      new mod.Entry(SERVICE_NAME, account).setPassword(secret);
      return true;
    } catch (err) {
      log.warn(`[secrets-vault] failed to store secret for "${account}":`, err);
      return false;
    }
  },

  async get(account: string): Promise<string | null> {
    const mod = await getKeyring();
    if (!mod) return null;
    try {
      return new mod.Entry(SERVICE_NAME, account).getPassword();
    } catch {
      return null; // not found, or platform storage unavailable — same "no secret" result either way
    }
  },

  async delete(account: string): Promise<void> {
    const mod = await getKeyring();
    if (!mod) return;
    try { new mod.Entry(SERVICE_NAME, account).deletePassword(); } catch { /* nothing to delete */ }
  },
};
