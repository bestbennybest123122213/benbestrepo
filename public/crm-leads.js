// =============================================
// CRM LEAD TRACKER - Full-Featured Implementation
// Location: Integrated into BULL OS Interested Leads tab
// =============================================

// Ensure showToast is available (fallback if not defined globally)
if (typeof showToast === 'undefined') {
  window.showToast = function(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };
}

// ========== STATE MANAGEMENT ==========
const CRM = {
  // Data
  leads: [],
  filteredLeads: [],
  hiddenRows: new Set(),
  hiddenColumns: new Set(),
  
  // Sort state
  sortColumn: 'date_first_response',
  sortDirection: 'asc', // Default: oldest first
  
  // Undo/Redo
  undoStack: [],
  redoStack: [],
  MAX_UNDO: 50,
  
  // UI State
  searchQuery: '',
  isLoading: false,
  
  // Realtime
  realtimeChannel: null,
  
  // Initialize
  async init() {
    this.loadHiddenColumns();
    await this.loadLeads();
    this.setupRealtimeSubscription();
    this.setupKeyboardShortcuts();
    this.render();
  }
};

// ========== DATA LOADING ==========
CRM.loadLeads = async function() {
  this.isLoading = true;
  this.renderLoadingState();
  
  try {
    const res = await fetch('/api/response-times/stats?days=365&showAll=true&skipDedup=true');
    const data = await res.json();
    
    if (data.error) throw new Error(data.error);
    
    this.leads = (data.leads || []).map(l => ({
      ...l,
      domain: l.email ? l.email.split('@')[1] : null,
      date_first_response: l.lead_response // Alias for sorting
    }));
    
    // Apply default sort
    this.sortColumn = 'date_first_response';
    this.sortDirection = 'asc';
    this.applySort();
    
  } catch (err) {
    console.error('Failed to load leads:', err);
    showToast('Failed to load leads: ' + err.message, 'error');
  } finally {
    this.isLoading = false;
  }
};

// ========== REALTIME SUBSCRIPTION ==========
CRM.setupRealtimeSubscription = function() {
  // Check if Supabase client is available
  if (typeof supabase === 'undefined') {
    console.log('[CRM] Supabase client not available for realtime');
    return;
  }
  
  try {
    this.realtimeChannel = supabase
      .channel('curated_leads_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'curated_leads' },
        (payload) => this.handleRealtimeChange(payload)
      )
      .subscribe();
    
    console.log('[CRM] Realtime subscription active');
  } catch (err) {
    console.log('[CRM] Realtime not available:', err.message);
  }
};

CRM.handleRealtimeChange = function(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  
  if (eventType === 'INSERT') {
    // Check if lead already exists (avoid duplicates)
    if (!this.leads.find(l => l.id === newRow.id)) {
      const lead = { ...newRow, domain: newRow.email?.split('@')[1] || null };
      this.leads.push(lead);
      this.applySort();
      this.render();
      showToast('New lead added (synced)', 'info');
    }
  } else if (eventType === 'UPDATE') {
    const idx = this.leads.findIndex(l => l.id === newRow.id);
    if (idx !== -1) {
      this.leads[idx] = { ...newRow, domain: newRow.email?.split('@')[1] || null };
      this.render();
    }
  } else if (eventType === 'DELETE') {
    this.leads = this.leads.filter(l => l.id !== oldRow.id);
    this.render();
    showToast('Lead deleted (synced)', 'info');
  }
};

// ========== SORTING ==========
CRM.applySort = function() {
  const col = this.sortColumn;
  const dir = this.sortDirection;
  
  this.leads.sort((a, b) => {
    let aVal = a[col];
    let bVal = b[col];
    
    // Handle nulls
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    // Handle dates
    if (col.includes('date') || col.includes('response') || col.includes('time')) {
      aVal = new Date(aVal).getTime() || 0;
      bVal = new Date(bVal).getTime() || 0;
    }
    
    // Handle strings
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (aVal < bVal) return dir === 'asc' ? -1 : 1;
    if (aVal > bVal) return dir === 'asc' ? 1 : -1;
    return 0;
  });
};

CRM.setSort = function(column) {
  if (this.sortColumn === column) {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    this.sortColumn = column;
    this.sortDirection = 'asc';
  }
  this.applySort();
  this.render();
};

// ========== FILTERING ==========
CRM.setSearch = function(query) {
  this.searchQuery = query.toLowerCase();
  // Don't re-render - just filter existing rows for better UX (keeps focus)
  this.filterRowsInPlace();
};

// Filter rows without re-rendering the whole table (preserves search input focus)
CRM.filterRowsInPlace = function() {
  const tbody = document.getElementById('crmTableBody');
  if (!tbody) {
    // Fallback to full render if table not yet built
    this.render();
    return;
  }
  
  const rows = tbody.querySelectorAll('tr');
  const q = this.searchQuery;
  let visibleCount = 0;
  
  rows.forEach(row => {
    if (row.classList.contains('crm-new-row')) return; // Skip new lead row
    
    const leadId = parseInt(row.getAttribute('data-id'), 10);
    const lead = this.leads.find(l => l.id === leadId);
    if (!lead) return;
    
    // Check if hidden
    if (this.hiddenRows.has(leadId)) {
      row.style.display = 'none';
      return;
    }
    
    // Check search match
    let matches = true;
    if (q) {
      matches = (lead.email || '').toLowerCase().includes(q) ||
        (lead.company || '').toLowerCase().includes(q) ||
        (lead.name || '').toLowerCase().includes(q) ||
        (lead.domain || '').toLowerCase().includes(q) ||
        (lead.notes || '').toLowerCase().includes(q);
    }
    
    row.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  
  // Update visible count in summary
  const summaryText = document.querySelector('.crm-summary span[style*="text-dim"]');
  if (summaryText) {
    summaryText.innerHTML = `Sorted: ${this.sortColumn} ${this.sortDirection.toUpperCase()} | ${visibleCount} visible`;
  }
};

CRM.getFilteredLeads = function() {
  let leads = this.leads.filter(l => !this.hiddenRows.has(l.id));
  
  if (this.searchQuery) {
    const q = this.searchQuery;
    leads = leads.filter(l => 
      (l.email || '').toLowerCase().includes(q) ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.name || '').toLowerCase().includes(q) ||
      (l.domain || '').toLowerCase().includes(q) ||
      (l.notes || '').toLowerCase().includes(q)
    );
  }
  
  return leads;
};

// ========== UNDO/REDO ==========
CRM.pushUndo = function(action) {
  this.undoStack.push(action);
  if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
  this.redoStack = []; // Clear redo stack on new action
};

CRM.undo = async function() {
  if (this.undoStack.length === 0) {
    showToast('Nothing to undo', 'info');
    return;
  }
  
  const action = this.undoStack.pop();
  
  try {
    if (action.type === 'edit') {
      await fetch('/api/curated-leads/' + action.leadId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [action.field]: action.oldValue })
      });
      
      const lead = this.leads.find(l => l.id === action.leadId);
      if (lead) lead[action.field] = action.oldValue;
      
      this.redoStack.push({
        ...action,
        oldValue: action.newValue,
        newValue: action.oldValue
      });
      
      this.render();
      showToast('Undone: ' + action.field, 'success');
      
    } else if (action.type === 'create') {
      await fetch('/api/curated-leads/' + action.leadId, { method: 'DELETE' });
      this.leads = this.leads.filter(l => l.id !== action.leadId);
      this.redoStack.push(action);
      this.render();
      showToast('Undone: lead removed', 'success');
      
    } else if (action.type === 'delete') {
      const res = await fetch('/api/curated-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.lead)
      });
      const result = await res.json();
      
      if (result.lead) {
        // Restore at original position
        this.leads.splice(action.position, 0, result.lead);
        this.redoStack.push({ ...action, leadId: result.lead.id });
      }
      
      this.render();
      showToast('Undone: lead restored', 'success');
    }
  } catch (err) {
    showToast('Undo failed: ' + err.message, 'error');
    this.undoStack.push(action); // Put it back
  }
};

