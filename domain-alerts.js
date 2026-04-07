#!/usr/bin/env node
/**
 * Domain Health Alert System
 * Monitors domain reputation and sends alerts when domains need attention
 * 
 * Commands:
 *   gex domain-alerts          - Check domains and show alerts
 *   gex domain-alerts --notify - Check and send Telegram notification if issues
 *   gex domain-alerts --watch  - Continuous monitoring mode
 *   gex domain-alerts --history - Show alert history
 *   gex domain-alerts --recover <domain> - Generate recovery plan for domain
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Thresholds
const CRITICAL_THRESHOLD = 70;  // Below this = critical
const WARNING_THRESHOLD = 85;   // Below this = warning
const HEALTHY_THRESHOLD = 95;   // Above this = healthy

// Alert history file
const ALERT_HISTORY_FILE = path.join(__dirname, 'data', 'domain-alert-history.json');

// Colors
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Initialize Supabase
let supabase = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
      console.log('[Supabase] Client initialized');
    }
  }
  return supabase;
}

// Load alert history
function loadAlertHistory() {
  try {
    if (fs.existsSync(ALERT_HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(ALERT_HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return { alerts: [], lastCheck: null, notifiedDomains: {} };
}

// Save alert history
function saveAlertHistory(history) {
  const dir = path.dirname(ALERT_HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ALERT_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Get domain health from Supabase
async function getDomainHealth() {
  const sb = getSupabase();
  if (!sb) {
    console.log(`${RED}Error: Supabase not configured${RESET}`);
    return [];
  }

  // Get today's date
  const today = new Date().toISOString().split('T')[0];
  
  // Try today first
  let { data, error } = await sb
    .from('domain_snapshots')
    .select('*')
    .eq('snapshot_date', today);

  // If no data today, get most recent
  if (!data || data.length === 0) {
    const result = await sb
      .from('domain_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(50);
    
    data = result.data;
    error = result.error;
    
    // Get latest snapshot per domain
    const latestByDomain = {};
    for (const row of data || []) {
      if (!latestByDomain[row.domain]) {
        latestByDomain[row.domain] = row;
      }
    }
    data = Object.values(latestByDomain);
  }

  if (error) {
    console.log(`${RED}Error fetching domains: ${error.message}${RESET}`);
    return [];
  }

  return data || [];
}

// Categorize domains by health
function categorizeDomains(domains) {
  const critical = [];
  const warning = [];
  const healthy = [];

  for (const domain of domains) {
    const rep = domain.reputation || 0;
    if (rep < CRITICAL_THRESHOLD) {
      critical.push(domain);
    } else if (rep < WARNING_THRESHOLD) {
      warning.push(domain);
    } else {
      healthy.push(domain);
    }
  }

  return { critical, warning, healthy };
}

// Generate recovery plan for a domain
function generateRecoveryPlan(domain) {
  const rep = domain.reputation || 0;
  const warmup = domain.warmup_rate || 0;
  
  const plan = {
    domain: domain.domain,
    currentRep: rep,
    currentWarmup: warmup,
    severity: rep < CRITICAL_THRESHOLD ? 'CRITICAL' : 'WARNING',
    actions: [],
    timeline: ''
  };

  if (rep < 50) {
    plan.actions = [
      '🛑 PAUSE immediately from all campaigns',
      '📧 Reduce daily volume to 0 for 7 days',
      '🔄 Run warmup-only mode for 14 days',
      '📊 Monitor reputation daily',
      '⏳ Gradually reintroduce (10 emails/day, increase weekly)'
    ];
    plan.timeline = '3-4 weeks to recover';
  } else if (rep < 70) {
    plan.actions = [
      '⚠️ Reduce daily volume by 75%',
      '📧 Max 15-20 emails/day',
      '🔄 Increase warmup ratio to 80%',
      '📊 Monitor for 7 days',
      '✅ If stable, slowly increase volume'
    ];
    plan.timeline = '2-3 weeks to recover';
  } else if (rep < 85) {
    plan.actions = [
      '📉 Reduce daily volume by 50%',
      '🔄 Increase warmup ratio to 60%',
      '📊 Monitor for 5 days',
      '✅ Increase volume if reputation improves'
    ];
    plan.timeline = '1-2 weeks to stabilize';
  }

  return plan;
}

// Format alert for display
function formatAlert(domain, isNew = false) {
  const rep = domain.reputation || 0;
  const warmup = domain.warmup_rate || 0;
  const icon = rep < CRITICAL_THRESHOLD ? '🔴' : '🟡';
  const newBadge = isNew ? ` ${RED}[NEW]${RESET}` : '';
  
  return `  ${icon} ${BOLD}${domain.domain}${RESET}${newBadge}
     Rep: ${rep < CRITICAL_THRESHOLD ? RED : YELLOW}${rep}%${RESET} | Warmup: ${warmup.toFixed(0)}% | Cap: ${domain.daily_limit || 0}`;
}

// Format for Telegram
function formatTelegramAlert(critical, warning) {
  const lines = ['🚨 *DOMAIN HEALTH ALERT*\n'];
  
  if (critical.length > 0) {
    lines.push('*🔴 CRITICAL (< 70%)*');
    for (const d of critical) {
      lines.push(`• ${d.domain}: ${d.reputation}%`);
    }
    lines.push('');
  }
  
  if (warning.length > 0) {
    lines.push('*🟡 WARNING (< 85%)*');
    for (const d of warning) {
      lines.push(`• ${d.domain}: ${d.reputation}%`);
    }
    lines.push('');
  }
  
  lines.push('_Run `gex domain-alerts --recover <domain>` for recovery plan_');
  
  return lines.join('\n');
}

// Send Telegram notification
async function sendTelegramNotification(message) {
  try {
    const notifyPath = path.join(__dirname, 'notify.js');
    if (fs.existsSync(notifyPath)) {
      const { sendNotification } = require(notifyPath);
      await sendNotification(message);
      return true;
    }
  } catch (e) {
    console.log(`${YELLOW}Could not send Telegram notification: ${e.message}${RESET}`);
  }
  return false;
}

// Main check function
async function checkDomainHealth(options = {}) {
  const { notify = false, watch = false, recover = null, history = false } = options;
  
  // Show history
  if (history) {
    const hist = loadAlertHistory();
    console.log(`\n${BOLD}${CYAN}DOMAIN ALERT HISTORY${RESET}\n`);
    console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
    
    if (hist.alerts.length === 0) {
      console.log(`  ${DIM}No alerts recorded yet${RESET}`);
    } else {
      const recent = hist.alerts.slice(-20).reverse();
      for (const alert of recent) {
        const date = new Date(alert.time).toLocaleString();
        const icon = alert.severity === 'critical' ? '🔴' : '🟡';
        console.log(`  ${icon} ${date}`);
        console.log(`     ${alert.domain}: ${alert.reputation}% → ${alert.action || 'alerted'}`);
      }
    }
    console.log();
    return;
  }

  // Get current domain health
  const domains = await getDomainHealth();
  if (domains.length === 0) {
    console.log(`${YELLOW}No domain data found${RESET}`);
    return;
  }

  const { critical, warning, healthy } = categorizeDomains(domains);
  const hist = loadAlertHistory();

  // Recovery plan for specific domain
  if (recover) {
    const domain = domains.find(d => d.domain.toLowerCase().includes(recover.toLowerCase()));
    if (!domain) {
      console.log(`${RED}Domain not found: ${recover}${RESET}`);
      return;
    }
    
    const plan = generateRecoveryPlan(domain);
    console.log(`\n${BOLD}${CYAN}RECOVERY PLAN: ${plan.domain}${RESET}\n`);
    console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
    console.log(`  Severity:    ${plan.severity === 'CRITICAL' ? RED : YELLOW}${plan.severity}${RESET}`);
    console.log(`  Reputation:  ${plan.currentRep}%`);
    console.log(`  Warmup:      ${plan.currentWarmup.toFixed(0)}%`);
    console.log(`  Timeline:    ${plan.timeline}`);
    console.log(`\n${BOLD}Actions:${RESET}`);
    for (const action of plan.actions) {
      console.log(`  ${action}`);
    }
    console.log();
    return;
  }

  // Display current status
  console.log(`\n${BOLD}╔${'═'.repeat(58)}╗${RESET}`);
  console.log(`${BOLD}║  🏥 DOMAIN HEALTH MONITOR                                ║${RESET}`);
  console.log(`${BOLD}╚${'═'.repeat(58)}╝${RESET}\n`);

  console.log(`${CYAN}SUMMARY${RESET}`);
  console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
  console.log(`  Total Domains:  ${BOLD}${domains.length}${RESET}`);
  console.log(`  🔴 Critical:    ${critical.length > 0 ? RED + critical.length + RESET : GREEN + '0' + RESET}`);
  console.log(`  🟡 Warning:     ${warning.length > 0 ? YELLOW + warning.length + RESET : GREEN + '0' + RESET}`);
  console.log(`  🟢 Healthy:     ${GREEN}${healthy.length}${RESET}`);
  console.log();

  // Show alerts
  if (critical.length > 0 || warning.length > 0) {
    // Check for new alerts
    const newAlerts = [];
    
    if (critical.length > 0) {
      console.log(`${RED}🔴 CRITICAL DOMAINS${RESET}`);
      console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
      for (const d of critical) {
        const isNew = !hist.notifiedDomains[d.domain] || 
                      hist.notifiedDomains[d.domain].reputation > d.reputation;
        if (isNew) newAlerts.push({ ...d, severity: 'critical' });
        console.log(formatAlert(d, isNew));
      }
      console.log();
    }

    if (warning.length > 0) {
      console.log(`${YELLOW}🟡 WARNING DOMAINS${RESET}`);
      console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
      for (const d of warning) {
        const isNew = !hist.notifiedDomains[d.domain] || 
                      hist.notifiedDomains[d.domain].reputation > d.reputation;
        if (isNew) newAlerts.push({ ...d, severity: 'warning' });
        console.log(formatAlert(d, isNew));
      }
      console.log();
    }

    // Send notification if requested and there are new alerts
    if (notify && newAlerts.length > 0) {
      const message = formatTelegramAlert(
        critical.filter(d => newAlerts.some(n => n.domain === d.domain)),
        warning.filter(d => newAlerts.some(n => n.domain === d.domain))
      );
      const sent = await sendTelegramNotification(message);
      if (sent) {
        console.log(`${GREEN}✓ Telegram notification sent${RESET}\n`);
        
        // Update history
        for (const alert of newAlerts) {
          hist.alerts.push({
            time: new Date().toISOString(),
            domain: alert.domain,
            reputation: alert.reputation,
            severity: alert.severity,
            action: 'notified'
          });
          hist.notifiedDomains[alert.domain] = {
            reputation: alert.reputation,
            notifiedAt: new Date().toISOString()
          };
        }
        hist.lastCheck = new Date().toISOString();
        saveAlertHistory(hist);
      }
    } else if (notify && newAlerts.length === 0) {
      console.log(`${DIM}No new alerts to notify${RESET}\n`);
    }

    // Show recommendations
    console.log(`${CYAN}RECOMMENDATIONS${RESET}`);
    console.log(`${CYAN}${'━'.repeat(60)}${RESET}`);
    if (critical.length > 0) {
      console.log(`  ${RED}⚠️  ${critical.length} domain(s) need immediate attention${RESET}`);
      console.log(`  ${DIM}Run: gex domain-alerts --recover <domain>${RESET}`);
    }
    if (warning.length > 0) {
      console.log(`  ${YELLOW}📉 ${warning.length} domain(s) should be monitored${RESET}`);
    }
    console.log();
  } else {
    console.log(`${GREEN}✅ All domains are healthy!${RESET}\n`);
  }

  // Update last check
  hist.lastCheck = new Date().toISOString();
  saveAlertHistory(hist);
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const options = {
    notify: args.includes('--notify') || args.includes('-n'),
    watch: args.includes('--watch') || args.includes('-w'),
    history: args.includes('--history') || args.includes('-h'),
    recover: null
  };

  // Check for --recover <domain>
  const recoverIdx = args.findIndex(a => a === '--recover' || a === '-r');
  if (recoverIdx !== -1 && args[recoverIdx + 1]) {
    options.recover = args[recoverIdx + 1];
  }

  if (options.watch) {
    console.log(`${CYAN}Starting domain health monitor (Ctrl+C to stop)...${RESET}\n`);
    while (true) {
      await checkDomainHealth({ ...options, notify: true });
      console.log(`${DIM}Next check in 30 minutes...${RESET}\n`);
      await new Promise(r => setTimeout(r, 30 * 60 * 1000));
    }
  } else {
    await checkDomainHealth(options);
  }
}

// Export for use as module
module.exports = { checkDomainHealth, getDomainHealth, categorizeDomains, generateRecoveryPlan };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
