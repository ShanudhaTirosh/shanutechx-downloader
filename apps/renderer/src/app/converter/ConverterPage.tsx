import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { 
  FolderOpen, RefreshCw, Video, Image, Music, 
  ChevronDown, Settings, Zap, Sparkles, CheckCircle2, Lightbulb,
  Upload, X, ArrowRight, Clock, Monitor, Film, Activity,
  AlertCircle, XCircle, FileText, Check, ExternalLink, Sliders
} from "lucide-react";
import type { MediaFileInfo } from "@shanutechx/shared-types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { useToast } from "../../components/ui/Toast";
import { ipc } from "../../lib/ipc-client";
import { shake, shakeKeyframes, springs } from "../../lib/motion";

type FormatCategory = "video" | "audio" | "image";

interface ConversionPreset {
  id: string;
  name: string;
  description: string;
  outputFormat: string;
  quality?: "low" | "medium" | "high" | "ultra" | "lossless";
  videoCodec?: string;
  icon: React.ReactNode;
  category: FormatCategory;
}

interface ConversionTaskState {
  taskId: string;
  inputName: string;
  inputPath: string;
  outputFormat: string;
  outputPath?: string;
  status: "converting" | "complete" | "failed" | "cancelled";
  percent: number;
  speed?: string;
  timemark?: string;
  fps?: number;
  errorMessage?: string;
  startTime: number;
}

const QUICK_PRESETS: ConversionPreset[] = [
  {
    id: "convert-h264",
    name: "MP4 / H.264 (Universal)",
    description: "Maximum compatibility across phones, TVs, and web",
    outputFormat: "mp4",
    quality: "high",
    videoCodec: "libx264",
    icon: <Film size={18} />,
    category: "video",
  },
  {
    id: "convert-hevc",
    name: "MP4 / H.265 (HEVC)",
    description: "50% smaller file size at equivalent high visual quality",
    outputFormat: "mp4",
    quality: "high",
    videoCodec: "libx265",
    icon: <Video size={18} />,
    category: "video",
  },
  {
    id: "convert-av1",
    name: "MP4 / AV1 (Next-Gen)",
    description: "Next-generation royalty-free ultra-efficient compression",
    outputFormat: "mp4",
    quality: "high",
    videoCodec: "libsvtav1",
    icon: <Sparkles size={18} />,
    category: "video",
  },
  {
    id: "convert-webm",
    name: "WebM / VP9",
    description: "Modern open web video standard",
    outputFormat: "webm",
    quality: "high",
    videoCodec: "libvpx-vp9",
    icon: <Video size={18} />,
    category: "video",
  },
  {
    id: "convert-mkv",
    name: "MKV (Matroska)",
    description: "High quality container with multi-track support",
    outputFormat: "mkv",
    quality: "high",
    icon: <Video size={18} />,
    category: "video",
  },
  {
    id: "extract-mp3",
    name: "Extract MP3 (320 kbps)",
    description: "Maximum bitrate pristine MP3 audio",
    outputFormat: "mp3",
    quality: "high",
    icon: <Music size={18} />,
    category: "audio",
  },
  {
    id: "extract-flac",
    name: "Extract FLAC (Lossless)",
    description: "Studio quality lossless audio bitstream",
    outputFormat: "flac",
    quality: "lossless",
    icon: <Sparkles size={18} />,
    category: "audio",
  },
  {
    id: "audio-wav",
    name: "Convert to WAV",
    description: "Uncompressed PCM raw audio standard",
    outputFormat: "wav",
    quality: "lossless",
    icon: <Music size={18} />,
    category: "audio",
  },
  {
    id: "audio-aac",
    name: "Convert to AAC / M4A",
    description: "Apple, iOS & modern streaming standard",
    outputFormat: "m4a",
    quality: "high",
    icon: <Music size={18} />,
    category: "audio",
  },
  {
    id: "image-webp",
    name: "Image to WebP",
    description: "Modern image format with compact size and alpha",
    outputFormat: "webp",
    quality: "high",
    icon: <Image size={18} />,
    category: "image",
  },
  {
    id: "image-png",
    name: "Image to PNG",
    description: "Lossless crisp graphics with transparency",
    outputFormat: "png",
    quality: "lossless",
    icon: <Image size={18} />,
    category: "image",
  },
  {
    id: "image-jpg",
    name: "Image to JPG",
    description: "Universal photographic JPEG image",
    outputFormat: "jpg",
    quality: "high",
    icon: <Image size={18} />,
    category: "image",
  },
];

