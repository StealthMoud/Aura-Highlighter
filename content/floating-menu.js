// Floating selection menu for Aura Highlighter
// Dynamically creates, positions, and triggers selection actions

let auraMenuElement = null;
let currentSelectionRange = null;
let activeHighlightId = null; // Stored when clicking an existing highlight

const COLOR_MAP = {
  indigo: 'hsl(245, 80%, 62%)',
  cyan: 'hsl(180, 80%, 50%)',
  green: 'hsl(145, 80%, 45%)',
  amber: 'hsl(35, 80%, 55%)'
};

function initFloatingMenu(onHighlightCallback, onDeleteCallback) {
  if (auraMenuElement) return;

  const menu = document.createElement('div');
  menu.className = 'aura-floating-menu';
  
  // Color picker buttons
  Object.keys(COLOR_MAP).forEach(color => {
    const btn = document.createElement('button');
    btn.className = `aura-menu-btn aura-color-dot aura-${color}`;
    btn.title = `Highlight ${color}`;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${COLOR_MAP[color]}" stroke="none"><circle cx="12" cy="12" r="8"/></svg>`;
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentSelectionRange) {
        onHighlightCallback(currentSelectionRange, color);
      } else if (activeHighlightId) {
        // Recolor existing highlight
        onHighlightCallback(null, color, activeHighlightId);
      }
      hideFloatingMenu();
    });
    menu.appendChild(btn);
  });

  // Splitter line
  const divider = document.createElement('div');
  divider.className = 'aura-menu-divider';
  menu.appendChild(divider);

  // Trash button for deleting highlight
  const trashBtn = document.createElement('button');
  trashBtn.className = 'aura-menu-btn aura-trash-btn';
  trashBtn.title = 'Remove Highlight';
  trashBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
  
  trashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeHighlightId) {
      onDeleteCallback(activeHighlightId);
    }
    hideFloatingMenu();
  });
  menu.appendChild(trashBtn);

  document.body.appendChild(menu);
  auraMenuElement = menu;
}

function showFloatingMenu(range, highlightId = null) {
  if (!auraMenuElement) return;

  currentSelectionRange = range;
  activeHighlightId = highlightId;

  // Toggle trash button visibility
  const trashBtn = auraMenuElement.querySelector('.aura-trash-btn');
  if (trashBtn) {
    trashBtn.style.display = highlightId ? 'flex' : 'none';
    const divider = auraMenuElement.querySelector('.aura-menu-divider');
    if (divider) divider.style.display = highlightId ? 'block' : 'none';
  }

  // Get selection coordinates
  const rect = range ? range.getBoundingClientRect() : null;
  if (!rect && !highlightId) return;

  let top = 0;
  let left = 0;

  if (rect) {
    // Positioning relative to text selection bounding box
    top = rect.top + window.scrollY - 48;
    left = rect.left + window.scrollX + (rect.width / 2) - 80;
  } else if (highlightId) {
    // If clicking an existing highlight span, find it
    const mark = document.querySelector(`mark[data-highlight-id="${highlightId}"]`);
    if (mark) {
      const markRect = mark.getBoundingClientRect();
      top = markRect.top + window.scrollY - 48;
      left = markRect.left + window.scrollX + (markRect.width / 2) - 80;
    }
  }

  // Avoid running off-screen
  top = Math.max(10, top);
  left = Math.max(10, Math.min(window.innerWidth - 180, left));

  auraMenuElement.style.top = `${top}px`;
  auraMenuElement.style.left = `${left}px`;
  auraMenuElement.classList.add('aura-visible');
}

function hideFloatingMenu() {
  if (auraMenuElement) {
    auraMenuElement.classList.remove('aura-visible');
  }
  currentSelectionRange = null;
  activeHighlightId = null;
}
