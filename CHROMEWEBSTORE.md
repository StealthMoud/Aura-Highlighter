# Chrome Web Store Metadata — Aura Highlighter

This document tracks all metadata, privacy disclosures, version history, and permission justifications required for the Chrome Web Store dashboard.

## Store Listing Metadata

- **Extension Name**: Aura Highlighter
- **Short Name**: Aura
- **Summary (Max 150 chars)**: Sleek, glassmorphic highlight management tool with contextual color controls and smart range persistence.
- **Detailed Description**:
  Aura Highlighter brings visual excellence and productivity together. Highlight text selections seamlessly on any webpage with a clean, high-performance contextual floating menu.
  
  Key Features:
  - **Premium UI**: Designed with glassmorphism, responsive spring animations, and structured dark-mode elements.
  - **Smart Selection Toolbar**: Contextual floating menu appears instantly upon text selection, offering immediate accent color selections (Indigo, Cyan, Green, Amber).
  - **Robust Range Persistence**: Highlights are serialized using parent block-level offsets, ensuring they persist and re-apply when reloading pages.
  - **Dynamic Highlights Dashboard**: Open the popup window to search, review, copy to clipboard, or scroll immediately back to highlights.

---

## Permissions Justification

Every permission listed in `manifest.json` is justified below for the review team:

| Permission / Host | Purpose | Justification |
|-------------------|---------|---------------|
| `storage` | Local state persistence | Used to save highlighted text offsets and colors indexed by URL, so user highlights remain preserved across page loads and browser restarts. |
| `tabs` | Active tab identification | Used in the popup window to query the current active tab's URL to load and filter highlights specific to that webpage. |
| `contextMenus` | Native right-click menu | Allows users to trigger text highlighting directly via the browser's native right-click context menu. |
| `http://*/*` & `https://*/*` | Page injection matches | Required to inject content scripts that handle selection listeners, draw floating color selectors, and restore saved highlight marks on visited sites. |

---

## Privacy & Data Use Disclosure

- **Data Collection**: None. Aura Highlighter executes completely locally inside the user's browser.
- **Local Storage**: Data is stored using `chrome.storage.local`.
- **Third-party Services**: No remote servers are contacted. No telemetry is collected.

---

## Version History

### Version 1.0.0 (2026-06-10)
- Initial release.
- Added floating color selectors on text selection.
- Implemented offset-based DOM range highlighting and storage.
- Added glassmorphic dashboard popup with search, copy, scroll-to, and clear page actions.
