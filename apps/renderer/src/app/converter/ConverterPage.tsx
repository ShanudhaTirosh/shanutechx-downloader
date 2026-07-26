import { useState } from "react";
import { FileAudio, Loader2, FolderOpen } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ipc } from "../../lib/ipc-client";

export function ConverterPage() {
  const [inputPath, setInputPath] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleBrowse() {
    const result = await ipc.invoke("app:selectFile", {
      title: "Select Video or Audio File",
      filters: [
        { name: "Video Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"] },
        { name: "Audio Files", extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.filePath) {
      setInputPath(result.filePath);
    }
  }

  async function handleConvert() {
    if (!inputPath.trim()) return;
    setRunning(true); setResult(null);
    try {
      await ipc.invoke("converter:convert", { inputPath: inputPath.trim(), kind: "extract-audio" });
      setResult("Conversion started — track progress on the Dashboard.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Converter</h1>
      <p className="text-sm text-zinc-500 mb-6">Extract audio, mux video, and tag media files — powered by a bundled ffmpeg.</p>

      <Card>
        <CardHeader><CardTitle>Extract audio (MP3)</CardTitle></CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="Select a video or audio file..."
              className="flex-1 bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring"
            />
            <Button onClick={handleBrowse} variant="secondary" className="shrink-0">
              <FolderOpen size={16} /> Browse
            </Button>
          </div>
          <Button onClick={handleConvert} disabled={!inputPath.trim() || running} className="self-start">
            {running ? <Loader2 size={16} className="animate-spin" /> : <FileAudio size={16} />} Extract audio
          </Button>
          {result && <p className="text-xs text-status-success">{result}</p>}
        </div>
      </Card>
    </div>
  );
}

