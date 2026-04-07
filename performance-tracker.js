#!/usr/bin/env node
/**
 * Performance Tracker
 * 
 * Tracks key metrics over time and identifies trends:
 * - Daily snapshots
 * - Week-over-week comparisons
 * - Trend analysis
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');

const HISTORY_FILE = 'performance-history.json';

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return { snapshots: [] };
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function captureSnapshot() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  if (!leads) throw new Error('No data');

  const now = new Date();
  const snapshot = {
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    metrics: {
      total: leads.length,
      booked: leads.filter(l => l.reply_category === 'Booked').length,
      meetings: leads.filter(l => l.reply_category === 'Meeting Request').length,
      interested: leads.filter(l => l.reply_category === 'Interested').length,
      info: leads.filter(l => l.reply_category === 'Information Request').length
    }
  };

  snapshot.metrics.bookingRate = ((snapshot.metrics.booked / snapshot.metrics.total) * 100).toFixed(2);
  snapshot.metrics.unbooked = snapshot.metrics.total - snapshot.metrics.booked;

  return snapshot;
}

async function recordSnapshot() {
  console.log('\n📊 Recording performance snapshot...\n');
  
  const snapshot = await captureSnapshot();
  const history = loadHistory();
  
  // Check if we already have today's snapshot
  const todayIndex = history.snapshots.findIndex(s => s.date === snapshot.date);
  if (todayIndex >= 0) {
    history.snapshots[todayIndex] = snapshot;
    console.log('📝 Updated today\'s snapshot');
  } else {
    history.snapshots.push(snapshot);
    console.log('📝 Created new snapshot');
  }
  
  // Keep last 90 days
  history.snapshots = history.snapshots.slice(-90);
  
  saveHistory(history);
  
  console.log(`\n📅 ${snapshot.date}`);
  console.log(`   Total: ${snapshot.metrics.total}`);
  console.log(`   Booked: ${snapshot.metrics.booked} (${snapshot.metrics.bookingRate}%)`);
  console.log(`   Meetings: ${snapshot.metrics.meetings}`);
  console.log(`   Interested: ${snapshot.metrics.interested}`);
  
  return snapshot;
}

function analyzeTrends() {
  const history = loadHistory();
  const snapshots = history.snapshots;
  
  if (snapshots.length < 2) {
    console.log('\n⚠️  Need at least 2 snapshots for trend analysis');
    console.log('   Run "node performance-tracker.js record" daily');
    return;
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📈 PERFORMANCE TRENDS                                                   ║
║  Based on ${snapshots.length} snapshots                                             ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];
  
  // Day-over-day
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 Day-over-Day Changes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const metrics = ['total', 'booked', 'meetings', 'interested'];
  metrics.forEach(m => {
    const curr = latest.metrics[m];
    const prev = previous.metrics[m];
    const diff = curr - prev;
    const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : 0;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const color = diff > 0 ? '🟢' : diff < 0 ? '🔴' : '⚪';
    console.log(`  ${color} ${m.padEnd(12)} ${curr.toString().padStart(5)} ${arrow} ${diff >= 0 ? '+' : ''}${diff} (${pct}%)`);
  });

  // Week-over-week (if we have 7+ days)
  if (snapshots.length >= 7) {
    const weekAgo = snapshots[snapshots.length - 7];
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📆 Week-over-Week Changes');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    metrics.forEach(m => {
      const curr = latest.metrics[m];
      const prev = weekAgo.metrics[m];
      const diff = curr - prev;
      const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : 0;
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      const color = diff > 0 ? '🟢' : diff < 0 ? '🔴' : '⚪';
      console.log(`  ${color} ${m.padEnd(12)} ${curr.toString().padStart(5)} ${arrow} ${diff >= 0 ? '+' : ''}${diff} (${pct}%)`);
    });
  }

  // Booking rate trend
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Booking Rate History (last 7 days)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const last7 = snapshots.slice(-7);
  last7.forEach(s => {
    const rate = parseFloat(s.metrics.bookingRate);
    const bar = '█'.repeat(Math.floor(rate / 2)) + '░'.repeat(50 - Math.floor(rate / 2));
    console.log(`  ${s.date.slice(5)}  ${bar} ${rate}%`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

async function main() {
  const action = process.argv[2] || 'trends';

  switch (action) {
    case 'record':
      await recordSnapshot();
      break;
    case 'trends':
    case 'analyze':
      analyzeTrends();
      break;
    default:
      console.log('Usage: node performance-tracker.js [record|trends]');
  }
}

module.exports = { captureSnapshot, recordSnapshot, analyzeTrends };

if (require.main === module) {
  main().catch(console.error);
}
