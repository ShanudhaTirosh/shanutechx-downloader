/**
 * Verifies the secrets vault degrades gracefully rather than crashing when
 * OS-level secret storage is unavailable (as it is in this sandboxed build
 * environment — no D-Bus Secret Service session running), and that the
 * proxy dispatcher builder correctly returns undefined when no proxy is
 * configured (the common case, and one that must never accidentally throw).
 */
import { secretsVault } from "../src/secrets/secrets-vault";
import { buildProxyDispatcher } from "../src/utils/proxy-agent";
import type { AppSettings } from "@shanutechx/shared-types";

const BASE_SETTINGS: AppSettings = {
  downloadDir: "/tmp", maxSimultaneousDownloads: 4, askLocationEachTime: false, autoStart: true,
  maxTotalSpeedKBps: 0, maxSpeedPerFileKBps: 0,
  proxyType: "none", proxyHost: "", proxyPort: 0, proxyHasCredentials: false,
  segmentCount: 8, retryAttempts: 3,
  defaultVideoQuality: "1080p", defaultAudioFormat: "mp3", autoEmbedThumbnail: true,
  subtitleLanguages: "", ignoreCertificateErrors: false,
  torrentSavePath: "", torrentPortStart: 6881, torrentPortEnd: 6889, torrentDhtEnabled: true,
  minimizeToTray: true, theme: "dark",
};

async function main() {
  console.log("[test 1] secretsVault degrades gracefully with no OS keychain session...");
  const available = await secretsVault.isAvailable();
  console.log(`  isAvailable() = ${available} (expected false in this sandbox — no Secret Service daemon)`);

  // The important assertion: none of these should ever THROW, regardless of
  // platform availability. A throw here would crash an IPC handler.
  const setResult = await secretsVault.set("test-account", "test-secret");
  const getResult = await secretsVault.get("test-account");
  await secretsVault.delete("test-account");
  console.log(`  set() returned ${setResult}, get() returned ${getResult === null ? "null" : "a value"} — no exceptions thrown`);
  console.log("  ✓ PASS — vault never throws, callers can treat it as always-safe");

  console.log("\n[test 2] buildProxyDispatcher() returns undefined for the default 'no proxy' settings...");
  const dispatcher = await buildProxyDispatcher(BASE_SETTINGS);
  if (dispatcher !== undefined) throw new Error("Expected undefined dispatcher when proxyType is 'none'");
  console.log("  ✓ PASS — no proxy configured means no dispatcher, requests go through undici's default path");

  console.log("\n[test 3] buildProxyDispatcher() builds a real ProxyAgent when a proxy IS configured...");
  const withProxy = await buildProxyDispatcher({ ...BASE_SETTINGS, proxyType: "http", proxyHost: "127.0.0.1", proxyPort: 8080 });
  if (!withProxy) throw new Error("Expected a ProxyAgent instance when proxyType/host/port are set");
  console.log(`  ✓ PASS — dispatcher constructed: ${withProxy.constructor.name}`);

  console.log("\n✅ SECRETS/PROXY SMOKE TEST PASSED\n");
}

main().catch((err) => { console.error("❌ FAILED:", err); process.exit(1); });
