import { useState } from "react";
import { FileAudio, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ipc } from "../../lib/ipc-client";

export function ConverterPage() {
  const [inputPath, setInputPath] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
          <input
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="/path/to/video.mp4"
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring"
          />
          <Button onClick={handleConvert} disabled={!inputPath.trim() || running} className="self-start">
            {running ? <Loader2 size={16} className="animate-spin" /> : <FileAudio size={16} />} Extract audio
          </Button>
          {result && <p className="text-xs text-status-success">{result}</p>}
        </div>
      </Card>
    </div>
  );
}