CRM.redo = async function() {
  if (this.redoStack.length === 0) {
    showToast('Nothing to redo', 'info');
    return;
  }
  
  const action = this.redoStack.pop();
  
  try {
    if (action.type === 'edit') {
      await fetch('/api/curated-leads/' + action.leadId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [action.field]: action.newValue })
      });
      
      const lead = this.leads.find(l => l.id === action.leadId);
      if (lead) lead[action.field] = action.newValue;
      
      this.undoStack.push({
        ...action,
        oldValue: action.newValue,
        newValue: action.oldValue
      });
      
      this.render();
      showToast('Redone: ' + action.field, 'success');
      
    } else if (action.type === 'create') {
      const res = await fetch('/api/curated-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.lead)
      });
      const result = await res.json();
      
      if (result.lead) {
        this.leads.push(result.lead);
        this.undoStack.push({ ...action, leadId: result.lead.id });
        this.applySort();
      }
      
      this.render();
      showToast('Redone: lead created', 'success');
      
    } else if (action.type === 'delete') {
      await fetch('/api/curated-leads/' + action.leadId, { method: 'DELETE' });
      this.leads = this.leads.filter(l => l.id !== action.leadId);
      this.undoStack.push(action);
      this.render();
      showToast('Redone: lead deleted', 'success');
    }
  } catch (err) {
    showToast('Redo failed: ' + err.message, 'error');
    this.redoStack.push(action);
  }
};

// ========== KEYBOARD SHORTCUTS ==========
CRM.setupKeyboardShortcuts = function() {
  document.addEventListener('keydown', (e) => {
    // Only handle when CRM is active
    if (typeof currentView !== 'undefined' && currentView !== 'interestedLeads') return;
    
    // Ctrl+Z = Undo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      CRM.undo();
    }
    
    // Ctrl+Shift+Z = Redo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      CRM.redo();
    }
    
    // Ctrl+N = New lead (if not in input)
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !e.shiftKey) {
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        CRM.showNewLeadRow();
      }
    }
  });
};

// ========== COLUMN VISIBILITY ==========
CRM.loadHiddenColumns = function() {
  try {
    const saved = localStorage.getItem('crm_hidden_columns');
    this.hiddenColumns = saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    this.hiddenColumns = new Set();
  }
};

CRM.saveHiddenColumns = function() {
  localStorage.setItem('crm_hidden_columns', JSON.stringify([...this.hiddenColumns]));
};

CRM.toggleColumn = function(colId) {
  if (this.hiddenColumns.has(colId)) {
    this.hiddenColumns.delete(colId);
  } else {
    this.hiddenColumns.add(colId);
  }
  this.saveHiddenColumns();
  this.render();
};

CRM.isColumnVisible = function(colId) {
  return !this.hiddenColumns.has(colId);
};

// ========== ROW OPERATIONS ==========
CRM.hideRow = function(leadId) {
  this.hiddenRows.add(leadId);
  this.render();
};

CRM.unhideRow = function(leadId) {
  this.hiddenRows.delete(leadId);
  this.render();
};

CRM.getHiddenRowsNearPosition = function(position) {
  // Returns hidden rows that were originally near this position
  const visibleLeads = this.getFilteredLeads();
  const hiddenLeads = this.leads.filter(l => this.hiddenRows.has(l.id));
  return hiddenLeads;
};

// ========== CELL EDITING ==========
CRM.editCell = function(td, leadId, field, inputType = 'text') {
  if (td.querySelector('input, select')) return; // Already editing
  
  const lead = this.leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const currentValue = lead[field] || '';
  const originalHtml = td.innerHTML;
  
  td.classList.add('editing');
  
  if (inputType === 'text') {
    td.innerHTML = `<input type="text" class="crm-edit-input" value="${this.escapeHtml(currentValue)}">`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
    
    const save = () => this.saveCell(td, leadId, field, input.value, currentValue, originalHtml);
    const cancel = () => { td.innerHTML = originalHtml; td.classList.remove('editing'); };
    
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { cancel(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        input.blur();
        setTimeout(() => this.navigateCell(td, e.shiftKey), 50);
      }
    });
  }
};

CRM.editCellSelect = function(td, leadId, field, options, includeEmpty = true) {
  if (td.querySelector('select')) return;
  
  const lead = this.leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const currentValue = lead[field] || '';
  const originalHtml = td.innerHTML;
  
  td.classList.add('editing');
  
  let optionsHtml = includeEmpty ? '<option value="">—</option>' : '';
  optionsHtml += options.map(opt => 
    `<option value="${opt}" ${opt === currentValue ? 'selected' : ''}>${opt}</option>`
  ).join('');
  
  td.innerHTML = `<select class="crm-edit-select">${optionsHtml}</select>`;
  const select = td.querySelector('select');
  select.focus();
  
  const save = () => {
    const newValue = select.value || null;
    this.saveCell(td, leadId, field, newValue, currentValue || null, originalHtml);
  };
  
  select.addEventListener('change', save);
  select.addEventListener('blur', () => {
    setTimeout(() => {
      if (td.querySelector('select')) {
        td.innerHTML = originalHtml;
        td.classList.remove('editing');
      }
    }, 100);
  });
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      td.innerHTML = originalHtml;
      td.classList.remove('editing');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      select.blur();
      setTimeout(() => this.navigateCell(td, e.shiftKey), 50);
    }
  });
};

CRM.editCellBoolean = function(td, leadId, field) {
  // Three states: unset (—), Yes, No
  this.editCellSelect(td, leadId, field, ['Yes', 'No'], true);
};

