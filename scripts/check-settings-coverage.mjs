#!/usr/bin/env node
/**
 * Settings-coverage gate — the direct, automated fix for the single biggest
 * trust-breaking bug class in the original audit: a setting that exists in
 * the UI/DB but has no real effect (the old app's "Max Total Speed" did
 * nothing at all). This script parses every key in AppSettings and fails if
 * a key is never referenced anywhere in apps/main/src outside of
 * settings-store.ts itself (where it's merely defined/defaulted/persisted).
 *
 * Run via `pnpm check:settings-coverage`. Wire into CI (.github/workflows/ci.yml)
 * so a new setting can never ship without a real read-site.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const sharedTypesFile = path.join(repoRoot, "packages/shared-types/src/index.ts");
const scanDirs = [path.join(repoRoot, "apps/main/src"), path.join(repoRoot, "apps/renderer/src")];
const settingsStoreFile = path.join(repoRoot, "apps/main/src/settings/settings-store.ts");

function extractSettingsKeys(source) {
  const match = /interface AppSettings \{([\s\S]*?)\n\}/.exec(source);
  if (!match) throw new Error("Could not locate `interface AppSettings` in shared-types");
  const body = match[1];
  const keyRe = /^\s*(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)(\??):/gm;
  const keys = [];
  let m;
  while ((m = keyRe.exec(body))) keys.push(m[1]);
  return keys;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sharedTypesSource = fs.readFileSync(sharedTypesFile, "utf8");
const keys = extractSettingsKeys(sharedTypesSource);

const files = scanDirs.flatMap(walk).filter((f) => f !== settingsStoreFile);
const combinedSource = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

const uncovered = keys.filter((key) => {
  // Looks for `.key` or `[key]`-style access (settings.foo, applied.foo, etc.)
  // anywhere outside settings-store.ts — a real read-site, not just the
  // definition/default/clamp logic that lives in the store itself.
  const re = new RegExp(`\\.${key}\\b`);
  return !re.test(combinedSource);
});

if (uncovered.length > 0) {
  console.error(`\n❌ Settings coverage check FAILED — ${uncovered.length} setting(s) have no read-site outside settings-store.ts:\n`);
  for (const key of uncovered) console.error(`   - ${key}`);
  console.error(`\nEvery key in AppSettings must be read somewhere real before it ships.`);
  console.error(`This is the automated guardrail against shipping another dead toggle\nlike the old app's "Max Total Speed" setting.\n`);
  process.exit(1);
}

console.log(`✅ Settings coverage OK — all ${keys.length} settings have at least one real read-site.`);
