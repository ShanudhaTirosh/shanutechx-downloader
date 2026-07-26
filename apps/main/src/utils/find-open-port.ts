import net from "node:net";

/**
 * Scans [start, end] for the first port that's actually free, instead of
 * accepting a "port range" setting and then only ever using `start` — the
 * exact bug found in the old app's torrent engine (audit §3.10: `port_end`
 * was accepted as a parameter but never referenced anywhere).
 */
export async function findOpenPort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  return start; // fall back to start and let the caller/OS report the real bind error
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}
