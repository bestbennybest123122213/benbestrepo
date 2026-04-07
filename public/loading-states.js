/**
 * Loading States - Skeleton loaders and progress indicators
 */

(function() {
  // CSS for loading states
  const style = document.createElement('style');
  style.textContent = `
    /* Progress bar at top */
    .progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 50%, transparent 50%);
      background-size: 200% 100%;
      animation: progress 1s infinite;
      z-index: 10001;
      display: none;
    }
    .progress-bar.active { display: block; }
    @keyframes progress {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Skeleton loaders */
    .skeleton {
      background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover) 50%, var(--bg-card) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .skeleton-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .skeleton-row {
      height: 16px;
      margin-bottom: 12px;
      border-radius: 4px;
    }
    .skeleton-row.short { width: 60%; }
    .skeleton-row.medium { width: 80%; }
    .skeleton-stat {
      height: 48px;
      border-radius: 8px;
    }

    /* Fade in animation */
    .fade-in {
      animation: fadeIn 0.3s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Refresh indicator */
    .refresh-indicator {
      position: fixed;
      top: 60px;
      right: 24px;
      background: var(--accent);
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      display: none;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .refresh-indicator.show { display: flex; align-items: center; gap: 8px; }
    .refresh-indicator .spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Empty state improvements */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .empty-state-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .empty-state-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }
    .empty-state-desc {
      font-size: 14px;
      max-width: 400px;
      margin: 0 auto;
    }
  `;
  document.head.appendChild(style);

  // Create progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.id = 'progressBar';
  document.body.prepend(progressBar);

  // Create refresh indicator
  const refreshIndicator = document.createElement('div');
  refreshIndicator.className = 'refresh-indicator';
  refreshIndicator.id = 'refreshIndicator';
  refreshIndicator.innerHTML = '<div class="spinner-small"></div> Refreshing...';
  document.body.appendChild(refreshIndicator);

  // Loading state helpers
  window.loadingState = {
    start: () => {
      document.getElementById('progressBar').classList.add('active');
      document.getElementById('refreshIndicator').classList.add('show');
    },
    end: () => {
      document.getElementById('progressBar').classList.remove('active');
      document.getElementById('refreshIndicator').classList.remove('show');
    },
    skeleton: (count = 3) => {
      return Array(count).fill(0).map(() => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row medium"></div>
          <div class="skeleton skeleton-row short"></div>
        </div>
      `).join('');
    },
    statsSkeleton: () => `
      <div class="summary-cards">
        ${Array(5).fill(0).map(() => `
          <div class="summary-card">
            <div class="skeleton skeleton-row short" style="height: 12px;"></div>
            <div class="skeleton skeleton-stat" style="margin: 12px 0;"></div>
            <div class="skeleton skeleton-row" style="height: 10px; width: 40%;"></div>
          </div>
        `).join('')}
      </div>
    `
  };

  // Empty state helper
  window.emptyState = (icon, title, desc) => `
    <div class="empty-state fade-in">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-desc">${desc}</div>
    </div>
  `;

  console.log('✨ Loading states initialized');
})();
