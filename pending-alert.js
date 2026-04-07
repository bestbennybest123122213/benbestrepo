#!/usr/bin/env node
/**
 * Pending Leads Daily Alert
 * Sends a Telegram notification about leads that said YES but have no follow-up.
 * 
 * Run via cron at 8:00 AM daily:
 * 0 8 * * * cd ~/clawd/domain-health-dashboard && node pending-alert.js
 * 
 * Commands:
 *   gex pending-alert           - Send alert if critical leads exist
 *   gex pending-alert --force   - Send even if no critical leads
 *   gex pending-alert --dry-run - Preview without sending
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run') || args.includes('-n');
const HELP = args.includes('--help') || args.includes('-h');

// Telegram config (from environment)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (HELP) {
  console.log(`
Pending Leads Daily Alert
─────────────────────────
Sends a Telegram notification about pending follow-ups.

Usage:
  gex pending-alert           Send alert if critical leads exist
  gex pending-alert --force   Send even if no critical leads  
  gex pending-alert --dry-run Preview message without sending
  gex pending-alert --help    Show this help

Cron setup (8 AM daily):
  0 8 * * * cd ~/clawd/domain-health-dashboard && node pending-alert.js

Environment required:
  TELEGRAM_BOT_TOKEN  Your Telegram bot token
  TELEGRAM_CHAT_ID    Chat ID to send alerts to
`);
  process.exit(0);
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️  Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    console.log('\nMessage that would be sent:');
    console.log('─'.repeat(50));
    console.log(message);
    console.log('─'.repeat(50));
    return false;
  }

  if (DRY_RUN) {
    console.log('🔍 Dry run - message preview:');
    console.log('─'.repeat(50));
    console.log(message);
    console.log('─'.repeat(50));
    return true;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown'
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error('Telegram error:', body);
          resolve(false);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  // Get pending leads
  const { data: leads, error } = await supabase
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Meeting Request', 'Interested', 'Information Request', 'Booked'])
    .eq('follow_up_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  // Group by age
  const now = new Date();
  let critical = 0, urgent = 0, warm = 0;
  const topLeads = [];

  leads.forEach(lead => {
    const created = new Date(lead.created_at);
    const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    
    if (days >= 14) critical++;
    else if (days >= 7) urgent++;
    else warm++;

    // Track top 5 most urgent
    if (topLeads.length < 5 && days >= 7) {
      const name = lead.lead_name || lead.lead_email.split('@')[0];
      const company = lead.lead_company || lead.lead_email.split('@')[1].split('.')[0];
      topLeads.push({ name, company, days, category: lead.reply_category });
    }
  });

  const total = leads.length;

  // Decide if we should send
  if (critical < 10 && !FORCE) {
    console.log(`✓ Only ${critical} critical leads. No alert needed.`);
    console.log(`  Total: ${total} | Critical: ${critical} | Urgent: ${urgent} | Warm: ${warm}`);
    process.exit(0);
  }

  // Build message
  const avgDeal = 25000;
  const commission = 0.3;
  const closeRate = 0.3;
  const potentialRevenue = total * avgDeal * closeRate;
  const potentialCommission = potentialRevenue * commission;

  let message = `🚨 *Pending Leads Alert*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `*${total} leads said YES but have no follow-up*\n\n`;
  message += `🔴 Critical (14+ days): ${critical}\n`;
  message += `🟠 Urgent (7-13 days): ${urgent}\n`;
  message += `🟢 Warm (< 7 days): ${warm}\n\n`;
  
  if (topLeads.length > 0) {
    message += `*Top Priority:*\n`;
    topLeads.forEach((lead, i) => {
      const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][i];
      message += `${emoji} ${lead.name} @ ${lead.company} (${lead.days}d)\n`;
    });
    message += `\n`;
  }

  message += `💰 *Revenue at risk:* $${(potentialRevenue/1000).toFixed(0)}K\n`;
  message += `💵 *Commission at risk:* $${(potentialCommission/1000).toFixed(0)}K\n\n`;
  message += `Run: \`gex batch-followups --export\`\n`;
  message += `Or: \`gex pending --critical\``;

  // Send
  const sent = await sendTelegram(message);
  
  if (sent && !DRY_RUN) {
    console.log('✅ Alert sent to Telegram');
  }
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
