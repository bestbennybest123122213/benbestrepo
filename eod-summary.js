#!/usr/bin/env node
/**
 * End of Day Summary
 * Comprehensive summary of day's activity and pending items
 * 
 * Commands:
 *   gex eod           - Full end of day summary
 *   gex endofday      - Alias
 *   gex eod --save    - Save to file
 *   gex eod --telegram - Telegram format
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');
const { execSync } = require('child_process');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const args = process.argv.slice(2);
const SAVE = args.includes('--save') || args.includes('-s');
const TELEGRAM = args.includes('--telegram') || args.includes('-t');

async function generateEOD() {
  const supabase = initSupabase();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  let summary = '';

  // Header
  if (TELEGRAM) {
    summary += `🌙 *END OF DAY SUMMARY*\n`;
    summary += `📅 ${dayName}\n\n`;
  } else {
    summary += `\n${c.bold}╔${'═'.repeat(60)}╗${c.reset}\n`;
    summary += `${c.bold}║  🌙 END OF DAY SUMMARY                                      ║${c.reset}\n`;
    summary += `${c.bold}║  ${dayName.padEnd(56)}║${c.reset}\n`;
    summary += `${c.bold}╚${'═'.repeat(60)}╝${c.reset}\n\n`;
  }

  // Get today's metrics
  let todayReplies = 0;
  let todayBooked = 0;
  let totalPending = 0;
  let hotLeads = 0;
  let staleLeads = 0;

  if (supabase) {
    try {
      const { data: leads } = await supabase
        .from('imann_positive_replies')
        .select('status, conversation_date, created_at');

      const nowMs = Date.now();
      for (const lead of leads || []) {
        const createdDate = new Date(lead.created_at).toISOString().split('T')[0];
        if (createdDate === today) {
          todayReplies++;
          if (lead.status === 'Booked') todayBooked++;
        }
        
        if (lead.status !== 'Booked') {
          totalPending++;
          const age = (nowMs - new Date(lead.conversation_date).getTime()) / (1000 * 60 * 60 * 24);
          if (age < 3) hotLeads++;
          if (age > 14) staleLeads++;
        }
      }
    } catch (e) {}
  }

  // Day's Activity
  if (TELEGRAM) {
    summary += `📊 *TODAY'S ACTIVITY*\n`;
    summary += `• New replies: ${todayReplies}\n`;
    summary += `• Meetings booked: ${todayBooked}\n\n`;
  } else {
    summary += `${c.cyan}TODAY'S ACTIVITY${c.reset}\n`;
    summary += `${c.cyan}${'━'.repeat(62)}${c.reset}\n`;
    summary += `  New replies:      ${todayReplies === 0 ? c.yellow + '0' + c.reset : c.green + todayReplies + c.reset}\n`;
    summary += `  Meetings booked:  ${todayBooked === 0 ? c.yellow + '0' + c.reset : c.green + todayBooked + c.reset}\n\n`;
  }

  // Pipeline Status
  let pipelineScore = '?';
  try {
    const scoreOutput = execSync('node pipeline-score.js --quick 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    const match = scoreOutput.match(/(\d+)\/100/);
    if (match) pipelineScore = match[1];
  } catch (e) {}

  if (TELEGRAM) {
    summary += `📈 *PIPELINE STATUS*\n`;
    summary += `• Score: ${pipelineScore}/100\n`;
    summary += `• Pending: ${totalPending}\n`;
    summary += `• Hot leads: ${hotLeads}\n`;
    summary += `• Stale: ${staleLeads}\n\n`;
  } else {
    summary += `${c.cyan}PIPELINE STATUS${c.reset}\n`;
    summary += `${c.cyan}${'━'.repeat(62)}${c.reset}\n`;
    const scoreColor = parseInt(pipelineScore) >= 50 ? c.green : parseInt(pipelineScore) >= 30 ? c.yellow : c.red;
    summary += `  Pipeline Score:   ${scoreColor}${pipelineScore}/100${c.reset}\n`;
    summary += `  Pending leads:    ${totalPending}\n`;
    summary += `  Hot leads:        ${hotLeads > 0 ? c.red + hotLeads + ' (need response)' + c.reset : '0'}\n`;
    summary += `  Stale leads:      ${staleLeads > 0 ? c.yellow + staleLeads + c.reset : '0'}\n\n`;
  }

  // Domain Health
  let domainsHealthy = 0;
  let domainsCritical = 0;
  if (supabase) {
    try {
      const { data: domains } = await supabase
        .from('domain_snapshots')
        .select('domain, reputation')
        .order('snapshot_date', { ascending: false })
        .limit(30);
      
      const latest = {};
      for (const d of domains || []) {
        if (!latest[d.domain]) {
          latest[d.domain] = d;
          if (d.reputation >= 70) domainsHealthy++;
          else domainsCritical++;
        }
      }
    } catch (e) {}
  }

  if (domainsCritical > 0) {
    if (TELEGRAM) {
      summary += `🏥 *DOMAIN ALERT*\n`;
      summary += `• ${domainsCritical} domain(s) below 70%\n\n`;
    } else {
      summary += `${c.cyan}DOMAIN HEALTH${c.reset}\n`;
      summary += `${c.cyan}${'━'.repeat(62)}${c.reset}\n`;
      summary += `  ${c.red}⚠️ ${domainsCritical} domain(s) below 70% - needs attention${c.reset}\n`;
      summary += `  ${domainsHealthy} domains healthy\n\n`;
    }
  }

  // Tomorrow's Priorities
  if (TELEGRAM) {
    summary += `🎯 *TOMORROW'S PRIORITIES*\n`;
    if (hotLeads > 0) summary += `1. Respond to ${hotLeads} hot leads\n`;
    if (domainsCritical > 0) summary += `2. Fix ${domainsCritical} domain(s)\n`;
    if (staleLeads > 30) summary += `3. Archive stale leads\n`;
    summary += `\n_Run \`gex morning\` to start_`;
  } else {
    summary += `${c.cyan}TOMORROW'S PRIORITIES${c.reset}\n`;
    summary += `${c.cyan}${'━'.repeat(62)}${c.reset}\n`;
    let priority = 1;
    if (hotLeads > 0) {
      summary += `  ${priority}. ${c.red}Respond to ${hotLeads} hot leads${c.reset}\n`;
      priority++;
    }
    if (domainsCritical > 0) {
      summary += `  ${priority}. Fix ${domainsCritical} domain(s) with low reputation\n`;
      priority++;
    }
    if (staleLeads > 30) {
      summary += `  ${priority}. Archive ${staleLeads} stale leads → gex archive --execute\n`;
      priority++;
    }
    summary += `\n  ${c.dim}Run: gex morning to start tomorrow${c.reset}\n`;
  }

  return summary;
}

async function main() {
  const summary = await generateEOD();

  if (SAVE) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `./reports/eod-${date}.md`;
    
    if (!fs.existsSync('./reports')) {
      fs.mkdirSync('./reports', { recursive: true });
    }
    
    // Strip ANSI codes for file
    const cleanSummary = summary.replace(/\x1b\[[0-9;]*m/g, '');
    fs.writeFileSync(filename, cleanSummary);
    console.log(`✅ Summary saved to ${filename}`);
  }

  console.log(summary);
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
