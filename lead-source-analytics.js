#!/usr/bin/env node
/**
 * Lead Source Analytics
 * Analyze which campaigns and verticals convert best.
 * Reads from Supabase all_replies table.
 *
 * Usage:
 *   node lead-source-analytics.js by-campaign
 *   node lead-source-analytics.js by-vertical
 *   node lead-source-analytics.js trends
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const POSITIVE_CATEGORIES = new Set([
  'Interested',
  'Meeting Request',
  'Information Request',
  'Booked',
  'Demo Request',
  'Pricing Request'
]);

const HOT_CATEGORIES = new Set([
  'Meeting Request',
  'Booked'
]);

function detectVerticalFromEmail(email) {
  const domain = (email || '').split('@')[1] || '';
  const root = domain.split('.').slice(0, -1).join('.') || domain;
  const text = `${domain} ${root}`.toLowerCase();

  if (text.match(/game|gaming|studio|play|esports/)) return 'gaming';
  if (text.match(/edu|learn|school|course|tutor|study/)) return 'edtech';
  if (text.match(/ai|tech|software|saas|app|cloud|digital/)) return 'tech';
  if (text.match(/retail|shop|store|consumer|brand|commerce/)) return 'consumer';
  if (text.match(/bank|finance|invest|trading|crypto/)) return 'finance';

  return 'other';
}

async function fetchReplies() {
  const { data, error } = await supabase
    .from('all_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('Error fetching replies:', error.message);
    return [];
  }

  return data || [];
}

function calculateRates(rows) {
  const total = rows.length;
  const positive = rows.filter(r => POSITIVE_CATEGORIES.has(r.reply_category)).length;
  const hot = rows.filter(r => HOT_CATEGORIES.has(r.reply_category)).length;

  return {
    total,
    positive,
    hot,
    positiveRate: total > 0 ? (positive / total) * 100 : 0,
    hotRate: total > 0 ? (hot / total) * 100 : 0
  };
}

async function byCampaign() {
  const replies = await fetchReplies();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📣 CAMPAIGN PERFORMANCE                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (replies.length === 0) {
    console.log('No replies found in all_replies.\n');
    return;
  }

  const grouped = {};
  replies.forEach(r => {
    const name = r.campaign_name || 'Unknown Campaign';
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(r);
  });

  const rows = Object.entries(grouped)
    .map(([name, rows]) => ({ name, ...calculateRates(rows) }))
    .sort((a, b) => b.positiveRate - a.positiveRate);

  console.log('Campaign                         Total   Positive   Positive %   Hot %');
  console.log('─'.repeat(80));

  rows.forEach(r => {
    console.log(
      `${r.name.substring(0, 30).padEnd(30)} ` +
      `${String(r.total).padStart(5)}   ` +
      `${String(r.positive).padStart(8)}   ` +
      `${r.positiveRate.toFixed(1).padStart(9)}%   ` +
      `${r.hotRate.toFixed(1).padStart(5)}%`
    );
  });
  console.log('');
}

async function byVertical() {
  const replies = await fetchReplies();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🧭 VERTICAL PERFORMANCE                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (replies.length === 0) {
    console.log('No replies found in all_replies.\n');
    return;
  }

  const grouped = {};
  replies.forEach(r => {
    const vertical = detectVerticalFromEmail(r.lead_email);
    if (!grouped[vertical]) grouped[vertical] = [];
    grouped[vertical].push(r);
  });

  const rows = Object.entries(grouped)
    .map(([vertical, rows]) => ({ vertical, ...calculateRates(rows) }))
    .sort((a, b) => b.positiveRate - a.positiveRate);

  console.log('Vertical        Total   Positive   Positive %   Hot %');
  console.log('─'.repeat(70));

  rows.forEach(r => {
    console.log(
      `${r.vertical.padEnd(14)} ` +
      `${String(r.total).padStart(5)}   ` +
      `${String(r.positive).padStart(8)}   ` +
      `${r.positiveRate.toFixed(1).padStart(9)}%   ` +
      `${r.hotRate.toFixed(1).padStart(5)}%`
    );
  });
  console.log('');
}

async function trends() {
  const replies = await fetchReplies();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📈 CONVERSION TRENDS                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (replies.length === 0) {
    console.log('No replies found in all_replies.\n');
    return;
  }

  const byWeek = {};
  replies.forEach(r => {
    const date = new Date(r.replied_at || r.created_at);
    if (Number.isNaN(date.getTime())) return;
    const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;
    if (!byWeek[weekKey]) byWeek[weekKey] = [];
    byWeek[weekKey].push(r);
  });

  const rows = Object.entries(byWeek)
    .map(([week, rows]) => ({ week, ...calculateRates(rows) }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-12);

  console.log('Week        Total   Positive   Positive %   Hot %');
  console.log('─'.repeat(70));

  rows.forEach(r => {
    console.log(
      `${r.week.padEnd(10)} ` +
      `${String(r.total).padStart(5)}   ` +
      `${String(r.positive).padStart(8)}   ` +
      `${r.positiveRate.toFixed(1).padStart(9)}%   ` +
      `${r.hotRate.toFixed(1).padStart(5)}%`
    );
  });
  console.log('');
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

const args = process.argv.slice(2);
const command = args[0] || 'by-campaign';

(async () => {
  switch (command) {
    case 'by-campaign':
      await byCampaign();
      break;
    case 'by-vertical':
      await byVertical();
      break;
    case 'trends':
      await trends();
      break;
    default:
      await byCampaign();
      break;
  }
})();
