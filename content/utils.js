// DOM helpers for Aura Highlighter
// Provids functions to serialize and deserialize DOM positions

/**
 * Checks if an element is a container block.
 * We serialize relative to block elements for stability.
 */
function isBlockElement(el) {
  if (!el) return false;
  const blocks = ['P', 'DIV', 'LI', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TD', 'TH', 'MAIN', 'ASIDE'];
  return blocks.includes(el.tagName);
}

/**
 * Finds the closest parent block element of a node.
 */
function getClosestBlockParent(node) {
  let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (current && current !== document.body) {
    if (isBlockElement(current)) return current;
    current = current.parentElement;
  }
  return document.body;
}

/**
 * Generates a unique CSS selector for a DOM element.
 * Handles IDs, classnames, and nth-child indices.
 */
function getUniqueSelector(el) {
  if (!el || el === document.body) return 'body';
  if (el.id && !/^[0-9]/.test(el.id) && !el.id.includes('__') && el.id.length < 50) {
    // Avoid dynamic lookig IDs (e.g. react/next hashes)
    return `#${CSS.escape(el.id)}`;
  }
  
  const path = [];
  let current = el;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id && !/^[0-9]/.test(current.id) && !current.id.includes('__')) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }
    
    // Find index among siblings of same tag
    const siblings = Array.from(current.parentElement?.children || []);
    const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
    
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * Calculates absolute character offset inside a block parent.
 * It iterates through all child text nodes until it reaches targetNode.
 */
function getTextOffset(parent, targetNode, offsetInNode) {
  let totalOffset = 0;
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === targetNode) {
      return totalOffset + offsetInNode;
    }
    totalOffset += node.textContent.length;
  }
  return -1; // Node not found inside parent
}

/**
 * Finds the specific text node and local offset from an absolute offset.
 */
function getNodeAndOffset(parent, targetOffset) {
  let currentOffset = 0;
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const len = node.textContent.length;
    if (currentOffset + len >= targetOffset) {
      return {
        node: node,
        offset: targetOffset - currentOffset
      };
    }
    currentOffset += len;
  }
  
  return null; // Target offset out of bounds
}