CRM.editCellDateTime = function(td, leadId, field) {
  if (td.querySelector('input')) return;
  
  const lead = this.leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const currentValue = lead[field];
  const originalHtml = td.innerHTML;
  
  // Convert to datetime-local format
  let inputValue = '';
  if (currentValue) {
    const d = new Date(currentValue);
    inputValue = d.toISOString().slice(0, 16);
  }
  
  td.classList.add('editing');
  td.innerHTML = `<input type="datetime-local" class="crm-edit-input crm-datetime" value="${inputValue}">`;
  
  const input = td.querySelector('input');
  input.focus();
  
  let saved = false;
  
  const save = async () => {
    if (saved) return;
    saved = true;
    
    const newValue = input.value ? new Date(input.value).toISOString() : null;
    
    // Validate: lead_response must be before response_time
    if ((field === 'lead_response' || field === 'response_time') && lead) {
      const leadResponseVal = field === 'lead_response' ? newValue : lead.lead_response;
      const ourReplyVal = field === 'response_time' ? newValue : lead.response_time;
      
      if (leadResponseVal && ourReplyVal) {
        if (new Date(leadResponseVal) >= new Date(ourReplyVal)) {
          showToast('Lead reply must be BEFORE our reply', 'error');
          td.innerHTML = originalHtml;
          td.classList.remove('editing');
          return;
        }
      }
    }
    
    // Calculate ERT if both times exist
    const updateData = { [field]: newValue };
    if ((field === 'lead_response' || field === 'response_time') && lead) {
      const lr = field === 'lead_response' ? newValue : lead.lead_response;
      const rt = field === 'response_time' ? newValue : lead.response_time;
      
      if (lr && rt) {
        const diffMs = Math.abs(new Date(rt) - new Date(lr));
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        updateData.ert = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }
    
    await this.saveCellWithData(td, leadId, updateData, currentValue, originalHtml, field);
  };
  
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      saved = true;
      td.innerHTML = originalHtml;
      td.classList.remove('editing');
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      input.blur();
      setTimeout(() => this.navigateCell(td, e.shiftKey), 50);
    }
  });
};

CRM.saveCell = async function(td, leadId, field, newValue, oldValue, originalHtml) {
  td.classList.remove('editing');
  
  if (newValue === oldValue) {
    td.innerHTML = originalHtml;
    return;
  }
  
  // Optimistic update
  const lead = this.leads.find(l => l.id === leadId);
  if (lead) lead[field] = newValue;
  
  td.innerHTML = '<span style="opacity:0.5">Saving...</span>';
  
  try {
    const res = await fetch('/api/curated-leads/' + leadId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newValue || null })
    });
    const result = await res.json();
    
    if (result.error) throw new Error(result.error);
    
    this.pushUndo({ type: 'edit', leadId, field, oldValue, newValue });
    this.render();
    showToast('Saved', 'success');
    
  } catch (err) {
    // Revert on failure
    if (lead) lead[field] = oldValue;
    td.innerHTML = originalHtml;
    showToast('Save failed: ' + err.message, 'error');
  }
};

CRM.saveCellWithData = async function(td, leadId, updateData, oldValue, originalHtml, primaryField) {
  td.classList.remove('editing');
  td.innerHTML = '<span style="opacity:0.5">Saving...</span>';
  
  const lead = this.leads.find(l => l.id === leadId);
  const previousValues = {};
  
  // Optimistic update
  if (lead) {
    for (const [k, v] of Object.entries(updateData)) {
      previousValues[k] = lead[k];
      lead[k] = v;
    }
  }
  
  try {
    const res = await fetch('/api/curated-leads/' + leadId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    const result = await res.json();
    
    if (result.error) throw new Error(result.error);
    
    this.pushUndo({ 
      type: 'edit', 
      leadId, 
      field: primaryField, 
      oldValue, 
      newValue: updateData[primaryField] 
    });
    
    this.render();
    showToast('Saved', 'success');
    
  } catch (err) {
    // Revert all changes
    if (lead) {
      for (const [k, v] of Object.entries(previousValues)) {
        lead[k] = v;
      }
    }
    td.innerHTML = originalHtml;
    showToast('Save failed: ' + err.message, 'error');
  }
};

CRM.navigateCell = function(currentTd, reverse = false) {
  const row = currentTd.closest('tr');
  const cells = Array.from(row.querySelectorAll('.crm-cell'));
  const currentIdx = cells.indexOf(currentTd);
  
  if (reverse) {
    if (currentIdx > 0) {
      cells[currentIdx - 1].click();
    } else {
      const prevRow = row.previousElementSibling;
      if (prevRow && !prevRow.classList.contains('crm-new-row')) {
        const prevCells = prevRow.querySelectorAll('.crm-cell');
        if (prevCells.length > 0) prevCells[prevCells.length - 1].click();
      }
    }
  } else {
    if (currentIdx < cells.length - 1) {
      cells[currentIdx + 1].click();
    } else {
      const nextRow = row.nextElementSibling;
      if (nextRow && !nextRow.classList.contains('crm-new-row')) {
        const nextCells = nextRow.querySelectorAll('.crm-cell');
        if (nextCells.length > 0) nextCells[0].click();
      }
    }
  }
};

// ========== ADD/DELETE LEADS ==========
CRM.showNewLeadRow = function() {
  const existing = document.getElementById('crmNewLeadRow');
  if (existing) {
    document.getElementById('newLeadEmail')?.focus();
    return;
  }
  
  const tbody = document.getElementById('crmTableBody');
  const nowET = new Date().toLocaleString('sv-SE', { timeZone: 'America/New_York' }).slice(0, 16).replace(' ', 'T');
  
  const row = document.createElement('tr');
  row.id = 'crmNewLeadRow';
  row.className = 'crm-new-row';
  row.innerHTML = `
    <td style="text-align: center;">${this.leads.length + 1}</td>
    <td><input type="email" class="crm-new-input" id="newLeadEmail" placeholder="email@company.com"></td>
    <td><input type="text" class="crm-new-input" id="newLeadCompany" placeholder="Company"></td>
    <td><input type="text" class="crm-new-input" id="newLeadName" placeholder="Name"></td>
    <td>
      <select class="crm-new-input" id="newLeadStatus">
        <option value="">—</option>
        <option value="Booked">Booked</option>
        <option value="Scheduling" selected>Scheduling</option>
        <option value="Not booked">Not booked</option>
      </select>
    </td>
    <td><input type="datetime-local" class="crm-new-input crm-datetime" id="newLeadResponse" value="${nowET}"></td>
    <td><input type="text" class="crm-new-input" id="newLeadNotes" placeholder="Notes"></td>
    <td style="text-align: center;">
      <button class="crm-save-btn" onclick="CRM.saveNewLead()">Save</button>
      <button class="crm-cancel-btn" onclick="CRM.cancelNewLead()">×</button>
    </td>
  `;
  
  tbody.appendChild(row);
  
  const emailInput = document.getElementById('newLeadEmail');
  const companyInput = document.getElementById('newLeadCompany');
  emailInput.focus();
  
  // Auto-fill company from email
  emailInput.addEventListener('input', () => {
    const email = emailInput.value.trim();
    if (email.includes('@') && !companyInput.dataset.userEdited) {
      const domain = email.split('@')[1];
      const companyPart = domain.includes('.') ? domain.split('.')[0] : domain;
      companyInput.value = companyPart.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  });
  
  companyInput.addEventListener('input', () => companyInput.dataset.userEdited = 'true');
  
  // Enter to save
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      CRM.saveNewLead();
    }
    if (e.key === 'Escape') {
      CRM.cancelNewLead();
    }
  });
  
  // Scroll to bottom
  const container = tbody.closest('div');
  if (container) container.scrollTop = container.scrollHeight;
};

