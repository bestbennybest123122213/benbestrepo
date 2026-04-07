/**
 * Stats Widgets - Reusable dashboard components
 */

(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* Mini Stats Card */
    .stat-mini {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .stat-mini-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .stat-mini-icon.green { background: var(--green-bg); }
    .stat-mini-icon.red { background: var(--red-bg); }
    .stat-mini-icon.yellow { background: var(--yellow-bg); }
    .stat-mini-icon.blue { background: var(--blue-bg); }
    .stat-mini-icon.accent { background: var(--orange-bg); }
    .stat-mini-content { flex: 1; }
    .stat-mini-value {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
    }
    .stat-mini-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .stat-mini-trend {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .stat-mini-trend.up { background: var(--green-bg); color: var(--green); }
    .stat-mini-trend.down { background: var(--red-bg); color: var(--red); }
    .stat-mini-trend.flat { background: rgba(136,136,136,0.2); color: var(--text-muted); }

    /* Progress Ring */
    .progress-ring {
      position: relative;
      width: 80px;
      height: 80px;
    }
    .progress-ring-circle {
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
    }
    .progress-ring-bg {
      fill: none;
      stroke: var(--border);
      stroke-width: 6;
    }
    .progress-ring-fill {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.5s ease;
    }
    .progress-ring-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 16px;
      font-weight: 700;
    }
    .progress-ring-label {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Sparkline */
    .sparkline {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 30px;
    }
    .sparkline-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 2px;
      opacity: 0.6;
      transition: opacity 0.1s, height 0.3s;
    }
    .sparkline-bar:hover {
      opacity: 1;
    }

    /* Metric Row */
    .metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .metric-row:last-child { border-bottom: none; }
    .metric-row-label {
      font-size: 13px;
      color: var(--text-muted);
    }
    .metric-row-value {
      font-size: 14px;
      font-weight: 600;
    }

    /* KPI Card */
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .kpi-card-value {
      font-size: 36px;
      font-weight: 700;
      line-height: 1.2;
    }
    .kpi-card-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .kpi-card-footer {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
    }
  `;
  document.head.appendChild(style);

  // Widget generators
  window.gexWidgets = {
    // Mini stat card
    miniStat: ({ icon, value, label, trend, color = 'accent' }) => `
      <div class="stat-mini">
        <div class="stat-mini-icon ${color}">${icon}</div>
        <div class="stat-mini-content">
          <div class="stat-mini-value">${value}</div>
          <div class="stat-mini-label">${label}</div>
        </div>
        ${trend !== undefined ? `<span class="stat-mini-trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}">${trend > 0 ? '+' : ''}${trend}%</span>` : ''}
      </div>
    `,

    // Progress ring
    progressRing: ({ value, max = 100, label, color = 'var(--accent)' }) => {
      const pct = Math.min(100, (value / max) * 100);
      const circumference = 2 * Math.PI * 35;
      const offset = circumference - (pct / 100) * circumference;
      return `
        <div class="progress-ring">
          <svg viewBox="0 0 80 80">
            <circle class="progress-ring-bg" cx="40" cy="40" r="35"/>
            <circle class="progress-ring-fill progress-ring-circle" cx="40" cy="40" r="35" 
                    style="stroke: ${color}; stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}"/>
          </svg>
          <span class="progress-ring-text">${pct.toFixed(0)}%</span>
          ${label ? `<span class="progress-ring-label">${label}</span>` : ''}
        </div>
      `;
    },

    // Sparkline chart
    sparkline: (data, maxHeight = 30) => {
      const max = Math.max(...data);
      return `
        <div class="sparkline">
          ${data.map(v => `<div class="sparkline-bar" style="height: ${(v / max) * maxHeight}px" title="${v}"></div>`).join('')}
        </div>
      `;
    },

    // KPI card
    kpiCard: ({ value, label, footer }) => `
      <div class="kpi-card">
        <div class="kpi-card-value">${value}</div>
        <div class="kpi-card-label">${label}</div>
        ${footer ? `<div class="kpi-card-footer">${footer}</div>` : ''}
      </div>
    `,

    // Metric row
    metricRow: ({ label, value }) => `
      <div class="metric-row">
        <span class="metric-row-label">${label}</span>
        <span class="metric-row-value">${value}</span>
      </div>
    `
  };

  console.log('📊 Stats widgets initialized');
})();
