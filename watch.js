#!/usr/bin/env node
/**
 * Watch Mode - Continuous monitoring with live updates
 * 
 * Shows a live dashboard that updates periodically.
 * Perfect for keeping on a second monitor.
 * 
 * Usage:
 *   node watch.js              # Update every 60 seconds
 *   node watch.js --fast       # Update every 10 seconds
 *   node watch.js --interval 30  # Custom interval
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const FAST = args.includes('--fast') || args.includes('-f');
const intervalIdx = args.indexOf('--interval');
const INTERVAL = intervalIdx > -1 ? parseInt(args[intervalIdx + 1]) * 1000 : (FAST ? 10000 : 60000);

let client = null;
let lastStats = null;

async function fetchStats() {
  if (!client) return null;
  
  const { data: leads } = await client
    .from('positive_replies')
    .select('*');
  
  if (!leads) return null;
  
  const now = Date.now();
  return {
    total: leads.length,
    booked: leads.filter(l => l.reply_category === 'Booked').length,
    hot: leads.filter(l => {
      if (!l.replied_at) return false;
      return (now - new Date(l.replied_at).getTime()) < 3 * 24 * 60 * 60 * 1000;
    }).length,
    stale: leads.filter(l => {
      if (!l.replied_at) return false;
      return (now - new Date(l.replied_at).getTime()) > 14 * 24 * 60 * 60 * 1000;
    }).length,
    meetingReq: leads.filter(l => l.reply_category === 'Meeting Request').length,
    interested: leads.filter(l => l.reply_category === 'Interested').length,
  };
}

function renderDashboard(stats, changed = {}) {
  // Clear screen
  console.clear();
  
  const now = new Date().toLocaleTimeString();
  const rate = stats.total > 0 ? ((stats.booked / stats.total) * 100).toFixed(1) : '0.0';
  
  // Determine change indicators
  const indicator = (key) => {
    if (!changed[key]) return ' ';
    return changed[key] > 0 ? '↑' : '↓';
  };
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 GEX LIVE MONITOR                                    ${now.padStart(12)}  ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║     PIPELINE                           CATEGORIES                        ║
║     ────────                           ──────────                        ║
║                                                                          ║
║     Total:     ${String(stats.total).padStart(5)} ${indicator('total')}                 📅 Meeting Req:  ${String(stats.meetingReq).padStart(4)}    ║
║     Booked:    ${String(stats.booked).padStart(5)} ${indicator('booked')}  (${rate.padStart(5)}%)       👍 Interested:   ${String(stats.interested).padStart(4)}    ║
║                                                                          ║
║     🔥 Hot:    ${String(stats.hot).padStart(5)} ${indicator('hot')}                                              ║
║     ⚠️  Stale:  ${String(stats.stale).padStart(5)} ${indicator('stale')}                                              ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Updating every ${(INTERVAL/1000).toString().padStart(2)}s | Press Ctrl+C to exit                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Show any significant changes
  if (Object.keys(changed).length > 0) {
    const changes = Object.entries(changed)
      .filter(([_, v]) => v !== 0)
      .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`)
      .join('  |  ');
    if (changes) {
      console.log(`  📢 Changes: ${changes}\n`);
    }
  }
}

async function update() {
  const stats = await fetchStats();
  
  if (!stats) {
    console.clear();
    console.log('\n  ❌ Database error - retrying...\n');
    return;
  }
  
  // Calculate changes
  const changed = {};
  if (lastStats) {
    ['total', 'booked', 'hot', 'stale'].forEach(key => {
      if (stats[key] !== lastStats[key]) {
        changed[key] = stats[key] - lastStats[key];
      }
    });
  }
  
  renderDashboard(stats, changed);
  lastStats = stats;
}

async function main() {
  client = initSupabase();
  
  if (!client) {
    console.error('❌ Database not configured');
    console.error('   Run: node gex.js doctor');
    process.exit(1);
  }
  
  console.log('🔄 Starting watch mode...\n');
  
  // Initial fetch
  await update();
  
  // Set up interval
  setInterval(update, INTERVAL);
  
  // Handle exit
  process.on('SIGINT', () => {
    console.log('\n\n  👋 Watch mode stopped\n');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
