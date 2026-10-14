import { request, type Dispatcher } from "undici";
import path from "node:path";
import { sanitizeFilename } from "../../utils/filename";
import { isDriveUrl, convertDriveUrl } from "./drive-downloader";

export interface ResolvedMeta {
  filename: string;
  sizeBytes: number | null; // null = unknown, never fabricated as 1 byte (audit fix, §3.3)
  acceptsRanges: boolean;
  actualUrl?: string; // For redirected URLs (like Google Drive)
}

function filenameFromContentDisposition(header: string | undefined): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) { try { return decodeURIComponent(utf8Match[1]); } catch { /* fall through */ } }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    return base && base !== "/" ? base : "download";
  } catch {
    return "download";
  }
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Encoding": "identity",
};

export async function resolveMeta(url: string, dispatcher?: Dispatcher): Promise<ResolvedMeta> {
  // Handle Google Drive URLs specially
  if (isDriveUrl(url)) {
    try {
      const driveInfo = await convertDriveUrl(url, dispatcher);
      return {
        filename: sanitizeFilename(driveInfo.filename),
        sizeBytes: driveInfo.size,
        acceptsRanges: false,
        actualUrl: driveInfo.directUrl,
      };
    } catch (error) {
      console.error("Failed to resolve Google Drive URL:", error);
    }
  }

  let headers: Record<string, string> = {};
  let ok = false;
  let finalUrl = url;

  try {
    const res = await request(url, {
      method: "HEAD",
      dispatcher,
      headers: BROWSER_HEADERS,
      maxRedirections: 5,
    });
    if (res.statusCode < 400) {
      headers = res.headers as Record<string, string>;
      ok = true;
    }
    await res.body.dump();
  } catch {
    /* fall through to GET probe below */
  }

  if (!ok) {
    const res = await request(url, {
      method: "GET",
      dispatcher,
      headers: { ...BROWSER_HEADERS, Range: "bytes=0-0" },
      maxRedirections: 5,
    });
    headers = res.headers as Record<string, string>;
    if (res.statusCode === 206) {
      headers["accept-ranges"] = "bytes";
      const cr = headers["content-range"];
      if (cr) {
        const totalMatch = /\/(\d+)$/.exec(cr);
        if (totalMatch?.[1]) {
          headers["content-length"] = totalMatch[1];
        }
      }
    }
    res.body.destroy();
  }

  const contentLength = headers["content-length"];
  const sizeBytes = contentLength ? Number(contentLength) : null;
  const acceptsRanges = headers["accept-ranges"] === "bytes" || headers["content-range"] !== undefined;

  const nameFromHeader = filenameFromContentDisposition(headers["content-disposition"]);
  const rawName = nameFromHeader ?? filenameFromUrl(url);
  let safeDecodedName: string;
  try {
    safeDecodedName = decodeURIComponent(rawName);
  } catch {
    safeDecodedName = rawName;
  }

  return {
    filename: sanitizeFilename(safeDecodedName),
    sizeBytes: sizeBytes !== null && !Number.isNaN(sizeBytes) && sizeBytes > 0 ? sizeBytes : null,
    acceptsRanges,
  };
}