CRM.cancelNewLead = function() {
  const row = document.getElementById('crmNewLeadRow');
  if (row) row.remove();
};

CRM.saveNewLead = async function() {
  const email = document.getElementById('newLeadEmail')?.value?.trim();
  const company = document.getElementById('newLeadCompany')?.value?.trim();
  const name = document.getElementById('newLeadName')?.value?.trim();
  const status = document.getElementById('newLeadStatus')?.value;
  const leadResponse = document.getElementById('newLeadResponse')?.value;
  const notes = document.getElementById('newLeadNotes')?.value?.trim();
  
  if (!email || !email.includes('@')) {
    showToast('Valid email is required', 'error');
    document.getElementById('newLeadEmail')?.focus();
    return;
  }
  
  // Check for domain deduplication
  const domain = email.split('@')[1];
  const existingWithDomain = this.leads.find(l => l.domain === domain);
  
  if (existingWithDomain) {
    // Merge into existing row instead of creating new
    const shouldMerge = confirm(`Domain ${domain} already exists (${existingWithDomain.email}). Merge name and email into existing record?`);
    
    if (shouldMerge) {
      try {
        const res = await fetch('/api/curated-leads/' + existingWithDomain.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: name || existingWithDomain.name,
            email: email,
            notes: notes || existingWithDomain.notes
          })
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        
        existingWithDomain.email = email;
        if (name) existingWithDomain.name = name;
        if (notes) existingWithDomain.notes = notes;
        
        this.cancelNewLead();
        this.render();
        showToast('Merged into existing lead', 'success');
        return;
      } catch (err) {
        showToast('Merge failed: ' + err.message, 'error');
        return;
      }
    }
  }
  
  const saveBtn = document.querySelector('.crm-save-btn');
  if (saveBtn) {
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
  }
  
  try {
    const leadData = {
      email,
      company: company || null,
      domain,
      name: name || null,
      status: status || 'Scheduling',
      category: 'Interested',
      lead_response: leadResponse ? new Date(leadResponse).toISOString() : null,
      notes: notes || null,
      source: 'outbound'
    };
    
    const res = await fetch('/api/curated-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });
    
    const result = await res.json();
    
    if (result.error) throw new Error(result.error);
    
    if (result.lead) {
      result.lead.domain = domain;
      this.leads.push(result.lead);
      this.pushUndo({ type: 'create', leadId: result.lead.id, lead: leadData });
      this.applySort();
    }
    
    this.cancelNewLead();
    this.render();
    showToast('Lead created!', 'success');
    
    // Scroll to bottom
    setTimeout(() => {
      const container = document.getElementById('crmTableBody')?.closest('div');
      if (container) container.scrollTop = container.scrollHeight;
    }, 100);
    
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (saveBtn) {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }
  }
};

CRM.deleteLead = async function(leadId, email) {
  const lead = this.leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const position = this.leads.indexOf(lead);
  
  if (!confirm(`Delete lead: ${email}?`)) return;
  
  // Optimistic delete
  this.leads = this.leads.filter(l => l.id !== leadId);
  this.render();
  
  try {
    const res = await fetch('/api/curated-leads/' + leadId, { method: 'DELETE' });
    const result = await res.json();
    
    if (result.error) throw new Error(result.error);
    
    this.pushUndo({ type: 'delete', leadId, lead, position });
    showToast('Lead deleted', 'delete');
    
  } catch (err) {
    // Revert
    this.leads.splice(position, 0, lead);
    this.render();
    showToast('Delete failed: ' + err.message, 'error');
  }
};

// ========== UTILITY FUNCTIONS ==========
CRM.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

