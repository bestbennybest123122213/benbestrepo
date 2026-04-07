/**
 * Enhanced Filtering UI
 * Multi-filter support with presets and saved filters
 */

(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* Filter Bar */
    .filter-bar {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .filter-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }
    
    .filter-select {
      background: var(--bg-dark);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      min-width: 120px;
    }
    .filter-select:focus {
      outline: none;
      border-color: var(--accent);
    }
    
    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--accent);
      color: white;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 500;
    }
    .filter-chip-remove {
      cursor: pointer;
      opacity: 0.7;
    }
    .filter-chip-remove:hover {
      opacity: 1;
    }
    
    .filter-presets {
      display: flex;
      gap: 6px;
    }
    
    .filter-preset {
      padding: 4px 10px;
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 16px;
      font-size: 11px;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.1s;
    }
    .filter-preset:hover {
      background: var(--bg-card-hover);
      color: var(--text);
    }
    .filter-preset.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }
    
    .filter-spacer {
      flex: 1;
    }
    
    .filter-count {
      font-size: 12px;
      color: var(--text-muted);
    }
    
    /* Active Filters Display */
    .active-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
  `;
  document.head.appendChild(style);

  // Filter state
  let activeFilters = {
    category: 'all',
    age: 'all',
    tier: 'all',
    status: 'all'
  };

  const presets = {
    hot: { age: 'hot', category: 'all', tier: 'all', status: 'pending' },
    enterprise: { tier: 'enterprise', category: 'all', age: 'all', status: 'all' },
    meetings: { category: 'Meeting Request', age: 'all', tier: 'all', status: 'all' },
    stale: { age: 'stale', category: 'all', tier: 'all', status: 'all' },
    all: { category: 'all', age: 'all', tier: 'all', status: 'all' }
  };

  // Create filter bar HTML
  function createFilterBar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const filterHTML = `
      <div class="filter-bar" id="filterBar">
        <div class="filter-group">
          <span class="filter-label">Category:</span>
          <select class="filter-select" id="filterCategory" onchange="window.__applyFilter('category', this.value)">
            <option value="all">All</option>
            <option value="Meeting Request">Meeting Requests</option>
            <option value="Interested">Interested</option>
            <option value="Information Request">Info Requests</option>
            <option value="Booked">Booked</option>
          </select>
        </div>
        
        <div class="filter-group">
          <span class="filter-label">Age:</span>
          <select class="filter-select" id="filterAge" onchange="window.__applyFilter('age', this.value)">
            <option value="all">All</option>
            <option value="hot">Hot (0-3d)</option>
            <option value="warm">Warm (4-7d)</option>
            <option value="cool">Cool (8-14d)</option>
            <option value="stale">Stale (15+d)</option>
          </select>
        </div>
        
        <div class="filter-group">
          <span class="filter-label">Tier:</span>
          <select class="filter-select" id="filterTier" onchange="window.__applyFilter('tier', this.value)">
            <option value="all">All</option>
            <option value="enterprise">Enterprise</option>
            <option value="mid-market">Mid-Market</option>
            <option value="smb">SMB</option>
          </select>
        </div>
        
        <div class="filter-presets">
          <button class="filter-preset active" data-preset="all" onclick="window.__applyPreset('all')">All</button>
          <button class="filter-preset" data-preset="hot" onclick="window.__applyPreset('hot')">🔥 Hot</button>
          <button class="filter-preset" data-preset="enterprise" onclick="window.__applyPreset('enterprise')">🏢 Enterprise</button>
          <button class="filter-preset" data-preset="meetings" onclick="window.__applyPreset('meetings')">📅 Meetings</button>
          <button class="filter-preset" data-preset="stale" onclick="window.__applyPreset('stale')">⏰ Stale</button>
        </div>
        
        <div class="filter-spacer"></div>
        
        <span class="filter-count" id="filterCount">Showing all leads</span>
      </div>
      <div class="active-filters" id="activeFilters"></div>
    `;

    container.insertAdjacentHTML('afterbegin', filterHTML);
  }

  window.__applyFilter = function(key, value) {
    activeFilters[key] = value;
    updateUI();
    triggerFilter();
  };

  window.__applyPreset = function(presetName) {
    activeFilters = { ...presets[presetName] };
    
    // Update select boxes
    document.getElementById('filterCategory').value = activeFilters.category;
    document.getElementById('filterAge').value = activeFilters.age;
    document.getElementById('filterTier').value = activeFilters.tier;
    
    // Update preset buttons
    document.querySelectorAll('.filter-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetName);
    });
    
    updateUI();
    triggerFilter();
  };

  function updateUI() {
    // Update active filters display
    const chips = [];
    if (activeFilters.category !== 'all') {
      chips.push(`Category: ${activeFilters.category}`);
    }
    if (activeFilters.age !== 'all') {
      chips.push(`Age: ${activeFilters.age}`);
    }
    if (activeFilters.tier !== 'all') {
      chips.push(`Tier: ${activeFilters.tier}`);
    }
    
    const container = document.getElementById('activeFilters');
    if (container) {
      container.innerHTML = chips.map(c => 
        `<span class="filter-chip">${c} <span class="filter-chip-remove" onclick="window.__clearFilter('${c.split(':')[0].toLowerCase()}')">×</span></span>`
      ).join('');
    }
  }

  window.__clearFilter = function(key) {
    activeFilters[key] = 'all';
    const selectId = 'filter' + key.charAt(0).toUpperCase() + key.slice(1);
    const select = document.getElementById(selectId);
    if (select) select.value = 'all';
    updateUI();
    triggerFilter();
  };

  function triggerFilter() {
    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('gex-filter-change', { detail: activeFilters });
    document.dispatchEvent(event);
    
    // If global filter function exists, call it
    if (typeof window.applyFilters === 'function') {
      window.applyFilters(activeFilters);
    }
  }

  // Export for external use
  window.gexFilters = {
    create: createFilterBar,
    apply: window.__applyFilter,
    preset: window.__applyPreset,
    getActive: () => ({ ...activeFilters }),
    reset: () => window.__applyPreset('all')
  };

  console.log('🎛️ Filter system initialized');
})();
