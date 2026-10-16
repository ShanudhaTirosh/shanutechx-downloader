<div align="center">
  <img src="STX.png" alt="STX Downloader Logo" width="180" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

  # STX Downloader
  ### Ultra-Fast, Multi-Protocol Desktop Download Manager & Media Suite

  [![Version](https://img.shields.io/badge/version-0.2.0-blue.svg?style=for-the-badge&logo=semver)](https://github.com/ShanudhaTirosh/shanutechx-downloader/releases)
  [![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D6.svg?style=for-the-badge&logo=windows)](https://github.com/ShanudhaTirosh/shanutechx-downloader)
  [![Electron](https://img.shields.io/badge/Electron-33.0.0-47848F.svg?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-18.3.1-61DAFB.svg?style=for-the-badge&logo=react)](https://react.dev/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)

  <p align="center">
    <b>Engineered by <a href="https://info.shanutechx.com">Shanudha Tirosh</a> • SHANUTECHX</b><br/>
    <a href="https://info.shanutechx.com">Portfolio & Website</a> •
    <a href="https://github.com/ShanudhaTirosh/shanutechx-downloader">GitHub Repository</a> •
    <a href="https://github.com/ShanudhaTirosh/shanutechx-downloader/issues">Report Issue</a>
  </p>
</div>

---

## 📖 Overview

**STX Downloader** is a next-generation desktop download manager and media extraction engine engineered for speed, reliability, and visual elegance. Built on **Electron 33**, **React 18**, and **TypeScript**, STX Downloader unifies high-performance multi-threaded direct downloads, 1800+ social media grabbers, streaming BitTorrent downloads, and a full FFmpeg media converter into a single cohesive, dark glassmorphic application.

---

## ⚡ Core Capabilities

### 1. Multi-Threaded Direct Downloads
* **Parallel Stream Acceleration**: Download files with up to 32 parallel HTTP range connection threads, dramatically maximizing network bandwidth saturation.
* **Smart Pause & Resume**: Robust pause/resume with byte-accurate chunk state persistence in a local SQLite database powered by Drizzle ORM.
* **Batch Downloader Modal**: Queue multiple URLs simultaneously with custom stream allocations and destination directories.
* **Real Token-Bucket Speed Limiter**: Global and per-item download rate limiting to protect network bandwidth when multitasking.
* **Auto-Category Classification**: Automatically sorts downloads into Videos, Audio, Documents, Archives, and Software.

### 2. Social Grabber (1,800+ Platforms)
* **Powered by yt-dlp**: Seamless video and audio extraction from YouTube, TikTok, Instagram, Twitter/X, Facebook, Twitch, Reddit, Vimeo, and adult platforms.
* **High-Fidelity Audio Extraction**: Extract pristine audio in MP3 (up to 320k), M4A, FLAC, WAV, AAC, and OPUS.
* **Automatic Metadata & Cover Art Embedding**: Embeds high-resolution cover thumbnails, artist info, and track titles directly into output files.
* **Photo Carousel & Slideshow Generator**: Download photo carousels from TikTok and Instagram or automatically render them into smooth MP4 slideshow videos with background audio.
* **Browser Cookie Pass-Through**: Authenticate against private playlists or member content using Chrome, Edge, Brave, or Firefox session cookies.

### 3. BitTorrent & P2P Client
* **WebTorrent P2P Engine**: Lightning-fast torrent and magnet link downloads without external software.
* **File Selective Downloading**: Choose individual files to prioritize or exclude from torrent bundles.
* **Swarm Health & Telemetry**: Live tracker status, peer counts, upload/download ratios, and seeding management.
* **Magnet Drag & Drop**: Drop `.torrent` files or paste magnet URIs directly into the client.

### 4. Universal Media Converter
* **Embedded FFmpeg Engine**: Convert video and audio between popular formats (MP4, MKV, AVI, WebM, MOV, MP3, FLAC, WAV, OGG, AAC) with zero quality loss.
* **Configurable Transcoding**: Custom video codecs (H.264, H.265, VP9), resolutions (4K, 1080p, 720p, 480p), audio bitrates, and hardware acceleration options.
* **Batch Conversion**: Transcode entire directories or playlists concurrently with progress tracking.

### 5. System Tray & Background Automation
* **Compact Notification Tray**: Real-time download speed and active transfers badge displayed directly in the Windows taskbar tray.
* **Background Operation**: Minimize to system tray without interrupting downloads.
* **Single-Instance Enforcement**: Deep-linking protocol (`shanutechx://`) allows browser extensions and external triggers to enqueue downloads instantly.

---

## 🛠️ Zero-Config System Binaries (Auto-Provisioned)

STX Downloader eliminates the hassle of manually installing or configuring external command-line tools.

* **Automatic Detection**: On application startup, the binary manager checks for `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe`.
* **Zero-Touch Auto-Download**: If missing, STX Downloader automatically downloads the official release binaries in the background with live progress indicators.
* **Seamless Local Migration**: If you previously had binaries in `%APPDATA%\Electron\binaries` or `%APPDATA%\SHANUTECHX Downloader\binaries`, STX Downloader instantly auto-migrates them to `%APPDATA%\STX Downloader\binaries` without re-downloading.
* **Runtime Self-Healing**: If a user requests audio extraction or video transcoding and FFmpeg is not yet available, the system initiates an on-demand download immediately.

---

## 👤 About the Developer & Brand

**STX Downloader** is designed, developed, and maintained by **Shanudha Tirosh** under the **SHANUTECHX** software brand.

* **Developer**: Shanudha Tirosh
* **Brand / Studio**: SHANUTECHX
* **Official Website**: [https://info.shanutechx.com](https://info.shanutechx.com)
* **GitHub**: [@ShanudhaTirosh](https://github.com/ShanudhaTirosh)
* **Support Email**: [info@shanutechx.com](mailto:info@shanutechx.com)
* **Issue Tracker**: [GitHub Issues](https://github.com/ShanudhaTirosh/shanutechx-downloader/issues)

If you find this project valuable, please consider giving it a ⭐ on [GitHub](https://github.com/ShanudhaTirosh/shanutechx-downloader)!

---

## 🏗️ Architecture & Technology Stack

```
shanutechx-downloader/
├── apps/
│   ├── main/                  # Electron Main Process (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── engines/       # Direct, Social (yt-dlp), Torrent, Converter
│   │   │   ├── ipc/           # Type-safe IPC channels & handlers
│   │   │   ├── queue/         # Parallel download queue & token bucket limiter
│   │   │   ├── db/            # SQLite with Drizzle ORM
│   │   │   ├── tray/          # Windows system tray integration
│   │   │   └── utils/         # Auto binary manager (yt-dlp, ffmpeg)
│   │   └── electron-builder.yml
│   └── renderer/              # Modern React 18 + Vite UI
│       └── src/
│           ├── app/           # Dashboard, Downloads, Social, Torrents, Converter, History
│           ├── components/    # Reusable UI widgets, cards, dialogs, title bar
│           └── stores/        # Zustand state management
└── packages/
    ├── design-tokens/         # Shared Tailwind CSS presets & styling tokens
    └── shared-types/          # Shared TypeScript contracts & interfaces
```

| Layer | Technologies |
|---|---|
| **Runtime** | Electron 33, Node.js 20+ |
| **Frontend Framework** | React 18, TypeScript, Vite |
| **Styling & Effects** | Tailwind CSS, Framer Motion, Lucide Icons |
| **Persistence** | SQLite3 via `better-sqlite3`, Drizzle ORM |
| **Download Engines** | Custom Multi-Stream Chunk Engine, `yt-dlp`, `WebTorrent`, `FFmpeg` |
| **Networking** | Undici HTTP/1.1 & HTTP/2 client |

---

## 🚀 Getting Started

### Installation (Pre-Built Executables)
1. Download the latest installer `STX-Downloader-Setup-{version}.exe` from [Releases](https://github.com/ShanudhaTirosh/shanutechx-downloader/releases).
2. Run the installer. Desktop and Start Menu shortcuts will be generated automatically.
3. Launch STX Downloader. All core binaries will be auto-configured.

### Building From Source

#### Prerequisites
- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Git**

```bash
# 1. Clone the repository
git clone https://github.com/ShanudhaTirosh/shanutechx-downloader.git
cd shanutechx-downloader

# 2. Install workspace dependencies
pnpm install

# 3. Launch development mode with hot-reload
pnpm dev

# 4. Build and package the production installer
pnpm build
pnpm package
```

The resulting NSIS executable will be located in `apps/main/dist/`.

---

## 🗺️ Roadmap & Feature Expansions

### Phase 1: Core Engine & Polish (Completed)
- [x] Multi-stream parallel direct download engine with 1-32 thread controls.
- [x] Social Grabber with 1800+ sites, video/audio quality presets, and thumbnail embedding.
- [x] WebTorrent client with DHT, magnet resolution, and file selective downloading.
- [x] Universal FFmpeg converter with video/audio transcoding.
- [x] Windows system tray with live transfer speed counter.
- [x] Automatic binary provisioning and legacy migration for yt-dlp & FFmpeg.
- [x] Clean STX Downloader branding and brand iconography.
- [x] High-contrast obsidian glassmorphic filter bars and navigation.

### Phase 2: Automation & Power Tools (In Progress)
- [x] Batch download modal with multi-URL parsing.
- [x] JSON import/export for download history backup.
- [ ] Automated download schedule calendar (e.g., night-time off-peak downloading).
- [ ] Bandwidth scheduling (custom speed caps at specific hours of the day).
- [ ] Full playlist and channel scraping with selectable item checkboxes.

### Phase 3: Ecosystem & Cloud Expansions (Upcoming)
- [ ] Chrome & Firefox companion extension with single-click download takeover.
- [ ] Webhook notifications (Discord, Telegram) on download completion.
- [ ] Encrypted cloud synchronization for download settings and history.
- [ ] Remote web control interface for headless or home server deployments.

---

## 📄 License

This software is released under the **MIT License**. See the [LICENSE](LICENSE) file for more information.

---

<div align="center">
  <b>STX Downloader • Crafted with precision by <a href="https://info.shanutechx.com">Shanudha Tirosh</a></b><br/>
  © 2026 SHANUTECHX. All Rights Reserved.
</div>
