import { runProcess } from "../../utils/spawn-process";
import type { MediaInfo } from "@shanutechx/shared-types";

interface YtDlpFlatInfo {
  title?: string; uploader?: string; duration?: number; thumbnail?: string;
  webpage_url?: string; extractor?: string; ext?: string; filesize?: number; filesize_approx?: number;
  _type?: string; entries?: unknown[];
  formats?: { height?: number; format_id: string; ext: string; filesize?: number; filesize_approx?: number; vcodec?: string }[];
}

/**
 * Always invokes yt-dlp with an ARGUMENT ARRAY via execa — never a shell
 * string. This is the direct fix for the old app's implicit shell-invocation
 * risk class; there is no string concatenation of user-supplied URLs into a
 * command line anywhere in this file.
 */
export async function extractMediaInfo(
  url: string, ytDlpPath: string, ignoreCertificateErrors: boolean,
): Promise<MediaInfo> {
  const args = ["--dump-json", "--no-playlist", "--no-warnings", "--socket-timeout", "20"];
  if (ignoreCertificateErrors) args.push("--no-check-certificate"); // OFF unless the user explicitly opted in (audit fix §3.6)
  args.push(url);

  const { promise } = runProcess(ytDlpPath, args, { timeoutMs: 30_000 });
  const { stdout } = await promise;
  const info: YtDlpFlatInfo = JSON.parse(stdout);

  const formats = (info.formats ?? [])
    .filter((f) => f.vcodec && f.vcodec !== "none" && f.height)
    .map((f) => ({
      height: f.height!,
      formatId: f.format_id,
      ext: f.ext,
      filesizeBytes: f.filesize ?? f.filesize_approx ?? null,
    }))
    .sort((a, b) => b.height - a.height);

  return {
    title: info.title ?? "Untitled",
    uploader: info.uploader ?? "Unknown",
    durationSec: info.duration ?? 0,
    thumbnail: info.thumbnail ?? "",
    webpageUrl: info.webpage_url ?? url,
    extractor: info.extractor ?? "unknown",
    ext: info.ext ?? "mp4",
    filesizeBytes: info.filesize ?? info.filesize_approx ?? null,
    isPlaylist: info._type === "playlist",
    availableQualities: formats,
  };
}
