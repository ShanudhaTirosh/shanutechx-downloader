/**
 * Real smoke test — actually invokes the system's ffmpeg (no stub) to
 * convert a generated WAV into an MP3, verifying:
 *   1. The output file is produced and is a real, playable-sized MP3.
 *   2. Live progress percentages actually arrive DURING the run (this
 *      exact bug — Duration parsed only after completion, so progress
 *      never updated live — was caught and fixed while building this).
 *   3. Cancellation actually kills the ffmpeg process.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ConverterJob } from "../src/engines/converter-engine/converter-job";

async function main() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shanutechx-converter-test-"));
  const inputWav = path.join(tmpDir, "input.wav");
  const outputMp3 = path.join(tmpDir, "output.mp3");

  console.log("generating a 3s test tone with ffmpeg...");
  execSync(`ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -y "${inputWav}"`, { stdio: "ignore" });

  console.log("\n[test] ConverterJob reports live progress and produces a valid output file...");
  const job = new ConverterJob();
  const progressSamples: number[] = [];
  let doneCalled = false;
  let errorMsg: string | null = null;

  await job.run(
    {
      inputPath: inputWav, outputPath: outputMp3,
      ffmpegArgs: ["-vn", "-acodec", "libmp3lame", "-q:a", "2"],
      ffmpegPath: "ffmpeg",
    },
    {
      onProgress: (p) => progressSamples.push(p),
      onDone: () => { doneCalled = true; },
      onError: (msg) => { errorMsg = msg; },
    },
  );

  if (errorMsg) throw new Error(`Converter reported an error: ${errorMsg}`);
  if (!doneCalled) throw new Error("onDone was never called");

  const stat = await fsp.stat(outputMp3);
  if (stat.size < 1000) throw new Error(`Output MP3 suspiciously small: ${stat.size} bytes`);

  const sawLiveProgress = progressSamples.some((p) => p > 0 && p < 100);
  const checks: [string, boolean][] = [
    ["output MP3 file exists and has real content", stat.size > 1000],
    [`live progress samples captured during the run (not just 0/100)`, sawLiveProgress],
    ["progress ends at 100", progressSamples[progressSamples.length - 1] === 100],
  ];

  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`  ${passed ? "✓" : "✗"} ${label}`);
    if (!passed) allPassed = false;
  }
  console.log(`  progress samples: [${progressSamples.map((p) => p.toFixed(0)).join(", ")}]`);

  console.log("\n[test] cancellation actually kills the ffmpeg process...");
  const bigInput = path.join(tmpDir, "big.wav");
  execSync(`ffmpeg -f lavfi -i "sine=frequency=220:duration=20" -y "${bigInput}"`, { stdio: "ignore" });
  const cancelJob = new ConverterJob();
  let cancelSawError = false;
  let cancelSawDone = false;
  const runPromise = cancelJob.run(
    // -re forces ffmpeg to read the input at its native real-time playback
    // rate instead of as-fast-as-CPU-allows — without it, encoding this
    // trivial 20s sine tone finishes in well under 300ms and there's
    // nothing left to cancel by the time cancel() fires.
    { inputPath: bigInput, outputPath: path.join(tmpDir, "cancel-out.mp3"), ffmpegArgs: ["-re", "-vn", "-acodec", "libmp3lame"], ffmpegPath: "ffmpeg" },
    { onProgress: () => {}, onDone: () => { cancelSawDone = true; }, onError: () => { cancelSawError = true; } },
  );
  setTimeout(() => cancelJob.cancel(), 300);
  await runPromise;
  console.log(`  ${cancelSawError ? "✓" : "✗"} cancel() caused the job to end via onError (process was killed), not onDone=${cancelSawDone}`);
  if (!cancelSawError) allPassed = false;

  await fsp.rm(tmpDir, { recursive: true, force: true });
  if (!allPassed) throw new Error("Some checks failed");
  console.log("\n✅ CONVERTER SMOKE TEST PASSED (real ffmpeg, real files, real cancellation)\n");
}

main().catch((err) => { console.error("❌ FAILED:", err); process.exit(1); });
