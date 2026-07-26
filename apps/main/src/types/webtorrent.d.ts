/**
 * Minimal ambient declaration for the ESM-only `webtorrent` package.
 * We intentionally don't pull in @types/webtorrent — it targets an older API
 * shape than v3 exposes. This app only touches a small, explicitly-typed
 * surface (see WTClient/WTTorrent in torrent-engine.ts), so a loose ambient
 * `any` here is safe: all real type-checking happens against our own
 * narrower interfaces immediately after the dynamic import.
 */
declare module "webtorrent" {
  const WebTorrent: any;
  export default WebTorrent;
}
