/**
 * Lead Death Alert System
 * 
 * Monitors leads approaching critical thresholds and sends alerts.
 * Designed to run as a daily cron job.
 * 
 * Thresholds:
 * - Day 6: Warning (about to become urgent)
 * - Day 13: Critical (about to become critical)
 * - Day 20: Last chance (about to die)
 * 
 * Usage:
 *   gex alert                # Check for alerts
 *   gex alert --telegram     # Send to Telegram
 *   gex alert --summary      # Summary only
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Threshold definitions - ranges for each urgency level
const THRESHOLDS = [
  { minDays: 5, maxDays: 6, name: 'warning', emoji: '⚠️', message: 'about to become URGENT (day 7)' },
  { minDays: 12, maxDays: 13, name: 'critical', emoji: '🔴', message: 'about to become CRITICAL (day 14)' },
  { minDays: 19, maxDays: 20, name: 'lastChance', emoji: '💀', message: 'about to DIE (day 21 = 19% booking rate)' }
];

// Email templates by threshold
const templates = {
  warning: (lead) => `Hey ${lead.firstName},

Quick follow-up on our conversation about ItssIMANNN. Would love to find a time to chat this week.

Best,
Jan`,
  
  critical: (lead) => `Hey ${lead.firstName},

Following up one more time on the ItssIMANNN collaboration. I know schedules get busy, but wanted to make sure this doesn't slip away.

ItssIMANNN's audience (10M+ subs) has driven massive results - Whiteout Survival saw 48M views and 100K+ new users.

Would 15 minutes this week work?

Best,
Jan`,
  
  lastChance: (lead) => `Hey ${lead.firstName},

Last check-in on the ItssIMANNN partnership discussion. I know timing doesn't always line up.

If you're still interested in exploring this, I'm happy to find time this week. Otherwise, no worries - just let me know either way.

Best,
Jan`
};

function extractFirstName(name) {
  if (!name) return 'there';
  return name.split(/[\s@]/)[0];
}

async function getLeadsAtThreshold(threshold) {
  const now = Date.now();
  // Get leads between minDays and maxDays old
  const minDate = new Date(now - (threshold.maxDays + 1) * 24 * 60 * 60 * 1000);
  const maxDate = new Date(now - threshold.minDays * 24 * 60 * 60 * 1000);
  
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('booking_status', ['Pending', null, ''])
    .in('lead_category', ['Booked', 'Meeting Request', 'Interested', 'Information Request'])
    .lt('created_at', maxDate.toISOString())
    .gt('created_at', minDate.toISOString())
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
  
  return leads.map(lead => {
    const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...lead,
      firstName: extractFirstName(lead.name),
      daysOld,
      threshold: threshold.name,
      thresholdEmoji: threshold.emoji,
      thresholdMessage: threshold.message,
      template: templates[threshold.name]({ firstName: extractFirstName(lead.name) })
    };
  });
}

async function getAllAlerts() {
  const alerts = [];
  
  for (const threshold of THRESHOLDS) {
    const leads = await getLeadsAtThreshold(threshold);
    alerts.push(...leads);
  }
  
  return alerts;
}

function formatTelegramMessage(alerts) {
  if (alerts.length === 0) {
    return '✅ No urgent lead alerts today.';
  }
  
  let message = '🚨 *LEAD ALERTS*\n\n';
  
  // Group by threshold
  const grouped = {};
  for (const alert of alerts) {
    if (!grouped[alert.threshold]) {
      grouped[alert.threshold] = [];
    }
    grouped[alert.threshold].push(alert);
  }
  
  // Last chance first (most urgent)
  for (const threshold of ['lastChance', 'critical', 'warning']) {
    const leads = grouped[threshold] || [];
    if (leads.length === 0) continue;
    
    const thresholdInfo = THRESHOLDS.find(t => t.name === threshold);
    message += `*${thresholdInfo.emoji} ${leads.length} leads ${thresholdInfo.message}*\n`;
    
    leads.slice(0, 5).forEach(lead => {
      message += `• ${lead.firstName} @ ${lead.domain || 'Unknown'} (${lead.lead_category})\n`;
    });
    
    if (leads.length > 5) {
      message += `  _...and ${leads.length - 5} more_\n`;
    }
    message += '\n';
  }
  
  message += '📋 Full details: `gex alert`';
  
  return message;
}

function formatConsoleOutput(alerts) {
  if (alerts.length === 0) {
    console.log('\n✅ No urgent lead alerts today.\n');
    return;
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🚨 LEAD DEATH ALERTS                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Group by threshold
  const grouped = {};
  for (const alert of alerts) {
    if (!grouped[alert.threshold]) {
      grouped[alert.threshold] = [];
    }
    grouped[alert.threshold].push(alert);
  }
  
  // Last chance first (most urgent)
  for (const threshold of ['lastChance', 'critical', 'warning']) {
    const leads = grouped[threshold] || [];
    if (leads.length === 0) continue;
    
    const thresholdInfo = THRESHOLDS.find(t => t.name === threshold);
    console.log(`${thresholdInfo.emoji} ${leads.length} LEADS ${thresholdInfo.message.toUpperCase()}`);
    console.log('─'.repeat(60));
    
    leads.forEach((lead, i) => {
      console.log(`\n  [${i + 1}] ${lead.firstName} @ ${lead.domain || 'Unknown'}`);
      console.log(`      Category: ${lead.lead_category} | Day ${lead.daysOld}`);
      console.log(`      Email: ${lead.email}`);
      console.log(`      ---`);
      console.log(lead.template.split('\n').map(line => `      ${line}`).join('\n'));
    });
    
    console.log('\n');
  }
  
  console.log(`📊 Total alerts: ${alerts.length}`);
  console.log(`💡 Send these emails TODAY to save these leads.\n`);
}

async function run(args = []) {
  const telegramMode = args.includes('--telegram') || args.includes('-t');
  const summaryOnly = args.includes('--summary') || args.includes('-s');
  
  console.log('[Checking lead thresholds...]');
  
  const alerts = await getAllAlerts();
  
  if (telegramMode) {
    const message = formatTelegramMessage(alerts);
    console.log('\n📱 Telegram message:\n');
    console.log(message);
    console.log('\nCopy the above to send via Telegram.');
  } else if (summaryOnly) {
    console.log(`\n📊 Alert summary: ${alerts.length} leads at critical thresholds`);
    alerts.forEach(alert => {
      console.log(`  ${alert.thresholdEmoji} ${alert.firstName} @ ${alert.domain} (${alert.threshold})`);
    });
  } else {
    formatConsoleOutput(alerts);
  }
  
  return alerts;
}

module.exports = { run, getAllAlerts, formatTelegramMessage };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
