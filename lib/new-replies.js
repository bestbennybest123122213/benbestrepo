/**
 * New Reply Detector
 * 
 * Detects new positive replies since last check and generates alerts.
 * 
 * Usage:
 *   gex new                 # Check for new replies
 *   gex new --since 24h     # New replies in last 24 hours
 *   gex new --telegram      # Telegram format
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DATA_DIR = path.join(__dirname, '..', 'data');
const LAST_CHECK_FILE = path.join(DATA_DIR, 'last-reply-check.json');

function loadLastCheck() {
  if (fs.existsSync(LAST_CHECK_FILE)) {
    return JSON.parse(fs.readFileSync(LAST_CHECK_FILE, 'utf8'));
  }
  return { lastCheck: null, lastIds: [] };
}

function saveLastCheck(data) {
  fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify(data, null, 2));
}

async function getRecentReplies(hoursAgo = 24) {
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  
  const { data: replies, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('lead_category', ['Meeting Request', 'Booked', 'Interested', 'Information Request'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return [];
  }
  
  return replies;
}

function extractFirstName(name) {
  if (!name) return 'there';
  return name.split(/[\s@]/)[0];
}

function generateQuickReply(lead) {
  const firstName = extractFirstName(lead.name);
  const company = lead.domain?.split('.')[0] || 'your company';
  
  const templates = {
    'Meeting Request': `Hey ${firstName},

Thanks for reaching out. Would love to chat about how ItssIMANNN could work with ${company}.

Here's my calendar: [CALENDLY]

Best,
Jan`,
    'Booked': `Hey ${firstName},

Looking forward to our call. Just wanted to confirm we're still on.

Best,
Jan`,
    'Interested': `Hey ${firstName},

Great to hear you're interested. Happy to share more details about ItssIMANNN's audience and past campaign results.

Would a quick call work, or would you prefer I send over some info?

Best,
Jan`,
    'Information Request': `Hey ${firstName},

Thanks for your interest. Here's a quick overview:

• 10M+ subscribers, 300M+ monthly views
• Gen Z audience (18-34)
• Story-driven moral content
• Past results: 48M views, 100K+ new users

Would you like to hop on a quick call to discuss further?

Best,
Jan`
  };
  
  return templates[lead.lead_category] || templates['Interested'];
}

function formatAlert(replies, telegramMode = false) {
  if (replies.length === 0) {
    if (telegramMode) {
      return '✅ No new positive replies.';
    }
    console.log('\n✅ No new positive replies since last check.\n');
    return;
  }
  
  if (telegramMode) {
    let msg = `🔔 *${replies.length} NEW POSITIVE REPLIES*\n\n`;
    
    replies.forEach(reply => {
      const name = extractFirstName(reply.name);
      const company = reply.domain?.split('.')[0] || 'Unknown';
      const emoji = reply.lead_category === 'Meeting Request' ? '📅' :
                    reply.lead_category === 'Booked' ? '✅' : '💡';
      msg += `${emoji} *${name} @ ${company}*\n`;
      msg += `   ${reply.lead_category}\n\n`;
    });
    
    msg += '🎯 Respond ASAP for best conversion.';
    return msg;
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔔 NEW POSITIVE REPLIES                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Found ${replies.length} new positive replies:\n`);
  
  replies.forEach((reply, i) => {
    const name = extractFirstName(reply.name);
    const company = reply.domain?.split('.')[0] || 'Unknown';
    const emoji = reply.lead_category === 'Meeting Request' ? '📅' :
                  reply.lead_category === 'Booked' ? '✅' : '💡';
    
    console.log(`${emoji} [${i + 1}] ${name} @ ${company}`);
    console.log(`   Category: ${reply.lead_category}`);
    console.log(`   Email: ${reply.email}`);
    console.log(`   Time: ${new Date(reply.created_at).toLocaleString()}`);
    console.log();
    console.log('   Quick reply:');
    console.log('   ─'.repeat(30));
    console.log(generateQuickReply(reply).split('\n').map(l => `   ${l}`).join('\n'));
    console.log();
  });
  
  console.log('💡 Respond within 4 hours for 2.3x better conversion.\n');
}

async function run(args = []) {
  const telegramMode = args.includes('--telegram') || args.includes('-t');
  const sinceArg = args.find(a => a.startsWith('--since'));
  
  let hours = 24;
  if (sinceArg) {
    const match = sinceArg.match(/(\d+)/);
    if (match) hours = parseInt(match[1]);
  }
  
  const lastCheck = loadLastCheck();
  const replies = await getRecentReplies(hours);
  
  // Filter to only new replies (not seen before)
  const lastIds = new Set(lastCheck.lastIds || []);
  const newReplies = replies.filter(r => !lastIds.has(r.id));
  
  // Update last check
  saveLastCheck({
    lastCheck: new Date().toISOString(),
    lastIds: replies.map(r => r.id)
  });
  
  if (telegramMode) {
    console.log(formatAlert(newReplies, true));
  } else {
    formatAlert(newReplies);
  }
  
  return newReplies;
}

module.exports = { run, getRecentReplies, generateQuickReply };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
