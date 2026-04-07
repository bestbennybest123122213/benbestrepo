#!/usr/bin/env node
/**
 * Cron Tasks - Automated background tasks
 * 
 * Run with: node cron-tasks.js <task>
 * 
 * Tasks:
 *   morning    - Morning briefing (8am)
 *   noon       - Midday check (12pm)
 *   evening    - Evening summary (6pm)
 *   hourly     - Quick pipeline check
 *   alert      - Check for urgent leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');
const fs = require('fs');

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8571010793';

async function getStats() {
  const client = initSupabase();
  if (!client) return null;

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) return null;

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const hot = leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked');
  const stale = leads.filter(l => getAge(l) > 14 && l.reply_category !== 'Booked');
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
  });

  return {
    total: leads.length,
    booked: booked.length,
    meetings: meetings.length,
    hot,
    stale,
    enterprise,
    bookingRate: ((booked.length / leads.length) * 100).toFixed(1)
  };
}

// Save notification for later delivery
function saveNotification(message, priority = 'normal') {
  const notifications = JSON.parse(fs.readFileSync('notifications-queue.json', 'utf8') || '[]');
  notifications.push({
    message,
    priority,
    timestamp: new Date().toISOString(),
    delivered: false
  });
  fs.writeFileSync('notifications-queue.json', JSON.stringify(notifications, null, 2));
}

async function morningBrief() {
  const stats = await getStats();
  if (!stats) return 'Error fetching stats';

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  
  let message = `☀️ *MORNING BRIEF* - ${date}\n\n`;
  message += `📊 Pipeline: ${stats.total} leads | ${stats.booked} booked (${stats.bookingRate}%)\n`;
  message += `🤝 ${stats.meetings} meeting requests\n`;
  
  if (stats.hot.length > 0) {
    message += `\n🔥 *${stats.hot.length} HOT LEADS* (respond today!):\n`;
    stats.hot.slice(0, 5).forEach(l => {
      const info = getCompanyInfo(l.lead_email);
      message += `• ${l.lead_name || 'N/A'} @ ${info?.name || 'N/A'}\n`;
    });
  }

  if (stats.enterprise.length > 0) {
    message += `\n🏢 *${stats.enterprise.length} ENTERPRISE* leads:\n`;
    stats.enterprise.slice(0, 5).forEach(l => {
      const info = getCompanyInfo(l.lead_email);
      message += `• ${l.lead_name || 'N/A'} @ ${info?.name || 'N/A'}\n`;
    });
  }

  message += `\n📋 Today's Goal: Book ${Math.min(5, stats.meetings)} meetings\n`;
  message += `⏱️ Est. time: ${stats.hot.length * 5 + Math.min(5, stats.meetings) * 3} min`;

  return message;
}

async function noonCheck() {
  const stats = await getStats();
  if (!stats) return 'Error';

  let message = `📊 *MIDDAY CHECK*\n\n`;
  message += `Pipeline: ${stats.total} leads | ${stats.booked} booked\n`;
  
  if (stats.hot.length > 0) {
    message += `\n⚠️ ${stats.hot.length} hot leads still need response!`;
  } else {
    message += `\n✅ All hot leads handled`;
  }

  return message;
}

async function eveningSummary() {
  const stats = await getStats();
  if (!stats) return 'Error';

  let message = `🌙 *EVENING SUMMARY*\n\n`;
  message += `📊 Final Pipeline: ${stats.total} leads | ${stats.booked} booked (${stats.bookingRate}%)\n`;
  message += `🤝 ${stats.meetings} meetings pending\n`;
  message += `⚠️ ${stats.stale.length} stale leads\n`;
  message += `\n📝 Tomorrow: Focus on ${Math.min(10, stats.stale.length)} stale leads`;

  return message;
}

async function hourlyCheck() {
  const stats = await getStats();
  if (!stats) return null;

  // Only notify if there are urgent items
  if (stats.hot.length > 3 || stats.enterprise.length > 0) {
    return `⏰ Pipeline: ${stats.total} total | 🔥 ${stats.hot.length} hot | 🏢 ${stats.enterprise.length} enterprise`;
  }
  return null;
}

async function alertCheck() {
  const stats = await getStats();
  if (!stats) return null;

  const alerts = [];
  
  if (stats.hot.length > 5) {
    alerts.push(`🚨 ${stats.hot.length} hot leads need IMMEDIATE response!`);
  }
  
  const urgentEnterprise = stats.enterprise.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise';
  });
  
  if (urgentEnterprise.length > 0) {
    alerts.push(`🏢 ${urgentEnterprise.length} enterprise leads waiting!`);
  }

  return alerts.length > 0 ? alerts.join('\n') : null;
}

async function main() {
  const task = process.argv[2] || 'alert';
  let result = null;

  console.log(`\n🔄 Running task: ${task}\n`);

  switch (task) {
    case 'morning':
      result = await morningBrief();
      break;
    case 'noon':
      result = await noonCheck();
      break;
    case 'evening':
      result = await eveningSummary();
      break;
    case 'hourly':
      result = await hourlyCheck();
      break;
    case 'alert':
      result = await alertCheck();
      break;
    default:
      console.log('Unknown task:', task);
      console.log('Available: morning, noon, evening, hourly, alert');
      return;
  }

  if (result) {
    console.log(result);
    console.log('\n---');
    console.log('Send this to Telegram or save for later delivery');
  } else {
    console.log('✅ Nothing to report');
  }
}

module.exports = { morningBrief, noonCheck, eveningSummary, hourlyCheck, alertCheck };

if (require.main === module) {
  main().catch(console.error);
}