export function ConverterPage() {
  const [inputPath, setInputPath] = useState("");
  const [mediaInfo, setMediaInfo] = useState<MediaFileInfo | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [outputFormat, setOutputFormat] = useState("mp4");
  const [quality, setQuality] = useState<"low" | "medium" | "high" | "ultra" | "lossless">("high");
  const [videoCodec, setVideoCodec] = useState("auto");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useGPU, setUseGPU] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<FormatCategory | "all">("all");
  const [shakeKey, setShakeKey] = useState(0);

  // Custom output directory
  const [customOutputDir, setCustomOutputDir] = useState<string>("");

  // Advanced options
  const [resolution, setResolution] = useState("");
  const [videoBitrate, setVideoBitrate] = useState("");
  const [audioBitrate, setAudioBitrate] = useState("");
  const [fps, setFps] = useState("");
  const [preset, setPreset] = useState<"ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow">("medium");

  // Conversion queue & history
  const [tasks, setTasks] = useState<ConversionTaskState[]>([]);
  const [isStarting, setIsStarting] = useState(false);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStartingRef = useRef(false);

  // Load supported formats on mount
  useEffect(() => {
    async function loadFormats() {
      try {
        const formats = await ipc.invoke("converter:getSupportedFormats", undefined);
        if (formats) {
          setSupportedFormats(formats);
        }
      } catch (error) {
        console.error("Failed to load formats:", error);
      }
    }
    void loadFormats();
  }, []);

  // Subscribe to live converter progress and status events
  useEffect(() => {
    const unSubProgress = ipc.on("converter:progress", (payload) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.taskId === payload.taskId) {
            return {
              ...t,
              percent: Math.min(100, Math.max(t.percent, payload.percent)),
              speed: payload.speed || t.speed,
              timemark: payload.timemark || t.timemark,
              fps: payload.fps || t.fps,
              status: payload.percent >= 100 ? "complete" : "converting",
            };
          }
          return t;
        })
      );
    });

    const unSubStatus = ipc.on("converter:status", (payload) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.taskId === payload.taskId) {
            return {
              ...t,
              status: payload.status,
              outputPath: payload.outputPath || t.outputPath,
              errorMessage: payload.errorMessage,
              percent: payload.status === "complete" ? 100 : t.percent,
            };
          }
          return t;
        })
      );

      if (payload.status === "complete") {
        showToast("Conversion completed successfully!", "success");
      } else if (payload.status === "failed") {
        showToast(`Conversion failed: ${payload.errorMessage || "Unknown error"}`, "error");
      }
    });

    return () => {
      unSubProgress();
      unSubStatus();
    };
  }, [showToast]);

  // Inspect file and auto-recommend format category
  async function inspectFile(filePath: string) {
    setInputPath(filePath);
    setIsProbing(true);
    setMediaInfo(null);

    try {
      const info = await ipc.invoke("converter:probe", { filePath });
      setMediaInfo(info);

      // Auto-tune format & category based on input
      if (info.category === "video") {
        setSelectedCategory("video");
        setOutputFormat("mp4");
      } else if (info.category === "audio") {
        setSelectedCategory("audio");
        setOutputFormat("mp3");
      } else if (info.category === "image") {
        setSelectedCategory("image");
        setOutputFormat("webp");
      }
    } catch {
      // Fallback: simple basename
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
        setSelectedCategory("video");
        setOutputFormat("mp4");
      } else if (["mp3", "wav", "flac", "m4a", "aac"].includes(ext)) {
        setSelectedCategory("audio");
        setOutputFormat("mp3");
      } else if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
        setSelectedCategory("image");
        setOutputFormat("webp");
      }
    } finally {
      setIsProbing(false);
    }
  }

  async function handleBrowse() {
    try {
      const result = await ipc.invoke("app:selectFile", {
        title: "Select File to Convert",
        filters: [
          { name: "All Supported Media", extensions: ["*"] },
          { name: "Video Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "mpg", "mpeg", "ts", "vob"] },
          { name: "Audio Files", extensions: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "alac"] },
          { name: "Image Files", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff"] },
        ],
      });
      if (result.filePath) {
        await inspectFile(result.filePath);
        showToast("File selected", "success");
      }
    } catch {
      showToast("Failed to select file", "error");
    }
  }

  async function handleSelectOutputDir() {
    try {
      const result = await ipc.invoke("app:selectDirectory", {
        title: "Select Output Folder",
        defaultPath: customOutputDir || (inputPath ? inputPath.substring(0, inputPath.lastIndexOf("\\")) : undefined),
      });
      if (result.dirPath) {
        setCustomOutputDir(result.dirPath);
        showToast("Output directory updated", "success");
      }
    } catch {
      showToast("Failed to select folder", "error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // In Electron, File objects have a 'path' property
      const filePath = (file as any).path || (file as any).name;
      if (filePath) {
        void inspectFile(filePath);
        showToast("File loaded via drag and drop", "success");
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleClearFile() {
    setInputPath("");
    setMediaInfo(null);
  }

  async function handleQuickConvert(p: ConversionPreset) {
    if (!inputPath.trim()) {
      setShakeKey((k) => k + 1);
      showToast("Please select an input file first", "error");
      return;
    }

    if (mediaInfo?.category === "audio" && p.category !== "audio") {
      setShakeKey((k) => k + 1);
      showToast("Audio files cannot be converted to video or image formats", "error");
      return;
    }

    if (mediaInfo?.category === "image" && p.category !== "image") {
      setShakeKey((k) => k + 1);
      showToast("Image files cannot be converted to video or audio formats", "error");
      return;
    }
    
    setOutputFormat(p.outputFormat);
    if (p.quality) {
      setQuality(p.quality);
    }
    if (p.videoCodec) {
      setVideoCodec(p.videoCodec);
    }
    
    await executeConversion(p.outputFormat, p.quality, p.videoCodec);
  }

  async function handleCustomConvert() {
    if (!inputPath.trim()) {
      setShakeKey((k) => k + 1);
      showToast("Please select an input file first", "error");
      return;
    }

    const fmtLower = outputFormat.toLowerCase();
    if (mediaInfo?.category === "audio") {
      const isAudio = supportedFormats.audio.includes(fmtLower);
      if (!isAudio) {
        setShakeKey((k) => k + 1);
        showToast("Audio files can only be converted to audio formats (MP3, FLAC, WAV, AAC, M4A, etc.)", "error");
        return;
      }
    }

    if (mediaInfo?.category === "image") {
      const isImage = supportedFormats.image.includes(fmtLower);
      if (!isImage) {
        setShakeKey((k) => k + 1);
        showToast("Image files can only be converted to image formats (PNG, JPG, WebP, etc.)", "error");
        return;
      }
    }
    
    await executeConversion(outputFormat, quality, videoCodec);
  }

  async function executeConversion(
    format: string,
    qual?: "low" | "medium" | "high" | "ultra" | "lossless",
    vCodec?: string
  ) {
    if (isStarting || isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    try {
      const options: any = {
        inputPath: inputPath.trim(),
        outputFormat: format,
        quality: qual || quality,
        hwAccel: useGPU ? "auto" : "none",
      };

      const effCodec = vCodec || videoCodec;
      if (effCodec && effCodec !== "auto") {
        options.videoCodec = effCodec;
      }

      if (customOutputDir.trim()) {
        options.outputDir = customOutputDir.trim();
      }

      // Add advanced options if enabled
      if (showAdvanced) {
        if (resolution.trim()) options.resolution = resolution.trim();
        if (videoBitrate.trim()) options.videoBitrate = videoBitrate.trim();
        if (audioBitrate.trim()) options.audioBitrate = audioBitrate.trim();
        if (fps.trim()) options.fps = parseInt(fps.trim(), 10);
        if (preset) options.preset = preset;
      }

      const res = await ipc.invoke("converter:universalConvert", options);
      const filename = inputPath.split("\\").pop() || inputPath.split("/").pop() || "media";

      const newTask: ConversionTaskState = {
        taskId: res.taskId,
        inputName: filename,
        inputPath: inputPath.trim(),
        outputFormat: format.toLowerCase(),
        status: "converting",
        percent: 0,
        startTime: Date.now(),
      };

      setTasks((prev) => [newTask, ...prev]);
      showToast(`Converting to ${format.toUpperCase()}...`, "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Conversion failed", "error");
    } finally {
      setIsStarting(false);
      isStartingRef.current = false;
    }
  }

  async function handleCancelTask(taskId: string) {
    // 0ms optimistic UI update for instant feedback
    setTasks((prev) =>
      prev.map((t) => (t.taskId === taskId ? { ...t, status: "cancelled" } : t))
    );
    showToast("Conversion cancelled", "info");
    try {
      await ipc.invoke("converter:cancel", { taskId });
    } catch {
      // Ignored: UI already marked as cancelled
    }
  }

  async function handleShowInFolder(filepath: string) {
    try {
      await ipc.invoke("app:showInFolder", { filepath });
    } catch {
      showToast("Could not locate file in folder", "error");
    }
  }

  function handleDismissTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  }

  function handleClearCompleted() {
    setTasks((prev) => prev.filter((t) => t.status === "converting"));
  }

  const availableCategories: (FormatCategory | "all")[] = 
    mediaInfo?.category === "audio"
      ? ["audio"]
      : mediaInfo?.category === "image"
      ? ["image"]
      : ["all", "video", "audio", "image"];

  const compatiblePresets = QUICK_PRESETS.filter((p) => {
    if (mediaInfo?.category === "audio") return p.category === "audio";
    if (mediaInfo?.category === "image") return p.category === "image";
    return true;
  });

  const filteredPresets = selectedCategory === "all" 
    ? compatiblePresets 
    : compatiblePresets.filter((p) => p.category === selectedCategory);

  const activeTasks = tasks.filter((t) => t.status === "converting");
  const hasFinishedTasks = tasks.some((t) => t.status !== "converting");

  return (
    <div className="max-w-4xl space-y-5 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-1 flex items-center gap-2">
          <RefreshCw size={20} className="text-purple-400" />
          Universal Converter
        </h1>
        <p className="text-sm text-zinc-400">
          Transform videos, audio, and images locally with FFmpeg — 50+ formats supported, 100% offline with GPU acceleration
        </p>
      </div>

      {/* Live Conversion Tasks Banner / Progress List */}
      <AnimatePresence mode="popLayout">
        {tasks.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={springs.gentle}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-purple-400" />
                <h3 className="text-sm font-medium text-zinc-200">
                  Active & Recent Conversions ({tasks.length})
                </h3>
              </div>
              {hasFinishedTasks && (
                <button
                  onClick={handleClearCompleted}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                >
                  <X size={12} /> Clear Finished
                </button>
              )}
            </div>

            <div className="space-y-2">
              {tasks.map((task) => (
                <motion.div
                  key={task.taskId}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={springs.gentle}
                >
                  <Card className="p-3.5 bg-surface-raised border border-surface-border hover:border-surface-border-hover transition-colors">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="shrink-0 font-medium text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase">
                          {task.outputFormat}
                        </span>
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {task.inputName}
                        </p>
                        <ArrowRight size={13} className="text-zinc-500 shrink-0" />
                        <span className="text-xs text-zinc-400 shrink-0">
                          .{task.outputFormat}
                        </span>
                      </div>

                      {/* Status pill & actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {task.status === "converting" && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <RefreshCw size={12} className="animate-spin text-purple-400" />
                            <span>{task.percent.toFixed(0)}%</span>
                          </div>
                        )}
                        {task.status === "complete" && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={12} />
                            <span>Completed</span>
                          </div>
                        )}
                        {task.status === "failed" && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertCircle size={12} />
                            <span>Failed</span>
                          </div>
                        )}
                        {task.status === "cancelled" && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                            <XCircle size={12} />
                            <span>Cancelled</span>
                          </div>
                        )}

                        {/* Action buttons */}
                        {task.status === "converting" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCancelTask(task.taskId)}
                            className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300"
                            title="Cancel conversion"
                          >
                            <X size={13} /> Cancel
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            {task.outputPath && task.status === "complete" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleShowInFolder(task.outputPath!)}
                                className="h-7 px-2 text-xs text-zinc-200"
                                title="Show in folder"
                              >
                                <FolderOpen size={13} /> Show in Folder
                              </Button>
                            )}
                            <button
                              onClick={() => handleDismissTask(task.taskId)}
                              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                              title="Dismiss"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {task.status === "converting" && (
                      <div className="space-y-1.5 mt-2">
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                            style={{ width: `${Math.max(2, task.percent)}%` }}
                            transition={{ duration: 0.2 }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <div className="flex items-center gap-3">
                            {task.speed && <span>Speed: {task.speed}</span>}
                            {task.timemark && <span>Time: {task.timemark}</span>}
                            {task.fps && <span>{task.fps} fps</span>}
                          </div>
                          <span>{task.percent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}

                    {/* Error message if failed */}
                    {task.status === "failed" && task.errorMessage && (
                      <p className="mt-1 text-xs text-rose-400 line-clamp-2">
                        {task.errorMessage}
                      </p>
                    )}

                    {/* Destination path if complete */}
                    {task.status === "complete" && task.outputPath && (
                      <p className="mt-1 text-xs text-zinc-500 truncate">
                        Saved to: {task.outputPath}
                      </p>
                    )}
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Input & Drag & Drop Zone */}
      <motion.div key={shakeKey} animate={shakeKey > 0 ? { x: shakeKeyframes } : undefined} transition={shake}>
        {!inputPath ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowse}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10"
                : "border-surface-border bg-surface-raised/60 hover:bg-surface-raised hover:border-purple-500/40"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Upload size={22} />
              </div>
              <div>
                <h3 className="text-base font-medium text-zinc-200 mb-1">
                  Drag & drop your file here, or click to browse
                </h3>
                <p className="text-xs text-zinc-500">
                  Supports MP4, MKV, AVI, MOV, WebM, MP3, WAV, FLAC, AAC, PNG, JPG, WebP, and 40+ more
                </p>
              </div>
              <Button variant="secondary" size="sm" className="mt-1 pointer-events-none">
                <FolderOpen size={14} /> Select File
              </Button>
            </div>
          </div>
        ) : (
          /* Selected File Inspector Card */
          <Card className="p-4 bg-surface-raised border border-surface-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  {mediaInfo?.category === "audio" ? (
                    <Music size={20} />
                  ) : mediaInfo?.category === "image" ? (
                    <Image size={20} />
                  ) : (
                    <Video size={20} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-zinc-100 truncate">
                      {mediaInfo?.filename || inputPath.split("\\").pop() || inputPath}
                    </h3>
                    {mediaInfo?.formattedSize && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {mediaInfo.formattedSize}
                      </span>
                    )}
                    {mediaInfo?.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 capitalize">
                        {mediaInfo.category}
                      </span>
                    )}
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-zinc-400">
                    {isProbing ? (
                      <span className="text-purple-400 flex items-center gap-1.5">
                        <RefreshCw size={12} className="animate-spin" /> Analyzing media streams...
                      </span>
                    ) : (
                      <>
                        {mediaInfo?.formattedDuration && (
                          <div className="flex items-center gap-1 text-zinc-300">
                            <Clock size={13} className="text-purple-400" />
                            <span>{mediaInfo.formattedDuration}</span>
                          </div>
                        )}
                        {mediaInfo?.resolution && (
                          <div className="flex items-center gap-1 text-zinc-300">
                            <Monitor size={13} className="text-purple-400" />
                            <span>{mediaInfo.resolution}</span>
                          </div>
                        )}
                        {mediaInfo?.videoCodec && (
                          <div className="flex items-center gap-1 text-zinc-400">
                            <Film size={13} />
                            <span>{mediaInfo.videoCodec.toUpperCase()}</span>
                          </div>
                        )}
                        {mediaInfo?.fps && (
                          <div className="flex items-center gap-1 text-zinc-400">
                            <Activity size={13} />
                            <span>{mediaInfo.fps} fps</span>
                          </div>
                        )}
                        {mediaInfo?.audioCodec && (
                          <div className="flex items-center gap-1 text-zinc-400">
                            <Music size={13} />
                            <span>{mediaInfo.audioCodec.toUpperCase()}</span>
                          </div>
                        )}
                        {mediaInfo?.videoBitrate && (
                          <span className="text-zinc-500">{mediaInfo.videoBitrate}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={handleBrowse}>
                  <FolderOpen size={14} /> Change
                </Button>
                <button
                  onClick={handleClearFile}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Clear file"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </Card>
        )}
      </motion.div>

      {/* Output Destination Selector */}
      <Card className="p-3.5 bg-surface-raised border border-surface-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FolderOpen size={16} className="text-zinc-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-zinc-400 block mb-0.5">Output Directory:</span>
              <p className="text-xs text-zinc-200 font-mono truncate">
                {customOutputDir || "Same folder as source file"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {customOutputDir && (
              <button
                onClick={() => setCustomOutputDir("")}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
              >
                Reset
              </button>
            )}
            <Button size="sm" variant="secondary" onClick={handleSelectOutputDir}>
              <FolderOpen size={14} /> Browse Folder
            </Button>
          </div>
        </div>
      </Card>

      {/* Quick Presets Grid */}
      <Card className="p-4 bg-surface-raised border border-surface-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-yellow-400" />
            <h3 className="text-sm font-medium text-zinc-200">Recommended Presets</h3>
          </div>
          <div className="flex gap-1 relative bg-zinc-900/60 p-1 rounded-lg border border-surface-border">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`relative px-2.5 py-1 text-xs rounded transition-colors ${
                  selectedCategory === cat ? "text-purple-300 font-medium" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {selectedCategory === cat && (
                  <motion.span
                    layoutId="converter-category-pill"
                    transition={springs.gentle}
                    className="absolute inset-0 bg-purple-500/20 border border-purple-500/30 rounded"
                  />
                )}
                <span className="relative z-10 capitalize">{cat}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Source format constraint notification */}
        {mediaInfo?.category === "audio" && (
          <div className="mb-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>Audio source file detected: only audio conversions (MP3, FLAC, WAV, AAC, M4A) are supported.</span>
          </div>
        )}
        {mediaInfo?.category === "image" && (
          <div className="mb-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>Image source file detected: only image conversions (PNG, JPG, WebP) are supported.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <AnimatePresence mode="popLayout">
            {filteredPresets.map((presetItem) => (
              <motion.button
                key={presetItem.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={springs.gentle}
                whileHover={isStarting || !inputPath ? undefined : { y: -2 }}
                whileTap={isStarting || !inputPath ? undefined : { scale: 0.97 }}
                onClick={() => handleQuickConvert(presetItem)}
                disabled={isStarting || !inputPath}
                className="group flex items-start gap-3 p-3 rounded-lg bg-surface border border-surface-border hover:border-purple-500/50 hover:bg-purple-500/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left relative overflow-hidden"
              >
                <div className="shrink-0 mt-0.5 text-purple-400 group-hover:text-purple-300 transition-colors relative z-10">
                  {presetItem.icon}
                </div>
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">
                      {presetItem.name}
                    </p>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-purple-300 border border-zinc-700">
                      .{presetItem.outputFormat}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    {presetItem.description}
                  </p>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </Card>

      {/* Custom Conversion Controls */}
      <Card className="p-4 bg-surface-raised border border-surface-border">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-200">Custom Conversion</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {/* Output Format */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Output Format</label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>optgroup]:bg-zinc-800 [&>optgroup]:text-zinc-200 [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
              style={{ colorScheme: "dark" }}
            >
              {mediaInfo?.category !== "audio" && mediaInfo?.category !== "image" && (
                <optgroup label="Video Formats">
                  {supportedFormats.video.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt.toUpperCase()} Video</option>
                  ))}
                </optgroup>
              )}
              {mediaInfo?.category !== "image" && (
                <optgroup label="Audio Formats">
                  {supportedFormats.audio.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt.toUpperCase()} Audio</option>
                  ))}
                </optgroup>
              )}
              {mediaInfo?.category !== "audio" && (
                <optgroup label="Image Formats">
                  {supportedFormats.image.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt.toUpperCase()} Image</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Video Codec (when video format is selected) or Quality Profile */}
          {supportedFormats.video.includes(outputFormat.toLowerCase()) && mediaInfo?.category !== "audio" ? (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Video Codec</label>
              <select
                value={videoCodec}
                onChange={(e) => setVideoCodec(e.target.value)}
                className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
                style={{ colorScheme: "dark" }}
              >
                <option value="auto">Auto (Hardware NVENC / QSV / AMF if available)</option>
                <option value="libx264">H.264 / AVC (Universal Compatibility)</option>
                <option value="libx265">H.265 / HEVC (High Efficiency)</option>
                <option value="libsvtav1">AV1 (Next-Generation Open Standard)</option>
                <option value="libvpx-vp9">VP9 (WebM Open Standard)</option>
                <option value="copy">Stream Copy (Direct Passthrough, Instant)</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Quality Profile</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as any)}
                className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
                style={{ colorScheme: "dark" }}
              >
                <option value="low">Low (Fast encoding, smaller file)</option>
                <option value="medium">Medium (Standard web quality)</option>
                <option value="high">High (Recommended for HD / High Bitrate)</option>
                <option value="ultra">Ultra (Near-transparent preservation)</option>
                <option value="lossless">Lossless (Bit-exact, no compression loss)</option>
              </select>
            </div>
          )}
        </div>

        {supportedFormats.video.includes(outputFormat.toLowerCase()) && mediaInfo?.category !== "audio" && (
          <div className="mb-3">
            <label className="text-xs text-zinc-400 mb-1 block">Quality Profile</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as any)}
              className="w-full bg-zinc-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus-ring [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
              style={{ colorScheme: "dark" }}
            >
              <option value="low">Low (Fast encoding, smaller file)</option>
              <option value="medium">Medium (Standard web quality)</option>
              <option value="high">High (Recommended for HD / High Bitrate)</option>
              <option value="ultra">Ultra (Near-transparent preservation)</option>
              <option value="lossless">Lossless (Bit-exact, no compression loss)</option>
            </select>
          </div>
        )}

        {/* GPU Acceleration Toggle */}
        <div className="flex items-center justify-between p-3 bg-surface rounded-lg mb-3 border border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0">
              <Zap size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Hardware Acceleration</p>
              <p className="text-xs text-zinc-400">
                Uses NVIDIA NVENC, Intel QSV, or AMD AMF GPU for fast encoding
              </p>
            </div>
          </div>
          <Toggle checked={useGPU} onChange={setUseGPU} />
        </div>

        {/* Advanced Options Toggle */}
        <motion.button
          onClick={() => setShowAdvanced(!showAdvanced)}
          whileTap={{ scale: 0.98 }}
          transition={springs.snappy}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <motion.span animate={{ rotate: showAdvanced ? 180 : 0 }} transition={springs.snappy} className="inline-flex">
            <ChevronDown size={16} />
          </motion.span>
          <Sliders size={14} className="text-zinc-400" />
          <span>Advanced Encoder Settings</span>
        </motion.button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              key="advanced"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={springs.firm}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-surface rounded-lg border border-surface-border">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Output Resolution</label>
                  <input
                    type="text"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="e.g. 1920x1080 or 1280x720"
                    className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Video Bitrate</label>
                  <input
                    type="text"
                    value={videoBitrate}
                    onChange={(e) => setVideoBitrate(e.target.value)}
                    placeholder="e.g. 5M or 2500k"
                    className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Audio Bitrate</label>
                  <input
                    type="text"
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value)}
                    placeholder="e.g. 320k or 192k"
                    className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Target FPS</label>
                  <input
                    type="text"
                    value={fps}
                    onChange={(e) => setFps(e.target.value)}
                    placeholder="e.g. 30 or 60"
                    className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-ring"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-xs text-zinc-400 mb-1 block">Encoding Speed vs Compression Preset</label>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-surface-border rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus-ring [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="ultrafast">Ultra Fast (Largest output size)</option>
                    <option value="superfast">Super Fast</option>
                    <option value="veryfast">Very Fast</option>
                    <option value="faster">Faster</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium (Recommended balanced)</option>
                    <option value="slow">Slow (Better compression)</option>
                    <option value="slower">Slower (High compression)</option>
                    <option value="veryslow">Very Slow (Maximum compression)</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Start Conversion Button */}
        <Button
          onClick={handleCustomConvert}
          disabled={!inputPath.trim() || isStarting}
          loading={isStarting}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5"
        >
          {!isStarting && <RefreshCw size={16} />}
          {isStarting ? "Initiating conversion..." : `Convert to ${outputFormat.toUpperCase()}`}
        </Button>
      </Card>

      {/* Feature Footnotes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
          <p className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2">
            <Lightbulb size={15} className="text-purple-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-purple-300 font-medium">100% Offline & Private:</strong>{" "}
              Conversions are computed entirely locally on your processor and GPU. No telemetry or file uploads.
            </span>
          </p>
        </div>
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2">
            <Zap size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-blue-300 font-medium">Hardware Accelerated:</strong>{" "}
              Automatically utilizes NVIDIA NVENC, Intel QuickSync, or AMD AMF when detected on your system.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
