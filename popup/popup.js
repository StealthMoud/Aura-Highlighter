// Controller logic for Aura Highlights popup
// Interacts with local storage, active tab scripts, and clipboard

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  
  const url = tab.url.split('#')[0];
  let highlights = [];

  // DOM references
  const countEl = document.getElementById('highlight-count');
  const searchInput = document.getElementById('search-input');
  const emptyState = document.getElementById('empty-state');
  const listEl = document.getElementById('highlights-list');
  const clearAllBtn = document.getElementById('clear-all-btn');

  // Load and render highlights
  async function loadAndRender() {
    const data = await chrome.storage.local.get(url);
    highlights = data[url] || [];
    renderList(highlights);
  }

  function renderList(items) {
    countEl.textContent = items.length;
    listEl.innerHTML = '';
    
    if (items.length === 0) {
      emptyState.style.display = 'flex';
      listEl.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    listEl.style.display = 'flex';

    items.forEach(h => {
      const card = document.createElement('div');
      card.className = 'highlight-card';
      card.setAttribute('data-id', h.id);

      card.innerHTML = `
        <div class="highlight-header">
          <span class="color-indicator color-${h.color}"></span>
          <span class="highlight-time">${formatTime(h.createdAt)}</span>
        </div>
        <div class="highlight-body" title="${escapeHtml(h.text)}">${escapeHtml(h.text)}</div>
        <div class="card-actions">
          <button class="icon-btn jump-btn" title="Scroll to highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
            </svg>
          </button>
          <button class="icon-btn copy-btn" title="Copy to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="icon-btn delete-btn" title="Remove highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      // Event bindings
      card.querySelector('.jump-btn').addEventListener('click', () => {
        chrome.tabs.sendMessage(tab.id, { action: "scroll-to", id: h.id });
      });

      card.querySelector('.copy-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        await navigator.clipboard.writeText(h.text);
        btn.style.color = 'hsl(145, 80%, 45%)';
        setTimeout(() => btn.style.color = '', 1000);
      });

      card.querySelector('.delete-btn').addEventListener('click', async () => {
        await chrome.tabs.sendMessage(tab.id, { action: "delete-highlight", id: h.id });
        await loadAndRender();
      });

      listEl.appendChild(card);
    });
  }

  // Filter highlights on search
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = highlights.filter(h => h.text.toLowerCase().includes(query));
    renderList(filtered);
  });

  // Clear all highlights on active page
  clearAllBtn.addEventListener('click', async () => {
    for (const h of highlights) {
      await chrome.tabs.sendMessage(tab.id, { action: "delete-highlight", id: h.id });
    }
    await chrome.storage.local.remove(url);
    await loadAndRender();
  });

  // Storage listener to update popup if highlights change elsewhere
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[url]) {
      loadAndRender();
    }
  });

  // Init
  await loadAndRender();
});

function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
