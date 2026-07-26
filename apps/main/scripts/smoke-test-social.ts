/**
 * Smoke test for extract-info.ts's JSON-parsing/mapping logic without
 * requiring real internet access to a video platform (this sandbox can't
 * reach arbitrary external hosts). We stub a fake "yt-dlp" binary — a tiny
 * shell script that prints a realistic --dump-json payload — and point
 * extractMediaInfo() at it. This validates the parsing/mapping code path
 * for real; it does NOT validate yt-dlp itself, which is a well-established
 * upstream project outside this app's scope to test.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractMediaInfo } from "../src/engines/social-extractor/extract-info";

const FAKE_INFO = {
  title: "Example Video Title",
  uploader: "Example Channel",
  duration: 212,
  thumbnail: "https://example.com/thumb.jpg",
  webpage_url: "https://example.com/watch?v=abc123",
  extractor: "generic",
  ext: "mp4",
  filesize_approx: 15728640,
  _type: "video",
  formats: [
    { height: 1080, format_id: "137", ext: "mp4", filesize: 15728640, vcodec: "avc1" },
    { height: 720, format_id: "136", ext: "mp4", filesize: 9437184, vcodec: "avc1" },
    { height: 0, format_id: "140", ext: "m4a", filesize: 3145728, vcodec: "none" }, // audio-only — must be filtered out
  ],
};

async function main() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shanutechx-fakeytdlp-"));
  const fakeYtDlpPath = path.join(tmpDir, "yt-dlp");
  await fsp.writeFile(fakeYtDlpPath, `#!/bin/sh\ncat << 'JSON'\n${JSON.stringify(FAKE_INFO)}\nJSON\n`);
  await fsp.chmod(fakeYtDlpPath, 0o755);

  console.log("[test] extractMediaInfo() parses yt-dlp --dump-json output correctly...");
  const info = await extractMediaInfo("https://example.com/watch?v=abc123", fakeYtDlpPath, false);

  const checks: [string, boolean][] = [
    ["title mapped", info.title === "Example Video Title"],
    ["uploader mapped", info.uploader === "Example Channel"],
    ["duration mapped", info.durationSec === 212],
    ["video-only formats kept", info.availableQualities.length === 2],
    ["audio-only format filtered out", !info.availableQualities.some((f) => f.formatId === "140")],
    ["formats sorted by height desc", info.availableQualities[0]?.height === 1080 && info.availableQualities[1]?.height === 720],
    ["isPlaylist correctly false", info.isPlaylist === false],
  ];

  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`  ${passed ? "✓" : "✗"} ${label}`);
    if (!passed) allPassed = false;
  }

  await fsp.rm(tmpDir, { recursive: true, force: true });
  if (!allPassed) throw new Error("Some checks failed");
  console.log("\n✅ SOCIAL EXTRACTOR PARSING SMOKE TEST PASSED\n");
  console.log("Note: this validates our JSON-mapping code only. Real yt-dlp");
  console.log("network extraction against live sites isn't reachable from this");
  console.log("sandboxed environment — verify that manually with `pnpm dev`.");
}

main().catch((err) => { console.error("❌ FAILED:", err); process.exit(1); });
