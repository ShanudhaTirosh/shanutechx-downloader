import { request } from "undici";
import type { Dispatcher } from "undici";

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  downloadUrl: string;
}

/**
 * Google Drive URL patterns:
 * - https://drive.google.com/file/d/{FILE_ID}/view
 * - https://drive.google.com/open?id={FILE_ID}
 * - https://drive.google.com/uc?id={FILE_ID}
 * - https://docs.google.com/document/d/{FILE_ID}
 * - https://docs.google.com/spreadsheets/d/{FILE_ID}
 * - https://docs.google.com/presentation/d/{FILE_ID}
 */

const DRIVE_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
  /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
];

/**
 * Extract Google Drive file ID from various URL formats
 */
export function extractDriveFileId(url: string): string | null {
  for (const pattern of DRIVE_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if URL is a Google Drive URL
 */
export function isDriveUrl(url: string): boolean {
  return extractDriveFileId(url) !== null;
}

/**
 * Get direct download URL for Google Drive file
 * 
 * Google Drive requires special handling:
 * 1. Small files: Direct download via /uc?export=download&id=
 * 2. Large files: Requires confirmation token (virus scan warning bypass)
 */
export function getDriveDirectUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

/**
 * Resolve Google Drive file metadata
 * This attempts to get filename and size without downloading
 */
export async function resolveDriveFile(
  fileId: string,
  dispatcher?: Dispatcher
): Promise<DriveFileInfo> {
  const downloadUrl = getDriveDirectUrl(fileId);
  
  try {
    // Make HEAD request to get metadata
    const response = await request(downloadUrl, {
      method: "HEAD",
      dispatcher,
      maxRedirections: 10,
    });

    // Try to extract filename from Content-Disposition header
    const contentDisposition = response.headers["content-disposition"] as string;
    let filename = `drive-${fileId}`;
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, "");
      }
    }

    // Get file size
    const contentLength = response.headers["content-length"] as string;
    const size = contentLength ? parseInt(contentLength, 10) : null;

    // Get MIME type
    const mimeType = (response.headers["content-type"] as string) || "application/octet-stream";

    return {
      id: fileId,
      name: filename,
      mimeType,
      size,
      downloadUrl,
    };
  } catch {
    // Fallback if HEAD request fails
    return {
      id: fileId,
      name: `drive-${fileId}`,
      mimeType: "application/octet-stream",
      size: null,
      downloadUrl,
    };
  }
}

/**
 * Convert Google Drive URL to direct download URL
 * This is the main function to use when adding a Drive URL to downloads
 */
export async function convertDriveUrl(
  url: string,
  dispatcher?: Dispatcher
): Promise<{ directUrl: string; filename: string; size: number | null }> {
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    throw new Error("Invalid Google Drive URL");
  }

  const fileInfo = await resolveDriveFile(fileId, dispatcher);

  return {
    directUrl: fileInfo.downloadUrl,
    filename: fileInfo.name,
    size: fileInfo.size,
  };
}

/**
 * Google Docs export formats
 * These require different export URLs
 */
export const DOCS_EXPORT_FORMATS = {
  document: {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    txt: "text/plain",
    html: "text/html",
    epub: "application/epub+zip",
  },
  spreadsheet: {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    pdf: "application/pdf",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
  },
  presentation: {
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odp: "application/vnd.oasis.opendocument.presentation",
    pdf: "application/pdf",
    txt: "text/plain",
  },
};

/**
 * Get Google Docs export URL
 */
export function getDocsExportUrl(fileId: string, format: string, docType: "document" | "spreadsheet" | "presentation"): string {
  return `https://docs.google.com/${docType}s/d/${fileId}/export?format=${format}`;
}
