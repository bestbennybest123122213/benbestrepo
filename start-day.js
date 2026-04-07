#!/usr/bin/env node
/**
 * Morning Start - Complete morning routine in one command
 * 
 * Runs all morning checks and presents a unified briefing.
 * Perfect for starting the day.
 * 
 * Usage:
 *   node morning.js           # Full morning routine
 *   node morning.js --quick   # Quick summary only
 *   node morning.js --actions # Just action items
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getAgeDays, timeAgo, formatCurrency } = require('./lib/utils');
const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick') || args.includes('-q');
const ACTIONS_ONLY = args.includes('--actions') || args.includes('-a');

async function main() {
  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ☀️  ${greeting.padEnd(58)}     ║
║      ${dayName.padEnd(58)}     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const client = initSupabase();
  if (!client) {
    console.log('  ⚠️  Database not connected - running in offline mode\n');
    await runOfflineMorning();
    return;
  }

  // Fetch all data
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads || leads.length === 0) {
    console.log('  📭 No leads in pipeline yet\n');
    await runOfflineMorning();
    return;
  }

  const stats = calculateStats(leads);
  
  if (QUICK) {
    printQuickSummary(stats);
    return;
  }
  
  if (ACTIONS_ONLY) {
    printActions(stats);
    return;
  }

  // Full morning routine
  printOverview(stats);
  printActions(stats);
  printMissionControl();
  printQuickCommands();
}

function calculateStats(leads) {
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 1);
  const warm = unbooked.filter(l => getAgeDays(l.replied_at) > 1 && getAgeDays(l.replied_at) <= 3);
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 14);
  
  const meetingRequests = unbooked.filter(l => l.reply_category === 'Meeting Request');
  const interested = unbooked.filter(l => l.reply_category === 'Interested');
  
  // Revenue calculation
  const bookedValue = booked.length * 500;
  const pipelineValue = meetingRequests.length * 200 + interested.length * 100;
  
  return {
    total,
    booked,
    unbooked,
    hot,
    warm,
    stale,
    meetingRequests,
    interested,
    bookedValue,
    pipelineValue
  };
}

function printOverview(stats) {
  const bookRate = stats.total > 0 ? Math.round(stats.booked.length / stats.total * 100) : 0;
  
  console.log(`  📊 PIPELINE SNAPSHOT
  ═══════════════════════════════════════════════════════════════════════
  
     Total: ${stats.total}    Booked: ${stats.booked.length} (${bookRate}%)
     
     🔥 Hot (today):    ${stats.hot.length}
     🌡️  Warm (2-3d):    ${stats.warm.length}
     ⚠️  Stale (>14d):   ${stats.stale.length}
     
     📅 Meeting Req:    ${stats.meetingRequests.length}
     👍 Interested:     ${stats.interested.length}
     
  💰 REVENUE
  ═══════════════════════════════════════════════════════════════════════
  
     Booked Value:     ${formatCurrency(stats.bookedValue)}
     Pipeline Value:   ${formatCurrency(stats.pipelineValue)}
     
`);
}

function printQuickSummary(stats) {
  const bookRate = stats.total > 0 ? Math.round(stats.booked.length / stats.total * 100) : 0;
  console.log(`  📊 ${stats.booked.length}/${stats.total} booked (${bookRate}%) | 🔥 ${stats.hot.length} hot | ⚠️ ${stats.stale.length} stale | 💰 ${formatCurrency(stats.bookedValue)}\n`);
}

function printActions(stats) {
  console.log(`  🎯 TODAY'S PRIORITIES
  ═══════════════════════════════════════════════════════════════════════
`);

  let priority = 1;

  // Hot leads first
  if (stats.hot.length > 0) {
    console.log(`  ${priority}. 🔥 RESPOND TO HOT LEADS (${stats.hot.length})`);
    stats.hot.slice(0, 3).forEach(l => {
      console.log(`     • ${l.lead_name || l.lead_email} @ ${l.lead_company || 'Unknown'}`);
    });
    console.log('');
    priority++;
  }

  // Meeting requests
  if (stats.meetingRequests.length > 0) {
    console.log(`  ${priority}. 📅 SEND CALENDAR LINKS (${stats.meetingRequests.length})`);
    stats.meetingRequests.slice(0, 3).forEach(l => {
      console.log(`     • ${l.lead_name || l.lead_email} - ${timeAgo(l.replied_at)}`);
    });
    console.log('');
    priority++;
  }

  // Stale warnings
  if (stats.stale.length > 5) {
    console.log(`  ${priority}. ⚠️ REVIEW STALE LEADS (${stats.stale.length} going cold)`);
    console.log(`     Run: node gex.js reengage`);
    console.log('');
    priority++;
  }

  if (priority === 1) {
    console.log(`  ✅ All caught up! Pipeline is healthy.\n`);
  }
}

function printMissionControl() {
  try {
    const mcPath = path.join(__dirname, '..', 'mission-control');
    const output = execSync('./update.sh summary', { cwd: mcPath, encoding: 'utf8' });
    console.log(`  📋 MISSION CONTROL`);
    console.log('  ' + output.split('\n').join('\n  '));
  } catch {
    // Mission Control not available
  }
}

function printQuickCommands() {
  console.log(`
  ⚡ QUICK COMMANDS
  ═══════════════════════════════════════════════════════════════════════
  
     node gex.js nba       → Next best action
     node gex.js inbox     → Priority inbox
     node gex.js fast      → Hot lead responses
     node gex.js drafts 5  → Generate emails
  
`);
}

async function runOfflineMorning() {
  printMissionControl();
  console.log(`
  💡 TIP: Configure SUPABASE_URL to enable full pipeline view.
         Run: node gex.js doctor
`);
}

function getGreeting(hour) {
  if (hour < 12) return 'Good morning!';
  if (hour < 17) return 'Good afternoon!';
  return 'Good evening!';
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
