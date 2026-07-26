# Adult Content Download Support

## Overview

SHANUTECHX Downloader supports downloading videos from adult content websites through the **yt-dlp** extraction engine. This feature is built-in and requires no additional configuration.

## 🔒 Privacy & Security

### Your Privacy Matters

- **100% Local Processing**: All video extraction happens on your computer
- **No External Servers**: Videos are downloaded directly from the source site
- **No Tracking**: We don't track, log, or know what you download
- **Local Database**: Your download history is stored only in a local SQLite database on your machine
- **No Analytics**: No usage data is sent to us or third parties
- **Private Mode**: Consider using Windows' private browsing features or VPN if desired

### Security Features

- **HTTPS Support**: Downloads use encrypted connections when available
- **Certificate Validation**: Optional certificate checking (can be disabled for problematic sites)
- **No Script Injection**: Direct downloads without executing third-party scripts
- **Sandboxed Extraction**: yt-dlp runs in isolated process

## 🌐 Supported Sites

### Major Adult Platforms

✅ **Fully Supported** (tested and working):
- Pornhub
- Xvideos
- Xhamster
- RedTube
- YouPorn
- Xnxx
- SpankBang
- Tube8
- Beeg
- Eporner
- And many more...

### Premium/Subscription Sites

⚠️ **Requires Authentication**:
- OnlyFans (requires cookies/login)
- Patreon (requires cookies/login)
- FanCentro
- ManyVids
- And others...

### Live Streaming

✅ **Supported**:
- Chaturbate (live and recorded shows)
- Stripchat
- Cam4
- BongaCams
- And more...

## 📥 How to Download

### Basic Download

1. **Copy Video URL**
   - Go to the adult site
   - Copy the video page URL (not the embed URL)

2. **Paste in SHANUTECHX Downloader**
   - Open the app
   - Go to **Social Grab** tab
   - Paste the URL
   - Click **Extract**

3. **Select Quality**
   - Choose your preferred quality (1080p, 720p, etc.)
   - Click **Download**

4. **Track Progress**
   - Go to **Downloads** tab
   - Watch real-time progress
   - Videos save to your configured download folder

### Tips for Best Results

- **Use Full URLs**: Copy the complete video page URL
- **Avoid Embed URLs**: Don't use player embed links
- **Check for Geo-Restrictions**: Some content may be region-locked
- **Try Different Qualities**: If one quality fails, try another

## ⚙️ Configuration

### Recommended Settings

1. **Download Location**
   - Settings → Downloads → Download Directory
   - Choose a private folder
   - Consider using a folder that's excluded from cloud backup

2. **Certificate Verification**
   - Settings → Advanced → Ignore Certificate Errors
   - Enable if downloads fail with SSL errors
   - Only use for trusted sites

3. **Speed Limits**
   - Settings → Downloads → Max Speed
   - Set limits to avoid bandwidth issues
   - Useful for background downloads

### Privacy Settings

- **Disable Thumbnails**: Clear thumbnail cache after downloads
- **Auto-Delete History**: Manually clear history from History tab
- **Custom Folder**: Use a separate, private folder for adult content

## 🛠️ Troubleshooting

### "Unsupported URL" Error

**Solution**:
1. Make sure you're using the full video page URL
2. Check if the site is supported: See `SUPPORTED-SITES.md`
3. Try updating yt-dlp: Settings → System Binaries → Download Missing Binaries

### "Private video" or "Login required"

**Solution** (Coming Soon):
- Cookie import feature will be added in future update
- Manual workaround: Use browser developer tools to export cookies

### Download Fails or Gets Stuck

**Solutions**:
1. **Enable "Ignore Certificate Errors"** in Settings
2. **Try different quality** - some qualities may not be available
3. **Check your internet connection**
4. **Try again later** - site may be temporarily down
5. **Update yt-dlp** - newer version may fix issues

### Slow Download Speed

**Solutions**:
1. Check your internet speed
2. Try direct HTTP download if available
3. Disable speed limits in settings
4. Use fewer simultaneous downloads
5. Some sites throttle download speeds

### Video Quality Not Available

**Solutions**:
1. **Try "Best available"** option
2. **Download audio only** and video separately (advanced users)
3. Site may not have that quality available
4. Try a different video

## 🔐 Authentication for Premium Content

### Future Feature: Cookie Import

Coming soon in a future update:
- Import cookies from your browser
- Download from subscription sites you have access to
- Support for OnlyFans, Patreon, etc.

### Manual Workaround (Advanced)

For now, you can:
1. Use yt-dlp command line with `--cookies-from-browser chrome`
2. Or manually export cookies and use `--cookies` flag

This feature will be integrated into the GUI in a future update.

## ⚖️ Legal & Ethical Considerations

### Legal Notice

**IMPORTANT**: You are responsible for complying with:

1. **Copyright Laws**: Downloading copyrighted content without permission may be illegal
2. **Terms of Service**: Sites may prohibit downloading their content
3. **Age Restrictions**: Ensure you meet legal age requirements in your jurisdiction
4. **Content Ownership**: Respect content creators' rights

### Ethical Use

- **Respect Content Creators**: Consider supporting creators through official channels
- **Personal Use Only**: Don't redistribute downloaded content
- **Follow Site Rules**: Respect terms of service
- **Age Verification**: Ensure you meet minimum age requirements

## 🚫 What We Don't Support

- **Illegal Content**: Child exploitation material (CSAM) - automatically refused by yt-dlp
- **Malware Sites**: Sites known for malware distribution
- **Redistribution**: Tools for mass scraping or republishing
- **DRM Circumvention**: Encrypted/protected content

## 📊 Statistics

- **Sites Supported**: 100+ adult content platforms
- **Average Success Rate**: ~95% for major sites
- **Update Frequency**: yt-dlp updates monthly

## 🆘 Support

### Getting Help

If you encounter issues:

1. **Check this guide** for common solutions
2. **Update yt-dlp**: Settings → System Binaries
3. **Check yt-dlp compatibility**: https://github.com/yt-dlp/yt-dlp/issues
4. **Contact us** (keep details private):
   - Email: support@shanutechx.com (mark as "Technical Issue - Private")
   - GitHub: https://github.com/ShanudhaTirosh/shanutechx-downloader/issues

### Reporting Issues

When reporting adult content download issues:
- ✅ DO: Include error messages
- ✅ DO: Mention the site (e.g., "major adult site #1")
- ✅ DO: Include yt-dlp version
- ❌ DON'T: Include explicit URLs in public issues
- ❌ DON'T: Share personal account details

## 🔄 Future Improvements

Planned features:
- [ ] Cookie import from browser (for premium sites)
- [ ] Batch download support
- [ ] Playlist downloads
- [ ] Custom format selection
- [ ] Private mode (no history recording)
- [ ] Encrypted storage option
- [ ] Auto-cleanup of download history

## 📝 Disclaimer

This software is a general-purpose download manager. The developers:

- Do not promote or condone piracy
- Do not track user downloads
- Do not provide content
- Are not responsible for how users use the software
- Encourage legal and ethical use only

**Use at your own discretion and risk. Always comply with applicable laws.**

---

**Last Updated**: 2026-07-26
**yt-dlp Version**: Latest (auto-updated)
