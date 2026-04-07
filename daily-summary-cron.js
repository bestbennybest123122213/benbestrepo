#!/usr/bin/env node
/**
 * Daily Summary for Cron Jobs
 * 
 * Generates a compact daily summary suitable for automated delivery.
 * Designed to be called by cron and output sent via Telegram.
 * 
 * Usage:
 *   node daily-summary-cron.js           # Full summary
 *   node daily-summary-cron.js morning   # Morning brief
 *   node daily-summary-cron.js evening   # Evening wrap-up
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const MODE = args[0] || 'full';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ DB error');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No data');
    process.exit(1);
  }

  switch (MODE) {
    case 'morning':
      morningBrief(leads);
      break;
    case 'evening':
      eveningWrapup(leads);
      break;
    default:
      fullSummary(leads);
  }
}

function morningBrief(leads) {
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);
  
  // Due today
  const sequenceDays = [0, 3, 7, 14, 21, 30];
  const dueToday = unbooked.filter(l => sequenceDays.includes(getAgeDays(l.replied_at)));

  const lines = [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  lines.push(`☀️ *Morning Brief* - ${today}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`📊 ${booked.length}/${leads.length} booked (${(booked.length/leads.length*100).toFixed(0)}%)`);
  lines.push(`🔥 ${hot.length} hot | ⚠️ ${stale.length} stale`);
  lines.push('');
  
  if (dueToday.length > 0) {
    lines.push(`📬 *${dueToday.length} follow-ups due today*`);
    dueToday.slice(0, 3).forEach(l => {
      lines.push(`  • ${l.lead_name}`);
    });
    if (dueToday.length > 3) lines.push(`  • +${dueToday.length - 3} more`);
    lines.push('');
  }

  // Top priority
  const topPriority = unbooked
    .sort((a, b) => getAgeDays(a.replied_at) - getAgeDays(b.replied_at))
    .filter(l => l.reply_category === 'Meeting Request' || l.reply_category === 'Interested')
    [0];

  if (topPriority) {
    lines.push(`🎯 *Top priority:* ${topPriority.lead_name}`);
    lines.push(`   ${topPriority.reply_category} | ${getAgeDays(topPriority.replied_at)}d ago`);
  }

  console.log(lines.join('\n'));
}

function eveningWrapup(leads) {
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  
  // Today's activity (created today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const newToday = leads.filter(l => new Date(l.created_at) >= todayStart);
  const bookedToday = booked.filter(l => new Date(l.created_at) >= todayStart);

  const lines = [];
  
  lines.push('🌙 *Evening Wrap-up*');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`*Today's activity:*`);
  lines.push(`  📥 New leads: ${newToday.length}`);
  lines.push(`  ✅ Booked: ${bookedToday.length}`);
  lines.push('');
  lines.push(`*Pipeline status:*`);
  lines.push(`  Total: ${leads.length} leads`);
  lines.push(`  Booked: ${booked.length} (${(booked.length/leads.length*100).toFixed(0)}%)`);
  lines.push(`  Pending: ${unbooked.length}`);
  lines.push('');
  lines.push(`💰 Revenue: $${(booked.length * 500).toLocaleString()}`);
  lines.push('');
  lines.push('_See you tomorrow!_ 👋');

  console.log(lines.join('\n'));
}

function fullSummary(leads) {
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const warm = unbooked.filter(l => { const a = getAgeDays(l.replied_at); return a > 3 && a <= 7; });
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);

  const sequenceDays = [0, 3, 7, 14, 21, 30];
  const dueToday = unbooked.filter(l => sequenceDays.includes(getAgeDays(l.replied_at)));

  const health = stale.length / unbooked.length;
  const healthEmoji = health < 0.3 ? '🟢' : health < 0.5 ? '🟡' : health < 0.7 ? '🟠' : '🔴';

  const lines = [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  lines.push(`📊 *Daily Summary* - ${today}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`${healthEmoji} *Pipeline Health*`);
  lines.push(`• Total: ${leads.length} leads`);
  lines.push(`• ✅ Booked: ${booked.length} (${(booked.length/leads.length*100).toFixed(1)}%)`);
  lines.push(`• 🤝 Meetings: ${meetings.length}`);
  lines.push(`• 💡 Interested: ${interested.length}`);
  lines.push('');
  lines.push(`⚡ *Urgency*`);
  lines.push(`• 🔥 Hot: ${hot.length}`);
  lines.push(`• 🌡️ Warm: ${warm.length}`);
  lines.push(`• ⚠️ Stale: ${stale.length}`);
  lines.push('');

  if (dueToday.length > 0) {
    lines.push(`📬 *Due Today:* ${dueToday.length} follow-ups`);
    lines.push('');
  }

  lines.push(`💰 *Revenue*`);
  lines.push(`• Current: $${(booked.length * 500).toLocaleString()}`);
  lines.push(`• Potential: +$${(meetings.length * 200).toLocaleString()}`);
  lines.push('');

  // Top 3 priorities
  const priorities = unbooked
    .map(l => ({ ...l, score: (l.reply_category === 'Meeting Request' ? 30 : 15) + Math.max(0, 20 - getAgeDays(l.replied_at)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  lines.push(`🎯 *Top Priorities*`);
  priorities.forEach((l, i) => {
    lines.push(`${i + 1}. ${l.lead_name} @ ${l.lead_company || '?'}`);
  });

  console.log(lines.join('\n'));
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
