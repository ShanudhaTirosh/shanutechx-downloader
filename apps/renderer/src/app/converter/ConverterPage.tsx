import { useState, useEffect } from "react";
import { 
  Loader2, FolderOpen, RefreshCw, Video, Image, Music, 
  ChevronDown, ChevronUp, Settings, Zap, Sparkles, CheckCircle2
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";

type FormatCategory = "video" | "audio" | "image";

interface ConversionPreset {
  name: string;
  description: string;
  outputFormat: string;
  quality?: string;
  icon: React.ReactNode;
  category: FormatCategory;
}

const QUICK_PRESETS: ConversionPreset[] = [
  {
    name: "Extract Audio (MP3)",
    description: "High quality 320kbps MP3",
    outputFormat: "mp3",
    quality: "high",
    icon: <Music size={20} />,
    category: "audio"
  },
  {
    name: "Extract Audio (FLAC)",
    description: "Lossless audio quality",
    outputFormat: "flac",
    icon: <Sparkles size={20} />,
    category: "audio"
  },
  {
    name: "Compress Video",
    description: "Smaller file, good quality",
    outputFormat: "mp4",
    quality: "medium",
    icon: <Video size={20} />,
    category: "video"
  },
  {
    name: "Convert to MP4",
    description: "Universal video format",
    outputFormat: "mp4",
    quality: "high",
    icon: <Video size={20} />,
    category: "video"
  },
  {
    name: "Convert to WebM",
    description: "Modern web format",
    outputFormat: "webm",
    quality: "high",
    icon: <Video size={20} />,
    category: "video"
  },
  {
    name: "Image to JPG",
    description: "Standard image format",
    outputFormat: "jpg",
    quality: "high",
    icon: <Image size={20} />,
    category: "image"
  },
  {
    name: "Image to WebP",
    description: "Modern, smaller size",
    outputFormat: "webp",
    quality: "high",
    icon: <Image size={20} />,
    category: "image"
  },
];

export function ConverterPage() {
  const [inputPath, setInputPath] = useState("");
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [quality, setQuality] = useState<string>("high");
  const [running, setRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useGPU, setUseGPU] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<FormatCategory | "all">("all");
  
  // Advanced options
  const [resolution, setResolution] = useState("");
  const [videoBitrate, setVideoBitrate] = useState("");
  const [audioBitrate, setAudioBitrate] = useState("");
  const [fps, setFps] = useState("");
  const [preset, setPreset] = useState("medium");
  
  const [supportedFormats, setSupportedFormats] = useState<{
    video: string[];
    audio: string[];
    image: string[];
  }>({
    video: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "ogv"],
    audio: ["mp3", "aac", "m4a", "wav", "flac", "ogg", "opus", "wma"],
    image: ["jpg", "jpeg", "png", "bmp", "webp"],
  });
  
  const { showToast } = useToast();

  useEffect(() => {
    async function loadFormats() {
      try {
        const formats = await ipc.invoke("converter:getSupportedFormats", undefined);
        if (formats) {
          setSupportedFormats(formats);
        }
      } catch (error) {
        console.error("Failed to load formats:", error);
        // Keep default formats if loading fails
      }
    }
    void loadFormats();
  }, []);

  async function handleBrowse() {
    try {
      const result = await ipc.invoke("app:selectFile", {
        title: "Select File to Convert",
        filters: [
          { name: "All Supported Files", extensions: ["*"] },
          { name: "Video Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "mpg", "mpeg", "ts", "vob"] },
          { name: "Audio Files", extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "alac"] },
          { name: "Image Files", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff"] },
        ],
      });
      if (result.filePath) {
        setInputPath(result.filePath);
        showToast("File selected successfully", "success");
      }
    } catch (error) {
      showToast("Failed to select file", "error");
    }
  }

  async function handleQuickConvert(preset: ConversionPreset) {
    if (!inputPath.trim()) {
      showToast("Please select an input file first", "error");
      return;
    }
    
    setOutputFormat(preset.outputFormat);
    if (preset.quality) {
      setQuality(preset.quality);
    }
    
    await startConversion(preset.outputFormat, preset.quality);
  }

  async function handleCustomConvert() {
    if (!inputPath.trim()) {
      showToast("Please select an input file first", "error");
      return;
    }
    
    await startConversion(outputFormat, quality);
  }

  async function startConversion(format: string, qual?: string) {
    setRunning(true);
    try {
      const options: any = {
        inputPath: inputPath.trim(),
        outputFormat: format,
        quality: qual || quality,
        hwAccel: useGPU ? "auto" : "none",
      };

      // Add advanced options if set
      if (resolution) options.resolution = resolution;
      if (videoBitrate) options.videoBitrate = videoBitrate;
      if (audioBitrate) options.audioBitrate = audioBitrate;
      if (fps) options.fps = parseInt(fps);
      if (preset && showAdvanced) options.preset = preset;

      await ipc.invoke("converter:universalConvert", options);
      showToast(`Conversion started! Output: ${format.toUpperCase()}`, "success");
      
      // Reset form
      setInputPath("");
      setShowAdvanced(false);
      setResolution("");
      setVideoBitrate("");
      setAudioBitrate("");
      setFps("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Conversion failed", "error");
    } finally {
      setRunning(false);
    }
  }

  const filteredPresets = selectedCategory === "all" 
    ? QUICK_PRESETS 
    : QUICK_PRESETS.filter(p => p.category === selectedCategory);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100 mb-1 flex items-center gap-2">
          <RefreshCw size={20} className="text-purple-400" />
          Universal Converter
        </h1>
        <p className="text-sm text-zinc-500">
          Convert videos, audio, and images — 50+ formats supported, 100% offline with GPU acceleration
        </p>
      </div>

      {/* File Input */}
      <Card className="mb-4 p-4">
        <div className="flex items-center gap-2 mb-2">
          <FolderOpen size={16} className="text-zinc-500" />
          <h3 className="text-sm font-medium text-zinc-300">Select File</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="Choose a file or drag & drop..."
            className="flex-1 bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring"
            readOnly
          />
          <Button onClick={handleBrowse} variant="secondary">
            <FolderOpen size={16} /> Browse
          </Button>
        </div>
        {inputPath && (
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={14} />
            {inputPath.split('\\').pop() || inputPath.split('/').pop()}
          </div>
        )}
      </Card>

      {/* Quick Presets */}
      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            <h3 className="text-sm font-medium text-zinc-300">Quick Presets</h3>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-2 py-1 text-xs rounded ${selectedCategory === "all" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedCategory("video")}
              className={`px-2 py-1 text-xs rounded ${selectedCategory === "video" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Video
            </button>
            <button
              onClick={() => setSelectedCategory("audio")}
              className={`px-2 py-1 text-xs rounded ${selectedCategory === "audio" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Audio
            </button>
            <button
              onClick={() => setSelectedCategory("image")}
              className={`px-2 py-1 text-xs rounded ${selectedCategory === "image" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Image
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredPresets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleQuickConvert(preset)}
              disabled={running || !inputPath}
              className="group flex items-start gap-3 p-3 rounded-lg bg-surface-raised border border-surface-border hover:border-purple-500/50 hover:bg-purple-500/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left relative overflow-hidden"
            >
              {/* Hover gradient effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/0 group-hover:from-purple-500/10 group-hover:to-transparent transition-all opacity-0 group-hover:opacity-100" />
              
              <div className="shrink-0 mt-0.5 text-purple-400 group-hover:text-purple-300 transition-colors relative z-10">
                {preset.icon}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <p className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">{preset.name}</p>
                <p className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">{preset.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Custom Conversion */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-zinc-500" />
          <h3 className="text-sm font-medium text-zinc-300">Custom Conversion</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Output Format */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Output Format</label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>optgroup]:bg-zinc-800 [&>optgroup]:text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
              style={{
                colorScheme: 'dark'
              }}
            >
              <optgroup label="🎵 Audio Formats">
                {supportedFormats.audio.map(fmt => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                ))}
              </optgroup>
              <optgroup label="🎬 Video Formats">
                {supportedFormats.video.map(fmt => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                ))}
              </optgroup>
              <optgroup label="🖼️ Image Formats">
                {supportedFormats.image.map(fmt => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
              style={{
                colorScheme: 'dark'
              }}
            >
              <option value="low" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Low - Fast, small file</option>
              <option value="medium" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Medium - Balanced</option>
              <option value="high" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>High - Recommended ⭐</option>
              <option value="ultra" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Ultra - Best quality</option>
              <option value="lossless" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Lossless - No quality loss</option>
            </select>
          </div>
        </div>

        {/* GPU Acceleration Toggle */}
        <div className="flex items-center justify-between p-3 bg-surface-raised rounded-lg mb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            <div>
              <p className="text-sm text-zinc-100">GPU Acceleration</p>
              <p className="text-xs text-zinc-500">5-10x faster with NVIDIA/Intel/AMD GPU</p>
            </div>
          </div>
          <Toggle checked={useGPU} onChange={setUseGPU} />
        </div>

        {/* Advanced Options */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors mb-3"
        >
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Advanced Options
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-surface-raised rounded-lg">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Resolution</label>
              <input
                type="text"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="e.g., 1920x1080"
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Video Bitrate</label>
              <input
                type="text"
                value={videoBitrate}
                onChange={(e) => setVideoBitrate(e.target.value)}
                placeholder="e.g., 5M or 2000k"
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Audio Bitrate</label>
              <input
                type="text"
                value={audioBitrate}
                onChange={(e) => setAudioBitrate(e.target.value)}
                placeholder="e.g., 320k or 192k"
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">FPS</label>
              <input
                type="text"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                placeholder="e.g., 30 or 60"
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-500 mb-1 block">Encoding Preset (Speed vs Quality)</label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full bg-zinc-900 border border-surface-border rounded px-2 py-1.5 text-sm text-zinc-100 [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
                style={{
                  colorScheme: 'dark'
                }}
              >
                <option value="ultrafast">Ultra Fast (Largest file)</option>
                <option value="superfast">Super Fast</option>
                <option value="veryfast">Very Fast</option>
                <option value="faster">Faster</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium (Recommended)</option>
                <option value="slow">Slow (Better compression)</option>
                <option value="slower" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Slower</option>
                <option value="veryslow" style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>Very Slow (Best compression)</option>
              </select>
            </div>
          </div>
        )}

        {/* Convert Button */}
        <Button 
          onClick={handleCustomConvert}
          disabled={!inputPath.trim() || running}
          className="w-full"
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Start Conversion
            </>
          )}
        </Button>
      </Card>

      {/* Info Box */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <p className="text-xs text-zinc-400 leading-relaxed">
            <span className="text-purple-300 font-medium">💡 Tip:</span> All conversions happen locally using FFmpeg. 
            No internet required, completely private.
          </p>
        </div>
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-zinc-400 leading-relaxed">
            <span className="text-blue-300 font-medium">⚡ GPU:</span> Enable GPU acceleration for 5-10x faster conversions 
            (requires NVIDIA/Intel/AMD GPU).
          </p>
        </div>
      </div>
    </div>
  );
}

