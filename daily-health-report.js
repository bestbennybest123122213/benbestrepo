#!/usr/bin/env node
/**
 * Daily Domain Health Report
 * 
 * Analyzes domain snapshots from Supabase sync and generates a health report.
 * 
 * Usage:
 *   node daily-health-report.js              # Today's report
 *   node daily-health-report.js --compare    # Compare to yesterday
 *   node daily-health-report.js --week       # Weekly trend
 *   node daily-health-report.js --alerts     # Just alerts
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const COMPARE = args.includes('--compare');
const WEEK = args.includes('--week');
const ALERTS = args.includes('--alerts');
const HELP = args.includes('--help') || args.includes('-h');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

if (HELP) {
  console.log(`
${c.bold}Daily Domain Health Report${c.reset}
Analyze domain health from Supabase sync data.

${c.cyan}Usage:${c.reset}
  gex health-report              Today's report
  gex health-report --compare    Compare to yesterday
  gex health-report --week       Weekly trend
  gex health-report --alerts     Just show alerts

${c.cyan}Metrics:${c.reset}
  • Reputation score (0-100)
  • Warmup reply rate
  • Active accounts
  • Daily capacity
  • Bounce rate
`);
  process.exit(0);
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error(`${c.red}❌ Database not initialized${c.reset}`);
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];
  
  // Get today's snapshots
  const { data: todayData, error } = await client
    .from('domain_snapshots')
    .select('*')
    .eq('snapshot_date', today)
    .order('reputation', { ascending: true });

  if (error || !todayData) {
    console.error(`${c.red}❌ Failed to load data${c.reset}`);
    process.exit(1);
  }

  if (todayData.length === 0) {
    console.log(`${c.yellow}No data for today. Run: node sync-to-supabase.js${c.reset}`);
    process.exit(0);
  }

  // Get yesterday's for comparison
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const { data: yesterdayData } = await client
    .from('domain_snapshots')
    .select('*')
    .eq('snapshot_date', yesterday);

  const yesterdayMap = {};
  if (yesterdayData) {
    for (const d of yesterdayData) {
      yesterdayMap[d.domain] = d;
    }
  }

  // Calculate aggregates
  const totalDomains = todayData.length;
  const avgReputation = Math.round(todayData.reduce((s, d) => s + (d.reputation || 0), 0) / totalDomains);
  const avgWarmup = Math.round(todayData.reduce((s, d) => s + (d.warmup_reply_rate || 0), 0) / totalDomains);
  const totalCapacity = todayData.reduce((s, d) => s + (d.daily_capacity || 0), 0);
  const totalAccounts = todayData.reduce((s, d) => s + (d.total_accounts || 0), 0);
  const activeAccounts = todayData.reduce((s, d) => s + (d.active_accounts || 0), 0);

  // Find alerts (low reputation or warmup)
  const alerts = todayData.filter(d => (d.reputation || 100) < 80 || (d.warmup_reply_rate || 100) < 50);

  // Just alerts mode
  if (ALERTS) {
    if (alerts.length === 0) {
      console.log(`${c.green}✓ No domain health alerts${c.reset}`);
    } else {
      console.log(`\n${c.red}⚠️ ${alerts.length} DOMAIN ALERTS${c.reset}\n`);
      for (const d of alerts) {
        console.log(`  ${c.red}●${c.reset} ${d.domain}`);
        if ((d.reputation || 100) < 80) console.log(`    ${c.dim}Reputation: ${d.reputation}%${c.reset}`);
        if ((d.warmup_reply_rate || 100) < 50) console.log(`    ${c.dim}Warmup: ${d.warmup_reply_rate}%${c.reset}`);
      }
    }
    return;
  }

  // Full report
  console.log(`\n${c.bold}╔═══════════════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}║  📊 DAILY DOMAIN HEALTH REPORT                                            ║${c.reset}`);
  console.log(`${c.bold}║  ${today}                                                              ║${c.reset}`);
  console.log(`${c.bold}╚═══════════════════════════════════════════════════════════════════════════╝${c.reset}\n`);

  // Summary
  const repColor = avgReputation >= 90 ? c.green : (avgReputation >= 70 ? c.yellow : c.red);
  const warmupColor = avgWarmup >= 70 ? c.green : (avgWarmup >= 50 ? c.yellow : c.red);

  console.log(`${c.cyan}OVERVIEW${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  Domains:          ${c.bold}${totalDomains}${c.reset}`);
  console.log(`  Avg Reputation:   ${repColor}${avgReputation}%${c.reset}`);
  console.log(`  Avg Warmup Rate:  ${warmupColor}${avgWarmup}%${c.reset}`);
  console.log(`  Total Capacity:   ${c.bold}${totalCapacity}${c.reset} emails/day`);
  console.log(`  Active Accounts:  ${c.bold}${activeAccounts}${c.reset}/${totalAccounts}`);

  // Alerts
  if (alerts.length > 0) {
    console.log(`\n${c.red}⚠️ ALERTS (${alerts.length})${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    for (const d of alerts) {
      const issues = [];
      if ((d.reputation || 100) < 80) issues.push(`Rep: ${d.reputation}%`);
      if ((d.warmup_reply_rate || 100) < 50) issues.push(`Warmup: ${d.warmup_reply_rate}%`);
      console.log(`  ${c.red}●${c.reset} ${d.domain} - ${issues.join(', ')}`);
    }
  } else {
    console.log(`\n${c.green}✓ No alerts - all domains healthy${c.reset}`);
  }

  // Domain list
  console.log(`\n${c.cyan}ALL DOMAINS${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${'Domain'.padEnd(35)} ${'Rep'.padStart(5)} ${'Warmup'.padStart(7)} ${'Cap'.padStart(5)} ${'Trend'.padStart(6)}`);
  console.log(`  ${'-'.repeat(35)} ${'-'.repeat(5)} ${'-'.repeat(7)} ${'-'.repeat(5)} ${'-'.repeat(6)}`);

  for (const d of todayData.sort((a, b) => (a.reputation || 100) - (b.reputation || 100))) {
    const repColor = (d.reputation || 100) >= 90 ? c.green : ((d.reputation || 100) >= 70 ? c.yellow : c.red);
    const warmupColor = (d.warmup_reply_rate || 100) >= 70 ? c.green : ((d.warmup_reply_rate || 100) >= 50 ? c.yellow : c.red);
    
    // Trend
    let trend = '  -';
    if (yesterdayMap[d.domain]) {
      const diff = (d.reputation || 0) - (yesterdayMap[d.domain].reputation || 0);
      if (diff > 0) trend = `${c.green}+${diff}${c.reset}`;
      else if (diff < 0) trend = `${c.red}${diff}${c.reset}`;
      else trend = `${c.dim}=${c.reset}`;
    }

    const domainShort = d.domain.length > 33 ? d.domain.substring(0, 30) + '...' : d.domain;
    console.log(`  ${domainShort.padEnd(35)} ${repColor}${String(d.reputation || 100).padStart(4)}%${c.reset} ${warmupColor}${String(d.warmup_reply_rate || 100).padStart(6)}%${c.reset} ${String(d.daily_capacity || 0).padStart(5)} ${trend.padStart(6)}`);
  }

  console.log(`\n${c.dim}Run sync: node sync-to-supabase.js${c.reset}\n`);
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
