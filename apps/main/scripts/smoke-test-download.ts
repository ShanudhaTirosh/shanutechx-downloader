/**
 * Standalone smoke test for DownloadJob + TokenBucket — run with tsx against
 * a local HTTP server (no Electron, no real network egress required). Verifies:
 *   1. Multi-segment range-based download reconstructs the exact original bytes.
 *   2. The shared global token bucket actually caps aggregate throughput
 *      (the bug the old app had — per-segment-only limiting).
 *   3. Pause/resume works mid-transfer.
 */
import http from "node:http";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DownloadJob } from "../src/engines/download-engine/download-job";
import { TokenBucket } from "../src/utils/token-bucket";

const FILE_SIZE = 4 * 1024 * 1024; // 4MB
const testFile = crypto.randomBytes(FILE_SIZE);

function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const range = req.headers.range;
      if (req.method === "HEAD") {
        res.writeHead(200, { "content-length": FILE_SIZE, "accept-ranges": "bytes", "content-disposition": 'attachment; filename="test-file.bin"' });
        res.end();
        return;
      }
      if (range) {
        const match = /bytes=(\d+)-(\d+)/.exec(range);
        const start = Number(match![1]);
        const end = Number(match![2]);
        res.writeHead(206, { "content-range": `bytes ${start}-${end}/${FILE_SIZE}`, "content-length": end - start + 1 });
        res.end(testFile.subarray(start, end + 1));
      } else {
        res.writeHead(200, { "content-length": FILE_SIZE });
        res.end(testFile);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/test-file.bin`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function testMultiSegmentCorrectness(url: string, saveDir: string) {
  console.log("\n[test 1] multi-segment download reconstructs exact bytes...");
  const job = new DownloadJob("test1", url, saveDir, 6);
  const globalBucket = new TokenBucket(0); // unlimited
  const perFileBucket = new TokenBucket(0);
  let resolvedSegments = 0;
  let finalStatus = "";

  await job.run(
    {
      onResolved: (filename, sizeBytes, segments) => {
        resolvedSegments = segments;
        console.log(`  resolved: filename=${filename} sizeBytes=${sizeBytes} segments=${segments}`);
      },
      onProgress: () => {},
      onStatus: (status) => { finalStatus = status; },
    },
    globalBucket, perFileBucket,
  );

  if (finalStatus !== "complete") throw new Error(`Expected status "complete", got "${finalStatus}"`);
  if (resolvedSegments < 2) throw new Error(`Expected multi-segment split, got ${resolvedSegments} segment(s)`);

  const { filepath, sizeBytes } = job.result;
  const written = await fsp.readFile(filepath);
  if (written.length !== FILE_SIZE) throw new Error(`Size mismatch: wrote ${written.length}, expected ${FILE_SIZE}`);
  if (!written.equals(testFile)) throw new Error("Byte content mismatch after multi-segment merge!");
  console.log(`  ✓ PASS — ${sizeBytes} bytes, ${resolvedSegments} segments, content byte-for-byte correct`);
}

async function testGlobalSpeedLimit(url: string, saveDir: string) {
  console.log("\n[test 2] shared global token bucket actually caps aggregate speed (audit fix §2.7/§3.1)...");
  const targetBps = 512 * 1024; // 512 KB/s cap, shared across ALL segments
  const job = new DownloadJob("test2", url, saveDir, 8); // 8 segments — old app's bug would let each hit 512KB/s independently = ~4MB/s aggregate
  const globalBucket = new TokenBucket(targetBps);
  const perFileBucket = new TokenBucket(0); // no per-file cap, isolate the global-bucket behavior

  const start = Date.now();
  await job.run(
    { onResolved: () => {}, onProgress: () => {}, onStatus: () => {} },
    globalBucket, perFileBucket,
  );
  const elapsedSec = (Date.now() - start) / 1000;
  const actualBps = FILE_SIZE / elapsedSec;

  console.log(`  target: ${(targetBps / 1024).toFixed(0)} KB/s | actual aggregate: ${(actualBps / 1024).toFixed(0)} KB/s | elapsed: ${elapsedSec.toFixed(2)}s`);
  // Allow generous headroom (this is a coarse token bucket over a short transfer,
  // not a precision rate-shaper) but it must be nowhere near segmentCount x target,
  // which is what the OLD app's per-segment-only limiting would produce (~8x here).
  if (actualBps > targetBps * 2.5) {
    throw new Error(`Speed limiter did not hold aggregate throughput near the cap (old-app-style bug reproduced!)`);
  }
  console.log(`  ✓ PASS — aggregate throughput stayed within the shared cap regardless of 8 concurrent segments`);
}

async function testPauseResume(url: string, saveDir: string) {
  console.log("\n[test 3] pause/resume mid-transfer...");
  const job = new DownloadJob("test3", url, saveDir, 4);
  const globalBucket = new TokenBucket(300 * 1024); // slow enough to reliably catch it mid-flight
  const perFileBucket = new TokenBucket(0);
  let pausedOnce = false;
  let sawZeroProgressWhilePaused = false;
  let lastBytesAtPause = 0;
  let finalStatus = "";
  let finalError: string | undefined;

  await job.run(
    {
      onResolved: () => {},
      onProgress: (downloaded) => {
        if (!pausedOnce && downloaded > FILE_SIZE * 0.2) {
          pausedOnce = true;
          job.pause();
          lastBytesAtPause = downloaded;
          setTimeout(() => {
            sawZeroProgressWhilePaused = job.downloadedBytes === lastBytesAtPause;
            job.resume();
          }, 300);
        }
      },
      onStatus: (status, errorMessage) => { finalStatus = status; finalError = errorMessage; },
    },
    globalBucket, perFileBucket,
  );

  console.log(`  finalStatus=${finalStatus}${finalError ? ` error="${finalError}"` : ""}`);
  const { sizeBytes } = job.result;
  if (finalStatus !== "complete") throw new Error(`Expected status "complete", got "${finalStatus}"${finalError ? ` (${finalError})` : ""}`);
  if (sizeBytes !== FILE_SIZE) throw new Error(`Expected full file after resume, got ${sizeBytes} bytes`);
  if (!pausedOnce) throw new Error("Never triggered a pause — test setup issue");
  if (!sawZeroProgressWhilePaused) throw new Error("Bytes kept advancing while paused — pause() isn't blocking segment writes");
  console.log(`  ✓ PASS — transfer genuinely paused, then resumed and completed all ${sizeBytes} bytes`);
}

async function main() {
  const { url, close } = await startServer();
  const saveDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shanutechx-smoketest-"));
  console.log(`test server: ${url}`);
  console.log(`save dir: ${saveDir}`);

  try {
    await testMultiSegmentCorrectness(url, saveDir);
    await testGlobalSpeedLimit(url, saveDir);
    await testPauseResume(url, saveDir);
    console.log("\n✅ ALL SMOKE TESTS PASSED\n");
  } finally {
    await close();
    await fsp.rm(saveDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST FAILED:", err);
  process.exit(1);
});
