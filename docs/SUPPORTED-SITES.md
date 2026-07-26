# Supported Sites

SHANUTECHX Downloader uses **yt-dlp** as its extraction engine, which supports over **1800+ websites**. This means if yt-dlp can download from a site, so can SHANUTECHX Downloader!

## 🎥 Video Platforms

- YouTube (including age-restricted and private videos)
- Vimeo
- Dailymotion
- Twitch
- TikTok
- Instagram (videos, reels, IGTV)

## 📱 Social Media

- Twitter/X (videos and GIFs)
- Facebook (videos and live streams)
- Reddit (videos with audio)
- LinkedIn
- Snapchat

## 🔞 Adult Content Sites

**Privacy Note**: All downloads are processed locally on your machine. No data is sent to external servers.

Supported adult platforms include:
- Pornhub
- Xvideos
- Xhamster
- RedTube
- YouPorn
- OnlyFans (with authentication)
- Chaturbate (live streams)
- And many more...

## 🎮 Gaming & Live Streaming

- Twitch (VODs and clips)
- YouTube Gaming
- Facebook Gaming
- Mixer

## 📺 TV & News

- BBC iPlayer
- CNN
- NBC
- CBS
- Fox News
- And many more regional broadcasters

## 🎓 Educational

- Coursera
- Udemy
- Khan Academy
- LinkedIn Learning
- And more...

## 🎵 Music & Audio

- SoundCloud
- Bandcamp
- Mixcloud
- And more...

## 🌐 Complete List

For a complete and up-to-date list of all supported sites, run:

```bash
# In your terminal (after yt-dlp is downloaded)
yt-dlp --list-extractors
```

Or visit the official yt-dlp documentation:
https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md

## 🔒 Privacy & Security

- **Local Processing**: All video extraction happens on your computer
- **No Tracking**: We don't track what you download
- **No Logging**: Your download history is stored only in your local database
- **Secure**: Downloads use HTTPS when available
- **Optional Certificate Verification**: Can be disabled for sites with certificate issues

## ⚠️ Legal Notice

This software is provided for downloading content you have the right to download. Users are responsible for complying with:

- Website Terms of Service
- Copyright laws in your jurisdiction
- Content creator rights
- Age restrictions and local laws

**Please use responsibly and legally.**

## 🆘 Troubleshooting

### Site Not Working?

1. **Update yt-dlp**: Go to Settings → System Binaries → Download Missing Binaries
2. **Check if site is supported**: `yt-dlp --list-extractors | grep <sitename>`
3. **Try with --no-check-certificate**: Enable "Ignore Certificate Errors" in settings
4. **Check for geo-restrictions**: Some content may be region-locked
5. **Authentication**: Some sites require login (OnlyFans, Patreon, etc.)

### Authentication for Private Content

For sites that require login:
1. Use the **--cookies** option (coming soon in settings)
2. Or manually copy cookies from your browser

### Age-Restricted Content

- YouTube age-restricted: Works automatically
- Other sites: May require cookies or authentication

## 🚀 Future Features

- [ ] Cookie import from browser
- [ ] Batch download from playlists
- [ ] Scheduled downloads
- [ ] Custom format selection
- [ ] Subtitle/caption download
- [ ] Thumbnail extraction

## 📧 Report Issues

If a specific site isn't working:
1. Check if it's a yt-dlp issue: https://github.com/yt-dlp/yt-dlp/issues
2. Report to us: https://github.com/ShanudhaTirosh/shanutechx-downloader/issues

Include:
- Site URL (can be obfuscated for adult content)
- Error message
- yt-dlp version (shown in Settings)
