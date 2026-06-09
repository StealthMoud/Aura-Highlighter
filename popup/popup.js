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

  // Settings DOM references
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const dashboardView = document.getElementById('dashboard-view');
  const settingsView = document.getElementById('settings-view');
  const toggleToolbar = document.getElementById('toggle-toolbar');
  const toggleAutoHighlight = document.getElementById('toggle-autohighlight');
  const colorChoiceBtns = document.querySelectorAll('.color-choice-btn');

  // Toggle View Panels
  settingsToggleBtn.addEventListener('click', () => {
    const isSettingsActive = settingsView.classList.contains('active');
    if (isSettingsActive) {
      settingsView.classList.remove('active');
      dashboardView.classList.add('active');
      settingsToggleBtn.classList.remove('active');
      settingsToggleBtn.title = "Settings";
    } else {
      dashboardView.classList.remove('active');
      settingsView.classList.add('active');
      settingsToggleBtn.classList.add('active');
      settingsToggleBtn.title = "Back to list";
    }
  });

  // Load and apply settings
  async function loadSettings() {
    const {
      settings_toolbar_enabled = true,
      settings_auto_highlight = false,
      settings_default_color = 'indigo'
    } = await chrome.storage.local.get([
      'settings_toolbar_enabled',
      'settings_auto_highlight',
      'settings_default_color'
    ]);

    toggleToolbar.checked = settings_toolbar_enabled;
    toggleAutoHighlight.checked = settings_auto_highlight;

    colorChoiceBtns.forEach(btn => {
      if (btn.getAttribute('data-color') === settings_default_color) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Save settings on changes
  toggleToolbar.addEventListener('change', async () => {
    await chrome.storage.local.set({ settings_toolbar_enabled: toggleToolbar.checked });
  });

  toggleAutoHighlight.addEventListener('change', async () => {
    await chrome.storage.local.set({ settings_auto_highlight: toggleAutoHighlight.checked });
  });

  colorChoiceBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      colorChoiceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const color = btn.getAttribute('data-color');
      await chrome.storage.local.set({ settings_default_color: color });
    });
  });

  // Helper to resolve domains
  function extractHostname(urlStr) {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.replace('www.', '');
    } catch (e) {
      return urlStr;
    }
  }

  // Load and render highlights
  async function loadAndRender() {
    const allData = await chrome.storage.local.get(null);
    let allHighlights = [];
    
    Object.keys(allData).forEach(key => {
      if (!key.startsWith('settings_') && Array.isArray(allData[key])) {
        const pageHighlights = allData[key].map(h => ({
          ...h,
          url: h.url || key,
          pageTitle: h.pageTitle || extractHostname(key)
        }));
        allHighlights.push(...pageHighlights);
      }
    });

    highlights = allHighlights;
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

    // Group items by domain
    const groups = {};
    items.forEach(h => {
      const domain = extractHostname(h.url);
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(h);
    });

    // Render domain cards
    Object.keys(groups).forEach(domain => {
      const groupHighlights = groups[domain];
      const domainCard = document.createElement('div');
      domainCard.className = 'domain-card';
      
      // Expand by default if only one domain exists
      const isExpanded = Object.keys(groups).length === 1;
      if (isExpanded) {
        domainCard.classList.add('expanded');
      }

      domainCard.innerHTML = `
        <div class="domain-header">
          <div class="domain-info">
            <div class="domain-favicon-wrapper">
              <img class="domain-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="">
            </div>
            <span class="domain-name" title="${domain}">${domain}</span>
          </div>
          <div class="domain-controls">
            <span class="domain-badge">${groupHighlights.length}</span>
            <svg class="domain-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
        <div class="domain-body"></div>
      `;

      const headerEl = domainCard.querySelector('.domain-header');
      headerEl.addEventListener('click', () => {
        domainCard.classList.toggle('expanded');
      });

      const bodyEl = domainCard.querySelector('.domain-body');

      // Sort highlights descending
      groupHighlights.sort((a, b) => b.createdAt - a.createdAt);

      groupHighlights.forEach(h => {
        const card = document.createElement('div');
        card.className = 'highlight-card';
        card.setAttribute('data-id', h.id);

        card.innerHTML = `
          <div class="highlight-header">
            <span class="color-indicator color-${h.color}"></span>
            <span class="highlight-time">${formatTime(h.createdAt)}</span>
          </div>
          <div class="highlight-page-title" title="${escapeHtml(h.pageTitle)}">${escapeHtml(h.pageTitle)}</div>
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

        // Scroll action
        card.querySelector('.jump-btn').addEventListener('click', async () => {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!activeTab) return;

          const activeUrl = activeTab.url.split('#')[0];
          const targetUrl = h.url.split('#')[0];

          if (activeUrl === targetUrl) {
            chrome.tabs.sendMessage(activeTab.id, { action: "scroll-to", id: h.id });
          } else {
            chrome.tabs.update(activeTab.id, { url: `${targetUrl}#aura-scroll=${h.id}` });
          }
        });

        // Copy action
        card.querySelector('.copy-btn').addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          await navigator.clipboard.writeText(h.text);
          btn.style.color = 'hsl(145, 80%, 45%)';
          setTimeout(() => btn.style.color = '', 1000);
        });

        // Delete action
        card.querySelector('.delete-btn').addEventListener('click', async () => {
          const targetUrl = h.url.split('#')[0];
          const pageHighlightsData = await chrome.storage.local.get(targetUrl);
          const pageHighlights = pageHighlightsData[targetUrl] || [];
          const updated = pageHighlights.filter(item => item.id !== h.id);
          
          if (updated.length > 0) {
            await chrome.storage.local.set({ [targetUrl]: updated });
          } else {
            await chrome.storage.local.remove(targetUrl);
          }

          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.url.split('#')[0] === targetUrl) {
            chrome.tabs.sendMessage(activeTab.id, { action: "delete-highlight", id: h.id });
          }
          
          await loadAndRender();
        });

        bodyEl.appendChild(card);
      });

      listEl.appendChild(domainCard);
    });
  }

  // Filter highlights on search
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = highlights.filter(h => 
      h.text.toLowerCase().includes(query) || 
      h.pageTitle.toLowerCase().includes(query) || 
      extractHostname(h.url).toLowerCase().includes(query)
    );
    renderList(filtered);
  });

  // Clear all highlights on active page
  clearAllBtn.addEventListener('click', async () => {
    const activeHighlights = highlights.filter(h => h.url.split('#')[0] === url);
    for (const h of activeHighlights) {
      chrome.tabs.sendMessage(tab.id, { action: "delete-highlight", id: h.id });
    }
    await chrome.storage.local.remove(url);
    await loadAndRender();
  });

  // Storage listener to update popup if highlights change elsewhere
  chrome.storage.onChanged.addListener((changes) => {
    const isConfigChange = Object.keys(changes).every(k => k.startsWith('settings_'));
    if (!isConfigChange) {
      loadAndRender();
    }
  });

  // Init
  await loadAndRender();
  await loadSettings();
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
