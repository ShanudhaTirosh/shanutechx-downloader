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

export async function resolveMeta(url: string, dispatcher?: Dispatcher): Promise<ResolvedMeta> {
  // Handle Google Drive URLs specially
  if (isDriveUrl(url)) {
    try {
      const driveInfo = await convertDriveUrl(url, dispatcher);
      return {
        filename: sanitizeFilename(driveInfo.filename),
        sizeBytes: driveInfo.size,
        acceptsRanges: false, // Google Drive doesn't support range requests reliably
        actualUrl: driveInfo.directUrl,
      };
    } catch (error) {
      // Fall through to normal resolution if Drive conversion fails
      console.error("Failed to resolve Google Drive URL:", error);
    }
  }

  let headers: Record<string, string> = {};
  let ok = false;

  try {
    const res = await request(url, { method: "HEAD", dispatcher });
    // Some servers respond 200 to HEAD with no body, some 405/403 — only
    // trust it if we got real headers back on a successful-ish status.
    if (res.statusCode < 400) {
      headers = res.headers as Record<string, string>;
      ok = true;
    }
    await res.body.dump(); // drain — never leave a HEAD response's body unconsumed (audit fix, §3.2)
  } catch {
    /* fall through to GET probe below */
  }

  if (!ok) {
    // HEAD unsupported/blocked — probe with a real GET but only read headers,
    // then IMMEDIATELY destroy the body stream so we don't leak the socket
    // (this exact leak was audit finding §3.2 in the old app).
    const res = await request(url, { method: "GET", dispatcher });
    headers = res.headers as Record<string, string>;
    res.body.destroy();
  }

  const contentLength = headers["content-length"];
  const sizeBytes = contentLength ? Number(contentLength) : null;
  const acceptsRanges = headers["accept-ranges"] === "bytes";

  const nameFromHeader = filenameFromContentDisposition(headers["content-disposition"]);
  const rawName = nameFromHeader ?? filenameFromUrl(url);

  return {
    filename: sanitizeFilename(decodeURIComponent(rawName)),
    sizeBytes: sizeBytes !== null && !Number.isNaN(sizeBytes) && sizeBytes > 0 ? sizeBytes : null,
    acceptsRanges,
  };
}
