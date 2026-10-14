document.getElementById("downloadCurrentBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const targetUrl = tabs[0].url;
      const protocolUrl = `shanutechx://download?url=${encodeURIComponent(targetUrl)}`;
      chrome.tabs.create({ url: protocolUrl, active: false }, (newTab) => {
        document.getElementById("statusMsg").textContent = "Sent to SHANUTECHX Downloader!";
        setTimeout(() => {
          if (newTab && newTab.id) {
            chrome.tabs.remove(newTab.id).catch(() => {});
          }
          window.close();
        }, 600);
      });
    }
  });
});
