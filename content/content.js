// Main coordinator script for Aura Highlighter
// Wire mouse events, selection capture, storage persistence, and popup signals

let settingsToolbarEnabled = true;
let settingsAutoHighlight = false;
let settingsShortcutsEnabled = true;
let settingsDefaultColor = 'indigo';
const redoStack = [];

// Load initial configuration
async function loadConfig() {
  const config = await chrome.storage.local.get([
    'settings_toolbar_enabled',
    'settings_auto_highlight',
    'settings_shortcuts_enabled',
    'settings_default_color'
  ]);
  
  if (config.hasOwnProperty('settings_toolbar_enabled')) {
    settingsToolbarEnabled = config.settings_toolbar_enabled;
  }
  if (config.hasOwnProperty('settings_auto_highlight')) {
    settingsAutoHighlight = config.settings_auto_highlight;
  }
  if (config.hasOwnProperty('settings_shortcuts_enabled')) {
    settingsShortcutsEnabled = config.settings_shortcuts_enabled;
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
  if (changes.settings_shortcuts_enabled) {
    settingsShortcutsEnabled = changes.settings_shortcuts_enabled.newValue;
  }
  if (changes.settings_default_color) {
    settingsDefaultColor = changes.settings_default_color.newValue;
  }
});

// Automatically load highlights when injected
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    try {
      await chrome.runtime.sendMessage({ action: "cleanup-expired" });
    } catch (err) {}
    restorePageHighlights();
    checkAndScrollToHash();
  });
} else {
  (async () => {
    await loadConfig();
    try {
      await chrome.runtime.sendMessage({ action: "cleanup-expired" });
    } catch (err) {}
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
  // Clear redo stack on new highlight action
  redoStack.length = 0;

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
    
    // Save to redo stack before deleting
    redoStack.push(lastHighlight);
    
    removeHighlightFromDOM(lastHighlight.id);
    await deleteHighlightFromStorage(lastHighlight.id);
  } catch (err) {
    console.warn("Aura Highlighter: Failed to undo last highlight.", err);
  }
}

// Helper to restore the last undone highlight sequentially
async function redoLastHighlight() {
  if (redoStack.length === 0) return;
  
  const highlight = redoStack.pop();
  try {
    const parent = document.querySelector(highlight.selector);
    if (!parent) return;
    
    const startNodeInfo = getNodeAndOffset(parent, highlight.startOffset);
    const endNodeInfo = getNodeAndOffset(parent, highlight.endOffset);
    
    if (startNodeInfo && endNodeInfo) {
      const range = document.createRange();
      range.setStart(startNodeInfo.node, startNodeInfo.offset);
      range.setEnd(endNodeInfo.node, endNodeInfo.offset);
      
      wrapRangeInMarks(range, highlight.id, highlight.color);
      await saveHighlight(highlight);
    }
  } catch (err) {
    console.warn("Aura Highlighter: Failed to redo highlight.", err);
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

  // Guard: if shortcuts are disabled, bypass
  if (!settingsShortcutsEnabled) return;

  // Guard against form inputs
  if (e.target.tagName === 'INPUT' || 
      e.target.tagName === 'TEXTAREA' || 
      e.target.isContentEditable) {
    return;
  }

  // Cmd+Shift+Z or Ctrl+Shift+Z or Cmd+Y or Ctrl+Y to redo highlight
  const isRedo = ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
                 ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'y');
  if (isRedo) {
    e.preventDefault();
    await redoLastHighlight();
    return;
  }

  // Cmd+Z (Mac) or Ctrl+Z (Windows) to undo highlight
  const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
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
}, true);

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
  } else if (msg.action === "clear-page-highlights") {
    const marks = document.querySelectorAll('.aura-highlight-span');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });
  } else if (msg.action === "restore-highlight") {
    const h = msg.highlight;
    try {
      const parent = document.querySelector(h.selector);
      if (parent) {
        const startNodeInfo = getNodeAndOffset(parent, h.startOffset);
        const endNodeInfo = getNodeAndOffset(parent, h.endOffset);
        if (startNodeInfo && endNodeInfo) {
          const range = document.createRange();
          range.setStart(startNodeInfo.node, startNodeInfo.offset);
          range.setEnd(endNodeInfo.node, endNodeInfo.offset);
          wrapRangeInMarks(range, h.id, h.color);
        }
      }
    } catch (err) {
      console.warn("Failed to restore highlight to DOM:", err);
    }
  }
  sendResponse({ status: "ok" });
});
