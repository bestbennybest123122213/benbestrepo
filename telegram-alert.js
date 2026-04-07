#!/usr/bin/env node
/**
 * Telegram Alert Generator
 * 
 * Generates formatted alerts for Telegram with key metrics and actions.
 * Use with Clawdbot to send proactive updates.
 * 
 * Usage:
 *   node telegram-alert.js morning    # Morning briefing
 *   node telegram-alert.js hot        # Hot leads alert
 *   node telegram-alert.js stale      # Stale leads warning
 *   node telegram-alert.js daily      # Daily digest
 *   node telegram-alert.js weekly     # Weekly summary
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ALERT_TYPE = args[0] || 'daily';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  const metrics = calculateMetrics(leads);

  switch (ALERT_TYPE) {
    case 'morning':
      console.log(morningBrief(metrics));
      break;
    case 'hot':
      console.log(hotLeadsAlert(metrics));
      break;
    case 'stale':
      console.log(staleWarning(metrics));
      break;
    case 'weekly':
      console.log(weeklyDigest(metrics));
      break;
    case 'daily':
    default:
      console.log(dailyDigest(metrics));
  }
}

function calculateMetrics(leads) {
  const now = new Date();
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const warm = unbooked.filter(l => {
    const age = getAgeDays(l.replied_at);
    return age > 3 && age <= 7;
  });
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);
  
  const enterprise = leads.filter(l => l.company_size === 'enterprise');
  
  // Top priorities
  const priorities = unbooked
    .map(l => ({ ...l, age: getAgeDays(l.replied_at) }))
    .sort((a, b) => {
      // Score by urgency and value
      const scoreA = (a.company_size === 'enterprise' ? 50 : 0) + 
                     (a.reply_category === 'Meeting Request' ? 30 : 0) +
                     Math.max(0, 20 - a.age);
      const scoreB = (b.company_size === 'enterprise' ? 50 : 0) + 
                     (b.reply_category === 'Meeting Request' ? 30 : 0) +
                     Math.max(0, 20 - b.age);
      return scoreB - scoreA;
    })
    .slice(0, 5);

  return {
    total,
    booked: booked.length,
    meetings: meetings.length,
    interested: interested.length,
    hot: hot.length,
    warm: warm.length,
    stale: stale.length,
    enterprise: enterprise.length,
    unbooked: unbooked.length,
    bookingRate: ((booked.length / total) * 100).toFixed(1),
    hotLeads: hot.slice(0, 5),
    staleLeads: stale.slice(0, 5),
    priorities
  };
}

function morningBrief(m) {
  const lines = [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  lines.push(`☀️ *Morning Brief* - ${today}`);
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`📊 *Pipeline*: ${m.booked}/${m.total} booked (${m.bookingRate}%)`);
  lines.push(`🤝 *Pending meetings*: ${m.meetings}`);
  lines.push('');
  
  if (m.hot > 0) {
    lines.push(`🔥 *${m.hot} HOT lead${m.hot > 1 ? 's' : ''}* need attention today!`);
    m.hotLeads.forEach(l => {
      lines.push(`  • ${l.lead_name} @ ${l.lead_company || '?'}`);
    });
    lines.push('');
  }
  
  lines.push(`💡 *First action*: \`node gex.js nba\``);
  
  return lines.join('\n');
}

function hotLeadsAlert(m) {
  const lines = [];
  
  if (m.hot === 0) {
    return '✅ No hot leads requiring immediate action.';
  }
  
  lines.push(`🔥 *HOT LEADS ALERT*`);
  lines.push(`${m.hot} lead${m.hot > 1 ? 's' : ''} need response NOW!`);
  lines.push('');
  
  m.hotLeads.forEach((l, i) => {
    const age = getAgeDays(l.replied_at);
    lines.push(`${i + 1}. *${l.lead_name}* @ ${l.lead_company || 'Unknown'}`);
    lines.push(`   ${l.reply_category} • ${age}d ago`);
  });
  
  lines.push('');
  lines.push('➡️ Run: `node gex.js fast all`');
  
  return lines.join('\n');
}

function staleWarning(m) {
  const lines = [];
  
  if (m.stale < 10) {
    return `✅ Only ${m.stale} stale leads - pipeline is healthy.`;
  }
  
  lines.push(`⚠️ *STALE LEADS WARNING*`);
  lines.push(`${m.stale} leads going cold (15+ days)!`);
  lines.push('');
  lines.push(`That's ${((m.stale / m.unbooked) * 100).toFixed(0)}% of your pipeline.`);
  lines.push('');
  
  m.staleLeads.slice(0, 3).forEach(l => {
    const age = getAgeDays(l.replied_at);
    lines.push(`• ${l.lead_name} - ${age} days`);
  });
  
  if (m.stale > 3) {
    lines.push(`• ...and ${m.stale - 3} more`);
  }
  
  lines.push('');
  lines.push('➡️ Run: `node gex.js reengage`');
  
  return lines.join('\n');
}

function dailyDigest(m) {
  const lines = [];
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  
  lines.push(`📊 *Daily Digest* - ${day}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`✅ Booked: ${m.booked} (${m.bookingRate}%)`);
  lines.push(`🤝 Meetings pending: ${m.meetings}`);
  lines.push(`💡 Interested: ${m.interested}`);
  lines.push('');
  
  lines.push('*Urgency*');
  if (m.hot > 0) lines.push(`🔥 Hot: ${m.hot}`);
  if (m.warm > 0) lines.push(`🌡️ Warm: ${m.warm}`);
  if (m.stale > 0) lines.push(`⚠️ Stale: ${m.stale}`);
  lines.push('');
  
  lines.push('*Top 3 priorities*');
  m.priorities.slice(0, 3).forEach((l, i) => {
    lines.push(`${i + 1}. ${l.lead_name} @ ${l.lead_company || '?'}`);
  });
  lines.push('');
  
  lines.push(`💰 Revenue: $${(m.booked * 500).toLocaleString()}`);
  lines.push(`📈 Potential: +$${(m.meetings * 200).toLocaleString()}`);
  
  return lines.join('\n');
}

function weeklyDigest(m) {
  const lines = [];
  
  lines.push(`📈 *Weekly Summary*`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Total pipeline: ${m.total} leads`);
  lines.push(`✅ Booked: ${m.booked} (${m.bookingRate}%)`);
  lines.push(`🤝 Meeting requests: ${m.meetings}`);
  lines.push(`💼 Enterprise: ${m.enterprise}`);
  lines.push('');
  lines.push(`*Health check*`);
  
  if (m.stale > m.unbooked * 0.5) {
    lines.push(`⚠️ ${m.stale} leads stale - needs attention`);
  } else {
    lines.push(`✅ Stale rate healthy: ${m.stale} leads`);
  }
  
  if (m.hot < 5) {
    lines.push(`📉 Only ${m.hot} hot leads - need more prospecting`);
  } else {
    lines.push(`🔥 ${m.hot} hot leads in queue`);
  }
  
  lines.push('');
  lines.push(`💰 *Revenue*: $${(m.booked * 500).toLocaleString()}`);
  
  return lines.join('\n');
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
