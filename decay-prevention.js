#!/usr/bin/env node
/**
 * Lead Decay Prevention System
 * Proactive alerts before leads go stale
 * 
 * Commands:
 *   gex prevent             - Show at-risk leads with time remaining
 *   gex prevent --critical  - Only critical (last chance) leads
 *   gex prevent --today     - Leads that will cross threshold today
 *   gex prevent --notify    - Send Telegram alert for at-risk leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const args = process.argv.slice(2);
const CRITICAL = args.includes('--critical') || args.includes('-c');
const TODAY = args.includes('--today') || args.includes('-t');
const NOTIFY = args.includes('--notify') || args.includes('-n');
const TELEGRAM = args.includes('--telegram');

// Decay thresholds (days)
const THRESHOLDS = {
  warning: 5,      // Approaching 7-day mark
  danger: 12,      // Approaching 14-day mark (stale)
  critical: 25,    // Approaching 30-day mark (cold)
  lost: 55         // Approaching 60-day mark (archive)
};

// Vertical performance scores for prioritization
const VERTICAL_PRIORITY = {
  'education': 5,
  'edtech': 5,
  'apps': 4,
  'crypto': 4,
  'gaming': 3,
  'tech': 2,
  'other': 1
};

function detectVertical(text) {
  const t = (text || '').toLowerCase();
  if (t.match(/edu|learn|school|course|tutor|study|academy|university|udemy/)) return 'education';
  if (t.match(/crypto|blockchain|web3|nft|defi|token/)) return 'crypto';
  if (t.match(/app|mobile|ios|android|replit/)) return 'apps';
  if (t.match(/game|gaming|studio|play|unity/)) return 'gaming';
  if (t.match(/ai|tech|software|saas|digital/)) return 'tech';
  return 'other';
}

function getDecayStatus(ageDays) {
  if (ageDays >= THRESHOLDS.lost) return { status: 'lost', icon: '💀', color: c.dim, urgency: 'Archive or lose' };
  if (ageDays >= THRESHOLDS.critical) return { status: 'critical', icon: '🔴', color: c.red, urgency: 'Last chance' };
  if (ageDays >= THRESHOLDS.danger) return { status: 'danger', icon: '🟠', color: c.yellow, urgency: 'Going cold' };
  if (ageDays >= THRESHOLDS.warning) return { status: 'warning', icon: '🟡', color: c.yellow, urgency: 'Act soon' };
  return { status: 'fresh', icon: '🟢', color: c.green, urgency: 'Good' };
}

function getTimeRemaining(ageDays, threshold) {
  const remaining = threshold - ageDays;
  if (remaining <= 0) return 'PASSED';
  if (remaining < 1) return `${Math.round(remaining * 24)}h`;
  return `${Math.round(remaining)}d`;
}

async function analyzeDecay() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log(`${c.red}❌ Supabase not configured${c.reset}`);
    return;
  }

  // Get active leads (not booked)
  const { data: leads, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Booked')
    .order('conversation_date', { ascending: true });

  if (error) {
    console.log(`${c.red}❌ Error: ${error.message}${c.reset}`);
    return;
  }

  const now = Date.now();
  const atRiskLeads = [];

  for (const lead of leads || []) {
    const replyDate = new Date(lead.conversation_date || lead.created_at);
    const ageDays = (now - replyDate.getTime()) / (1000 * 60 * 60 * 24);
    const decay = getDecayStatus(ageDays);
    
    // Skip fresh leads unless they're high-value verticals approaching warning
    if (decay.status === 'fresh' && ageDays < THRESHOLDS.warning - 1) continue;

    const vertical = detectVertical(`${lead.lead_email} ${lead.lead_company}`);
    const priority = VERTICAL_PRIORITY[vertical] || 1;
    
    // Calculate urgency score (higher = more urgent)
    const urgencyScore = (ageDays / 60) * 100 + (priority * 10);
    
    atRiskLeads.push({
      ...lead,
      ageDays,
      decay,
      vertical,
      priority,
      urgencyScore,
      nextThreshold: ageDays < THRESHOLDS.warning ? THRESHOLDS.warning :
                     ageDays < THRESHOLDS.danger ? THRESHOLDS.danger :
                     ageDays < THRESHOLDS.critical ? THRESHOLDS.critical :
                     THRESHOLDS.lost,
      timeRemaining: getTimeRemaining(ageDays, 
                     ageDays < THRESHOLDS.warning ? THRESHOLDS.warning :
                     ageDays < THRESHOLDS.danger ? THRESHOLDS.danger :
                     ageDays < THRESHOLDS.critical ? THRESHOLDS.critical :
                     THRESHOLDS.lost)
    });
  }

  // Sort by urgency
  atRiskLeads.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Filter based on flags
  let filtered = atRiskLeads;
  if (CRITICAL) {
    filtered = atRiskLeads.filter(l => l.decay.status === 'critical' || l.decay.status === 'lost');
  }
  if (TODAY) {
    filtered = atRiskLeads.filter(l => l.timeRemaining.endsWith('h') || l.timeRemaining === '1d');
  }

  if (TELEGRAM) {
    outputTelegram(filtered);
  } else if (NOTIFY) {
    await sendNotification(filtered);
  } else {
    outputConsole(filtered, atRiskLeads);
  }
}

function outputConsole(leads, allLeads) {
  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  ⏰ LEAD DECAY PREVENTION                                              ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  // Summary
  const critical = allLeads.filter(l => l.decay.status === 'critical').length;
  const danger = allLeads.filter(l => l.decay.status === 'danger').length;
  const warning = allLeads.filter(l => l.decay.status === 'warning').length;
  const lost = allLeads.filter(l => l.decay.status === 'lost').length;

  console.log(`${c.cyan}DECAY SUMMARY${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);
  console.log(`  💀 Lost (>55d):      ${lost > 0 ? c.dim + lost + c.reset : c.green + '0' + c.reset}`);
  console.log(`  🔴 Critical (>25d):  ${critical > 0 ? c.red + critical + c.reset : c.green + '0' + c.reset}`);
  console.log(`  🟠 Danger (>12d):    ${danger > 0 ? c.yellow + danger + c.reset : c.green + '0' + c.reset}`);
  console.log(`  🟡 Warning (>5d):    ${warning > 0 ? c.yellow + warning + c.reset : c.green + '0' + c.reset}`);
  console.log();

  if (leads.length === 0) {
    console.log(`${c.green}✅ No at-risk leads matching criteria${c.reset}\n`);
    return;
  }

  // Show leads grouped by urgency
  console.log(`${c.cyan}AT-RISK LEADS (${leads.length})${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);

  for (const lead of leads.slice(0, 15)) {
    const name = lead.lead_name || lead.lead_email?.split('@')[0] || 'Unknown';
    const company = lead.lead_company || 'Unknown';
    const verticalBadge = lead.vertical !== 'other' ? ` [${lead.vertical}]` : '';
    
    console.log(`  ${lead.decay.icon} ${c.bold}${name}${c.reset} @ ${company}${c.dim}${verticalBadge}${c.reset}`);
    console.log(`     Age: ${Math.round(lead.ageDays)}d | Next threshold in: ${lead.decay.color}${lead.timeRemaining}${c.reset} | ${lead.decay.urgency}`);
    console.log(`     Category: ${lead.reply_category || 'Unknown'}`);
    console.log();
  }

  if (leads.length > 15) {
    console.log(`  ${c.dim}... and ${leads.length - 15} more${c.reset}\n`);
  }

  // Action recommendation
  console.log(`${c.cyan}RECOMMENDED ACTIONS${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);
  
  if (critical > 0 || lost > 0) {
    console.log(`  ${c.red}⚠️  ${critical + lost} leads at critical stage - respond TODAY${c.reset}`);
  }
  if (danger > 0) {
    console.log(`  🟠 ${danger} leads going cold - respond within 48h`);
  }
  
  // Find highest value at-risk lead
  const topLead = leads.find(l => l.priority >= 4);
  if (topLead) {
    console.log(`  🎯 Priority: ${topLead.lead_name || topLead.lead_email} @ ${topLead.lead_company} (${topLead.vertical})`);
  }
  
  console.log(`\n  → Run: ${c.cyan}gex send --html${c.reset} to respond quickly\n`);
}

function outputTelegram(leads) {
  let msg = `⏰ *LEAD DECAY ALERT*\n\n`;
  
  const critical = leads.filter(l => l.decay.status === 'critical' || l.decay.status === 'lost');
  const danger = leads.filter(l => l.decay.status === 'danger');
  
  if (critical.length > 0) {
    msg += `🔴 *CRITICAL (${critical.length}):*\n`;
    critical.slice(0, 5).forEach(l => {
      msg += `• ${l.lead_name || 'Unknown'} @ ${l.lead_company || 'Unknown'} (${Math.round(l.ageDays)}d)\n`;
    });
    msg += '\n';
  }
  
  if (danger.length > 0) {
    msg += `🟠 *DANGER (${danger.length}):*\n`;
    danger.slice(0, 5).forEach(l => {
      msg += `• ${l.lead_name || 'Unknown'} @ ${l.lead_company || 'Unknown'} (${Math.round(l.ageDays)}d)\n`;
    });
  }
  
  msg += `\n_Run \`gex send --html\` to respond_`;
  
  console.log(msg);
}

async function sendNotification(leads) {
  const critical = leads.filter(l => l.decay.status === 'critical' || l.decay.status === 'lost');
  
  if (critical.length === 0) {
    console.log(`${c.green}✅ No critical leads to notify about${c.reset}`);
    return;
  }
  
  try {
    const { sendNotification: notify } = require('./notify.js');
    const msg = `⏰ *DECAY ALERT*: ${critical.length} leads at critical stage!\n\n` +
      critical.slice(0, 3).map(l => 
        `• ${l.lead_name || 'Unknown'} @ ${l.lead_company || 'Unknown'} (${Math.round(l.ageDays)}d)`
      ).join('\n') +
      `\n\n_Respond today to prevent loss_`;
    
    await notify(msg);
    console.log(`${c.green}✓ Notification sent for ${critical.length} critical leads${c.reset}`);
  } catch (e) {
    console.log(`${c.yellow}Could not send notification: ${e.message}${c.reset}`);
  }
}

// Run
analyzeDecay().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
