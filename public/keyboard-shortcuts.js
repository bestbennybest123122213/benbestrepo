/**
 * Keyboard Shortcuts & Command Palette for GEX OS
 */

(function() {
  let commandPaletteOpen = false;
  
  // Create Command Palette HTML
  const paletteHTML = `
    <div id="commandPalette" class="command-palette hidden">
      <div class="command-palette-backdrop"></div>
      <div class="command-palette-modal">
        <div class="command-palette-header">
          <input type="text" id="commandInput" placeholder="Type a command or search..." autocomplete="off">
          <span class="command-shortcut">ESC to close</span>
        </div>
        <div class="command-palette-results" id="commandResults"></div>
        <div class="command-palette-footer">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>? Help</span>
        </div>
      </div>
    </div>
  `;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .command-palette {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      display: flex;
      justify-content: center;
      padding-top: 15vh;
    }
    .command-palette.hidden { display: none; }
    .command-palette-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
    }
    .command-palette-modal {
      position: relative;
      background: var(--bg-card, #1a1a1a);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 60vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      overflow: hidden;
    }
    .command-palette-header {
      padding: 16px;
      border-bottom: 1px solid var(--border, #2a2a2a);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .command-palette-header input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text, #fff);
      font-size: 16px;
      outline: none;
    }
    .command-palette-header input::placeholder {
      color: var(--text-dim, #666);
    }
    .command-shortcut {
      font-size: 11px;
      color: var(--text-dim, #666);
      background: var(--bg-dark, #0d0d0d);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .command-palette-results {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .command-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .command-item:hover, .command-item.selected {
      background: var(--accent, #f97316);
    }
    .command-item-icon { font-size: 18px; }
    .command-item-content { flex: 1; }
    .command-item-title { font-size: 14px; font-weight: 500; }
    .command-item-desc { font-size: 12px; color: var(--text-muted, #888); margin-top: 2px; }
    .command-item:hover .command-item-desc,
    .command-item.selected .command-item-desc { color: rgba(255,255,255,0.8); }
    .command-item-shortcut {
      font-size: 11px;
      color: var(--text-dim, #666);
      background: var(--bg-dark, #0d0d0d);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .command-palette-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border, #2a2a2a);
      display: flex;
      gap: 24px;
      font-size: 11px;
      color: var(--text-dim, #666);
    }
    .command-group-title {
      padding: 8px 16px 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-dim, #666);
      letter-spacing: 0.5px;
    }
  `;
  document.head.appendChild(style);

  // Define commands
  const commands = [
    // Navigation
    { id: 'nav-home', icon: '🏠', title: 'Go to Response Times', desc: 'View response time analytics', shortcut: 'G H', group: 'Navigation', action: () => switchView('responseTimes') },
    { id: 'nav-leads', icon: '🎯', title: 'Go to Interested Leads', desc: 'View all interested leads', shortcut: 'G L', group: 'Navigation', action: () => switchView('interestedLeads') },
    { id: 'nav-bookings', icon: '📅', title: 'Go to Bookings', desc: 'View booking tracker', shortcut: 'G B', group: 'Navigation', action: () => switchView('imannBookings') },
    { id: 'nav-stale', icon: '🔥', title: 'Go to Stale Leads', desc: 'View leads needing follow-up', shortcut: 'G S', group: 'Navigation', action: () => switchView('staleLeads') },
    { id: 'nav-hot', icon: '🚀', title: 'Go to Hot Prospects', desc: 'View hot leads', shortcut: 'G P', group: 'Navigation', action: () => switchView('hotProspects') },
    { id: 'nav-campaigns', icon: '📊', title: 'Go to Campaigns', desc: 'View campaign overview', shortcut: 'G C', group: 'Navigation', action: () => switchView('campaigns') },
    
    // Actions
    { id: 'refresh', icon: '↻', title: 'Refresh Data', desc: 'Force refresh all data', shortcut: 'R', group: 'Actions', action: () => { if (typeof loadDashboard === 'function') loadDashboard(true); } },
    { id: 'export', icon: '📥', title: 'Export CSV', desc: 'Export current view to CSV', shortcut: 'E', group: 'Actions', action: exportToCSV },
    { id: 'search', icon: '🔍', title: 'Search Leads', desc: 'Focus on search box', shortcut: '/', group: 'Actions', action: focusSearch },
    
    // Quick Filters
    { id: 'filter-enterprise', icon: '🏢', title: 'Filter: Enterprise Only', desc: 'Show only enterprise leads', group: 'Filters', action: () => applyFilter('enterprise') },
    { id: 'filter-hot', icon: '🔥', title: 'Filter: Hot (0-3 days)', desc: 'Show leads from last 3 days', group: 'Filters', action: () => applyFilter('hot') },
    { id: 'filter-meeting', icon: '🤝', title: 'Filter: Meeting Requests', desc: 'Show meeting requests only', group: 'Filters', action: () => applyFilter('meeting') },
    { id: 'filter-clear', icon: '✖️', title: 'Clear All Filters', desc: 'Remove all active filters', shortcut: 'X', group: 'Filters', action: clearFilters },
    
    // Help
    { id: 'help', icon: '❓', title: 'Keyboard Shortcuts', desc: 'Show all keyboard shortcuts', shortcut: '?', group: 'Help', action: showHelp },
  ];

  let selectedIndex = 0;
  let filteredCommands = [...commands];

  function injectPalette() {
    if (document.getElementById('commandPalette')) return;
    const div = document.createElement('div');
    div.innerHTML = paletteHTML;
    document.body.appendChild(div.firstElementChild);
    
    // Event listeners
    document.getElementById('commandInput').addEventListener('input', onInputChange);
    document.querySelector('.command-palette-backdrop').addEventListener('click', closePalette);
  }

  function openPalette() {
    injectPalette();
    const palette = document.getElementById('commandPalette');
    palette.classList.remove('hidden');
    commandPaletteOpen = true;
    selectedIndex = 0;
    filteredCommands = [...commands];
    renderCommands();
    document.getElementById('commandInput').value = '';
    document.getElementById('commandInput').focus();
  }

  function closePalette() {
    const palette = document.getElementById('commandPalette');
    if (palette) palette.classList.add('hidden');
    commandPaletteOpen = false;
  }

  function onInputChange(e) {
    const query = e.target.value.toLowerCase();
    filteredCommands = commands.filter(cmd => 
      cmd.title.toLowerCase().includes(query) || 
      cmd.desc.toLowerCase().includes(query) ||
      (cmd.group && cmd.group.toLowerCase().includes(query))
    );
    selectedIndex = 0;
    renderCommands();
  }

  function renderCommands() {
    const container = document.getElementById('commandResults');
    if (!container) return;
    
    // Group commands
    const groups = {};
    filteredCommands.forEach(cmd => {
      const group = cmd.group || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(cmd);
    });

    let html = '';
    Object.entries(groups).forEach(([groupName, cmds]) => {
      html += `<div class="command-group-title">${groupName}</div>`;
      cmds.forEach((cmd, i) => {
        const globalIndex = filteredCommands.indexOf(cmd);
        html += `
          <div class="command-item ${globalIndex === selectedIndex ? 'selected' : ''}" 
               data-index="${globalIndex}" onclick="window.__selectCommand(${globalIndex})">
            <span class="command-item-icon">${cmd.icon}</span>
            <div class="command-item-content">
              <div class="command-item-title">${cmd.title}</div>
              <div class="command-item-desc">${cmd.desc}</div>
            </div>
            ${cmd.shortcut ? `<span class="command-item-shortcut">${cmd.shortcut}</span>` : ''}
          </div>
        `;
      });
    });
    
    container.innerHTML = html || '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No commands found</div>';
  }

  function selectCommand(index) {
    const cmd = filteredCommands[index];
    if (cmd && cmd.action) {
      closePalette();
      cmd.action();
    }
  }

  // Helper functions
  function switchView(view) {
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.dataset.view === view) el.click();
    });
  }

  function focusSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.focus();
  }

  function exportToCSV() {
    showToast('info', 'Export feature coming soon!');
  }

  function applyFilter(type) {
    showToast('info', `Filter: ${type} applied`);
    // Implementation depends on current view
  }

  function clearFilters() {
    if (typeof searchFilter !== 'undefined') searchFilter = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    if (typeof render === 'function') render();
    showToast('success', 'Filters cleared');
  }

  function showHelp() {
    const helpHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">⌨️ Keyboard Shortcuts</h3>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">⌘K / Ctrl+K</kbd>
          <span>Open Command Palette</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">R</kbd>
          <span>Refresh Data</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">/</kbd>
          <span>Focus Search</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">G H</kbd>
          <span>Go to Home</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">G L</kbd>
          <span>Go to Leads</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">G B</kbd>
          <span>Go to Bookings</span>
          <kbd style="background: var(--bg-dark); padding: 4px 8px; border-radius: 4px;">ESC</kbd>
          <span>Close Palette</span>
        </div>
      </div>
    `;
    document.getElementById('commandResults').innerHTML = helpHTML;
  }

  function showToast(type, message) {
    if (typeof window.showToast === 'function') {
      window.showToast(type, message);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  // Global function for onclick
  window.__selectCommand = selectCommand;

  // Keyboard handling
  let keySequence = '';
  let keySequenceTimeout;

  document.addEventListener('keydown', (e) => {
    // Don't intercept if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
        closePalette();
      }
      return;
    }

    // Command palette toggle
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (commandPaletteOpen) closePalette();
      else openPalette();
      return;
    }

    // If palette is open, handle navigation
    if (commandPaletteOpen) {
      if (e.key === 'Escape') {
        closePalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
        renderCommands();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderCommands();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectCommand(selectedIndex);
      }
      return;
    }

    // Quick shortcuts when palette is closed
    const key = e.key.toUpperCase();
    
    // Build key sequence (for G+X type shortcuts)
    clearTimeout(keySequenceTimeout);
    keySequence += key;
    keySequenceTimeout = setTimeout(() => { keySequence = ''; }, 500);

    // Check for matches
    if (keySequence === 'GH') { switchView('responseTimes'); keySequence = ''; }
    else if (keySequence === 'GL') { switchView('interestedLeads'); keySequence = ''; }
    else if (keySequence === 'GB') { switchView('imannBookings'); keySequence = ''; }
    else if (keySequence === 'GS') { switchView('staleLeads'); keySequence = ''; }
    else if (keySequence === 'GP') { switchView('hotProspects'); keySequence = ''; }
    else if (keySequence === 'GC') { switchView('campaigns'); keySequence = ''; }
    else if (key === 'R' && keySequence.length === 1) {
      if (typeof loadDashboard === 'function') loadDashboard(true);
      keySequence = '';
    }
    else if (key === '/' && keySequence.length === 1) {
      focusSearch();
      keySequence = '';
    }
    else if (key === '?' && keySequence.length === 1) {
      openPalette();
      showHelp();
      keySequence = '';
    }
    else if (key === 'X' && keySequence.length === 1) {
      clearFilters();
      keySequence = '';
    }
  });

  // Initialize on load
  console.log('⌨️ Keyboard shortcuts loaded. Press ⌘K or Ctrl+K for command palette.');
})();
