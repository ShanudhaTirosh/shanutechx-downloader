# SHANUTECHX Downloader

Modern Electron + React desktop download manager — HTTP multi-segment downloads, yt-dlp-powered social
media grabbing, torrents, and media conversion, under the SHANUTECHX brand.

This is a **ground-up rebuild**, not a port of the previous PyQt6 app. It is structured specifically so the
bug classes found in that app's audit (fake settings, broken speed limiting, shutdown deadlocks, race
conditions, plaintext secrets) are closed by construction — see `docs/` for the full writeup.

## Status

**Phases 0–4 built and wired end-to-end.** Every engine below is real, working code — not stubs — verified
the ways described (this environment can't reach arbitrary public internet hosts, so live-network behavior
against real trackers/video sites is called out explicitly where that matters).

| Engine | State | How it was verified |
|---|---|---|
| HTTP download engine (multi-segment, pause/resume/cancel, global+per-file speed limiting) | ✅ Working | Real local HTTP server, byte-exact multi-segment reconstruction, real aggregate speed-cap measurement, real pause/resume mid-transfer — see `apps/main/scripts/smoke-test-download.ts` |
| Social extractor (yt-dlp wrapper) | ✅ Wired | JSON-mapping logic verified against a stubbed yt-dlp binary (`smoke-test-social.ts`); real extraction against live sites needs a normal internet connection — verify with `pnpm dev` |
| Torrent engine (WebTorrent) | ✅ Wired | Real local peer-to-peer transfer between two WebTorrent clients over localhost, byte-exact — see `smoke-test-torrent.ts`. Public tracker/DHT swarm behavior needs a normal network — verify with `pnpm dev` |
| Converter engine (ffmpeg) | ✅ Working | Real ffmpeg invocation, real audio extraction, live progress reporting, real cancellation — see `smoke-test-converter.ts` |
| Settings (real token-bucket speed limits, no dead toggles) | ✅ Working | Exercised directly by the download-engine smoke test |
| Full Electron app boot (DB + all 4 engines + IPC + UI) | ✅ Verified | Boots cleanly under the real Electron runtime in this environment (see below) |

Run `pnpm --filter @shanutechx/main` and look in `scripts/` for all four smoke tests — run them yourself with
`npx tsx scripts/smoke-test-*.ts` after `pnpm install`.

### Real bugs caught and fixed while building this (not the old app — this new one)

Building this surfaced its own real issues, fixed on the spot rather than shipped:
- `nanoid` v5 and `execa` v9 are ESM-only and broke the CommonJS-compiled main process at runtime — swapped
  `nanoid` for `crypto.randomUUID()` and `execa` for a small native `child_process.spawn` wrapper.