CRM.formatDate = function(d) {
  if (!d) return '—';
  const date = new Date(d);
  // Format: mm/dd/yyyy
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

CRM.formatDateTime = function(d) {
  if (!d) return '—';
  const date = new Date(d);
  // Format: mm/dd/yyyy hh:mm AM/PM
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${month}/${day}/${year} ${hour12}:${mins} ${ampm}`;
};

CRM.formatDateForInput = function(d) {
  // For date inputs: mm/dd/yyyy
  if (!d) return '';
  const date = new Date(d);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

CRM.statusColor = function(status) {
  if (status === 'Booked') return 'var(--green)';
  if (status === 'Scheduling') return 'var(--yellow)';
  if (status === 'Not booked') return 'var(--red)';
  return 'var(--text-muted)';
};

CRM.ertColor = function(ert) {
  if (!ert) return 'var(--text-muted)';
  const parts = ert.split(':').map(Number);
  const hours = parts[0] + (parts[1] || 0) / 60;
  if (hours < 1) return '#22c55e';
  if (hours < 6) return '#84cc16';
  if (hours < 24) return '#fbbf24';
  return '#ef4444';
};

// ========== SUMMARY STATS ==========
CRM.getSummaryStats = function() {
  const leads = this.leads;
  
  // Total entries (all rows - no deduplication)
  const totalEntries = leads.length;
  
  // Unique leads (deduped by email)
  const uniqueEmails = new Set(leads.map(l => l.email?.toLowerCase()).filter(Boolean));
  const uniqueLeads = uniqueEmails.size;
  
  // Unique domains
  const uniqueDomains = new Set(leads.map(l => l.domain?.toLowerCase()).filter(Boolean)).size;
  
  // Status counts - for unique leads (best status per email)
  // Priority: Booked > Scheduling > Not booked
  const statusPriority = { 'Booked': 3, 'Scheduling': 2, 'Not booked': 1 };
  const bestStatusByEmail = {};
  leads.forEach(l => {
    const email = l.email?.toLowerCase();
    if (!email) return;
    const currentPriority = statusPriority[bestStatusByEmail[email]] || 0;
    const newPriority = statusPriority[l.status] || 0;
    if (newPriority > currentPriority) {
      bestStatusByEmail[email] = l.status;
    }
  });
  
  const uniqueBooked = Object.values(bestStatusByEmail).filter(s => s === 'Booked').length;
  const uniqueScheduling = Object.values(bestStatusByEmail).filter(s => s === 'Scheduling').length;
  const uniqueNotBooked = Object.values(bestStatusByEmail).filter(s => s === 'Not booked').length;
  
  // Total status counts (all entries)
  const totalBooked = leads.filter(l => l.status === 'Booked').length;
  const totalScheduling = leads.filter(l => l.status === 'Scheduling').length;
  const totalNotBooked = leads.filter(l => l.status === 'Not booked').length;
  
  // Booking rate based on unique leads
  const bookingRateUnique = uniqueLeads > 0 ? (uniqueBooked / uniqueLeads * 100).toFixed(1) : '0.0';
  
  return { 
    // Total entries (all rows)
    totalEntries,
    // Unique counts (deduped)
    uniqueLeads,
    uniqueDomains,
    uniqueBooked,
    uniqueScheduling,
    uniqueNotBooked,
    // Total counts (all entries)
    totalBooked,
    totalScheduling,
    totalNotBooked,
    // Booking rate (based on unique leads)
    bookingRate: bookingRateUnique,
    // Legacy fields for compatibility
    total: uniqueLeads,
    booked: uniqueBooked,
    scheduling: uniqueScheduling,
    notBooked: uniqueNotBooked
  };
};

// ========== RENDER ==========
CRM.renderLoadingState = function() {
  const content = document.getElementById('mainContent');
  content.innerHTML = `
    <div class="matrix-loader">
      <div class="loader-title">📊 CRM Lead Tracker</div>
      <div class="loader-subtitle">Loading leads from Supabase...</div>
      <div class="loader-bar-container">
        <div class="loader-bar" style="width: 30%; animation: pulse 1.5s infinite;"></div>
      </div>
      <div class="loader-percent">...</div>
      <div class="loader-status">CONNECTING</div>
    </div>
  `;
};

CRM.render = function() {
  const content = document.getElementById('mainContent');
  const leads = this.getFilteredLeads();
  const stats = this.getSummaryStats();
  const sortIcon = (col) => {
    if (this.sortColumn !== col) return '<span style="opacity:0.3">⇅</span>';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  };
  
  // Column definitions
  const columns = [
    { id: 'checkbox', label: '<input type="checkbox" onclick="CRM.toggleAllLeadSelection(this.checked)" style="cursor: pointer;">', width: '30px', sortable: false },
    { id: 'num', label: '#', width: '40px', sortable: false },
    { id: 'email', label: 'Email', width: '200px', sortable: true },
    { id: 'company', label: 'Company', width: '150px', sortable: true },
    { id: 'name', label: 'Name', width: '120px', sortable: true },
    { id: 'domain', label: 'Domain', width: '120px', sortable: true },
    { id: 'status', label: 'Status', width: '90px', sortable: true },
    { id: 'category', label: 'Category', width: '110px', sortable: true },
    { id: 'ert', label: 'ERT', width: '80px', sortable: true },
    { id: 'date_first_response', label: 'Lead Reply', width: '140px', sortable: true },
    { id: 'response_time', label: 'Our Reply', width: '140px', sortable: true },
    { id: 'source', label: 'Source', width: '80px', sortable: true },
    { id: 'notes', label: 'Notes', width: '150px', sortable: true },
    { id: 'actions', label: '', width: '60px', sortable: false }
  ];
  
  const visibleColumns = columns.filter(c => this.isColumnVisible(c.id));
  
  content.innerHTML = `
    <style>
      .crm-container { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      .crm-summary { position: sticky; top: 0; z-index: 100; background: var(--bg-card); 
        border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px;
        display: flex; gap: 24px; align-items: center; }
      .crm-stat { text-align: center; }
      .crm-stat-value { font-size: 28px; font-weight: 700; }
      .crm-stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }
      .crm-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
      .crm-search { padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border);
        border-radius: 6px; color: var(--text); font-size: 13px; width: 280px; }
      .crm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .crm-table th { background: rgba(0,0,0,0.3); padding: 10px 8px; text-align: left;
        font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;
        border-bottom: 2px solid rgba(34, 197, 94, 0.3); cursor: pointer; white-space: nowrap; }
      .crm-table th:hover { color: var(--text); }
      .crm-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
      .crm-table tr:hover td { background: rgba(34, 197, 94, 0.05); }
      .crm-cell { cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.15s; }
      .crm-cell:hover { background: rgba(249, 115, 22, 0.15); }
      .crm-cell.editing { background: var(--bg-card); }
      .crm-edit-input { background: var(--bg-card); border: 1px solid var(--accent); color: var(--text);
        padding: 4px 6px; font-size: 12px; width: 100%; border-radius: 3px; outline: none; }
      .crm-edit-select { background: var(--bg-card); border: 1px solid var(--accent); color: var(--text);
        padding: 4px 6px; font-size: 12px; border-radius: 3px; outline: none; }
      .crm-datetime { width: 170px; }
      .crm-new-row { background: rgba(249, 115, 22, 0.1) !important; }
      .crm-new-input { background: var(--bg-card); border: 1px solid var(--border); color: var(--text);
        padding: 6px 8px; font-size: 12px; width: 100%; border-radius: 4px; }
      .crm-new-input:focus { border-color: var(--accent); outline: none; }
      .crm-save-btn { background: var(--green); color: #000; border: none; padding: 6px 12px;
        border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; }
      .crm-cancel-btn { background: transparent; color: var(--text-muted); border: 1px solid var(--border);
        padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 6px; }
      .crm-delete-btn { background: none; border: none; cursor: pointer; opacity: 0.3; font-size: 12px; }
      .crm-delete-btn:hover { opacity: 1; color: var(--red); }
      .crm-add-btn { background: var(--accent); color: #fff; border: none; padding: 8px 16px;
        border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
      .crm-add-btn:hover { background: var(--accent-hover); }
      .crm-url { color: var(--accent); text-decoration: none; }
      .crm-url:hover { text-decoration: underline; }
      .crm-col-toggle { font-size: 11px; padding: 6px 12px; background: var(--bg-card);
        border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text-muted); }
      .crm-hidden-pill { display: inline-block; background: rgba(239, 68, 68, 0.15);
        color: var(--red); padding: 2px 8px; border-radius: 10px; font-size: 10px;
        margin: 4px 0; cursor: pointer; }
    </style>
    
    <div class="crm-container">
      <!-- Sticky Summary Banner -->
      <div class="crm-summary">
        <div class="crm-stat">
          <div class="crm-stat-value">${stats.uniqueLeads}</div>
          <div class="crm-stat-label">Unique Leads</div>
        </div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--text-muted); font-size: 20px;">${stats.totalEntries}</div>
          <div class="crm-stat-label">Total Entries</div>
        </div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--cyan, #06b6d4); font-size: 20px;">${stats.uniqueDomains}</div>
          <div class="crm-stat-label">Unique Domains</div>
        </div>
        <div style="width: 1px; background: var(--border); margin: 0 8px;"></div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--green);">${stats.uniqueBooked}</div>
          <div class="crm-stat-label">Booked</div>
        </div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--yellow);">${stats.uniqueScheduling}</div>
          <div class="crm-stat-label">Scheduling</div>
        </div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--red);">${stats.uniqueNotBooked}</div>
          <div class="crm-stat-label">Not Booked</div>
        </div>
        <div class="crm-stat">
          <div class="crm-stat-value" style="color: var(--accent);">${stats.bookingRate}%</div>
          <div class="crm-stat-label">Booking Rate</div>
        </div>
        <div style="flex: 1;"></div>
        <span style="font-size: 11px; color: var(--text-dim);">
          Sorted: ${this.sortColumn} ${this.sortDirection.toUpperCase()} | 
          ${leads.length} visible
        </span>
      </div>
      
      <!-- Toolbar -->
      <div class="crm-toolbar">
        <input type="text" class="crm-search" placeholder="🔍 Search email, company, name..." 
          value="${this.escapeHtml(this.searchQuery)}" oninput="CRM.setSearch(this.value)">
        <button class="crm-add-btn" onclick="CRM.showNewLeadRow()">+ Add Lead</button>
        <button class="crm-add-btn" onclick="CRM.showBulkAddModal()" style="background: var(--bg-card); color: var(--accent); border: 1px solid var(--accent);">+ Add Multiple</button>
        <button class="crm-bulk-edit-btn" onclick="CRM.bulkEditSelected()" id="crmBulkEditBtn" disabled style="font-size: 12px; padding: 6px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: not-allowed;">✏️ Bulk Edit</button>
        <div class="crm-col-toggle" onclick="CRM.showColumnsDropdown()">
          Columns ▾ ${this.hiddenColumns.size > 0 ? `(${this.hiddenColumns.size} hidden)` : ''}
        </div>
        <div style="flex: 1;"></div>
        <span style="font-size: 10px; color: var(--green); background: rgba(34, 197, 94, 0.1); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(34, 197, 94, 0.3);">
          ● Connected: curated_leads
        </span>
        <span style="font-size: 11px; color: var(--text-dim); margin-left: 12px;">
          ⌘Z undo | ⌘⇧Z redo | ⌘N new lead
        </span>
      </div>
      
      <!-- Hidden rows indicator -->
      ${this.hiddenRows.size > 0 ? `
        <div class="crm-hidden-pill" onclick="CRM.showHiddenRowsMenu()">
          ${this.hiddenRows.size} hidden row${this.hiddenRows.size > 1 ? 's' : ''} — click to unhide
        </div>
      ` : ''}
      
      <!-- Table (full page, browser scrolls) -->
      <table class="crm-table">
        <thead>
          <tr>
            ${visibleColumns.map(col => `
              <th style="width: ${col.width};" 
                ${col.sortable ? `onclick="CRM.setSort('${col.id}')"` : ''}>
                ${col.label} ${col.sortable ? sortIcon(col.id) : ''}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody id="crmTableBody">
          ${leads.map((l, idx) => this.renderRow(l, idx, visibleColumns)).join('')}
        </tbody>
      </table>
      
      <!-- Add row button at bottom -->
      <button onclick="CRM.showNewLeadRow()" style="display: block; width: 100%; padding: 10px;
        background: var(--bg-card); border: 1px dashed var(--border); color: var(--text-muted);
        cursor: pointer; font-size: 12px; margin-top: 8px; border-radius: 6px;">
        + Add New Lead
      </button>
    </div>
  `;
};

CRM.renderRow = function(lead, idx, columns) {
  const cells = [];
  
  for (const col of columns) {
    let cellContent = '';
    let cellAttr = '';
    let clickHandler = '';
    
    switch (col.id) {
      case 'checkbox':
        const isChecked = CRM.selectedLeads.has(lead.id) ? 'checked' : '';
        cellContent = `<input type="checkbox" class="crm-lead-checkbox" data-id="${lead.id}" ${isChecked} onchange="CRM.toggleLeadSelection(${lead.id}, this.checked)" style="cursor: pointer;">`;
        break;
      case 'num':
        cellContent = idx + 1;
        break;
      case 'email':
        cellContent = this.escapeHtml(lead.email) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCell(this, ${lead.id}, 'email')"`;
        break;
      case 'company':
        cellContent = this.escapeHtml(lead.company) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCell(this, ${lead.id}, 'company')"`;
        break;
      case 'name':
        cellContent = this.escapeHtml(lead.name) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCell(this, ${lead.id}, 'name')"`;
        break;
      case 'domain':
        if (lead.domain) {
          cellContent = `<a href="https://${lead.domain}" target="_blank" class="crm-url">${lead.domain}</a>`;
        } else {
          cellContent = '<span style="opacity:0.3">—</span>';
        }
        break;
      case 'status':
        cellContent = `<span style="color: ${this.statusColor(lead.status)}; font-weight: 500;">
          ${this.escapeHtml(lead.status) || '<span style="opacity:0.3">—</span>'}</span>`;
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCellSelect(this, ${lead.id}, 'status', ['Booked', 'Scheduling', 'Not booked'])"`;
        break;
      case 'category':
        cellContent = this.escapeHtml(lead.category) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCellSelect(this, ${lead.id}, 'category', ['Interested', 'Meeting Request', 'Information Request'])"`;
        break;
      case 'ert':
        cellContent = lead.ert 
          ? `<span style="font-family: monospace; color: ${this.ertColor(lead.ert)};">${lead.ert}</span>`
          : '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCell(this, ${lead.id}, 'ert')"`;
        break;
      case 'date_first_response':
        cellContent = `<span style="color: var(--text-muted); font-size: 11px;">
          ${this.formatDateTime(lead.lead_response)}</span>`;
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCellDateTime(this, ${lead.id}, 'lead_response')"`;
        break;
      case 'response_time':
        cellContent = `<span style="color: var(--text-muted); font-size: 11px;">
          ${this.formatDateTime(lead.response_time)}</span>`;
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCellDateTime(this, ${lead.id}, 'response_time')"`;
        break;
      case 'source':
        cellContent = this.escapeHtml(lead.source) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell"';
        clickHandler = `onclick="CRM.editCellSelect(this, ${lead.id}, 'source', ['cold_email', 'inbound', 'outbound', 'reactivation'])"`;
        break;
      case 'notes':
        cellContent = this.escapeHtml(lead.notes) || '<span style="opacity:0.3">—</span>';
        cellAttr = 'class="crm-cell" style="color: var(--text-dim);"';
        clickHandler = `onclick="CRM.editCell(this, ${lead.id}, 'notes')"`;
        break;
      case 'actions':
        cellContent = `
          <button class="crm-delete-btn" onclick="CRM.hideRow(${lead.id})" title="Hide row">👁️</button>
          <button class="crm-delete-btn" onclick="CRM.deleteLead(${lead.id}, '${this.escapeHtml(lead.email)}')" title="Delete">🗑️</button>
        `;
        break;
    }
    
    cells.push(`<td ${cellAttr} ${clickHandler}>${cellContent}</td>`);
  }
  
  return `<tr data-id="${lead.id}">${cells.join('')}</tr>`;
};

CRM.showColumnsDropdown = function() {
  // Remove existing dropdown if open
  const existing = document.getElementById('crmColumnsDropdown');
  if (existing) {
    existing.remove();
    return;
  }
  
  const columns = [
    { id: 'email', label: 'Email' },
    { id: 'company', label: 'Company' },
    { id: 'name', label: 'Name' },
    { id: 'domain', label: 'Domain' },
    { id: 'status', label: 'Status' },
    { id: 'category', label: 'Category' },
    { id: 'ert', label: 'ERT' },
    { id: 'date_first_response', label: 'Lead Reply' },
    { id: 'response_time', label: 'Our Reply' },
    { id: 'source', label: 'Source' },
    { id: 'notes', label: 'Notes' }
  ];
  
  const dropdown = document.createElement('div');
  dropdown.id = 'crmColumnsDropdown';
  dropdown.style.cssText = `
    position: fixed;
    top: 200px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    z-index: 10001;
    min-width: 200px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  `;
  
  dropdown.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span style="font-weight: 600; color: var(--text);">Show/Hide Columns</span>
      <button onclick="document.getElementById('crmColumnsDropdown').remove()" 
        style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px;">×</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${columns.map(col => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
          <input type="checkbox" ${!this.hiddenColumns.has(col.id) ? 'checked' : ''} 
            onchange="CRM.toggleColumn('${col.id}')"
            style="cursor: pointer; accent-color: var(--accent);">
          <span style="color: var(--text);">${col.label}</span>
          ${this.hiddenColumns.has(col.id) ? '<span style="font-size: 10px; color: var(--text-dim);">(hidden)</span>' : ''}
        </label>
      `).join('')}
    </div>
    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
      <button onclick="CRM.showAllColumns()" 
        style="padding: 6px 12px; background: var(--bg-dark); border: 1px solid var(--border);
          border-radius: 4px; color: var(--text-muted); cursor: pointer; font-size: 11px; width: 100%;">
        Show All Columns
      </button>
    </div>
  `;
  
  document.body.appendChild(dropdown);
  
  // Close when clicking outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && !e.target.closest('.crm-col-toggle')) {
        dropdown.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
};

CRM.showAllColumns = function() {
  this.hiddenColumns.clear();
  this.saveHiddenColumns();
  const dropdown = document.getElementById('crmColumnsDropdown');
  if (dropdown) dropdown.remove();
  this.render();
};

CRM.showHiddenRowsMenu = function() {
  const hiddenLeads = this.leads.filter(l => this.hiddenRows.has(l.id));
  
  const toUnhide = prompt(
    `Hidden leads:\n${hiddenLeads.map(l => l.email).join('\n')}\n\nType email to unhide (or 'all'):`,
    'all'
  );
  
  if (toUnhide === 'all') {
    this.hiddenRows.clear();
    this.render();
    showToast(`Unhid ${hiddenLeads.length} rows`, 'success');
  } else {
    const lead = hiddenLeads.find(l => l.email === toUnhide);
    if (lead) {
      this.unhideRow(lead.id);
      showToast('Row unhidden', 'success');
    }
  }
};

// ========== DASHBOARD SECTION ==========
CRM.dashboardYear = new Date().getFullYear();
CRM.dashboardData = null;

CRM.loadDashboardData = async function(year) {
  try {
    const res = await fetch('/api/crm-dashboard?year=' + year);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    this.dashboardData = data;
    this.dashboardYear = year;
    return data;
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard: ' + err.message, 'error');
    return null;
  }
};

CRM.changeYear = async function(year) {
  const data = await this.loadDashboardData(year);
  if (data) {
    this.renderDashboardSection();
  }
};

CRM.renderDashboardSection = function() {
  const container = document.getElementById('crmDashboard');
  if (!container || !this.dashboardData) return;
  
  const d = this.dashboardData;
  const months = d.months || [];
  
  // Year selector
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
    .map(y => `<option value="${y}" ${y === d.year ? 'selected' : ''}>${y}</option>`)
    .join('');
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 16px; color: var(--text);">📊 Pipeline Dashboard</h3>
      <select onchange="CRM.changeYear(parseInt(this.value))" 
        style="padding: 6px 12px; background: var(--bg-card); border: 1px solid var(--border); 
          border-radius: 4px; color: var(--text); font-size: 13px; cursor: pointer;">
        ${yearOptions}
      </select>
    </div>
    
    <!-- Monthly Stats Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">
      <thead>
        <tr>
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid var(--border); color: var(--text-muted);">Month</th>
          <th style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">Leads</th>
          <th style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">Booked</th>
          <th style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">Scheduling</th>
          <th style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">Booking %</th>
          <th style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">Avg Days to Close</th>
        </tr>
      </thead>
      <tbody>
        ${months.map(m => {
          const bookingPct = m.leads > 0 ? (m.booked / m.leads * 100).toFixed(1) : '0.0';
          const pctColor = parseFloat(bookingPct) >= 30 ? 'var(--green)' : parseFloat(bookingPct) >= 15 ? 'var(--yellow)' : 'var(--text-muted)';
          return `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid var(--border);">${m.name}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border);">${m.leads}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--green);">${m.booked}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--yellow);">${m.scheduling}</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: ${pctColor};">${bookingPct}%</td>
              <td style="padding: 8px; text-align: center; border-bottom: 1px solid var(--border); color: var(--text-muted);">${m.avgDaysToClose !== null ? m.avgDaysToClose : ''}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight: 600; background: rgba(0,0,0,0.2);">
          <td style="padding: 8px; border-top: 2px solid var(--border);">Total</td>
          <td style="padding: 8px; text-align: center; border-top: 2px solid var(--border);">${d.totals.leads}</td>
          <td style="padding: 8px; text-align: center; border-top: 2px solid var(--border); color: var(--green);">${d.totals.booked}</td>
          <td style="padding: 8px; text-align: center; border-top: 2px solid var(--border); color: var(--yellow);">${d.totals.scheduling}</td>
          <td style="padding: 8px; text-align: center; border-top: 2px solid var(--border); color: var(--accent);">${d.totals.bookingRate}%</td>
          <td style="padding: 8px; text-align: center; border-top: 2px solid var(--border);"></td>
        </tr>
      </tfoot>
    </table>
  `;
};

// Update render to include dashboard
CRM._originalRender = CRM.render;
CRM.render = function() {
  this._originalRender.call(this);
  
  // Add dashboard section after the table
  const content = document.getElementById('mainContent');
  const existingDashboard = document.getElementById('crmDashboard');
  
  if (!existingDashboard && content) {
    const dashboardDiv = document.createElement('div');
    dashboardDiv.id = 'crmDashboard';
    dashboardDiv.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-top: 24px;';
    content.querySelector('.crm-container')?.appendChild(dashboardDiv);
    
    // Load dashboard data
    this.loadDashboardData(this.dashboardYear).then(() => this.renderDashboardSection());
  }
};

// ========== BULK ADD FUNCTIONALITY ==========
CRM.showBulkAddModal = function() {
  // Create modal if it doesn't exist
  let modal = document.getElementById('crmBulkAddModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'crmBulkAddModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); display: flex; align-items: center;
      justify-content: center; z-index: 10000;
    `;
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: var(--bg-card); border-radius: 12px; padding: 24px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; color: var(--text);">Add Multiple Leads</h3>
        <button onclick="CRM.closeBulkAddModal()" style="background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer;">&times;</button>
      </div>
      <div id="bulkAddRows"></div>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button onclick="CRM.addBulkAddRow()" style="padding: 8px 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; color: var(--text); cursor: pointer;">+ Add Another</button>
        <div style="flex: 1;"></div>
        <button onclick="CRM.closeBulkAddModal()" style="padding: 8px 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer;">Cancel</button>
        <button onclick="CRM.saveBulkLeads()" style="padding: 8px 16px; background: var(--accent); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-weight: 600;">Save All</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
  
  // Add first row
  const rowsContainer = document.getElementById('bulkAddRows');
  rowsContainer.innerHTML = '';
  this.addBulkAddRow();
};

CRM.closeBulkAddModal = function() {
  const modal = document.getElementById('crmBulkAddModal');
  if (modal) modal.style.display = 'none';
};

CRM.addBulkAddRow = function() {
  const rowsContainer = document.getElementById('bulkAddRows');
  const rowIndex = rowsContainer.children.length;
  
  const row = document.createElement('div');
  row.className = 'bulk-add-row';
  row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr 120px 120px 30px; gap: 8px; margin-bottom: 8px;';
  row.innerHTML = `
    <input type="email" placeholder="Email *" class="bulk-email" style="padding: 8px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
    <input type="text" placeholder="Company" class="bulk-company" style="padding: 8px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
    <input type="text" placeholder="Name" class="bulk-name" style="padding: 8px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
    <select class="bulk-status" style="padding: 8px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
      <option value="Scheduling">Scheduling</option>
      <option value="Booked">Booked</option>
      <option value="Not booked">Not booked</option>
    </select>
    <select class="bulk-category" style="padding: 8px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
      <option value="Interested">Interested</option>
      <option value="Meeting Request">Meeting Request</option>
      <option value="Information Request">Info Request</option>
    </select>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--red); cursor: pointer; font-size: 18px;">×</button>
  `;
  
  rowsContainer.appendChild(row);
  row.querySelector('.bulk-email').focus();
};

CRM.saveBulkLeads = async function() {
  const rows = document.querySelectorAll('.bulk-add-row');
  const leads = [];
  
  rows.forEach(row => {
    const email = row.querySelector('.bulk-email').value.trim();
    if (!email) return;
    
    leads.push({
      email: email,
      company: row.querySelector('.bulk-company').value.trim() || null,
      name: row.querySelector('.bulk-name').value.trim() || null,
      status: row.querySelector('.bulk-status').value,
      category: row.querySelector('.bulk-category').value,
      source: 'manual',
      lead_response: new Date().toISOString(),
      response_time: new Date().toISOString()
    });
  });
  
  if (leads.length === 0) {
    showToast('Please add at least one lead with an email', 'error');
    return;
  }
  
  try {
    // Save each lead
    for (const lead of leads) {
      const res = await fetch('/api/curated-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
    }
    
    showToast(`Added ${leads.length} lead(s)`, 'success');
    this.closeBulkAddModal();
    await this.loadLeads();
    this.render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ========== BULK EDIT FUNCTIONALITY ==========
CRM.selectedLeads = new Set();

CRM.toggleLeadSelection = function(id, checked) {
  if (checked) {
    this.selectedLeads.add(id);
  } else {
    this.selectedLeads.delete(id);
  }
  this.updateBulkEditButton();
};

CRM.toggleAllLeadSelection = function(checked) {
  const checkboxes = document.querySelectorAll('.crm-lead-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const id = parseInt(cb.dataset.id);
    if (checked) {
      this.selectedLeads.add(id);
    } else {
      this.selectedLeads.delete(id);
    }
  });
  this.updateBulkEditButton();
};

CRM.updateBulkEditButton = function() {
  const btn = document.getElementById('crmBulkEditBtn');
  if (!btn) return;
  
  const count = this.selectedLeads.size;
  if (count > 0) {
    btn.disabled = false;
    btn.style.cursor = 'pointer';
    btn.style.color = 'var(--text)';
    btn.style.borderColor = 'var(--accent)';
    btn.textContent = `✏️ Bulk Edit (${count})`;
  } else {
    btn.disabled = true;
    btn.style.cursor = 'not-allowed';
    btn.style.color = 'var(--text-muted)';
    btn.style.borderColor = 'var(--border)';
    btn.textContent = '✏️ Bulk Edit';
  }
};

CRM.bulkEditSelected = function() {
  if (this.selectedLeads.size === 0) return;
  
  const selectedIds = Array.from(this.selectedLeads);
  
  // Create modal
  let modal = document.getElementById('crmBulkEditModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'crmBulkEditModal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); display: flex; align-items: center;
      justify-content: center; z-index: 10000;
    `;
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: var(--bg-card); border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; color: var(--text);">Bulk Edit ${selectedIds.length} Lead${selectedIds.length > 1 ? 's' : ''}</h3>
        <button onclick="CRM.closeBulkEditModal()" style="background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer;">&times;</button>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 12px;">Status</label>
        <select id="bulkEditStatus" style="width: 100%; padding: 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
          <option value="">— Don't change —</option>
          <option value="Booked">Booked</option>
          <option value="Scheduling">Scheduling</option>
          <option value="Not booked">Not booked</option>
        </select>
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 12px;">Category</label>
        <select id="bulkEditCategory" style="width: 100%; padding: 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
          <option value="">— Don't change —</option>
          <option value="Interested">Interested</option>
          <option value="Meeting Request">Meeting Request</option>
          <option value="Information Request">Info Request</option>
        </select>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button onclick="CRM.closeBulkEditModal()" style="padding: 10px 20px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer;">Cancel</button>
        <button onclick="CRM.applyBulkEdit()" style="padding: 10px 20px; background: var(--accent); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-weight: 600;">Apply Changes</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
};

CRM.closeBulkEditModal = function() {
  const modal = document.getElementById('crmBulkEditModal');
  if (modal) modal.style.display = 'none';
};

CRM.applyBulkEdit = async function() {
  const status = document.getElementById('bulkEditStatus').value;
  const category = document.getElementById('bulkEditCategory').value;
  
  if (!status && !category) {
    showToast('Please select at least one field to change', 'error');
    return;
  }
  
  const selectedIds = Array.from(this.selectedLeads);
  let successCount = 0;
  
  try {
    for (const id of selectedIds) {
      const updates = {};
      if (status) updates.status = status;
      if (category) updates.category = category;
      
      const res = await fetch('/api/curated-leads/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const result = await res.json();
      if (!result.error) successCount++;
    }
    
    showToast(`Updated ${successCount} lead(s)`, 'success');
    this.closeBulkEditModal();
    this.selectedLeads.clear();
    await this.loadLeads();
    this.render();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// Export for global access
window.CRM = CRM;
