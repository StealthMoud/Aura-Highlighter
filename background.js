// Background service worker for Aura Highlighter
// Listens for context menu events and sends messages to content scripts

async function cleanupExpiredTrash() {
  try {
    const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
    if (aura_trash.length === 0) return;
    
    const now = Date.now();
    const thirtyDaysMs = 2592000000; // 30 Days expiration
    const validTrash = aura_trash.filter(item => {
      const age = now - (item.deletedAt || 0);
      return age < thirtyDaysMs;
    });
    
    if (validTrash.length !== aura_trash.length) {
      await chrome.storage.local.set({ aura_trash: validTrash });
    }
  } catch (err) {
    console.warn("Aura Highlighter: Failed to execute background trash cleanup.", err);
  }
}

async function cleanupExpiredHighlights() {
  await cleanupExpiredTrash();
  try {
    const config = await chrome.storage.local.get([
      'settings_auto_delete_enabled',
      'settings_auto_delete_duration'
    ]);
    
    if (!config.settings_auto_delete_enabled) return;
    
    const thresholdMs = parseInt(config.settings_auto_delete_duration, 10);
    if (isNaN(thresholdMs) || thresholdMs <= 0) return;
    
    const now = Date.now();
    const allData = await chrome.storage.local.get(null);
    const updates = {};
    const removals = [];
    
    Object.keys(allData).forEach(key => {
      if (!key.startsWith('settings_') && Array.isArray(allData[key])) {
        const pageHighlights = allData[key];
        const validHighlights = pageHighlights.filter(h => {
          const age = now - (h.createdAt || 0);
          return age < thresholdMs;
        });
        
        if (validHighlights.length !== pageHighlights.length) {
          if (validHighlights.length > 0) {
            updates[key] = validHighlights;
          } else {
            removals.push(key);
          }
        }
      }
    });
    
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
    if (removals.length > 0) {
      await chrome.storage.local.remove(removals);
    }
  } catch (err) {
    console.warn("Aura Highlighter: Failed to execute background cleanup.", err);
  }
}

// Perform cleanup on browser startup and extension load
chrome.runtime.onStartup.addListener(cleanupExpiredHighlights);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "aura-highlight",
    title: "Highlight Selection",
    contexts: ["selection"]
  });
  cleanupExpiredHighlights();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "cleanup-expired") {
    cleanupExpiredHighlights().then(() => sendResponse({ status: "ok" }));
    return true; // Keep message channel open for async response
  }
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
