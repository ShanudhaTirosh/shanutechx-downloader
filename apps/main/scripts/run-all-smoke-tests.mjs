#!/usr/bin/env node
/**
 * Runs every smoke-test-*.ts script and exits non-zero if any fails —
 * this is what `pnpm test` actually runs in apps/main, and what CI runs on
 * every push. These are real integration tests (a real local HTTP server,
 * real ffmpeg, real WebTorrent peer-to-peer transfer), not mocked unit
 * tests — see each script's own header comment for exactly what it proves
 * and what it can't (this sandboxed environment can't reach arbitrary
 * public internet hosts, so real yt-dlp-against-YouTube and real public
 * tracker/DHT swarm behavior still need a manual `pnpm dev` check).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptFiles = fs.readdirSync(__dirname)
  .filter((f) => f.startsWith("smoke-test-") && f.endsWith(".ts"))
  .sort();

let failed = 0;
for (const file of scriptFiles) {
  console.log(`\n${"=".repeat(60)}\nRunning ${file}\n${"=".repeat(60)}`);
  try {
    execSync(`npx tsx ${path.join(__dirname, file)}`, { stdio: "inherit", timeout: 60_000 });
  } catch (err) {
    console.error(`\n❌ ${file} FAILED`);
    failed++;
  }
}

console.log(`\n${"=".repeat(60)}`);
if (failed > 0) {
  console.error(`${failed}/${scriptFiles.length} smoke test file(s) failed.`);
  process.exit(1);
}
console.log(`✅ All ${scriptFiles.length} smoke test files passed.`);
