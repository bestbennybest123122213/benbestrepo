#!/usr/bin/env node
/**
 * Full Report Generator
 * 
 * Generates a comprehensive HTML report with all metrics.
 * Perfect for sharing or archiving.
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function generateReport() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Calculate metrics
  const metrics = {
    total: leads.length,
    booked: leads.filter(l => l.reply_category === 'Booked').length,
    meetings: leads.filter(l => l.reply_category === 'Meeting Request').length,
    interested: leads.filter(l => l.reply_category === 'Interested').length,
    info: leads.filter(l => l.reply_category === 'Information Request').length,
    hot: leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked').length,
    warm: leads.filter(l => getAge(l) > 3 && getAge(l) <= 7 && l.reply_category !== 'Booked').length,
    cool: leads.filter(l => getAge(l) > 7 && getAge(l) <= 14 && l.reply_category !== 'Booked').length,
    stale: leads.filter(l => getAge(l) > 14 && l.reply_category !== 'Booked').length,
    enterprise: leads.filter(l => {
      const info = getCompanyInfo(l.lead_email);
      return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
    }).length
  };

  metrics.bookingRate = ((metrics.booked / metrics.total) * 100).toFixed(1);
  metrics.unbooked = metrics.total - metrics.booked;

  // Get top leads
  const topLeads = leads
    .filter(l => l.reply_category !== 'Booked')
    .slice(0, 20)
    .map(l => {
      const info = getCompanyInfo(l.lead_email);
      return {
        name: l.lead_name || 'N/A',
        email: l.lead_email,
        company: info?.name || l.lead_company || 'N/A',
        category: l.reply_category,
        age: getAge(l),
        tier: info?.tier || 'standard',
        funding: info?.funding
      };
    });

  // Enterprise leads
  const enterpriseLeads = leads
    .filter(l => {
      const info = getCompanyInfo(l.lead_email);
      return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
    })
    .map(l => {
      const info = getCompanyInfo(l.lead_email);
      return {
        name: l.lead_name || 'N/A',
        company: info?.name || 'N/A',
        category: l.reply_category,
        age: getAge(l),
        funding: info?.funding
      };
    });

  const date = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  // Generate HTML report
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GEX Pipeline Report - ${date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #1a1a1a;
      line-height: 1.6;
      padding: 40px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e0e0e0;
    }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .date { color: #666; font-size: 14px; }
    .section { margin-bottom: 32px; }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .stat-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .stat-value.green { color: #22c55e; }
    .stat-value.red { color: #ef4444; }
    .stat-value.orange { color: #f97316; }
    .stat-value.blue { color: #3b82f6; }
    table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #f0f0f0;
    }
    th {
      background: #f8f8f8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-meeting { background: #dcfce7; color: #16a34a; }
    .badge-interested { background: #dbeafe; color: #2563eb; }
    .badge-info { background: #f3f4f6; color: #6b7280; }
    .badge-enterprise { background: #fef3c7; color: #d97706; }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #888;
      font-size: 12px;
    }
    @media print {
      body { background: white; padding: 20px; }
      .stat-card { box-shadow: none; border: 1px solid #e0e0e0; }
      table { box-shadow: none; border: 1px solid #e0e0e0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 GEX Pipeline Report</h1>
      <div class="date">${date}</div>
    </div>

    <div class="section">
      <div class="section-title">📊 Pipeline Overview</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${metrics.total}</div>
          <div class="stat-label">Total Leads</div>
        </div>
        <div class="stat-card">
          <div class="stat-value green">${metrics.booked}</div>
          <div class="stat-label">Booked (${metrics.bookingRate}%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value orange">${metrics.meetings}</div>
          <div class="stat-label">Meeting Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value blue">${metrics.enterprise}</div>
          <div class="stat-label">Enterprise</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">⏱️ Response Windows</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value red">${metrics.hot}</div>
          <div class="stat-label">Hot (0-3d)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value orange">${metrics.warm}</div>
          <div class="stat-label">Warm (4-7d)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${metrics.cool}</div>
          <div class="stat-label">Cool (8-14d)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${metrics.stale}</div>
          <div class="stat-label">Stale (15+d)</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🏢 Enterprise Leads (${enterpriseLeads.length})</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Category</th>
            <th>Age</th>
            <th>Funding</th>
          </tr>
        </thead>
        <tbody>
          ${enterpriseLeads.map(l => `
            <tr>
              <td>${l.name}</td>
              <td>${l.company}</td>
              <td><span class="badge badge-${l.category === 'Meeting Request' ? 'meeting' : 'interested'}">${l.category}</span></td>
              <td>${l.age}d</td>
              <td>${l.funding || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">📋 Recent Leads (Top 20)</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Category</th>
            <th>Age</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          ${topLeads.map(l => `
            <tr>
              <td>${l.name}</td>
              <td>${l.company}</td>
              <td><span class="badge badge-${l.category === 'Meeting Request' ? 'meeting' : l.category === 'Interested' ? 'interested' : 'info'}">${l.category}</span></td>
              <td>${l.age}d</td>
              <td>${l.tier === 'enterprise' ? '<span class="badge badge-enterprise">Enterprise</span>' : l.tier}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Generated by GEX OS • ${new Date().toLocaleString('en-GB')}
    </div>
  </div>
</body>
</html>`;

  // Save report
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `reports/report-${timestamp}.html`;
  
  if (!fs.existsSync('reports')) fs.mkdirSync('reports');
  fs.writeFileSync(filename, html);

  console.log(`\n✅ Report generated: ${filename}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${metrics.total} leads`);
  console.log(`   Booked: ${metrics.booked} (${metrics.bookingRate}%)`);
  console.log(`   Enterprise: ${metrics.enterprise}`);
  console.log(`   Hot: ${metrics.hot} | Stale: ${metrics.stale}`);
  console.log(`\n   Open in browser: file://${process.cwd()}/${filename}`);

  return filename;
}

module.exports = { generateReport };

if (require.main === module) {
  generateReport().catch(console.error);
}
