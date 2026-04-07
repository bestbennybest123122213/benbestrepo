/**
 * Real-time Notifications System
 */

(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* Notification Center */
    .notification-bell {
      position: relative;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      transition: all 0.2s;
      color: rgba(34, 197, 94, 0.7);
    }
    .notification-bell:hover {
      background: linear-gradient(135deg, #0f150f 0%, #1a241a 100%);
      color: #22c55e;
      text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
    }
    .notification-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      background: #22c55e;
      color: #000;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 5px;
      border-radius: 10px;
      min-width: 16px;
      text-align: center;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
    }
    
    /* Notification Panel */
    .notification-panel {
      position: fixed;
      top: 60px;
      right: 24px;
      width: 360px;
      max-height: 480px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      display: none;
      overflow: hidden;
      z-index: 1001;
    }
    .notification-panel.show { display: flex; flex-direction: column; }
    
    .notification-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .notification-title {
      font-weight: 600;
      font-size: 14px;
    }
    .notification-clear {
      font-size: 12px;
      color: var(--accent);
      cursor: pointer;
    }
    
    .notification-list {
      flex: 1;
      overflow-y: auto;
      max-height: 400px;
    }
    
    .notification-item {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.1s;
    }
    .notification-item:hover {
      background: var(--bg-card-hover);
    }
    .notification-item.unread {
      background: rgba(249, 115, 22, 0.05);
      border-left: 3px solid var(--accent);
    }
    .notification-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .notification-item-title {
      font-weight: 500;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .notification-item-time {
      font-size: 11px;
      color: var(--text-dim);
    }
    .notification-item-body {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    
    .notification-empty {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-muted);
    }
    .notification-empty-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    /* Toast Notifications */
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10002;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 280px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
    }
    .toast.success { background: var(--green); color: white; }
    .toast.error { background: var(--red); color: white; }
    .toast.warning { background: var(--yellow); color: #1a1a1a; }
    .toast.info { background: var(--blue); color: white; }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .toast.hide { animation: slideOut 0.3s ease-in forwards; }
    @keyframes slideOut {
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  let notifications = [];
  let unreadCount = 0;
  let panelOpen = false;

  // Create toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.id = 'toastContainer';
  document.body.appendChild(toastContainer);

  // Show toast notification
  window.showToast = function(type, message, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    
    toast.onclick = () => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    };
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  // Add notification to history
  function addNotification(title, body, type = 'info') {
    const notification = {
      id: Date.now(),
      title,
      body,
      type,
      time: new Date(),
      read: false
    };
    notifications.unshift(notification);
    unreadCount++;
    updateBadge();
    
    // Also show as toast
    showToast(type, title);
    
    // Store in localStorage
    saveNotifications();
  }

  function updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
  }

  function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <div class="notification-empty-icon">🔔</div>
          <div>No notifications yet</div>
        </div>
      `;
      return;
    }

    list.innerHTML = notifications.slice(0, 20).map(n => {
      const timeAgo = formatTimeAgo(n.time);
      const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
      return `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="window.__markRead(${n.id})">
          <div class="notification-item-header">
            <span class="notification-item-title">${icons[n.type] || ''} ${n.title}</span>
            <span class="notification-item-time">${timeAgo}</span>
          </div>
          <div class="notification-item-body">${n.body || ''}</div>
        </div>
      `;
    }).join('');
  }

  function formatTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  window.__markRead = function(id) {
    const n = notifications.find(n => n.id === id);
    if (n && !n.read) {
      n.read = true;
      unreadCount = Math.max(0, unreadCount - 1);
      updateBadge();
      renderNotifications();
      saveNotifications();
    }
  };

  window.__clearNotifications = function() {
    notifications = [];
    unreadCount = 0;
    updateBadge();
    renderNotifications();
    saveNotifications();
  };

  function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById('notificationPanel');
    if (panel) {
      panel.classList.toggle('show', panelOpen);
      if (panelOpen) renderNotifications();
    }
  }

  function saveNotifications() {
    localStorage.setItem('gex-notifications', JSON.stringify(notifications.slice(0, 50)));
  }

  function loadNotifications() {
    try {
      const stored = localStorage.getItem('gex-notifications');
      if (stored) {
        notifications = JSON.parse(stored);
        unreadCount = notifications.filter(n => !n.read).length;
        updateBadge();
      }
    } catch (e) {}
  }

  // Create notification bell in topbar
  function createNotificationBell() {
    const topbar = document.querySelector('.topbar > div:last-child');
    if (!topbar) return;

    const bell = document.createElement('div');
    bell.className = 'notification-bell';
    bell.innerHTML = `
      <span style="font-size: 18px;">🔔</span>
      <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
    `;
    bell.onclick = togglePanel;
    topbar.prepend(bell);

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'notification-panel';
    panel.id = 'notificationPanel';
    panel.innerHTML = `
      <div class="notification-header">
        <span class="notification-title">Notifications</span>
        <span class="notification-clear" onclick="window.__clearNotifications()">Clear all</span>
      </div>
      <div class="notification-list" id="notificationList"></div>
    `;
    document.body.appendChild(panel);

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (panelOpen && !e.target.closest('.notification-panel') && !e.target.closest('.notification-bell')) {
        togglePanel();
      }
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createNotificationBell();
      loadNotifications();
    });
  } else {
    createNotificationBell();
    loadNotifications();
  }

  // Export
  window.gexNotify = { add: addNotification, toast: showToast };

  console.log('🔔 Notifications system initialized');
})();
