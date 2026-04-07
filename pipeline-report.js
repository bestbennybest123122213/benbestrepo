#!/usr/bin/env node
/**
 * Pipeline Report Generator
 * 
 * Generates comprehensive reports in various formats.
 * 
 * Usage:
 *   node pipeline-report.js              # Console report
 *   node pipeline-report.js html         # Generate HTML report
 *   node pipeline-report.js markdown     # Generate markdown
 *   node pipeline-report.js json         # JSON export
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const FORMAT = args[0] || 'console';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  const report = generateReport(leads);

  switch (FORMAT) {
    case 'html':
      outputHTML(report);
      break;
    case 'markdown':
    case 'md':
      outputMarkdown(report);
      break;
    case 'json':
      outputJSON(report);
      break;
    default:
      outputConsole(report);
  }
}

function generateReport(leads) {
  const now = new Date();
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const info = leads.filter(l => l.reply_category === 'Information Request');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');

  // Age buckets
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const warm = unbooked.filter(l => { const a = getAgeDays(l.replied_at); return a > 3 && a <= 7; });
  const cool = unbooked.filter(l => { const a = getAgeDays(l.replied_at); return a > 7 && a <= 14; });
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);

  // Campaign breakdown
  const byCampaign = {};
  leads.forEach(l => {
    const camp = l.campaign_name || 'Unknown';
    if (!byCampaign[camp]) byCampaign[camp] = { total: 0, booked: 0 };
    byCampaign[camp].total++;
    if (l.reply_category === 'Booked') byCampaign[camp].booked++;
  });

  // Top campaigns
  const topCampaigns = Object.entries(byCampaign)
    .map(([name, stats]) => ({ name, ...stats, rate: stats.total > 0 ? stats.booked / stats.total : 0 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  // Health score
  const staleRate = unbooked.length > 0 ? stale.length / unbooked.length : 0;
  let healthScore = 100;
  if (staleRate > 0.5) healthScore -= 30;
  else if (staleRate > 0.3) healthScore -= 15;
  if (hot.length < 3) healthScore -= 20;
  healthScore = Math.max(0, healthScore);

  return {
    generatedAt: now.toISOString(),
    summary: {
      total: leads.length,
      booked: booked.length,
      meetings: meetings.length,
      interested: interested.length,
      info: info.length,
      bookingRate: ((booked.length / leads.length) * 100).toFixed(1),
      healthScore,
      healthGrade: healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : 'D'
    },
    pipeline: {
      hot: hot.length,
      warm: warm.length,
      cool: cool.length,
      stale: stale.length
    },
    revenue: {
      current: booked.length * 500,
      potential: (meetings.length * 0.4 + interested.length * 0.25) * 500,
      total: booked.length * 500 + (meetings.length * 0.4 + interested.length * 0.25) * 500
    },
    topCampaigns,
    topLeads: unbooked.slice(0, 10).map(l => ({
      name: l.lead_name,
      email: l.lead_email,
      company: l.lead_company,
      category: l.reply_category,
      age: getAgeDays(l.replied_at)
    }))
  };
}

function outputConsole(r) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 PIPELINE REPORT                                                      ║
║  Generated: ${new Date(r.generatedAt).toLocaleString()}                   ║
╚══════════════════════════════════════════════════════════════════════════╝

SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Health: ${r.summary.healthGrade} (${r.summary.healthScore}/100)
  Total Leads: ${r.summary.total}
  Booked: ${r.summary.booked} (${r.summary.bookingRate}%)
  Meetings: ${r.summary.meetings}
  Interested: ${r.summary.interested}

PIPELINE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔥 Hot (0-3d): ${r.pipeline.hot}
  🌡️ Warm (4-7d): ${r.pipeline.warm}
  ❄️ Cool (8-14d): ${r.pipeline.cool}
  ⚠️ Stale (15+d): ${r.pipeline.stale}

REVENUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current: $${r.revenue.current.toLocaleString()}
  Potential: +$${Math.round(r.revenue.potential).toLocaleString()}
  Total: $${Math.round(r.revenue.total).toLocaleString()}

TOP CAMPAIGNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  r.topCampaigns.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name.slice(0, 30)} (${(c.rate * 100).toFixed(0)}%)`);
  });

  console.log('');
}

function outputHTML(r) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Pipeline Report - ${new Date(r.generatedAt).toLocaleDateString()}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 2em; font-weight: bold; color: #f97316; }
    .metric-label { color: #666; }
    .section { margin: 30px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    .health-A { color: green; }
    .health-B { color: #f97316; }
    .health-C, .health-D { color: red; }
  </style>
</head>
<body>
  <h1>📊 Pipeline Report</h1>
  <p>Generated: ${new Date(r.generatedAt).toLocaleString()}</p>
  
  <div class="section">
    <h2>Summary</h2>
    <div class="metric">
      <div class="metric-value health-${r.summary.healthGrade}">${r.summary.healthGrade}</div>
      <div class="metric-label">Health Grade</div>
    </div>
    <div class="metric">
      <div class="metric-value">${r.summary.total}</div>
      <div class="metric-label">Total Leads</div>
    </div>
    <div class="metric">
      <div class="metric-value">${r.summary.booked}</div>
      <div class="metric-label">Booked (${r.summary.bookingRate}%)</div>
    </div>
  </div>
  
  <div class="section">
    <h2>Revenue</h2>
    <div class="metric">
      <div class="metric-value">$${r.revenue.current.toLocaleString()}</div>
      <div class="metric-label">Current</div>
    </div>
    <div class="metric">
      <div class="metric-value">$${Math.round(r.revenue.total).toLocaleString()}</div>
      <div class="metric-label">Potential Total</div>
    </div>
  </div>
  
  <div class="section">
    <h2>Pipeline Status</h2>
    <table>
      <tr><th>Stage</th><th>Count</th></tr>
      <tr><td>🔥 Hot (0-3d)</td><td>${r.pipeline.hot}</td></tr>
      <tr><td>🌡️ Warm (4-7d)</td><td>${r.pipeline.warm}</td></tr>
      <tr><td>❄️ Cool (8-14d)</td><td>${r.pipeline.cool}</td></tr>
      <tr><td>⚠️ Stale (15+d)</td><td>${r.pipeline.stale}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Top Leads</h2>
    <table>
      <tr><th>Name</th><th>Company</th><th>Category</th><th>Age</th></tr>
      ${r.topLeads.map(l => `<tr><td>${l.name}</td><td>${l.company || '-'}</td><td>${l.category}</td><td>${l.age}d</td></tr>`).join('')}
    </table>
  </div>
</body>
</html>`;

  const filename = `pipeline-report-${new Date().toISOString().split('T')[0]}.html`;
  fs.writeFileSync(filename, html);
  console.log(`✅ Report saved to ${filename}`);
}

function outputMarkdown(r) {
  const md = `# Pipeline Report
Generated: ${new Date(r.generatedAt).toLocaleString()}

## Summary
- **Health:** ${r.summary.healthGrade} (${r.summary.healthScore}/100)
- **Total Leads:** ${r.summary.total}
- **Booked:** ${r.summary.booked} (${r.summary.bookingRate}%)
- **Meetings:** ${r.summary.meetings}
- **Interested:** ${r.summary.interested}

## Pipeline Status
| Stage | Count |
|-------|-------|
| 🔥 Hot (0-3d) | ${r.pipeline.hot} |
| 🌡️ Warm (4-7d) | ${r.pipeline.warm} |
| ❄️ Cool (8-14d) | ${r.pipeline.cool} |
| ⚠️ Stale (15+d) | ${r.pipeline.stale} |

## Revenue
- **Current:** $${r.revenue.current.toLocaleString()}
- **Potential:** +$${Math.round(r.revenue.potential).toLocaleString()}
- **Total:** $${Math.round(r.revenue.total).toLocaleString()}

## Top Leads
| Name | Company | Category | Age |
|------|---------|----------|-----|
${r.topLeads.map(l => `| ${l.name} | ${l.company || '-'} | ${l.category} | ${l.age}d |`).join('\n')}
`;

  const filename = `pipeline-report-${new Date().toISOString().split('T')[0]}.md`;
  fs.writeFileSync(filename, md);
  console.log(`✅ Report saved to ${filename}`);
}

function outputJSON(r) {
  const filename = `pipeline-report-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(filename, JSON.stringify(r, null, 2));
  console.log(`✅ Report saved to ${filename}`);
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
