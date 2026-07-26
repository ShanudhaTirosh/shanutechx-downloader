/**
 * webtorrent (like several modern packages — see the nanoid/execa history in
 * this codebase) ships ESM-only. Rather than converting the entire main
 * process to ESM (which has real friction with Electron's sandboxed preload
 * script requirements), we load it via a dynamic `import()` — which Node
 * fully supports from CommonJS files — and cache the result. This is the
 * standard, low-risk interop pattern for consuming one ESM-only dependency
 * from an otherwise-CJS codebase.
 */
let cached: typeof import("webtorrent") extends { default: infer T } ? T : never;

export async function loadWebTorrent() {
  if (!cached) {
    const mod = await import("webtorrent");
    cached = (mod.default ?? mod) as typeof cached;
  }
  return cached;
}
