import fs from "node:fs/promises";
import path from "node:path";

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
// Windows reserved device names — the old app's sanitizer missed these
// entirely (audit finding §4.1); a title like "con" would fail to save.
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_BASENAME_BYTES = 200; // headroom under NTFS's 255-byte component limit + path prefix

export function sanitizeFilename(raw: string): string {
  let name = raw.replace(ILLEGAL_CHARS, "_").trim().replace(/^\.+|\.+$/g, "");
  if (!name) name = "download";

  const ext = path.extname(name);
  let base = name.slice(0, name.length - ext.length);
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;

  if (Buffer.byteLength(base + ext, "utf8") > MAX_BASENAME_BYTES) {
    const extBytes = Buffer.byteLength(ext, "utf8");
    const budget = MAX_BASENAME_BYTES - extBytes;
    base = Buffer.from(base, "utf8").subarray(0, Math.max(1, budget)).toString("utf8");
  }
  return base + ext;
}

/**
 * Atomic unique-path resolution. The old app's get_unique_filepath() checked
 * `exists()` then returned a path the caller created *later* — a TOCTOU race
 * where two downloads resolving the same name concurrently could both pass
 * the check (audit finding §4.3). This reserves the file immediately via an
 * exclusive create ('wx' — fails if the path exists), closing the gap.
 */
export async function reserveUniqueFilepath(dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);

  for (let n = 0; n < 1000; n++) {
    const candidate = path.join(dir, n === 0 ? filename : `${base} (${n})${ext}`);
    try {
      const handle = await fs.open(candidate, "wx");
      await handle.close();
      return candidate;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // taken — try the next suffix
    }
  }
  throw new Error(`Could not reserve a unique filename for "${filename}" after 1000 attempts`);
}
