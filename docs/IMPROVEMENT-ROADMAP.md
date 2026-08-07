# SHANUTECHX Downloader — Improvement Roadmap

This tracks the "improve everything, in phases" plan: UI/UX, performance, and
new capabilities. Phase 1 is implemented in this pass; the rest is a concrete,
ordered backlog for the following passes.

## Phase 1 — Done in this pass

**Motion foundation** (`apps/renderer/src/lib/motion.ts`)
New shared spring-physics presets (`snappy` / `gentle` / `bouncy` / `firm`),
in the spirit of [kinetics.colorion.co](https://kinetics.colorion.co) — the
library isn't an installable package, it's a gallery of copy-paste CSS/React
spring snippets, so the useful move was to standardize *our own* spring
parameters the same way (named, physical, reused everywhere) rather than
scattering one-off `duration`/`ease` values per component. Framer Motion
(already a dependency) drives all of it.

Applied to:
- **Button** — spring press (`whileTap` scale) + hover lift, plus a real
  `loading` state (spinner + auto-disable) for async actions.
- **Toggle** — thumb now travels on a bouncy spring instead of a CSS
  transition (the signature Kinetics "toggle" feel).
- **Toast** — spring slide-in/out via `AnimatePresence`, tap-spring close button.
- **ProgressRing** — switched from an eased tween to a "firm" (no-overshoot)
  spring so it still has weight but never visibly passes 100%.
- **DownloadCard** — spring entrance/exit (`AnimatePresence` + `layout`),
  hover lift, and a small "arrival pop" on the ring the instant a download
  completes.
- **DownloadsPage** — staggered list entrance, animated empty state.
- **AddUrlBar** — a physical shake on validation errors (wrong-URL-type,
  failed add) instead of relying on the toast alone.

**Performance**
- `download-job.ts`: progress events were firing on *every chunk* of *every
  segment* (up to 32 concurrent segments) — enough to flood IPC and force
  needless re-renders on a fast connection. Now coalesced to one emit per
  120ms per segment, with a guaranteed final flush when a segment finishes
  so the UI never sits on a stale number.

## Phase 2 — UI/UX, remaining pages (one at a time, as agreed)

Roll the same `lib/motion.ts` presets + patterns out to the rest of the app,
in priority order:

1. ~~**TorrentsPage**~~ — done. Extracted a `TorrentCard` widget with the same
   entrance/exit/hover treatment as `DownloadCard`, plus a seeding "breathe"
   pulse on the progress ring and a wiggle on the remove button.
2. ~~**ConverterPage**~~ — done. Spring press/hover on preset cards (with
   proper `AnimatePresence` when the category filter changes), a sliding
   pill indicator behind the active category tab, animated height on the
   Advanced Options disclosure, spring-shake when no input file is selected,
   and the Convert button now uses `Button`'s shared `loading` state.
3. ~~**SettingsPage**~~ — done. Staggered card entrance on mount, spring
   cross-fade on the binaries status badge and update-available/downloading
   banners (`AnimatePresence` + height animation instead of instant
   show/hide), animated proxy-fields reveal when switching proxy type, spring
   progress bar for update downloads, and both async buttons now use
   `Button`'s shared `loading` state. Fixed all 3 unused-`error` warnings.
4. ~~**Dashboard**~~ — done. Stat cards enter with a stagger on mount, and
   each number now "rolls" up/down on a firm spring whenever it changes
   (active/completed/failed counts) instead of snapping. Active-transfers
   list reuses the same `DownloadCard` stagger/`AnimatePresence` pattern as
   the Downloads page, with an animated empty state.
5. ~~**Sidebar / AppShell**~~ — done. Sidebar already had a sliding
   `layoutId` pill behind the active nav item (built in from the start) —
   moved its timing onto `springs.gentle` for consistency with everything
   else, added tap-spring feedback to nav items and the collapse button, and
   the collapse chevron now rotates on a spring instead of a CSS class swap.
   TitleBar's minimize/maximize/close buttons got the same tap-spring touch.
6. ~~**History**~~ — done. Row entrance/exit stagger matching Downloads, a
   sliding pill on the status filter tabs (same `layoutId` pattern as the
   Converter category tabs and Sidebar nav), and remove-button hover/tap
   spring.
7. ~~Lint cleanup~~ — done, all 6 pre-existing warnings fixed
   (`drive-downloader.ts`, `DashboardPage.tsx`, `TitleBar.tsx`, plus 3 in
   `SettingsPage.tsx`). `pnpm lint` is now warning-free.

**Phase 2 is complete.** All 7 pages (Dashboard, Downloads, Torrents,
Converter, Settings, History, plus Sidebar/TitleBar chrome) now share the
same spring-physics vocabulary from `lib/motion.ts` — entrance staggers,
sliding-pill tab indicators, spring press/hover, animated disclosures, and
spring-shake validation feedback are all consistent app-wide instead of
living on one showcase page.

## Phase 3 — Backend / engine performance

Ordered by impact vs. risk:

1. ~~**Torrent engine progress bridge**~~ — audited. Good news: it's already
   throttled correctly (broadcasts once per second across all torrents, not
   per-piece), so it doesn't have the flooding problem the HTTP engine had.
   While auditing it, found and fixed a real **functional bug** instead: a
   finished torrent was always reported as `state: "finished"`, never
   `"seeding"` — but WebTorrent keeps uploading to peers after completion.
   That meant (a) the pause button never showed for a completed torrent,
   so it could never be paused again once done, and (b) the UI's seeding
   "still active" pulse (added in Phase 2) could never actually light up.
   Now maps `done && !paused → "seeding"` correctly.
2. ~~**Segmented HTTP downloads — adaptive segment count**~~ — done. The
   user's requested segment count (up to 32) applied unconditionally to any
   file over 2MB, so e.g. a 3MB file at a high segment-count setting opened
   dozens of tiny per-segment connections for no real parallelism benefit.
   Now capped so each segment is at least 4MB, scaling segment count to the
   file size instead of always maxing out the setting.
3. ~~**Converter engine (FFmpeg)**~~ — done, and this one turned out to be
   more than an audit. Found two real issues while looking at progress
   throttling:
   - **Progress flooding** — same pattern as Phase 1's HTTP fix. ffmpeg's
     `-progress pipe:1` output emits a full status block roughly once per
     frame, which for high-fps footage converting faster than real time
     meant dozens of `onProgress` → IPC sends per second. Coalesced to the
     same 120ms interval, with the existing guaranteed final flush at 100%.
   - **Hardware acceleration was a non-functional stub.** The Settings "Use
     GPU acceleration" toggle called `detectHardwareAcceleration()`, which
     literally always returned `{ nvenc: false, qsv: false, amf: false }`
     with a comment saying it needed real implementation. So "auto" GPU
     mode only ever added a decode-side `-hwaccel auto` flag and silently
     kept every encode on CPU libx264/libx265, GPU or no GPU. Replaced it
     with a real probe (`ffmpeg -hide_banner -encoders`, memoized per
     binary) that checks which hardware encoders this specific ffmpeg build
     actually supports, and wired "auto" to pick the best one it finds
     (NVENC → QSV → AMF → CPU fallback) instead of guessing.
     — **Known follow-up, not shipped**: decode-side `-hwaccel <method>`
     still isn't wired up, because `ConverterJob` currently builds argv as
     `-i <input> ...args`, and ffmpeg only honors `-hwaccel` *before* `-i`.
     Fixing that needs `ConverterJob` to accept a separate pre-input arg
     list — a small, contained change, but real hardware to verify against
     rather than shipping an unverified flag reorder. The encoder-side fix
     above (the more expensive half of most conversions) is unaffected by
     this and works today.
4. ~~**SQLite/drizzle layer**~~ — done. Found a real chain of DB-write
   amplification: `updateProgress()` was called on *every* throttled
   progress event from both the HTTP and social-extractor engines, with no
   throttle of its own — and `better-sqlite3` is synchronous, running on
   Electron's *main* thread, so every one of those writes briefly blocks
   IPC/UI handling. Two fixes: (a) added `synchronous = NORMAL` alongside
   the existing WAL mode — SQLite's own documented safe pairing, avoiding
   an fsync on every single transaction while keeping the DB file itself
   crash-safe; (b) decoupled DB persistence from the UI feed entirely —
   `updateProgress()` now writes at most once per 2s per download, since
   the on-disk value only matters for surviving an app restart mid-download
   (the live progress bar comes from the IPC broadcast, not a DB read), so
   there's no reason to persist a resumability checkpoint every ~120ms.
   `complete()`/`updateStatus()` for terminal states still write
   immediately and unconditionally — only the high-frequency progress tick
   is throttled.
5. ~~**Startup time**~~ — audited, turned out to be a non-issue: it's
   `resolveBinaries()` (the one called per-download/per-conversion, i.e. the
   actual hot path) that just returns pre-computed constant paths with zero
   filesystem calls. `getMissingBinaries()` is the only one that touches
   disk, and it's only called once at app startup plus on-demand when the
   user clicks "check binaries" in Settings — not a hot path, nothing to
   cache.

**Phase 3 is complete.** Net result: fixed a real state-mapping bug (torrent
seeding), a real dead-code hardware-acceleration stub, two independent
progress-event-flooding sources (ffmpeg, on top of the HTTP engine from
Phase 1), an adaptive-segment-count inefficiency, and a DB-write
amplification chain — while two items audited clean (torrent IPC
throttling, binary-path resolution) and were reported as such rather than
"fixed" for the sake of it.

**Post-Phase-3 follow-up**: the yt-dlp/social engine's own progress
throttling was left unverified in the original pass — audited it properly
and found two things: (1) it relies on yt-dlp's own internal progress-line
throttling rather than anything this app controls, so brought it in line
with the same 120ms coalescing used by the other two engines, for
consistency that doesn't quietly regress on a yt-dlp update; (2)
`social-manager.ts` was calling `downloadsRepo.complete(id, filepath, 0, 0)`
— hardcoded zeros — so every finished social/yt-dlp download showed **0
bytes and 0 avg speed in History**, regardless of the actual file size.
Fixed by having `SocialDownloadJob` track the last-known size/timing from
yt-dlp's own progress output (the only source available, since unlike the
HTTP engine there's no upfront Content-Length) and exposing it for
`social-manager.ts` to report accurately on completion.

## Phase 4 — New capabilities

3 of the smaller, well-scoped candidates are now implemented and verified
(typecheck + build + lint clean); the larger ones are left as scoped
proposals rather than half-built.

### Done this pass

- ~~**Show in folder**~~ — completed downloads and history rows now have a
  button that reveals the file in the OS file manager (`shell.showItemInFolder`
  via a new typed `app:showInFolder` IPC channel). Guards file existence
  server-side first, since a file can be moved/deleted after the row was
  last refreshed.
- ~~**Duplicate URL detection**~~ — `downloadsRepo.findActiveOrCompleteByUrl()`
  checks for an existing non-failed/non-cancelled download of the same URL
  before starting a new one. `QueueManager.start()` rejects with a
  parseable `DUPLICATE_URL:<id>` error (documented on the IPC contract in
  shared-types) rather than either silently allowing dupes or silently
  blocking them; `AddUrlBar` catches that specific error and asks
  "add anyway?" before retrying with the check bypassed. A failed download
  is deliberately *not* treated as a duplicate — retrying a failed download
  is the normal, expected thing to do.
- ~~**Batch/list URL import**~~ — pasting a multi-line list of URLs into
  the Downloads URL bar (e.g. copied from a spreadsheet or text file) now
  adds all of them in one go instead of dumping the raw blob into the
  single-line input. Splits social/video URLs out with a pointer to Social
  Grab, reports invalid lines, and skips the duplicate-confirmation prompt
  for batch adds specifically (a blocking `confirm()` per line in a
  20-URL paste would be unusable) — single-URL paste behavior is
  untouched.
- ~~**Bandwidth scheduling**~~ — a second, time-windowed global speed limit
  ("cap me during the day, run faster overnight") layered on top of the
  existing always-on `maxTotalSpeedKBps` token bucket. A once-a-minute
  clock tick in `QueueManager` re-evaluates the effective rate — the limit
  flips automatically at the scheduled hour with no settings change and no
  restart needed, mid-download.
- ~~**Post-download actions**~~ — scoped down to the one action that had a
  real, already-built mechanism to hook into (`shell.showItemInFolder`,
  added earlier this phase): a "open containing folder automatically when
  a download finishes" toggle, wired through a single shared helper
  (`download-complete-actions.ts`) called from both the HTTP engine
  (queue-manager.ts) and the social/yt-dlp engine (social-manager.ts), so
  the behavior can't drift between the two completion paths.
- ~~**Download scheduling**~~ — "only download during a window each day"
  (e.g. 1am–6am), sharing the bandwidth schedule's clock-tick
  infrastructure. Outside the window, active transfers are auto-paused and
  queued ones stay queued; both auto-resume when the window reopens. Care
  was taken to track *which* downloads the scheduler itself paused
  (`autoPausedIds`) separately from a user's own manual pause, so the
  schedule only ever resumes what it paused — a download the user paused
  on purpose for an unrelated reason is never silently resumed out from
  under them.

### Proposed, not built — larger scope, listed for a future pass

- **Bandwidth/download schedule UX polish** — both schedules are single
  fixed daily windows (one "from hour" / "to hour" pair each). Multiple
  windows per day, per-weekday schedules, or a visual timeline picker
  would be the natural next iteration, but the current single-window
  version already covers the common case ("overnight") and every setting
  added is real and tested, not a placeholder for a UI that doesn't
  exist yet.
- **Post-download auto-convert / auto-move** — the completion hook point
  (`download-complete-actions.ts`) is now real and shared across both
  download engines, so adding more actions here is a much smaller lift
  than before, but auto-convert specifically needs to actually invoke the
  converter engine (cross-engine call, more surface to get right) and
  auto-move needs its own destination-folder setting; scoped out this pass.
- **Browser extension companion** — capture right-click "Download with
  SHANUTECHX" from Chrome/Firefox. The app already has a typed IPC/handler
  surface that a native-messaging host could bridge into, but the
  extension itself and the native-messaging manifest are a separate
  packaging surface (a whole second project, not a renderer/main code
  change), so it's out of scope for an in-repo pass like this one.
- **True duplicate-file detection** (vs. duplicate-URL) — warn before
  re-downloading a file whose *content* (not just URL) already exists
  on disk, e.g. via a checksum or filename+size heuristic. More invasive
  than URL matching since it needs to touch the filesystem, not just the
  history table.

## How to keep using Kinetics from here

Since Kinetics is a snippet gallery, not a package: when picking up a Phase 2
item, browse https://kinetics.colorion.co, pick the effect that matches the
interaction (there's a live demo + code panel per effect), and translate its
CSS/React into a spring using `lib/motion.ts`'s presets rather than
copy-pasting the raw snippet — that keeps every animation in the app on the
same small set of physical parameters instead of 35 different ones.
