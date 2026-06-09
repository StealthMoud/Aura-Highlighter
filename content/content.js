// Main coordinator script for Aura Highlighter
// Wire mouse events, selection capture, storage persistence, and popup signals

let settingsToolbarEnabled = true;
let settingsAutoHighlight = false;
let settingsDefaultColor = 'indigo';

// Load initial configuration
async function loadConfig() {
  const config = await chrome.storage.local.get([
    'settings_toolbar_enabled',
    'settings_auto_highlight',
    'settings_default_color'
  ]);
  
  if (config.hasOwnProperty('settings_toolbar_enabled')) {
    settingsToolbarEnabled = config.settings_toolbar_enabled;
  }
  if (config.hasOwnProperty('settings_auto_highlight')) {
    settingsAutoHighlight = config.settings_auto_highlight;
  }
  if (config.hasOwnProperty('settings_default_color')) {
    settingsDefaultColor = config.settings_default_color;
  }
}

// Reactively align settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings_toolbar_enabled) {
    settingsToolbarEnabled = changes.settings_toolbar_enabled.newValue;
  }
  if (changes.settings_auto_highlight) {
    settingsAutoHighlight = changes.settings_auto_highlight.newValue;
  }
  if (changes.settings_default_color) {
    settingsDefaultColor = changes.settings_default_color.newValue;
  }
});

// Automatically load highlights when injected
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    restorePageHighlights();
    checkAndScrollToHash();
  });
} else {
  (async () => {
    await loadConfig();
    restorePageHighlights();
    checkAndScrollToHash();
  })();
}

function checkAndScrollToHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#aura-scroll=')) {
    const targetId = hash.split('=')[1];
    setTimeout(() => {
      const mark = document.querySelector(`mark[data-highlight-id="${targetId}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mark.classList.add('aura-pulse');
        setTimeout(() => mark.classList.remove('aura-pulse'), 1500);
      }
    }, 600);
  }
}

window.addEventListener('hashchange', checkAndScrollToHash);

// Helper to create and save a new highlight from a Range object
async function createHighlightFromRange(range, color) {
  const id = 'aura_' + Math.random().toString(36).substr(2, 9);
  const parentBlock = getClosestBlockParent(range.startContainer);
  const selector = getUniqueSelector(parentBlock);
  const startOffset = getTextOffset(parentBlock, range.startContainer, range.startOffset);
  const endOffset = getTextOffset(parentBlock, range.endContainer, range.endOffset);
  
  if (startOffset !== -1 && endOffset !== -1) {
    const highlight = {
      id,
      selector,
      startOffset,
      endOffset,
      color,
      text: range.toString(),
      createdAt: Date.now(),
      pageTitle: document.title || window.location.hostname,
      url: window.location.href.split('#')[0]
    };
    wrapRangeInMarks(range, id, color);
    await saveHighlight(highlight);
    return id;
  }
  return null;
}

// Helper to remove the most recent page highlight sequentially
async function undoLastHighlight() {
  const url = window.location.href.split('#')[0];
  try {
    const { [url]: pageHighlights = [] } = await chrome.storage.local.get(url);
    if (pageHighlights.length === 0) return;
    
    // Sort highlights by creation time descending (most recent first)
    pageHighlights.sort((a, b) => b.createdAt - a.createdAt);
    const lastHighlight = pageHighlights[0];
    
    removeHighlightFromDOM(lastHighlight.id);
    await deleteHighlightFromStorage(lastHighlight.id);
  } catch (err) {
    console.warn("Aura Highlighter: Failed to undo last highlight.", err);
  }
}

// Initialize floating menu action handlers
initFloatingMenu(
  async (range, color, existingId = null) => {
    if (existingId) {
      // Recoloring existing highlight
      const marks = document.querySelectorAll(`mark[data-highlight-id="${existingId}"]`);
      marks.forEach(m => {
        m.className = `aura-highlight-span aura-hl-${color}`;
      });
      // Update storage
      const url = window.location.href.split('#')[0];
      const { [url]: pageHighlights = [] } = await chrome.storage.local.get(url);
      const target = pageHighlights.find(h => h.id === existingId);
      if (target) {
        target.color = color;
        await chrome.storage.local.set({ [url]: pageHighlights });
      }
    } else if (range) {
      await createHighlightFromRange(range, color);
    }
    window.getSelection().removeAllRanges();
  },
  async (id) => {
    // Delete action
    removeHighlightFromDOM(id);
    await deleteHighlightFromStorage(id);
  }
);

// Selection detection listener
document.addEventListener('mouseup', async (e) => {
  const selection = window.getSelection();
  
  // Ignore clicks inside the floating menu itself
  if (auraMenuElement && auraMenuElement.contains(e.target)) return;

  // Check if clicked directly on an existing highlight
  const targetMark = e.target.closest('.aura-highlight-span');
  if (targetMark) {
    const id = targetMark.getAttribute('data-highlight-id');
    showFloatingMenu(null, id);
    return;
  }

  // Handle new selections
  if (selection && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    // Enforce selection has actual text characters
    if (range.toString().trim().length > 0) {
      if (settingsAutoHighlight) {
        await createHighlightFromRange(range, settingsDefaultColor);
        selection.removeAllRanges();
      } else if (settingsToolbarEnabled) {
        showFloatingMenu(range);
      }
      return;
    }
  }

  hideFloatingMenu();
});

// Keyboard shortcuts coordinator
document.addEventListener('keydown', async (e) => {
  // Hide floating menu on escape key
  if (e.key === 'Escape') {
    hideFloatingMenu();
    window.getSelection().removeAllRanges();
    return;
  }

  // Guard against form inputs
  if (e.target.tagName === 'INPUT' || 
      e.target.tagName === 'TEXTAREA' || 
      e.target.isContentEditable) {
    return;
  }

  // Cmd+Z (Mac) or Ctrl+Z (Windows) to undo highlight
  const isUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
  if (isUndo) {
    e.preventDefault();
    await undoLastHighlight();
    return;
  }

  // 'h' (or 'H') to highlight active selection
  if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (range.toString().trim().length > 0) {
        e.preventDefault();
        await createHighlightFromRange(range, settingsDefaultColor);
        window.getSelection().removeAllRanges();
        hideFloatingMenu();
      }
    }
  }
});

// Listener for messages from popup & background service worker
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "trigger-highlight") {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      createHighlightFromRange(range, msg.color || "indigo");
      selection.removeAllRanges();
    }
  } else if (msg.action === "scroll-to") {
    const mark = document.querySelector(`mark[data-highlight-id="${msg.id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Pulsing effect to catch the eye
      mark.classList.add('aura-pulse');
      setTimeout(() => mark.classList.remove('aura-pulse'), 1500);
    }
  } else if (msg.action === "delete-highlight") {
    removeHighlightFromDOM(msg.id);
    deleteHighlightFromStorage(msg.id);
  }
  sendResponse({ status: "ok" });
});
