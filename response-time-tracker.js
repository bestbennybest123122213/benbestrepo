#!/usr/bin/env node
/**
 * Response Time Tracker
 * 
 * Tracks and analyzes response times to improve the fast response rate.
 * Stores historical snapshots for trend analysis.
 * 
 * Usage:
 *   node response-time-tracker.js              # Show current metrics
 *   node response-time-tracker.js record       # Record a snapshot
 *   node response-time-tracker.js history      # Show trend over time
 *   node response-time-tracker.js leaderboard  # Show fastest/slowest responses
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ACTION = args[0] || 'show';
const HISTORY_FILE = path.join(__dirname, '.response-time-history.json');

// Thresholds (in hours)
const THRESHOLDS = {
  excellent: 1,    // <1 hour
  good: 4,         // <4 hours
  acceptable: 24,  // <24 hours
  poor: 48,        // <48 hours
  critical: 168    // >1 week
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  switch (ACTION) {
    case 'record':
      await recordSnapshot(client);
      break;
    case 'history':
      showHistory();
      break;
    case 'leaderboard':
      await showLeaderboard(client);
      break;
    default:
      await showMetrics(client);
  }
}

async function showMetrics(client) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⏱️  RESPONSE TIME TRACKER                                                ║
║  Measure and improve your lead response speed                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  // Calculate response times
  const responseTimes = leads
    .filter(l => l.replied_at && l.created_at)
    .map(l => {
      const replied = new Date(l.replied_at);
      const created = new Date(l.created_at);
      const hoursToRespond = (created - replied) / (1000 * 60 * 60);
      return {
        ...l,
        hoursToRespond: hoursToRespond > 0 ? hoursToRespond : null
      };
    })
    .filter(l => l.hoursToRespond !== null && l.hoursToRespond > 0 && l.hoursToRespond < 720);

  // Bucket analysis
  const buckets = {
    excellent: responseTimes.filter(l => l.hoursToRespond < THRESHOLDS.excellent),
    good: responseTimes.filter(l => l.hoursToRespond >= THRESHOLDS.excellent && l.hoursToRespond < THRESHOLDS.good),
    acceptable: responseTimes.filter(l => l.hoursToRespond >= THRESHOLDS.good && l.hoursToRespond < THRESHOLDS.acceptable),
    poor: responseTimes.filter(l => l.hoursToRespond >= THRESHOLDS.acceptable && l.hoursToRespond < THRESHOLDS.poor),
    critical: responseTimes.filter(l => l.hoursToRespond >= THRESHOLDS.poor)
  };

  const total = responseTimes.length || 1;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RESPONSE TIME DISTRIBUTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const bar = (count, max) => {
    const width = Math.round((count / max) * 30);
    return '█'.repeat(width) + '░'.repeat(30 - width);
  };

  const maxCount = Math.max(...Object.values(buckets).map(b => b.length));

  console.log(`  🚀 Excellent (<1h)    ${bar(buckets.excellent.length, maxCount)} ${buckets.excellent.length} (${((buckets.excellent.length / total) * 100).toFixed(1)}%)`);
  console.log(`  ✅ Good (1-4h)        ${bar(buckets.good.length, maxCount)} ${buckets.good.length} (${((buckets.good.length / total) * 100).toFixed(1)}%)`);
  console.log(`  🟡 Acceptable (4-24h) ${bar(buckets.acceptable.length, maxCount)} ${buckets.acceptable.length} (${((buckets.acceptable.length / total) * 100).toFixed(1)}%)`);
  console.log(`  🟠 Poor (1-2 days)    ${bar(buckets.poor.length, maxCount)} ${buckets.poor.length} (${((buckets.poor.length / total) * 100).toFixed(1)}%)`);
  console.log(`  🔴 Critical (>2 days) ${bar(buckets.critical.length, maxCount)} ${buckets.critical.length} (${((buckets.critical.length / total) * 100).toFixed(1)}%)`);
  console.log('');

  // Key metrics
  const avgHours = responseTimes.reduce((sum, l) => sum + l.hoursToRespond, 0) / total;
  const medianHours = responseTimes.length > 0 
    ? responseTimes.sort((a, b) => a.hoursToRespond - b.hoursToRespond)[Math.floor(responseTimes.length / 2)].hoursToRespond 
    : 0;
  const fastRate = ((buckets.excellent.length + buckets.good.length) / total * 100);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 KEY METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  📈 Fast Response Rate:  ${fastRate.toFixed(1)}%  (target: 80%)`);
  console.log(`  ⏰ Average Response:    ${formatTime(avgHours)}`);
  console.log(`  📊 Median Response:     ${formatTime(medianHours)}`);
  console.log(`  📉 Leads with data:     ${responseTimes.length}`);
  console.log('');

  // Recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (fastRate < 20) {
    console.log('  🔴 CRITICAL: Fast response rate is very low');
    console.log('     → Set up notifications for new replies');
    console.log('     → Use `node gex.js fast` to quickly draft responses');
    console.log('     → Consider automated first-response templates');
  } else if (fastRate < 50) {
    console.log('  🟠 NEEDS IMPROVEMENT: Many leads waiting too long');
    console.log('     → Check replies at least 3x daily');
    console.log('     → Use quick templates for common responses');
  } else if (fastRate < 80) {
    console.log('  🟡 GOOD PROGRESS: Getting better!');
    console.log('     → Focus on catching those overnight replies');
    console.log('     → Consider timezone-aware scheduling');
  } else {
    console.log('  🟢 EXCELLENT: Fast response rate is on target!');
    console.log('     → Keep up the great work');
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Record snapshot: node response-time-tracker.js record');
  console.log('  View history:    node response-time-tracker.js history');
  console.log('  Top/bottom:      node response-time-tracker.js leaderboard');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function recordSnapshot(client) {
  console.log('📸 Recording response time snapshot...\n');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  const responseTimes = leads
    .filter(l => l.replied_at && l.created_at)
    .map(l => {
      const replied = new Date(l.replied_at);
      const created = new Date(l.created_at);
      const hoursToRespond = (created - replied) / (1000 * 60 * 60);
      return hoursToRespond > 0 && hoursToRespond < 720 ? hoursToRespond : null;
    })
    .filter(Boolean);

  const total = responseTimes.length || 1;
  const excellent = responseTimes.filter(h => h < 1).length;
  const good = responseTimes.filter(h => h >= 1 && h < 4).length;
  const avgHours = responseTimes.reduce((a, b) => a + b, 0) / total;
  const fastRate = (excellent + good) / total * 100;

  const snapshot = {
    date: new Date().toISOString(),
    totalLeads: leads.length,
    leadsWithData: responseTimes.length,
    fastRate: fastRate.toFixed(1),
    avgHours: avgHours.toFixed(1),
    excellent,
    good
  };

  // Load and update history
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {}

  history.push(snapshot);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

  console.log(`  ✅ Snapshot recorded: ${snapshot.date}`);
  console.log(`  📈 Fast Rate: ${snapshot.fastRate}%`);
  console.log(`  ⏰ Avg Response: ${formatTime(parseFloat(snapshot.avgHours))}`);
  console.log(`  📊 Total snapshots: ${history.length}`);
}

function showHistory() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📈 RESPONSE TIME HISTORY                                                ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    console.log('  No history recorded yet. Run: node response-time-tracker.js record\n');
    return;
  }

  if (history.length === 0) {
    console.log('  No snapshots yet.\n');
    return;
  }

  console.log('  Date                  | Fast Rate | Avg Response | Leads');
  console.log('  ──────────────────────┼───────────┼──────────────┼──────');

  history.slice(-20).forEach(s => {
    const date = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
    const trend = s.fastRate > 50 ? '📈' : s.fastRate > 20 ? '➡️' : '📉';
    console.log(`  ${date.padEnd(20)} | ${s.fastRate.toString().padStart(6)}% ${trend} | ${formatTime(parseFloat(s.avgHours)).padStart(12)} | ${s.leadsWithData}`);
  });

  // Trend
  if (history.length >= 2) {
    const latest = parseFloat(history[history.length - 1].fastRate);
    const previous = parseFloat(history[history.length - 2].fastRate);
    const diff = latest - previous;
    const trendEmoji = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    console.log('');
    console.log(`  Trend: ${trendEmoji} ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% since last snapshot`);
  }
  console.log('');
}

async function showLeaderboard(client) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏆 RESPONSE TIME LEADERBOARD                                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  const responseTimes = leads
    .filter(l => l.replied_at && l.created_at)
    .map(l => {
      const replied = new Date(l.replied_at);
      const created = new Date(l.created_at);
      const hoursToRespond = (created - replied) / (1000 * 60 * 60);
      return {
        ...l,
        hoursToRespond: hoursToRespond > 0 && hoursToRespond < 720 ? hoursToRespond : null
      };
    })
    .filter(l => l.hoursToRespond !== null)
    .sort((a, b) => a.hoursToRespond - b.hoursToRespond);

  console.log('🚀 FASTEST RESPONSES (top 10)');
  console.log('────────────────────────────────────────────────────────────────');
  responseTimes.slice(0, 10).forEach((l, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`  ${medal} ${(i + 1).toString().padStart(2)}. ${formatTime(l.hoursToRespond).padStart(10)} - ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
  });

  console.log('');
  console.log('🐌 SLOWEST RESPONSES (bottom 10)');
  console.log('────────────────────────────────────────────────────────────────');
  responseTimes.slice(-10).reverse().forEach((l, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${formatTime(l.hoursToRespond).padStart(10)} - ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
  });

  console.log('');
}

function formatTime(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
