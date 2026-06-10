// Highlighting logic for Aura Highlighter
// Wraps target DOM ranges in styled highlight tags and manages storage sync

const HIGHLIGHTS_KEY = "aura_page_highlights";

/**
 * Wraps a selection range in <mark> tags.
 */
function wrapRangeInMarks(range, id, color) {
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  
  // Single text node selection
  if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = startContainer;
    const endOffset = range.endOffset;
    const startOffset = range.startOffset;
    
    const splitEnd = textNode.splitText(endOffset);
    const splitStart = textNode.splitText(startOffset);
    
    const mark = document.createElement('mark');
    mark.className = `aura-highlight-span aura-hl-${color}`;
    mark.setAttribute('data-highlight-id', id);
    
    splitStart.parentNode.insertBefore(mark, splitEnd);
    mark.appendChild(splitStart);
    return [mark];
  }
  
  // Selection spanning multiple text nodes
  const textNodes = [];
  const commonAncestor = range.commonAncestorContainer;
  const walker = document.createTreeWalker(commonAncestor, NodeFilter.SHOW_TEXT);
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    // Check if node is in range
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    if (range.intersectsNode(node)) {
      textNodes.push(node);
    }
  }
  
  const marks = [];
  for (let i = 0; i < textNodes.length; i++) {
    const textNode = textNodes[i];
    let nodeToWrap = textNode;
    
    if (textNode === startContainer) {
      nodeToWrap = textNode.splitText(range.startOffset);
    }
    if (textNode === endContainer) {
      const currentOffset = (textNode === startContainer) ? range.endOffset - range.startOffset : range.endOffset;
      if (currentOffset < nodeToWrap.textContent.length) {
        nodeToWrap.splitText(currentOffset);
      }
    }
    
    if (nodeToWrap.textContent.trim().length === 0) continue;
    
    const mark = document.createElement('mark');
    mark.className = `aura-highlight-span aura-hl-${color}`;
    mark.setAttribute('data-highlight-id', id);
    
    nodeToWrap.parentNode.insertBefore(mark, nodeToWrap);
    mark.appendChild(nodeToWrap);
    marks.push(mark);
  }
  
  return marks;
}

/**
 * Removes highlight markers from DOM.
 */
function removeHighlightFromDOM(id) {
  const marks = document.querySelectorAll(`mark[data-highlight-id="${id}"]`);
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize(); // Merges split text nodes back together
    }
  });
}

/**
 * Saves a highlight metadata to storage.
 */
async function saveHighlight(highlight) {
  try {
    const url = window.location.href.split('#')[0];
    const { [url]: pageHighlights = [] } = await chrome.storage.local.get(url);
    pageHighlights.push(highlight);
    await chrome.storage.local.set({ [url]: pageHighlights });
  } catch (err) {
    if (err.message.includes("Extension context invalidated")) {
      console.warn("Aura Highlighter: Extension context was invalidated. Please refresh the page to continue highlighting.");
    } else {
      console.error("Failed to save highlight:", err);
    }
  }
}

/**
 * Deletes a highlight from storage.
 */
async function deleteHighlightFromStorage(id) {
  try {
    const url = window.location.href.split('#')[0];
    const { [url]: pageHighlights = [] } = await chrome.storage.local.get(url);
    const target = pageHighlights.find(h => h.id === id);
    const updated = pageHighlights.filter(h => h.id !== id);
    if (updated.length > 0) {
      await chrome.storage.local.set({ [url]: updated });
    } else {
      await chrome.storage.local.remove(url);
    }

    if (target) {
      const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
      target.deletedAt = Date.now();
      aura_trash.push(target);
      await chrome.storage.local.set({ aura_trash });
    }
  } catch (err) {
    console.warn("Aura Highlighter: Failed to delete highlight from storage.", err);
  }
}

/**
 * Restores highlights for the current page on load.
 */
async function restorePageHighlights() {
  try {
    const url = window.location.href.split('#')[0];
    const { [url]: pageHighlights = [] } = await chrome.storage.local.get(url);
    
    pageHighlights.forEach(h => {
      try {
        const parent = document.querySelector(h.selector);
        if (!parent) return;
        
        const startNodeInfo = getNodeAndOffset(parent, h.startOffset);
        const endNodeInfo = getNodeAndOffset(parent, h.endOffset);
        
        if (startNodeInfo && endNodeInfo) {
          const range = document.createRange();
          range.setStart(startNodeInfo.node, startNodeInfo.offset);
          range.setEnd(endNodeInfo.node, endNodeInfo.offset);
          
          wrapRangeInMarks(range, h.id, h.color);
        }
      } catch (err) {
        console.warn("Failed to restore highlight", h.id, err);
      }
    });
  } catch (err) {
    console.warn("Aura Highlighter: Failed to restore highlights.", err);
  }
}
