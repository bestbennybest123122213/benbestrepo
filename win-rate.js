#!/usr/bin/env node
/**
 * Win Rate Calculator
 * 
 * Tracks conversion rates and trends across different segments.
 * Helps identify what's working and what needs improvement.
 * 
 * Usage:
 *   node win-rate.js                 # Overall win rates
 *   node win-rate.js by-source       # Breakdown by source
 *   node win-rate.js by-category     # Breakdown by initial category
 *   node win-rate.js trends          # Weekly trends
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'overview';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  switch (VIEW) {
    case 'by-source':
      showBySource(leads);
      break;
    case 'by-category':
      showByCategory(leads);
      break;
    case 'trends':
      showTrends(leads);
      break;
    default:
      showOverview(leads);
  }
}

function showOverview(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📈 WIN RATE CALCULATOR                                                  ║
║  Conversion analysis and trends                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const info = leads.filter(l => l.reply_category === 'Information Request');

  const winRate = ((booked.length / total) * 100).toFixed(1);
  const meetingToBookRate = meetings.length > 0 
    ? ((booked.length / (booked.length + meetings.length)) * 100).toFixed(1)
    : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 OVERALL CONVERSION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Total Leads:           ${total}`);
  console.log(`  ✅ Booked:             ${booked.length} (${winRate}%)`);
  console.log(`  🤝 Meeting Requests:   ${meetings.length}`);
  console.log(`  💡 Interested:         ${interested.length}`);
  console.log(`  ❓ Info Requests:      ${info.length}`);
  console.log('');
  console.log(`  Meeting → Booking:     ${meetingToBookRate}%`);
  console.log('');

  // Funnel visualization
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CONVERSION FUNNEL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const maxBar = 40;
  const bar = (count) => {
    const width = Math.round((count / total) * maxBar);
    return '█'.repeat(width) + '░'.repeat(maxBar - width);
  };

  console.log(`  Replies     ${bar(total)} ${total} (100%)`);
  console.log(`  Meetings    ${bar(meetings.length + booked.length)} ${meetings.length + booked.length} (${((meetings.length + booked.length) / total * 100).toFixed(0)}%)`);
  console.log(`  Booked      ${bar(booked.length)} ${booked.length} (${winRate}%)`);
  console.log('');

  // By company size
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 BY COMPANY SIZE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const sizes = ['enterprise', 'midmarket', 'smb', 'startup'];
  sizes.forEach(size => {
    const sizeLeads = leads.filter(l => l.company_size === size);
    const sizeBooked = sizeLeads.filter(l => l.reply_category === 'Booked');
    if (sizeLeads.length > 0) {
      const rate = ((sizeBooked.length / sizeLeads.length) * 100).toFixed(0);
      console.log(`  ${size.padEnd(12)} ${sizeBooked.length}/${sizeLeads.length} (${rate}%)`);
    }
  });

  const unknownSize = leads.filter(l => !l.company_size);
  const unknownBooked = unknownSize.filter(l => l.reply_category === 'Booked');
  if (unknownSize.length > 0) {
    const rate = ((unknownBooked.length / unknownSize.length) * 100).toFixed(0);
    console.log(`  ${'unknown'.padEnd(12)} ${unknownBooked.length}/${unknownSize.length} (${rate}%)`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  node win-rate.js by-source   # By campaign source');
  console.log('  node win-rate.js trends      # Weekly trends');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function showBySource(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 WIN RATE BY SOURCE                                                   ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Group by campaign/source
  const sources = {};
  leads.forEach(l => {
    const source = l.campaign_name || l.source || 'Unknown';
    if (!sources[source]) {
      sources[source] = { total: 0, booked: 0 };
    }
    sources[source].total++;
    if (l.reply_category === 'Booked') sources[source].booked++;
  });

  // Sort by total
  const sorted = Object.entries(sources)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);

  console.log('  Source                        | Total | Booked | Rate');
  console.log('  ─────────────────────────────┼───────┼────────┼──────');

  sorted.forEach(([source, data]) => {
    const rate = ((data.booked / data.total) * 100).toFixed(0);
    const shortSource = source.slice(0, 30).padEnd(30);
    console.log(`  ${shortSource} | ${data.total.toString().padStart(5)} | ${data.booked.toString().padStart(6)} | ${rate}%`);
  });

  console.log('');
}

function showByCategory(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 CONVERSION BY INITIAL RESPONSE                                       ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const categories = {};
  leads.forEach(l => {
    const cat = l.reply_category || 'Unknown';
    if (!categories[cat]) {
      categories[cat] = { count: 0, examples: [] };
    }
    categories[cat].count++;
    if (categories[cat].examples.length < 3) {
      categories[cat].examples.push(l.lead_name);
    }
  });

  console.log('  Category                | Count | % of Total');
  console.log('  ───────────────────────┼───────┼───────────');

  const total = leads.length;
  Object.entries(categories)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([cat, data]) => {
      const pct = ((data.count / total) * 100).toFixed(1);
      console.log(`  ${cat.padEnd(22)} | ${data.count.toString().padStart(5)} | ${pct}%`);
    });

  console.log('');
}

function showTrends(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📈 WEEKLY CONVERSION TRENDS                                             ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Group by week
  const weeks = {};
  leads.forEach(l => {
    const date = new Date(l.created_at);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = { total: 0, booked: 0 };
    }
    weeks[weekKey].total++;
    if (l.reply_category === 'Booked') weeks[weekKey].booked++;
  });

  // Show last 8 weeks
  const sortedWeeks = Object.entries(weeks)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .reverse();

  console.log('  Week Starting      | Leads | Booked | Rate  | Trend');
  console.log('  ──────────────────┼───────┼────────┼───────┼──────────────────');

  let prevRate = null;
  sortedWeeks.forEach(([week, data]) => {
    const rate = data.total > 0 ? (data.booked / data.total) * 100 : 0;
    const rateStr = rate.toFixed(0) + '%';
    
    let trend = '';
    if (prevRate !== null) {
      const diff = rate - prevRate;
      if (diff > 5) trend = '📈 +' + diff.toFixed(0) + '%';
      else if (diff < -5) trend = '📉 ' + diff.toFixed(0) + '%';
      else trend = '➡️  stable';
    }
    
    const bar = '█'.repeat(Math.round(rate / 5));
    console.log(`  ${week.padEnd(18)} | ${data.total.toString().padStart(5)} | ${data.booked.toString().padStart(6)} | ${rateStr.padStart(5)} | ${bar} ${trend}`);
    
    prevRate = rate;
  });

  console.log('');
  
  // Calculate overall trend
  if (sortedWeeks.length >= 2) {
    const firstWeek = sortedWeeks[0][1];
    const lastWeek = sortedWeeks[sortedWeeks.length - 1][1];
    const firstRate = firstWeek.total > 0 ? (firstWeek.booked / firstWeek.total) * 100 : 0;
    const lastRate = lastWeek.total > 0 ? (lastWeek.booked / lastWeek.total) * 100 : 0;
    const overallTrend = lastRate - firstRate;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (overallTrend > 0) {
      console.log(`  📈 Overall trend: UP ${overallTrend.toFixed(1)}% over ${sortedWeeks.length} weeks`);
    } else if (overallTrend < 0) {
      console.log(`  📉 Overall trend: DOWN ${Math.abs(overallTrend).toFixed(1)}% over ${sortedWeeks.length} weeks`);
    } else {
      console.log(`  ➡️ Overall trend: STABLE over ${sortedWeeks.length} weeks`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  console.log('');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