- `webtorrent` v3 is also ESM-only — rather than converting the whole main process to ESM (real friction with
  Electron's sandboxed preload requirements), it's loaded via a dynamic `import()`, Node's documented interop
  path for consuming one ESM-only dependency from a CJS codebase.
- Native modules (`better-sqlite3`, and transitively via `webtorrent`: `utp-native`, `bufferutil`,
  `utf-8-validate`, `node-datachannel`) are compiled against the system Node's ABI by default, not Electron's —
  wired `@electron/rebuild` into `postinstall` so this is automatic, not a manual step someone forgets.
- ffmpeg's `-progress` output has a real, version-dependent quirk where `out_time_ms` is sometimes actually
  microseconds — switched to keying off `out_time_us`, verified against a real local ffmpeg build's output.
- Caught and fixed an ordering bug where conversion progress would never update live because `Duration` was
  originally parsed from stderr only after the process finished — now parsed from the streaming stderr in
  real time.

### What's NOT yet done (see `docs/` implementation plan, Phases 5–6)

- Security hardening pass, `keytar` secrets vault, CSP tightening
- Real code-signing certs wired into `electron-builder.yml` (currently unset — do not release unsigned)
- `electron-builder` packaging verified on a clean machine per platform
- Automated e2e (Playwright) and CI running the smoke tests on every PR
- Settings-coverage lint rule (a key existing in `AppSettings` with no read-site should fail CI)

### Phase 5 — Security hardening (also done)

- **Settings-coverage CI gate** (`scripts/check-settings-coverage.mjs`, wired into `.github/workflows/ci.yml`):
  parses every key in `AppSettings` and fails the build if a key has no real read-site outside the settings
  store itself. Caught **13 genuinely unwired settings** the moment it was written — every one of them is now
  wired to a real effect (OS login-item registration, native save dialog, segment-level retry-with-resume,
  yt-dlp subtitle/thumbnail flags, a real system tray, port-range scanning for the torrent engine, etc.) rather
  than the gate being loosened to pass.
- **Secrets vault** (`secrets/secrets-vault.ts`) — proxy credentials now live in the OS keychain via
  `@napi-rs/keyring` (prebuilt binaries, no native-build/Electron-ABI risk), never in the plaintext settings
  DB the old app used. Every method degrades to a safe no-op if OS-level secret storage isn't available,
  verified by `smoke-test-secrets.ts`.
- **Real proxy support end-to-end** — HTTP/SOCKS5 proxy settings now actually construct an undici
  `ProxyAgent` used by every download request (this didn't exist at all in earlier phases of this rebuild).
- **CSP tightened** — `object-src`, `base-uri`, `form-action`, and `frame-src` all locked to `'none'`.
- **Segment-level retry with byte-offset resume** — a transient network blip mid-segment now retries from
  where it left off (via Range headers) instead of either failing the whole download or corrupting the temp
  file, which a naive "just add append mode" fix would have done for non-ranged single-segment downloads —
  caught and fixed during this phase.

### Phase 6 — Packaging verification (also done)

Ran a real, unsigned `electron-builder --linux dir` build in this environment and **actually booted the packaged
output** (not just the dev build) — this caught three real bugs that only show up once an app is actually
packaged, none of which any amount of `pnpm dev` testing would have surfaced:

1. **pnpm-workspace symlinks broke asar packaging** — `@shanutechx/shared-types` (a real npm dependency at the
   time) is a workspace symlink pointing *outside* `apps/main`, and electron-builder's asar packager can't
   include a path outside the app root. Fix: moved it to `devDependencies` in both apps — it's genuinely
   type-only (13 `interface`/`type` exports, zero runtime code), so it was never supposed to ship in the
   bundle in the first place.
2. **The renderer's built UI silently wasn't in the package at all** — `files: [..., '../renderer/dist/**/*']`
   in `electron-builder.yml` looked reasonable but electron-builder's `files` patterns don't correctly cross
   the monorepo boundary the way a plain glob would suggest; the packaged app launched (main process was fine)
   but failed to load its own UI with `ERR_FILE_NOT_FOUND`. Fix: switched to `extraResources`, which explicitly
   supports copying from outside the app root into the unpacked `resources/` folder — matching what
   `window.ts`'s runtime path resolution already expected.
3. **Scoped npm package name leaked into both the binary filename and the userData directory** — the packaged
   binary was named `@shanutechxmain`, and worse, `app.getName()` defaulting to `package.json`'s literal
   `"@shanutechx/main"` string turned the user data directory into a broken nested path,
   `~/.config/@shanutechx/main/`, instead of one clean folder. Fixed with an explicit `executableName` in
   `electron-builder.yml` and an explicit `app.setName("SHANUTECHX Downloader")` at the very top of `main.ts`,
   before anything calls `app.getPath()`. Verified after the fix: `~/.config/SHANUTECHX Downloader/shanutechx.db`.

Also added in this phase:
- **CI actually runs the real smoke test suite** — `apps/main/scripts/run-all-smoke-tests.mjs` runs all five
  `smoke-test-*.ts` files and fails the build if any fails; wired as `pnpm test` in CI (`.github/workflows/ci.yml`),
  alongside a real ffmpeg install step so the converter test has what it needs on every OS in the build matrix.
- **A real ESLint config** — `pnpm lint` in CI was pointing at a script with no actual ESLint installed or
  configured anywhere; it would have failed the very first time CI ran. Added a real flat config
  (`eslint.config.mjs`) and fixed the handful of genuine warnings it immediately found (an unused variable, a
  stale eslint-disable comment, and one placeholder loop for global-speed calculation that was never actually
  implemented — replaced with real instantaneous per-download + aggregate speed tracking).

**Still not done, and should not be skipped before a real public release:**
- Real code-signing certificates (Windows OV/EV, macOS Developer ID) — nothing is signed yet; `CSC_IDENTITY_AUTO_DISCOVERY=false`
  was used deliberately in every packaging test in this phase to force an unsigned build for testing purposes only.
- Windows and macOS packaging haven't been run at all in this session (only Linux — this sandboxed environment
  can only run Linux containers). The monorepo-symlink and `files`-vs-`extraResources` bugs found here are
  platform-agnostic and are now fixed for all three targets, but the Windows NSIS installer and macOS
  notarization flow specifically should still get a real run-through on those OSes before shipping.
- App icons (`build/icon.ico` / `.icns` / `.png`) referenced in `electron-builder.yml` don't exist yet as real
  assets — the build tolerates their absence but a release build needs real brand icons in place.

## Getting started

```bash
pnpm install
pnpm dev            # runs main + renderer together
```

- `pnpm dev:renderer` — Vite dev server only, for fast UI iteration in a regular browser (some IPC calls will
  no-op until `window.shanutechx` exists — i.e. until running inside Electron).
- `pnpm dev:main` — Electron main process only (expects the renderer dev server running on :5173).
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` — run across every workspace package.
- `pnpm package` — build + produce installers via `electron-builder` (Phase 5; signing must be configured
  first — see `apps/main/electron-builder.yml`).

## Monorepo layout

```
apps/main/        Electron main process — engines, IPC handlers, window/lifecycle management
apps/renderer/     React + Vite UI — SHANUTECHX glassmorphism design system, tabs, stores
packages/shared-types/    The IPC contract — the only place channel shapes are declared
packages/design-tokens/   Brand colors/type/spacing — feeds the Tailwind config
```

## Brand

- Primary `#7c3aed` (purple) · Secondary `#06b6d4` (cyan) · Dark glassmorphism only for v1.
- Tokens live in `packages/design-tokens/src/tokens.ts` — change brand values there, not in component files.

## Design principles (enforced, not just documented)

1. Every setting in the UI has a real, tested read-site before it ships — no dead toggles.
2. Speed limits (per-file and global) are enforced via one real token-bucket in `QueueManager`.
3. All main↔renderer communication goes through the typed contract in `@shanutechx/shared-types`.
4. Shutdown is an explicit, bounded state machine (`apps/main/src/shutdown.ts`) — never a blind kill-timer race.
