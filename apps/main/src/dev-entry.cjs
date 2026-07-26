// Dev-only entry shim. Electron loads its entry point directly (not via a
// `require()` call), so a bare `-r tsx/cjs src/main.ts` can't work — Node's
// own loader chokes on the .ts extension before tsx's hook ever gets a
// chance to run. This tiny .cjs file IS the real entry point Electron loads;
// it registers the tsx hook first, then requires the actual TS source.
//
// NODE_ENV is set here (rather than relying on the shell) because the
// `pnpm dev` script invokes electron directly without an env-setting
// wrapper like cross-env. window.ts's isDev check depends on this being
// "development" — without it, the app falls through to loadFile() and
// looks for a renderer/dist build that doesn't exist yet in dev mode.
process.env.NODE_ENV = process.env.NODE_ENV || "development";
require("tsx/cjs");
require("./main.ts");
