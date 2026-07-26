# Changelog

All notable changes to SHANUTECHX Downloader will be documented in this file.

## [0.1.0] - 2026-07-26

### ✅ Critical Fixes
- **Window Controls**: Implemented functional minimize, maximize, and close buttons in custom title bar
  - Close button has red hover effect
  - Maximize button shows different icon when maximized (Square ↔ Minimize2)
  - All buttons properly trigger BrowserWindow methods via IPC

### ✨ Features Added

#### Automatic Binary Management
- **Auto-Download Binaries**: yt-dlp, ffmpeg, and ffprobe automatically downloaded on first launch
- **No Manual Configuration**: Binaries stored in app userData directory
- **Platform Detection**: Correct binary versions downloaded based on OS and architecture
- **Settings UI**: Binary status display and manual download option in Settings page
- **Progress Tracking**: Real-time download progress for binary downloads

#### Auto-Update System
- **GitHub Releases Integration**: Auto-update powered by electron-updater
- **Update Notifications**: Toast notifications when updates are available
- **One-Click Updates**: Download and install updates from Settings page
- **Release Notes**: Show changelog in update dialog
- **Progress Tracking**: Visual progress bar for update downloads

#### UI/UX Improvements
- **Real-Time StatusBar**: Live download/upload speeds and active download count
  - Color-coded indicators (green download, blue upload)
  - Speed formatting (B/s, KB/s, MB/s, GB/s)
  - Active count highlighting

- **ETA Calculation**: Accurate estimated time remaining for downloads
  - Based on current speed and remaining bytes
  - Only shown when total size is known

- **Toast Notification System**: Beautiful non-intrusive notifications
  - Success, error, and info types
  - Auto-dismiss with configurable duration
  - Manual close button
  - Smooth fade/slide animations
  - Glass-morphism design

- **File Picker**: Native file dialog for Converter page
  - Pre-configured filters for video/audio formats
  - "Browse" button with folder icon

- **Improved Empty States**: Actionable empty states on all pages
  - Dashboard: CTAs to start downloads or use social grab
  - Torrents: Instructions for adding magnets
  - History: Context-aware messages based on filter

- **Bulk History Operations**: 
  - Clear all history
  - Clear by filter (completed/failed/cancelled)
  - Confirmation dialogs
  - Toast feedback

#### Enhanced Error Handling
- **Specific Error Messages**: Social page shows context-specific errors
  - Unsupported platform
  - Network errors
  - Private/deleted/region-locked content
  - yt-dlp errors

- **Auto-Navigation**: After starting social media download, auto-navigate to Downloads page
- **Download Feedback**: Toast notification with media title and quality

#### Download Engine Improvements
- **Smart Retry Strategy**: Detect permanent failures (404, 403, 401, 410)
  - Skip retry for permanent errors
  - Continue exponential backoff for transient errors
  - Saves bandwidth and time

### 🏗️ Infrastructure
- **GitHub Actions**: Automated build and release workflow
  - Build for Windows, macOS, and Linux
  - Auto-create releases on version tags
  - Upload installers to GitHub Releases
  - Generate release notes

- **electron-builder Configuration**: Updated for GitHub releases
  - Changed output directory to `dist`
  - GitHub provider for updates
  - NSIS installer improvements

### 📚 Documentation
- **Comprehensive README**: Full project documentation
  - Features list
  - Installation instructions
  - Usage guide
  - Development setup
  - Architecture overview
  - Contributing guidelines
  - Troubleshooting

- **SETUP.md**: Detailed setup instructions
  - GitHub configuration
  - Auto-update setup
  - Release process
  - Code signing (optional)

- **IMPROVEMENTS.md**: Complete changelog of UI/UX improvements

### 🔧 Technical Changes

#### Backend (Main Process)
- New: `apps/main/src/utils/binary-manager.ts` - Binary download manager
- Updated: `apps/main/src/ipc/handlers/app.ts` - Added binary and update handlers
- Updated: `apps/main/src/main.ts` - Initialize binaries on startup
- Updated: `apps/main/src/engines/social-extractor/binaries.ts` - Use binary manager
- Updated: `apps/main/src/queue/queue-manager.ts` - ETA calculation and active count
- Updated: `apps/main/src/engines/download-engine/download-job.ts` - Smart retry strategy

#### Frontend (Renderer Process)
- New: `apps/renderer/src/components/ui/Toast.tsx` - Toast notification system
- Updated: `apps/renderer/src/App.tsx` - Wrapped with ToastProvider
- Updated: `apps/renderer/src/components/layout/TitleBar.tsx` - Functional window controls
- Updated: `apps/renderer/src/components/layout/StatusBar.tsx` - Real-time data
- Updated: `apps/renderer/src/app/converter/ConverterPage.tsx` - File picker
- Updated: `apps/renderer/src/app/social/SocialPage.tsx` - Error handling and toasts
- Updated: `apps/renderer/src/app/dashboard/DashboardPage.tsx` - Better empty state
- Updated: `apps/renderer/src/app/torrents/TorrentsPage.tsx` - Better empty state
- Updated: `apps/renderer/src/app/history/HistoryPage.tsx` - Bulk operations
- Updated: `apps/renderer/src/app/settings/SettingsPage.tsx` - Binary and update sections

#### Shared Types
- Updated: `packages/shared-types/src/index.ts` - New IPC channels
  - `app:minimize`, `app:maximize`, `app:unmaximize`, `app:close`
  - `app:isMaximized`, `app:selectFile`
  - `app:checkBinaries`, `app:downloadBinaries`
  - `app:checkForUpdates`, `app:downloadUpdate`
  - New events: `binary:download-progress`, `update:available`, etc.
  - Added `activeCount` to `queue:global-speed` event

### 📊 Statistics
- **Files Modified**: 16
- **New Files Created**: 7
- **Critical Bugs Fixed**: 1 (Window controls)
- **Major Features Added**: 6 (Binaries, Updates, StatusBar, ETA, File picker, Toasts)
- **UX Improvements**: 10+ (Empty states, error messages, animations, feedback)
- **Lines of Code**: ~2000 added/modified

### 🎯 Status
- ✅ All TypeScript errors resolved
- ✅ Application running with HMR active
- ✅ Window controls functional
- ✅ Real-time data working
- ✅ Toast system operational
- ✅ Binary auto-download implemented
- ✅ Auto-update system configured
- ✅ GitHub Actions workflow ready

---

## [Unreleased]

### Planned Features
- Drag & drop support for torrents and files
- Download scheduler
- Browser extension for easy downloads
- Cloud sync for download history
- Light theme
- More conversion presets (H.264, H.265, AV1)
- Playlist/batch downloads from social media

---

## Template for Future Releases

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Fixed
- Bug fixes

### Deprecated
- Features that will be removed

### Removed
- Removed features

### Security
- Security fixes
```
