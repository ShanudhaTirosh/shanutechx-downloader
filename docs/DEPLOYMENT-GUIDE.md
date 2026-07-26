# SHANUTECHX Downloader - Deployment Guide

## ✅ What's Been Fixed

### 1. GitHub Actions Workflow
- **Changed from multi-platform to Windows-only build**
- Removed macOS and Ubuntu build steps
- Simplified artifact upload and release process
- Now only builds for `windows-latest`

### 2. Icon Setup
- Created SVG icon at `build/icon.svg`
- Icon features: purple gradient, download arrow, motion lines
- Temporarily commented out icon reference in `electron-builder.yml`
- Created `build/README-ICON.md` with instructions

### 3. Binary Download Fixes
- Updated binary-manager.ts to use reliable sources
- Fixed ffmpeg/ffprobe download from gyan.dev
- Added zip extraction with recursive search
- Downloads once for both ffmpeg and ffprobe on Windows

### 4. README Updates
- Focused documentation on Windows platform only
- Removed macOS and Linux installation instructions
- Updated binary paths to show Windows only

## 📋 Next Steps

### To Complete Icon Setup:
1. Go to https://convertico.com/
2. Upload `build/icon.svg`
3. Select all sizes (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)
4. Download as `icon.ico`
5. Save to `build/icon.ico`
6. Uncomment the `icon:` line in `apps/main/electron-builder.yml`

### To Test the Build:
```bash
# Local build test
pnpm build
pnpm --filter @shanutechx/main package

# The output will be in apps/main/dist/
```

### To Trigger GitHub Actions Build:
```bash
# Create and push a new tag
git tag -a v0.1.1 -m "Release v0.1.1 - Windows build with icons"
git push origin v0.1.1
```

## 🔍 Verifying the Fix

### GitHub Actions Should Now:
1. ✅ Only run on Windows
2. ✅ Build both main and renderer
3. ✅ Package the application
4. ✅ Upload artifacts (exe, yml files)
5. ✅ Create GitHub release with files

### Expected Artifacts:
- `SHANUTECHX-Downloader-Setup-{version}.exe` - Installer
- `latest.yml` - Update metadata

## 🐛 Troubleshooting

### If Build Fails with Icon Error:
- The icon line is currently commented out
- Build should work without icon (will use default Windows icon)
- Add proper `icon.ico` file and uncomment the line when ready

### If Binary Downloads Fail:
- Check binary-manager.ts logs
- Binaries are downloaded to: `%APPDATA%\SHANUTECHX Downloader\binaries`
- The app will show errors in Settings if binaries are missing

### If GitHub Action Still Fails:
- Check the Actions tab on GitHub
- Look for specific error messages
- Verify `GH_TOKEN` secret is set (should be automatic)

## 📦 Release Process

1. **Make changes** to your code
2. **Test locally**: `pnpm dev`
3. **Build locally**: `pnpm build && pnpm package`
4. **Commit changes**: `git commit -am "Your message"`
5. **Push to main**: `git push`
6. **Create tag**: `git tag -a v0.1.x -m "Release message"`
7. **Push tag**: `git push origin v0.1.x`
8. **Wait for GitHub Actions** to build and create release
9. **Download installer** from Releases page

## 🎯 Current Version

- Version: 0.1.0
- Platform: Windows only
- Status: Ready for Windows builds
- Icon: Pending (SVG created, needs ICO conversion)

## 📧 Support

- Email: info@shanutechx.com
- Website: https://info.shanutechx.com
- GitHub Issues: https://github.com/ShanudhaTirosh/shanutechx-downloader/issues
