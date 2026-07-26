# Setup Instructions

## 🚀 Quick Setup for GitHub Auto-Updates

To enable automatic updates and GitHub Actions builds, the repository is already configured for:

**GitHub Repository**: https://github.com/ShanudhaTirosh/shanutechx-downloader  
**Owner**: ShanudhaTirosh  
**Website**: https://info.shanutechx.com  
**Email**: info@shanutechx.com

All configuration files have been updated with the correct information.

### 1. Push to GitHub Repository

The repository is already configured and available at:
**https://github.com/ShanudhaTirosh/shanutechx-downloader**

```bash
# If starting fresh, initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add remote (if not already added)
git remote add origin https://github.com/ShanudhaTirosh/shanutechx-downloader.git
git branch -M main
git push -u origin main
```

### 2. Enable GitHub Actions

GitHub Actions is already configured in `.github/workflows/build-release.yml`. It will automatically:
- Build for Windows, macOS, and Linux
- Create releases when you push a tag
- Upload installers to GitHub Releases

### 3. Create Your First Release

```bash
# Create and push a version tag
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will automatically:
1. Build the app for all platforms
2. Create a GitHub release
3. Upload installers (`.exe`, `.dmg`, `.AppImage`, etc.)
4. Generate release notes

### 4. Verify Auto-Update Setup

1. Open the built application
2. Go to **Settings**
3. Click **Check for Updates**
4. If a new version is available, it will show:
   - Version number
   - Release notes
   - "Download & Install Update" button

### 5. Optional: Code Signing (Recommended for Production)

#### Windows Code Signing

1. Get a code signing certificate (OV or EV)
2. Add to GitHub Secrets:
   - `WINDOWS_CERTIFICATE` - Base64 encoded .pfx file
   - `WINDOWS_CERTIFICATE_PASSWORD` - Certificate password

#### macOS Code Signing

1. Get an Apple Developer account
2. Create signing certificates in Xcode
3. Add to GitHub Secrets:
   - `MAC_CERTIFICATE` - Base64 encoded .p12 file
   - `MAC_CERTIFICATE_PASSWORD` - Certificate password
   - `APPLE_ID` - Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password
   - `APPLE_TEAM_ID` - Your team ID

Without code signing:
- Windows: Users will see "Windows protected your PC" warning
- macOS: Users need to right-click → Open (first time only)
- Linux: No code signing required

### 6. Testing Updates Locally

To test the update flow without pushing to GitHub:

1. Build a version with auto-updater disabled
2. Install it
3. Create a new version with higher version number
4. Push a release
5. Open the installed app and check for updates

---

## 🛠️ Development Setup

### Prerequisites

- Node.js 20 or higher
- pnpm 9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/ShanudhaTirosh/shanutechx-downloader.git
cd shanutechx-downloader

# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

### Development Commands

```bash
# Start dev server (both main and renderer)
pnpm dev

# Build for production
pnpm build

# Package into executable
pnpm package

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Structure

```
├── .github/workflows/    # GitHub Actions CI/CD
├── apps/
│   ├── main/            # Electron main process
│   └── renderer/        # React frontend
├── packages/
│   └── shared-types/    # Shared TypeScript types
└── package.json         # Root workspace config
```

---

## 📝 Releasing a New Version

### Manual Release Process

1. **Update Version Number**

   Edit `package.json` in the root:
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **Commit Changes**
   ```bash
   git add .
   git commit -m "Release v0.2.0"
   ```

3. **Create and Push Tag**
   ```bash
   git tag v0.2.0
   git push origin main
   git push origin v0.2.0
   ```

4. **GitHub Actions Will Automatically:**
   - Build for all platforms
   - Create GitHub release
   - Upload installers
   - Users will be notified of updates

### Versioning Guidelines

Follow [Semantic Versioning](https://semver.org/):

- `v1.0.0` - Major version (breaking changes)
- `v1.1.0` - Minor version (new features, backwards compatible)
- `v1.1.1` - Patch version (bug fixes)

---

## 🔧 Troubleshooting

### Build Fails on GitHub Actions

1. Check the Actions tab for error logs
2. Verify all dependencies are in `package.json`
3. Make sure `pnpm-lock.yaml` is committed
4. Check Node.js and pnpm versions match

### Auto-Update Not Working

1. Verify `electron-builder.yml` has correct GitHub owner/repo
2. Make sure releases are public (not drafts)
3. Check app version is lower than latest release
4. Look at console logs for errors

### Binaries Not Downloading

The app automatically downloads yt-dlp, ffmpeg, and ffprobe on first launch.

If download fails:
1. Check internet connection
2. Go to Settings → System Binaries
3. Click "Download Missing Binaries"
4. Check console for error messages

Binary download locations:
- Windows: `%APPDATA%\SHANUTECHX Downloader\binaries`
- macOS: `~/Library/Application Support/SHANUTECHX Downloader/binaries`
- Linux: `~/.config/SHANUTECHX Downloader/binaries`

---

## 🎯 Production Checklist

Before releasing to users:

- [ ] Update version number in `package.json`
- [ ] Replace `YOUR_GITHUB_USERNAME` in all config files
- [ ] Test auto-update flow
- [ ] Add code signing certificates (optional but recommended)
- [ ] Test on all target platforms (Windows, macOS, Linux)
- [ ] Create release notes
- [ ] Push version tag to trigger build

---

## 📚 Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [electron-updater](https://www.electron.build/auto-update)
- [GitHub Actions](https://docs.github.com/en/actions)

---

**Need help? Open an issue on GitHub!**
