// Background service worker for Aura Highlighter
// Listens for context menu events and sends messages to content scripts

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "aura-highlight",
    title: "Highlight Selection",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "aura-highlight" && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "trigger-highlight",
        color: "indigo"
      });
    } catch (err) {
      console.warn("Failed to communicate with content script. Target tab may not be loaded.", err);
    }
  }
});
