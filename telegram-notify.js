#!/usr/bin/env node
/**
 * Telegram Notification System
 * 
 * Send proactive alerts to Jan via Telegram.
 * Use for important updates, hot leads, and daily briefings.
 * 
 * Usage:
 *   node telegram-notify.js brief       # Send morning brief
 *   node telegram-notify.js alert       # Send hot lead alert
 *   node telegram-notify.js weekly      # Send weekly summary
 *   node telegram-notify.js custom MSG  # Send custom message
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const ACTION = args[0] || 'brief';
const CUSTOM_MSG = args.slice(1).join(' ');

// This outputs formatted text that can be sent via Clawdbot
// The actual sending is done by the calling agent

async function generateBrief() {
  const client = initSupabase();
  if (!client) return 'Database not available';

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // New replies
  const { data: newReplies } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', yesterday.toISOString());

  // Hot leads
  const { data: hotLeads } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false })
    .limit(5);

  const nowMs = Date.now();
  const urgent = (hotLeads || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age <= 3;
  });

  // Pending count
  const { count: pendingCount } = await client
    .from('positive_replies')
    .select('id', { count: 'exact', head: true })
    .eq('follow_up_status', 'pending');

  // Build message
  let msg = `☀️ *Morning Brief* — ${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}\n\n`;

  if (newReplies?.length > 0) {
    msg += `🆕 *${newReplies.length} new replies* in 24h\n\n`;
  } else {
    msg += `🆕 No new replies in 24h\n\n`;
  }

  if (urgent.length > 0) {
    msg += `🔥 *${urgent.length} HOT LEADS* need response TODAY:\n`;
    urgent.forEach(lead => {
      const name = lead.lead_name || lead.lead_email?.split('@')[0] || 'Unknown';
      const company = lead.lead_company ? ` @ ${lead.lead_company}` : '';
      msg += `• ${name}${company}\n`;
    });
    msg += '\n';
  }

  msg += `📊 *Stats:*\n`;
  msg += `• Pending leads: ${pendingCount || 0}\n`;
  msg += `• Hot (0-3d): ${urgent.length}\n\n`;

  msg += `🎯 *Focus:* Run \`gex queue\` and respond to hot leads first.`;

  return msg;
}

async function generateAlert() {
  const client = initSupabase();
  if (!client) return null;

  const nowMs = Date.now();
  
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  const hot = (leads || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age <= 3;
  });

  if (hot.length === 0) return null;

  let msg = `🔴 *ALERT: ${hot.length} Hot Lead${hot.length > 1 ? 's' : ''}*\n\n`;
  
  hot.slice(0, 3).forEach(lead => {
    const name = lead.lead_name || lead.lead_email?.split('@')[0] || 'Unknown';
    const company = lead.lead_company ? ` @ ${lead.lead_company}` : '';
    msg += `• ${name}${company} — ${lead.reply_category}\n`;
  });

  if (hot.length > 3) {
    msg += `• ... and ${hot.length - 3} more\n`;
  }

  msg += `\nRun \`gex queue\` to see ready-to-send emails.`;

  return msg;
}

async function generateWeekly() {
  const client = initSupabase();
  if (!client) return 'Database not available';

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // This week's replies
  const { data: weekReplies } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', weekAgo.toISOString());

  const newCount = weekReplies?.length || 0;
  const booked = (weekReplies || []).filter(r => r.reply_category === 'Booked' || r.reply_category === 'Meeting Booked').length;

  // Pipeline
  let pipelineValue = 0;
  let totalCommission = 0;
  
  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      const deals = data.deals || data || [];
      pipelineValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
    }
  } catch (e) {}

  try {
    const commPath = './data/commissions.json';
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      const comms = data.commissions || data || [];
      totalCommission = comms.reduce((sum, c) => sum + (c.commission || c.amount || 0), 0);
    }
  } catch (e) {}

  let msg = `📊 *Weekly Report*\n`;
  msg += `Week of ${weekAgo.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}\n\n`;

  msg += `*Activity*\n`;
  msg += `• New replies: ${newCount}\n`;
  msg += `• Meetings booked: ${booked}\n\n`;

  msg += `*Pipeline*\n`;
  msg += `• Active value: $${pipelineValue.toLocaleString()}\n`;
  msg += `• Historical commission: $${Math.round(totalCommission).toLocaleString()}\n\n`;

  msg += `Run \`gex weekly\` for full report.`;

  return msg;
}

async function main() {
  let message = null;

  switch (ACTION) {
    case 'brief':
    case 'morning':
      message = await generateBrief();
      break;
    case 'alert':
    case 'hot':
      message = await generateAlert();
      break;
    case 'weekly':
    case 'report':
      message = await generateWeekly();
      break;
    case 'custom':
      message = CUSTOM_MSG || 'No message provided';
      break;
    default:
      console.log('Usage: gex notify <brief|alert|weekly|custom>');
      return;
  }

  if (message) {
    console.log('--- TELEGRAM MESSAGE ---');
    console.log(message);
    console.log('--- END ---');
  } else {
    console.log('No notification needed');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
