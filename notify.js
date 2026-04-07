#!/usr/bin/env node
/**
 * Notification Hub
 * 
 * Sends formatted notifications for various events:
 * - New hot leads
 * - Stale lead alerts
 * - Weekly summaries
 * - Custom messages
 * 
 * Usage:
 *   node notify.js hot        # Hot lead alert
 *   node notify.js stale      # Stale lead warning
 *   node notify.js weekly     # Weekly summary
 *   node notify.js custom "message"
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function getLeadStats() {
  const client = initSupabase();
  if (!client) return null;

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) return null;

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  return {
    total: leads.length,
    booked: leads.filter(l => l.reply_category === 'Booked').length,
    meetings: leads.filter(l => l.reply_category === 'Meeting Request').length,
    fresh: leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked'),
    stale: leads.filter(l => getAge(l) > 14 && l.reply_category !== 'Booked'),
    enterprise: leads.filter(l => {
      const info = getCompanyInfo(l.lead_email);
      return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
    })
  };
}

async function generateNotification(type, customMsg) {
  const stats = await getLeadStats();
  if (!stats) return 'Error fetching stats';

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  switch (type) {
    case 'hot':
      if (stats.fresh.length === 0) return '✅ No hot leads right now';
      return `🔥 *HOT LEADS* (${date})

${stats.fresh.length} leads need immediate response:

${stats.fresh.slice(0, 5).map(l => {
  const info = getCompanyInfo(l.lead_email);
  return `• ${l.lead_name || 'N/A'} @ ${info?.name || l.lead_company || 'N/A'}
  ${l.reply_category}`;
}).join('\n\n')}

📊 Pipeline: ${stats.total} total | ${stats.booked} booked`;

    case 'stale':
      if (stats.stale.length === 0) return '✅ No stale leads!';
      return `⚠️ *STALE LEAD ALERT* (${date})

${stats.stale.length} leads going cold:

${stats.stale.slice(0, 5).map(l => `• ${l.lead_name || l.lead_email.split('@')[0]}`).join('\n')}
${stats.stale.length > 5 ? `\n+${stats.stale.length - 5} more...` : ''}

🎯 Action: Follow up or close out today`;

    case 'weekly':
      return `📊 *WEEKLY SUMMARY* (${date})

Pipeline:
• Total: ${stats.total}
• Booked: ${stats.booked} (${((stats.booked/stats.total)*100).toFixed(1)}%)
• Meeting Requests: ${stats.meetings}
• Stale: ${stats.stale.length}

${stats.enterprise.length > 0 ? `🏢 Enterprise leads: ${stats.enterprise.length}` : ''}

🔗 Dashboard: localhost:3456`;

    case 'enterprise':
      if (stats.enterprise.length === 0) return '✅ All enterprise leads handled';
      return `🏢 *ENTERPRISE LEADS* (${date})

${stats.enterprise.length} high-value accounts:

${stats.enterprise.map(l => {
  const info = getCompanyInfo(l.lead_email);
  return `• ${l.lead_name || 'N/A'} @ ${info?.name || 'N/A'}
  ${info?.funding ? '💰 ' + info.funding : ''} ${l.reply_category}`;
}).join('\n\n')}

🎯 Priority: Respond to these first!`;

    case 'custom':
      return customMsg || 'No message provided';

    default:
      return `📊 *QUICK STATUS* (${date})

${stats.total} leads | ${stats.booked} booked | ${stats.meetings} meetings

${stats.fresh.length > 0 ? '🔥 ' + stats.fresh.length + ' hot leads' : ''}
${stats.stale.length > 0 ? '⚠️ ' + stats.stale.length + ' stale' : ''}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const type = args[0] || 'status';
  const customMsg = args.slice(1).join(' ');

  try {
    const notification = await generateNotification(type, customMsg);
    console.log('\n' + notification + '\n');
    
    // Also output raw for copying
    console.log('---');
    console.log('Copy above message to Telegram/Slack');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateNotification, getLeadStats };

if (require.main === module) {
  main();
}
