/**
 * Dashboard Visualizations
 * 
 * Rich charts and graphs using Chart.js:
 * - Pipeline funnel
 * - Response time distribution
 * - Booking rate trend
 * - Lead source breakdown
 * - Enterprise vs SMB
 * - Weekly performance
 */

(function() {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    /* Chart containers */
    .viz-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .viz-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .viz-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .viz-chart {
      position: relative;
      height: 280px;
    }
    .viz-chart-sm {
      height: 200px;
    }
    .viz-chart-lg {
      height: 400px;
    }

    /* Funnel visualization */
    .funnel-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 20px;
    }
    .funnel-step {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .funnel-bar {
      height: 40px;
      background: linear-gradient(90deg, var(--accent), var(--accent-hover));
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 12px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      transition: width 0.5s ease-out;
    }
    .funnel-label {
      min-width: 140px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .funnel-value {
      min-width: 80px;
      text-align: right;
      font-weight: 600;
    }

    /* Heatmap */
    .heatmap-container {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }
    .heatmap-cell {
      aspect-ratio: 1;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .heatmap-cell:hover {
      transform: scale(1.1);
    }
    .heatmap-label {
      font-size: 10px;
      color: var(--text-dim);
      text-align: center;
      padding: 4px;
    }

    /* Metric cards grid */
    .metric-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    }
    .metric-card {
      background: var(--bg-dark);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .metric-card-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }
    .metric-card-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .metric-card-trend {
      font-size: 11px;
      margin-top: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .metric-card-trend.up { background: var(--green-bg); color: var(--green); }
    .metric-card-trend.down { background: var(--red-bg); color: var(--red); }

    /* Comparison bars */
    .compare-bars {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .compare-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .compare-label {
      min-width: 100px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .compare-bar-container {
      flex: 1;
      height: 24px;
      background: var(--bg-dark);
      border-radius: 4px;
      overflow: hidden;
      display: flex;
    }
    .compare-bar-a {
      background: var(--hypertide);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }
    .compare-bar-b {
      background: var(--google);
      display: flex;
      align-items: center;
      padding-left: 8px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    /* Donut chart center label */
    .donut-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    .donut-center-value {
      font-size: 32px;
      font-weight: 700;
    }
    .donut-center-label {
      font-size: 12px;
      color: var(--text-muted);
    }
  `;
  document.head.appendChild(style);

  // ==================== VISUALIZATION GENERATORS ====================

  window.gexViz = {
    /**
     * Create a funnel visualization
     */
    funnel: (containerId, data) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      const maxValue = Math.max(...data.map(d => d.value));
      
      container.innerHTML = `
        <div class="funnel-container">
          ${data.map((step, i) => {
            const width = (step.value / maxValue * 100);
            const color = step.color || `hsl(${30 + i * 30}, 80%, 55%)`;
            return `
              <div class="funnel-step">
                <span class="funnel-label">${step.label}</span>
                <div class="funnel-bar" style="width: ${width}%; background: ${color};">
                  ${step.value}
                </div>
                <span class="funnel-value">${step.pct || ''}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    /**
     * Create a heatmap (e.g., response times by day/hour)
     */
    heatmap: (containerId, data, options = {}) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      const { labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } = options;
      const maxValue = Math.max(...data.flat());
      
      const getColor = (value) => {
        if (value === 0) return 'var(--bg-dark)';
        const intensity = value / maxValue;
        const hue = 120 - (intensity * 120); // Green to red
        return `hsla(${hue}, 70%, 50%, ${0.3 + intensity * 0.7})`;
      };

      container.innerHTML = `
        <div class="heatmap-container">
          ${labels.map(l => `<div class="heatmap-label">${l}</div>`).join('')}
          ${data.flat().map((value, i) => `
            <div class="heatmap-cell" 
                 style="background: ${getColor(value)}; color: ${value > maxValue * 0.5 ? 'white' : 'var(--text)'}"
                 title="${value} leads">
              ${value || ''}
            </div>
          `).join('')}
        </div>
      `;
    },

    /**
     * Create metric cards
     */
    metricCards: (containerId, metrics) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = `
        <div class="metric-cards">
          ${metrics.map(m => `
            <div class="metric-card">
              <div class="metric-card-value" style="color: ${m.color || 'var(--text)'}">
                ${m.value}
              </div>
              <div class="metric-card-label">${m.label}</div>
              ${m.trend !== undefined ? `
                <span class="metric-card-trend ${m.trend >= 0 ? 'up' : 'down'}">
                  ${m.trend >= 0 ? '↑' : '↓'} ${Math.abs(m.trend)}%
                </span>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    },

    /**
     * Create comparison bars (A vs B)
     */
    compareBars: (containerId, data) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = `
        <div class="compare-bars">
          ${data.map(row => {
            const total = row.a + row.b;
            const pctA = total > 0 ? (row.a / total * 100).toFixed(0) : 50;
            const pctB = total > 0 ? (row.b / total * 100).toFixed(0) : 50;
            return `
              <div class="compare-row">
                <span class="compare-label">${row.label}</span>
                <div class="compare-bar-container">
                  <div class="compare-bar-a" style="width: ${pctA}%">${row.a}</div>
                  <div class="compare-bar-b" style="width: ${pctB}%">${row.b}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    /**
     * Create a donut chart with Chart.js
     */
    donut: (containerId, data, centerLabel = '') => {
      const container = document.getElementById(containerId);
      if (!container || !window.Chart) return;

      // Clear existing
      container.innerHTML = `
        <div class="viz-chart" style="position: relative;">
          <canvas id="${containerId}-canvas"></canvas>
          <div class="donut-center">
            <div class="donut-center-value">${data.reduce((a, b) => a + b.value, 0)}</div>
            <div class="donut-center-label">${centerLabel}</div>
          </div>
        </div>
      `;

      const ctx = document.getElementById(`${containerId}-canvas`).getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.label),
          datasets: [{
            data: data.map(d => d.value),
            backgroundColor: data.map(d => d.color),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#888', font: { size: 11 } }
            }
          }
        }
      });
    },

    /**
     * Create a line chart
     */
    lineChart: (containerId, data, options = {}) => {
      const container = document.getElementById(containerId);
      if (!container || !window.Chart) return;

      container.innerHTML = `<div class="viz-chart"><canvas id="${containerId}-canvas"></canvas></div>`;

      const ctx = document.getElementById(`${containerId}-canvas`).getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: data.datasets.map(ds => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.color,
            backgroundColor: ds.color + '20',
            tension: 0.3,
            fill: ds.fill || false
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#888', font: { size: 11 } }
            }
          },
          scales: {
            x: { grid: { color: '#2a2a2a' }, ticks: { color: '#888' } },
            y: { grid: { color: '#2a2a2a' }, ticks: { color: '#888' }, beginAtZero: true }
          }
        }
      });
    },

    /**
     * Create a bar chart
     */
    barChart: (containerId, data, options = {}) => {
      const container = document.getElementById(containerId);
      if (!container || !window.Chart) return;

      container.innerHTML = `<div class="viz-chart"><canvas id="${containerId}-canvas"></canvas></div>`;

      const ctx = document.getElementById(`${containerId}-canvas`).getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: data.datasets.map(ds => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: ds.color,
            borderRadius: 4
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: data.datasets.length > 1,
              position: 'top',
              labels: { color: '#888', font: { size: 11 } }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#888' } },
            y: { grid: { color: '#2a2a2a' }, ticks: { color: '#888' }, beginAtZero: true }
          }
        }
      });
    },

    /**
     * Create a gauge chart
     */
    gauge: (containerId, value, max = 100, options = {}) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      const pct = Math.min(100, (value / max) * 100);
      const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)';
      const circumference = 2 * Math.PI * 45;
      const offset = circumference - (pct / 100) * circumference * 0.75; // 270 degrees

      container.innerHTML = `
        <div style="position: relative; width: 150px; height: 120px; margin: 0 auto;">
          <svg viewBox="0 0 100 80" style="transform: rotate(-135deg);">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" stroke-width="8"/>
            <circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="8"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    stroke-linecap="round"/>
          </svg>
          <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); text-align: center;">
            <div style="font-size: 24px; font-weight: 700;">${value}${options.suffix || '%'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${options.label || ''}</div>
          </div>
        </div>
      `;
    }
  };

  console.log('📊 Visualizations library loaded');
})();
