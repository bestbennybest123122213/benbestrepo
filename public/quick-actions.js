/**
 * Quick Actions UI Component
 * 
 * One-click actions on leads:
 * - Mark Booked ✅
 * - Send Follow-up 📧
 * - Snooze ⏰
 * - Not Interested ❌
 * - Add Note 📝
 */

(function() {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    /* Quick Action Buttons */
    .quick-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }
    tr:hover .quick-actions,
    .lead-card:hover .quick-actions {
      opacity: 1;
    }
    .quick-actions.always-visible {
      opacity: 1;
    }
    
    .qa-btn {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
      background: var(--bg-dark);
      color: var(--text-muted);
    }
    .qa-btn:hover {
      transform: translateY(-1px);
    }
    
    .qa-btn.booked { background: var(--green-bg); color: var(--green); }
    .qa-btn.booked:hover { background: var(--green); color: white; }
    
    .qa-btn.followup { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .qa-btn.followup:hover { background: #3b82f6; color: white; }
    
    .qa-btn.snooze { background: rgba(234, 179, 8, 0.15); color: #eab308; }
    .qa-btn.snooze:hover { background: #eab308; color: black; }
    
    .qa-btn.not-interested { background: var(--red-bg); color: var(--red); }
    .qa-btn.not-interested:hover { background: var(--red); color: white; }
    
    .qa-btn.note { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
    .qa-btn.note:hover { background: #a855f7; color: white; }
    
    .qa-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    /* Action modal */
    .qa-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s;
    }
    .qa-modal.active {
      opacity: 1;
      visibility: visible;
    }
    .qa-modal-content {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
    }
    .qa-modal-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .qa-modal-input {
      width: 100%;
      padding: 12px;
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 14px;
      margin-bottom: 16px;
    }
    .qa-modal-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .qa-modal-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .qa-modal-btn.primary {
      background: var(--accent);
      color: white;
    }
    .qa-modal-btn.secondary {
      background: var(--bg-dark);
      color: var(--text-muted);
    }
    
    /* Toast notifications */
    .qa-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1001;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .qa-toast {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
      max-width: 320px;
    }
    .qa-toast.success { border-left: 3px solid var(--green); }
    .qa-toast.error { border-left: 3px solid var(--red); }
    .qa-toast.info { border-left: 3px solid var(--blue); }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    /* Mobile action buttons */
    @media (max-width: 768px) {
      .quick-actions {
        opacity: 1;
        flex-wrap: wrap;
      }
      .qa-btn {
        padding: 8px 12px;
        font-size: 13px;
      }
    }
  `;
  document.head.appendChild(style);

  // Create toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'qa-toast-container';
  document.body.appendChild(toastContainer);

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'qa-modal';
  modal.innerHTML = `
    <div class="qa-modal-content">
      <div class="qa-modal-title"></div>
      <input class="qa-modal-input" type="text" placeholder="">
      <div class="qa-modal-buttons">
        <button class="qa-modal-btn secondary" onclick="gexActions.closeModal()">Cancel</button>
        <button class="qa-modal-btn primary" onclick="gexActions.submitModal()">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) gexActions.closeModal();
  });

  // Quick Actions API
  window.gexActions = {
    pendingAction: null,

    /**
     * Show toast notification
     */
    toast(message, type = 'success') {
      const toast = document.createElement('div');
      toast.className = `qa-toast ${type}`;
      toast.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span>${message}</span>
      `;
      toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    },

    /**
     * Show modal for input
     */
    showModal(title, placeholder, callback) {
      modal.querySelector('.qa-modal-title').textContent = title;
      modal.querySelector('.qa-modal-input').placeholder = placeholder;
      modal.querySelector('.qa-modal-input').value = '';
      modal.classList.add('active');
      modal.querySelector('.qa-modal-input').focus();
      this.pendingAction = callback;
    },

    closeModal() {
      modal.classList.remove('active');
      this.pendingAction = null;
    },

    submitModal() {
      const value = modal.querySelector('.qa-modal-input').value;
      if (this.pendingAction) {
        this.pendingAction(value);
      }
      this.closeModal();
    },

    /**
     * API call wrapper
     */
    async api(action, email, params = {}) {
      try {
        const res = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, email, ...params })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Action failed');
        return data;
      } catch (error) {
        this.toast(error.message, 'error');
        throw error;
      }
    },

    /**
     * Mark as booked
     */
    async markBooked(email, btn) {
      if (btn) btn.disabled = true;
      try {
        await this.api('mark_booked', email);
        this.toast(`Marked as booked! 🎉`);
        this.refreshRow(email, 'Booked');
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    /**
     * Send follow-up (opens email draft)
     */
    async followUp(email, name, company) {
      const subject = encodeURIComponent(`Following up - ${company || 'our conversation'}`);
      const body = encodeURIComponent(`Hi ${name || 'there'},\n\nJust wanted to follow up...`);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
      this.toast('Email draft opened');
    },

    /**
     * Snooze lead
     */
    async snooze(email, btn) {
      this.showModal('Snooze for how many days?', '3', async (days) => {
        const d = parseInt(days) || 3;
        if (btn) btn.disabled = true;
        try {
          await this.api('snooze', email, { days: d });
          this.toast(`Snoozed for ${d} days ⏰`);
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    },

    /**
     * Mark not interested
     */
    async notInterested(email, btn) {
      if (!confirm('Mark as not interested?')) return;
      if (btn) btn.disabled = true;
      try {
        await this.api('mark_not_interested', email);
        this.toast('Marked as not interested');
        this.refreshRow(email, 'Not Interested');
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    /**
     * Add note
     */
    async addNote(email) {
      this.showModal('Add Note', 'Enter your note...', async (note) => {
        if (!note.trim()) return;
        await this.api('add_note', email, { note });
        this.toast('Note added 📝');
      });
    },

    /**
     * Update row after action
     */
    refreshRow(email, newCategory) {
      // Try to update the row in the table
      const rows = document.querySelectorAll('tr');
      rows.forEach(row => {
        if (row.textContent.includes(email)) {
          const categoryCell = row.querySelector('.category, [data-category]');
          if (categoryCell) {
            categoryCell.textContent = newCategory;
            categoryCell.className = `category ${newCategory.toLowerCase().replace(' ', '-')}`;
          }
          // Flash the row
          row.style.background = 'rgba(34, 197, 94, 0.2)';
          setTimeout(() => row.style.background = '', 1000);
        }
      });
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('leadUpdated', { 
        detail: { email, category: newCategory } 
      }));
    },

    /**
     * Generate action buttons HTML
     */
    buttons(email, name, company, options = {}) {
      const { showAll = false, compact = false } = options;
      const size = compact ? 'compact' : '';
      
      return `
        <div class="quick-actions ${showAll ? 'always-visible' : ''} ${size}">
          <button class="qa-btn booked" onclick="gexActions.markBooked('${email}', this)" title="Mark Booked">
            ✅${compact ? '' : ' Booked'}
          </button>
          <button class="qa-btn followup" onclick="gexActions.followUp('${email}', '${name || ''}', '${company || ''}')" title="Follow Up">
            📧${compact ? '' : ' Follow Up'}
          </button>
          <button class="qa-btn snooze" onclick="gexActions.snooze('${email}', this)" title="Snooze">
            ⏰${compact ? '' : ' Snooze'}
          </button>
          <button class="qa-btn not-interested" onclick="gexActions.notInterested('${email}', this)" title="Not Interested">
            ❌
          </button>
          <button class="qa-btn note" onclick="gexActions.addNote('${email}')" title="Add Note">
            📝
          </button>
        </div>
      `;
    }
  };

  console.log('⚡ Quick Actions loaded');
})();
