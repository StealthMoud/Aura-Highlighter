// Controller logic for Aura Highlights popup
// Interacts with local storage, active tab scripts, and clipboard

document.addEventListener('DOMContentLoaded', async () => {
  let tab = null;
  try {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = t;
  } catch (e) {
    console.warn("Failed to query active tab:", e);
  }
  
  const url = (tab && tab.url) ? tab.url.split('#')[0] : '';
  let highlights = [];

  // DOM references
  const countEl = document.getElementById('highlight-count');
  const searchInput = document.getElementById('search-input');
  const emptyState = document.getElementById('empty-state');
  const listEl = document.getElementById('highlights-list');
  const clearAllBtn = document.getElementById('clear-all-btn');

  // Settings DOM references
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const trashToggleBtn = document.getElementById('trash-toggle-btn');
  const dashboardView = document.getElementById('dashboard-view');
  const settingsView = document.getElementById('settings-view');
  const trashView = document.getElementById('trash-view');
  const trashList = document.getElementById('trash-list');
  const trashEmptyState = document.getElementById('trash-empty-state');
  const emptyTrashBtn = document.getElementById('empty-trash-btn');

  const toggleToolbar = document.getElementById('toggle-toolbar');
  const toggleAutoHighlight = document.getElementById('toggle-autohighlight');
  const toggleShortcuts = document.getElementById('toggle-shortcuts');
  const toggleAutodelete = document.getElementById('toggle-autodelete');
  const autodeleteDuration = document.getElementById('autodelete-duration');
  const autodeleteDurationContainer = document.getElementById('autodelete-duration-container');
  const colorChoiceBtns = document.querySelectorAll('.color-choice-btn');

  // Unified View Switcher
  function showView(viewName) {
    dashboardView.classList.remove('active');
    settingsView.classList.remove('active');
    trashView.classList.remove('active');
    
    settingsToggleBtn.classList.remove('active');
    trashToggleBtn.classList.remove('active');
    
    if (viewName === 'dashboard') {
      dashboardView.classList.add('active');
      settingsToggleBtn.title = "Settings";
      trashToggleBtn.title = "Recycle Bin";
      loadAndRender(); // Reload dashboard highlights
    } else if (viewName === 'settings') {
      settingsView.classList.add('active');
      settingsToggleBtn.classList.add('active');
      settingsToggleBtn.title = "Back to list";
      trashToggleBtn.title = "Recycle Bin";
    } else if (viewName === 'trash') {
      trashView.classList.add('active');
      trashToggleBtn.classList.add('active');
      trashToggleBtn.title = "Back to list";
      settingsToggleBtn.title = "Settings";
      renderTrashList(); // Render recently deleted items
    }
  }

  // Toggle View Panels
  settingsToggleBtn.addEventListener('click', () => {
    if (settingsView.classList.contains('active')) {
      showView('dashboard');
    } else {
      showView('settings');
    }
  });

  trashToggleBtn.addEventListener('click', () => {
    if (trashView.classList.contains('active')) {
      showView('dashboard');
    } else {
      showView('trash');
    }
  });

  // Load and apply settings
  async function loadSettings() {
    const {
      settings_toolbar_enabled = true,
      settings_auto_highlight = false,
      settings_shortcuts_enabled = true,
      settings_default_color = 'indigo',
      settings_auto_delete_enabled = false,
      settings_auto_delete_duration = '86400000'
    } = await chrome.storage.local.get([
      'settings_toolbar_enabled',
      'settings_auto_highlight',
      'settings_shortcuts_enabled',
      'settings_default_color',
      'settings_auto_delete_enabled',
      'settings_auto_delete_duration'
    ]);

    toggleToolbar.checked = settings_toolbar_enabled;
    toggleAutoHighlight.checked = settings_auto_highlight;
    toggleShortcuts.checked = settings_shortcuts_enabled;
    toggleAutodelete.checked = settings_auto_delete_enabled;
    autodeleteDuration.value = settings_auto_delete_duration;

    if (settings_auto_delete_enabled) {
      autodeleteDurationContainer.style.display = 'flex';
    } else {
      autodeleteDurationContainer.style.display = 'none';
    }

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
    const autoHighlightEnabled = toggleAutoHighlight.checked;
    if (autoHighlightEnabled) {
      toggleToolbar.checked = false;
      await chrome.storage.local.set({
        settings_auto_highlight: true,
        settings_toolbar_enabled: false
      });
    } else {
      await chrome.storage.local.set({ settings_auto_highlight: false });
    }
  });

  toggleShortcuts.addEventListener('change', async () => {
    await chrome.storage.local.set({ settings_shortcuts_enabled: toggleShortcuts.checked });
  });

  toggleAutodelete.addEventListener('change', async () => {
    const enabled = toggleAutodelete.checked;
    await chrome.storage.local.set({ settings_auto_delete_enabled: enabled });
    if (enabled) {
      if (autodeleteDuration.value === 'never') {
        autodeleteDuration.value = '86400000';
        await chrome.storage.local.set({ settings_auto_delete_duration: '86400000' });
      }
      autodeleteDurationContainer.style.display = 'flex';
    } else {
      autodeleteDurationContainer.style.display = 'none';
    }
    try {
      await chrome.runtime.sendMessage({ action: "cleanup-expired" });
    } catch (err) {}
  });

  autodeleteDuration.addEventListener('change', async () => {
    const value = autodeleteDuration.value;
    if (value === 'never') {
      toggleAutodelete.checked = false;
      autodeleteDurationContainer.style.display = 'none';
      await chrome.storage.local.set({
        settings_auto_delete_enabled: false,
        settings_auto_delete_duration: 'never'
      });
    } else {
      await chrome.storage.local.set({ settings_auto_delete_duration: value });
    }
    try {
      await chrome.runtime.sendMessage({ action: "cleanup-expired" });
    } catch (err) {}
  });

  colorChoiceBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      colorChoiceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const color = btn.getAttribute('data-color');
      await chrome.storage.local.set({ settings_default_color: color });
    });
  });

  // Clear Vault Reset
  const clearVaultBtn = document.getElementById('clear-vault-btn');
  clearVaultBtn.addEventListener('click', async () => {
    if (await showConfirmModal("Are you sure you want to permanently delete ALL highlights across all domains? This cannot be undone.", true)) {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter(key => !key.startsWith('settings_'));
      
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab && activeTab.id) {
          keysToRemove.forEach(urlKey => {
            if (activeTab.url && activeTab.url.split('#')[0] === urlKey.split('#')[0]) {
              chrome.tabs.sendMessage(activeTab.id, { action: "clear-page-highlights" });
            }
          });
        }
      } catch (e) {}

      await chrome.storage.local.remove(keysToRemove);
      await loadAndRender();
      
      // Auto toggle back to list view
      settingsToggleBtn.click();
    }
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
      if (!key.startsWith('settings_') && key !== 'aura_trash' && Array.isArray(allData[key])) {
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
            <button class="icon-btn delete-domain-btn" title="Delete all highlights on ${domain}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
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

      const deleteDomainBtn = domainCard.querySelector('.delete-domain-btn');
      deleteDomainBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await showConfirmModal(`Are you sure you want to move all highlights on ${domain} to trash?`, false)) {
          const allData = await chrome.storage.local.get(null);
          const urlsToRemove = Object.keys(allData).filter(key => {
            if (key.startsWith('settings_') || key === 'aura_trash') return false;
            try {
              const hostname = new URL(key).hostname.replace('www.', '');
              return hostname === domain;
            } catch (err) {
              return false;
            }
          });

          // Move deleted highlights to trash list
          const deletedHighlights = [];
          urlsToRemove.forEach(urlKey => {
            if (Array.isArray(allData[urlKey])) {
              deletedHighlights.push(...allData[urlKey]);
            }
          });

          if (deletedHighlights.length > 0) {
            const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
            const now = Date.now();
            deletedHighlights.forEach(item => {
              item.deletedAt = now;
              aura_trash.push(item);
            });
            await chrome.storage.local.set({ aura_trash });
          }

          try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (activeTab && activeTab.id && activeTab.url) {
              const activeUrl = activeTab.url.split('#')[0];
              if (urlsToRemove.includes(activeUrl)) {
                chrome.tabs.sendMessage(activeTab.id, { action: "clear-page-highlights" });
              }
            }
          } catch (err) {}

          await chrome.storage.local.remove(urlsToRemove);
          await loadAndRender();
        }
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
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
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
          const target = pageHighlights.find(item => item.id === h.id);
          const updated = pageHighlights.filter(item => item.id !== h.id);
          
          if (updated.length > 0) {
            await chrome.storage.local.set({ [targetUrl]: updated });
          } else {
            await chrome.storage.local.remove(targetUrl);
          }

          if (target) {
            const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
            target.deletedAt = Date.now();
            aura_trash.push(target);
            await chrome.storage.local.set({ aura_trash });
          }

          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTab && activeTab.url && activeTab.url.split('#')[0] === targetUrl) {
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
    if (activeHighlights.length > 0) {
      const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
      const now = Date.now();
      activeHighlights.forEach(h => {
        h.deletedAt = now;
        aura_trash.push(h);
      });
      await chrome.storage.local.set({ aura_trash });
    }
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

  // Empty Trash action handler
  emptyTrashBtn.addEventListener('click', async () => {
    if (await showConfirmModal("Are you sure you want to permanently empty the Recycle Bin? All trashed highlights will be erased forever.", true)) {
      await chrome.storage.local.remove('aura_trash');
      await renderTrashList();
    }
  });

  async function renderTrashList() {
    const { aura_trash = [] } = await chrome.storage.local.get('aura_trash');
    trashList.innerHTML = '';
    
    if (aura_trash.length === 0) {
      trashEmptyState.style.display = 'flex';
      trashList.style.display = 'none';
      return;
    }
    
    trashEmptyState.style.display = 'none';
    trashList.style.display = 'flex';
    
    // Sort recently deleted descending
    aura_trash.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    
    aura_trash.forEach(h => {
      const card = document.createElement('div');
      card.className = 'highlight-card';
      card.setAttribute('data-id', h.id);
      
      const domain = extractHostname(h.url);
      const remainingTimeDesc = formatDeletedTime(h.deletedAt);
      
      card.innerHTML = `
        <div class="highlight-header">
          <span class="color-indicator color-${h.color}"></span>
          <span class="highlight-time">Deletes in ${remainingTimeDesc}</span>
        </div>
        <div class="highlight-page-title" title="${escapeHtml(h.pageTitle)}">${escapeHtml(h.pageTitle)} (${domain})</div>
        <div class="highlight-body" title="${escapeHtml(h.text)}">${escapeHtml(h.text)}</div>
        <div class="card-actions">
          <button class="icon-btn restore-btn" title="Restore highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
          <button class="icon-btn delete-btn delete-perm-btn" title="Delete permanently">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
      
      // Restore action handler
      card.querySelector('.restore-btn').addEventListener('click', async () => {
        const currentTrashData = await chrome.storage.local.get('aura_trash');
        const currentTrash = currentTrashData.aura_trash || [];
        const targetHighlight = currentTrash.find(item => item.id === h.id);
        const updatedTrash = currentTrash.filter(item => item.id !== h.id);
        await chrome.storage.local.set({ aura_trash: updatedTrash });
        
        if (targetHighlight) {
          const targetUrl = targetHighlight.url.split('#')[0];
          const pageData = await chrome.storage.local.get(targetUrl);
          const pageHighlights = pageData[targetUrl] || [];
          
          delete targetHighlight.deletedAt;
          pageHighlights.push(targetHighlight);
          await chrome.storage.local.set({ [targetUrl]: pageHighlights });
          
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (activeTab && activeTab.url && activeTab.url.split('#')[0] === targetUrl) {
              chrome.tabs.sendMessage(activeTab.id, { action: "restore-highlight", highlight: targetHighlight });
            }
          } catch (e) {}
        }
        
        await renderTrashList();
      });
      
      // Delete Permanently action handler
      card.querySelector('.delete-perm-btn').addEventListener('click', async () => {
        if (await showConfirmModal("Are you sure you want to permanently delete this highlight?", true)) {
          const currentTrashData = await chrome.storage.local.get('aura_trash');
          const currentTrash = currentTrashData.aura_trash || [];
          const updatedTrash = currentTrash.filter(item => item.id !== h.id);
          await chrome.storage.local.set({ aura_trash: updatedTrash });
          await renderTrashList();
        }
      });
      
      trashList.appendChild(card);
    });
  }

  function formatDeletedTime(timestamp) {
    if (!timestamp) return '30d';
    const thirtyDaysMs = 2592000000;
    const elapsed = Date.now() - timestamp;
    const remainingMs = thirtyDaysMs - elapsed;
    
    if (remainingMs <= 0) return '0m';
    
    const mins = Math.floor(remainingMs / 60000);
    if (mins < 60) {
      return `${mins}m`;
    }
    
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      return `${hrs}h`;
    }
    
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  function showConfirmModal(message, isDanger = false) {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-confirm-modal');
      const messageEl = document.getElementById('custom-confirm-message');
      const okBtn = document.getElementById('custom-confirm-ok');
      const cancelBtn = document.getElementById('custom-confirm-cancel');
      
      messageEl.textContent = message;
      
      if (isDanger) {
        okBtn.className = 'modal-btn danger-confirm-btn';
        okBtn.textContent = 'Delete';
      } else {
        okBtn.className = 'modal-btn primary-confirm-btn';
        okBtn.textContent = 'Confirm';
      }
      
      modal.classList.add('active');
      
      function handleOk() {
        cleanup();
        resolve(true);
      }
      
      function handleCancel() {
        cleanup();
        resolve(false);
      }
      
      function cleanup() {
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.classList.remove('active');
      }
      
      okBtn.addEventListener('click', handleOk);
      cancelBtn.addEventListener('click', handleCancel);
    });
  }

  // Init
  try {
    await chrome.runtime.sendMessage({ action: "cleanup-expired" });
  } catch (err) {}
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
