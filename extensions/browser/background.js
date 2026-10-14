// Background service worker for SHANUTECHX Downloader extension

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "shanutechx-download-link",
    title: "Download with SHANUTECHX Downloader",
    contexts: ["link", "video", "audio", "image"]
  });

  chrome.contextMenus.create({
    id: "shanutechx-download-page",
    title: "Download Media on this Page with SHANUTECHX",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let targetUrl = info.srcUrl || info.linkUrl || (tab && tab.url);
  if (targetUrl) {
    const protocolUrl = `shanutechx://download?url=${encodeURIComponent(targetUrl)}`;
    chrome.tabs.create({ url: protocolUrl, active: false }, (newTab) => {
      // Automatically close the opened trigger tab after a moment
      setTimeout(() => {
        if (newTab && newTab.id) {
          chrome.tabs.remove(newTab.id).catch(() => {});
        }
      }, 500);
    });
  }
});
