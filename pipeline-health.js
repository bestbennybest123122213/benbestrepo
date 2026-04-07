#!/usr/bin/env node
/**
 * Pipeline Health Monitor
 * 
 * Quick health check of the entire pipeline with actionable insights.
 * Identifies bottlenecks, trends, and areas needing attention.
 * 
 * Usage:
 *   node pipeline-health.js           # Full health check
 *   node pipeline-health.js quick     # One-line summary
 *   node pipeline-health.js issues    # Show only issues
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'full';

// Health thresholds
const THRESHOLDS = {
  staleRate: { warning: 0.3, critical: 0.5 },  // % of unbooked
  hotLeads: { warning: 3, critical: 1 },        // minimum hot leads
  responseRate: { warning: 0.2, critical: 0.05 }, // fast response %
  meetingConversion: { warning: 0.3, critical: 0.15 }, // meeting → booking
  avgAge: { warning: 14, critical: 21 }         // average lead age
};

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

  const health = calculateHealth(leads);

  switch (VIEW) {
    case 'quick':
      showQuick(health);
      break;
    case 'issues':
      showIssues(health);
      break;
    default:
      showFull(health);
  }
}

function calculateHealth(leads) {
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  
  // Age calculations
  const ages = unbooked.map(l => getAgeDays(l.replied_at)).filter(a => a < 999);
  const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  
  // Buckets
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);
  
  // Rates
  const bookingRate = total > 0 ? booked.length / total : 0;
  const staleRate = unbooked.length > 0 ? stale.length / unbooked.length : 0;
  const meetingConversion = (meetings.length + booked.length) > 0 
    ? booked.length / (meetings.length + booked.length) 
    : 0;

  // Issues
  const issues = [];
  
  if (staleRate >= THRESHOLDS.staleRate.critical) {
    issues.push({ severity: 'critical', message: `${(staleRate * 100).toFixed(0)}% of pipeline is stale (>15 days)` });
  } else if (staleRate >= THRESHOLDS.staleRate.warning) {
    issues.push({ severity: 'warning', message: `${(staleRate * 100).toFixed(0)}% of pipeline is going stale` });
  }

  if (hot.length < THRESHOLDS.hotLeads.critical) {
    issues.push({ severity: 'critical', message: `Only ${hot.length} hot leads - need more prospecting` });
  } else if (hot.length < THRESHOLDS.hotLeads.warning) {
    issues.push({ severity: 'warning', message: `Only ${hot.length} hot leads in queue` });
  }

  if (avgAge >= THRESHOLDS.avgAge.critical) {
    issues.push({ severity: 'critical', message: `Average lead age is ${avgAge.toFixed(0)} days - too slow` });
  } else if (avgAge >= THRESHOLDS.avgAge.warning) {
    issues.push({ severity: 'warning', message: `Average lead age is ${avgAge.toFixed(0)} days` });
  }

  if (meetingConversion < THRESHOLDS.meetingConversion.critical) {
    issues.push({ severity: 'critical', message: `Only ${(meetingConversion * 100).toFixed(0)}% of meetings convert to bookings` });
  } else if (meetingConversion < THRESHOLDS.meetingConversion.warning) {
    issues.push({ severity: 'warning', message: `Meeting conversion rate is ${(meetingConversion * 100).toFixed(0)}%` });
  }

  // Overall health score (0-100)
  let score = 100;
  issues.forEach(i => {
    score -= i.severity === 'critical' ? 20 : 10;
  });
  score = Math.max(0, score);

  return {
    total,
    booked: booked.length,
    unbooked: unbooked.length,
    meetings: meetings.length,
    hot: hot.length,
    stale: stale.length,
    avgAge,
    bookingRate,
    staleRate,
    meetingConversion,
    score,
    issues,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  };
}

function showQuick(h) {
  const emoji = h.score >= 80 ? '🟢' : h.score >= 60 ? '🟡' : h.score >= 40 ? '🟠' : '🔴';
  console.log(`${emoji} Pipeline Health: ${h.grade} (${h.score}/100) | ${h.booked}/${h.total} booked (${(h.bookingRate * 100).toFixed(0)}%) | ${h.hot} hot | ${h.stale} stale | ${h.issues.length} issues`);
}

function showIssues(h) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚠️  PIPELINE ISSUES                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (h.issues.length === 0) {
    console.log('  ✅ No critical issues found!\n');
    return;
  }

  const critical = h.issues.filter(i => i.severity === 'critical');
  const warnings = h.issues.filter(i => i.severity === 'warning');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL');
    console.log('─'.repeat(60));
    critical.forEach(i => console.log(`  • ${i.message}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('🟠 WARNINGS');
    console.log('─'.repeat(60));
    warnings.forEach(i => console.log(`  • ${i.message}`));
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Fixes:');
  if (critical.some(i => i.message.includes('stale'))) {
    console.log('    • Run: node gex.js reengage');
  }
  if (critical.some(i => i.message.includes('hot'))) {
    console.log('    • Run: node gex.js fast');
  }
  if (critical.some(i => i.message.includes('conversion'))) {
    console.log('    • Run: node gex.js closer');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function showFull(h) {
  const emoji = h.score >= 80 ? '🟢' : h.score >= 60 ? '🟡' : h.score >= 40 ? '🟠' : '🔴';

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏥 PIPELINE HEALTH CHECK                                                ║
╚══════════════════════════════════════════════════════════════════════════╝

  ${emoji} Overall Health: ${h.grade} (${h.score}/100)
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 KEY METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Total Pipeline:      ${h.total} leads`);
  console.log(`  ✅ Booked:           ${h.booked} (${(h.bookingRate * 100).toFixed(1)}%)`);
  console.log(`  🤝 Meetings:         ${h.meetings} pending`);
  console.log(`  🔥 Hot (0-3d):       ${h.hot}`);
  console.log(`  ⚠️  Stale (15+d):     ${h.stale} (${(h.staleRate * 100).toFixed(0)}% of unbooked)`);
  console.log(`  📊 Avg Age:          ${h.avgAge.toFixed(1)} days`);
  console.log(`  📈 Meeting→Book:     ${(h.meetingConversion * 100).toFixed(1)}%`);
  console.log('');

  // Health indicators
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 HEALTH INDICATORS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  const indicators = [
    { name: 'Stale Rate', value: h.staleRate, target: 0.3, inverse: true },
    { name: 'Hot Leads', value: h.hot, target: 5, inverse: false },
    { name: 'Avg Age', value: h.avgAge, target: 10, inverse: true },
    { name: 'Conversion', value: h.meetingConversion, target: 0.4, inverse: false }
  ];

  indicators.forEach(ind => {
    let status;
    if (ind.inverse) {
      status = ind.value <= ind.target ? '✅' : ind.value <= ind.target * 1.5 ? '🟡' : '🔴';
    } else {
      status = ind.value >= ind.target ? '✅' : ind.value >= ind.target * 0.5 ? '🟡' : '🔴';
    }
    const valueStr = typeof ind.value === 'number' && ind.value < 1 
      ? `${(ind.value * 100).toFixed(0)}%` 
      : ind.value.toFixed(1);
    console.log(`  ${status} ${ind.name.padEnd(15)} ${valueStr}`);
  });
  console.log('');

  // Issues
  if (h.issues.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  ISSUES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    h.issues.forEach(i => {
      const icon = i.severity === 'critical' ? '🔴' : '🟠';
      console.log(`  ${icon} ${i.message}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Quick: node pipeline-health.js quick');
  console.log('  Issues: node pipeline-health.js issues');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
