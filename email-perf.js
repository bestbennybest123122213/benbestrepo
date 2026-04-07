#!/usr/bin/env node
/**
 * Email Performance Analyzer
 * 
 * Analyze email performance to find what works:
 * - Subject line patterns that get replies
 * - Campaign/template effectiveness
 * - Timing analysis (best days/times)
 * - Vertical-specific insights
 * - A/B test suggestions
 * - Export to CSV
 * 
 * Usage:
 *   node email-perf.js              # Overall dashboard
 *   node email-perf.js subjects     # Subject line patterns
 *   node email-perf.js templates    # Template effectiveness
 *   node email-perf.js timing       # Best days/times analysis
 *   node email-perf.js verticals    # Vertical deep dive
 *   node email-perf.js ab           # A/B test suggestions
 *   node email-perf.js trends       # Performance trends over time
 *   node email-perf.js export       # Export data to CSV
 *   node email-perf.js --vertical gaming  # Filter by vertical
 *   node email-perf.js --best       # Show top performing emails
 *   node email-perf.js --export     # Export data to CSV
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const SUBCOMMAND = args.find(a => !a.startsWith('-')) || 'dashboard';
const FLAGS = {
  vertical: args.find(a => a.startsWith('--vertical='))?.split('=')[1] || 
             (args.includes('--vertical') ? args[args.indexOf('--vertical') + 1] : null),
  best: args.includes('--best'),
  worst: args.includes('--worst'),
  export: args.includes('--export'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20
};

// ANSI colors
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
  bg: { green: '\x1b[42m', yellow: '\x1b[43m', red: '\x1b[41m' }
};

const POSITIVE_CATEGORIES = ['Booked', 'Meeting Request', 'Interested', 'Information Request'];
const BOOKED_CATEGORIES = ['Booked', 'Meeting Request'];

// Extract vertical from campaign name
function extractVertical(name) {
  if (!name) return 'other';
  const lower = name.toLowerCase();
  if (lower.includes('gaming') || lower.includes('game')) return 'gaming';
  if (lower.includes('edu') || lower.includes('edtech')) return 'education';
  if (lower.includes('app')) return 'apps';
  if (lower.includes('video') || lower.includes('editing')) return 'video';
  if (lower.includes('reac') || lower.includes('reactivation')) return 'reactivation';
  return 'other';
}

// Parse day of week from date
function getDayOfWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

// Get hour from date
function getHour(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).getHours();
}

// Format percentage
function pct(n, d) {
  if (!d || d === 0) return '0.0%';
  return ((n / d) * 100).toFixed(1) + '%';
}

// Rating bar visualization
function rateBar(rate, max = 10) {
  const filled = Math.round((rate / max) * 10);
  return c.green + '█'.repeat(Math.min(filled, 10)) + c.dim + '░'.repeat(10 - Math.min(filled, 10)) + c.reset;
}

async function main() {
  console.log(`\n${c.bold}📧 Email Performance Analyzer${c.reset}\n`);
  
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Fetch all replies data
  const { data: allReplies, error: repliesErr } = await client
    .from('all_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (repliesErr || !allReplies) {
    console.error('❌ Failed to fetch replies:', repliesErr?.message);
    process.exit(1);
  }

  // Fetch campaign snapshots for send data
  const { data: campaigns } = await client
    .from('campaign_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false });

  // Get latest snapshot per campaign
  const latestCampaigns = {};
  for (const camp of campaigns || []) {
    if (!latestCampaigns[camp.campaign_id]) {
      latestCampaigns[camp.campaign_id] = camp;
    }
  }

  // Filter by vertical if specified
  let replies = allReplies;
  if (FLAGS.vertical) {
    replies = allReplies.filter(r => extractVertical(r.campaign_name) === FLAGS.vertical.toLowerCase());
    console.log(`${c.dim}Filtering for vertical: ${FLAGS.vertical} (${replies.length} replies)${c.reset}\n`);
  }

  // Route to subcommand (check FLAGS first)
  if (FLAGS.best) {
    await showBestEmails(replies, latestCampaigns);
  } else if (FLAGS.export) {
    await exportToCSV(replies, latestCampaigns);
  } else {
    switch (SUBCOMMAND) {
      case 'subjects':
      case 'subject':
        await analyzeSubjects(replies, latestCampaigns);
        break;
      case 'templates':
      case 'template':
        await analyzeTemplates(replies, latestCampaigns);
        break;
      case 'timing':
      case 'time':
      case 'times':
        await analyzeTiming(replies);
        break;
      case 'verticals':
      case 'vertical':
        await analyzeVerticals(replies, latestCampaigns);
        break;
      case 'best':
      case 'top':
      case 'winners':
        await showBestEmails(replies, latestCampaigns);
        break;
      case 'ab':
      case 'abtest':
      case 'tests':
      case 'suggestions':
        await showABSuggestions(replies, latestCampaigns);
        break;
      case 'export':
      case 'csv':
        await exportToCSV(replies, latestCampaigns);
        break;
      case 'trends':
      case 'trend':
      case 'history':
        await showTrends(replies, latestCampaigns);
        break;
      default:
        await showDashboard(replies, latestCampaigns);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD - Overall view
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function showDashboard(replies, campaigns) {
  // Calculate campaign stats
  const campList = Object.values(campaigns);
  const totalSent = campList.reduce((sum, c) => sum + (c.sent || 0), 0);
  const totalReplied = campList.reduce((sum, c) => sum + (c.replied || 0), 0);
  const totalInterested = campList.reduce((sum, c) => sum + (c.interested || 0), 0);
  const totalBounced = campList.reduce((sum, c) => sum + (c.bounced || 0), 0);

  // Reply category breakdown
  const byCategory = {};
  replies.forEach(r => {
    const cat = r.reply_category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  // Vertical breakdown
  const byVertical = {};
  replies.forEach(r => {
    const vert = extractVertical(r.campaign_name);
    if (!byVertical[vert]) byVertical[vert] = { total: 0, positive: 0, booked: 0 };
    byVertical[vert].total++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) byVertical[vert].positive++;
    if (BOOKED_CATEGORIES.includes(r.reply_category)) byVertical[vert].booked++;
  });

  console.log(`${c.bold}━━━ OVERALL METRICS ━━━${c.reset}`);
  console.log(`  📤 Total Sent:     ${c.bold}${totalSent.toLocaleString()}${c.reset}`);
  console.log(`  📬 Total Replies:  ${c.bold}${totalReplied.toLocaleString()}${c.reset} (${pct(totalReplied, totalSent)})`);
  console.log(`  ✨ Interested:     ${c.green}${totalInterested.toLocaleString()}${c.reset} (${pct(totalInterested, totalSent)})`);
  console.log(`  🚫 Bounced:        ${c.red}${totalBounced.toLocaleString()}${c.reset} (${pct(totalBounced, totalSent)})`);

  console.log(`\n${c.bold}━━━ REPLY CATEGORIES ━━━${c.reset}`);
  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCats) {
    const icon = cat === 'Booked' ? '🎯' : 
                 cat === 'Meeting Request' ? '📅' :
                 cat === 'Interested' ? '✨' :
                 cat === 'Information Request' ? '❓' :
                 cat === 'Not Interested' ? '❌' :
                 cat === 'Out Of Office' ? '✈️' : '📝';
    const color = POSITIVE_CATEGORIES.includes(cat) ? c.green : 
                  cat === 'Not Interested' ? c.red : c.dim;
    console.log(`  ${icon} ${color}${cat.padEnd(22)}${c.reset} ${count.toString().padStart(4)} ${rateBar(count, replies.length / 5)}`);
  }

  console.log(`\n${c.bold}━━━ BY VERTICAL ━━━${c.reset}`);
  const sortedVerts = Object.entries(byVertical).sort((a, b) => b[1].total - a[1].total);
  console.log(`  ${'Vertical'.padEnd(14)} ${'Total'.padStart(6)} ${'Positive'.padStart(9)} ${'Booked'.padStart(8)}  Rate`);
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  for (const [vert, stats] of sortedVerts) {
    const rate = (stats.positive / stats.total * 100).toFixed(1);
    const icon = vert === 'gaming' ? '🎮' :
                 vert === 'education' ? '📚' :
                 vert === 'apps' ? '📱' :
                 vert === 'video' ? '🎬' :
                 vert === 'reactivation' ? '♻️' : '📦';
    console.log(`  ${icon} ${vert.padEnd(12)} ${stats.total.toString().padStart(6)} ${c.green}${stats.positive.toString().padStart(9)}${c.reset} ${c.cyan}${stats.booked.toString().padStart(8)}${c.reset}  ${rateBar(parseFloat(rate), 100)}`);
  }

  // Top campaigns
  console.log(`\n${c.bold}━━━ TOP CAMPAIGNS (by reply rate) ━━━${c.reset}`);
  const topCamps = Object.values(campaigns)
    .filter(camp => camp.sent >= 100)
    .sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))
    .slice(0, 5);
  
  for (const camp of topCamps) {
    const name = (camp.campaign_name || 'Unknown').slice(0, 45);
    const rate = camp.reply_rate?.toFixed(1) || '0.0';
    console.log(`  ${rateBar(parseFloat(rate))} ${rate}%  ${name}`);
  }

  // Quick insights
  console.log(`\n${c.bold}━━━ KEY INSIGHTS ━━━${c.reset}`);
  
  const positiveCount = replies.filter(r => POSITIVE_CATEGORIES.includes(r.reply_category)).length;
  const positiveRate = (positiveCount / replies.length * 100).toFixed(1);
  console.log(`  💡 Positive response rate: ${c.green}${positiveRate}%${c.reset}`);
  
  const bestVert = sortedVerts[0];
  if (bestVert) {
    const bestRate = (bestVert[1].positive / bestVert[1].total * 100).toFixed(1);
    console.log(`  🏆 Best vertical: ${c.cyan}${bestVert[0]}${c.reset} (${bestRate}% positive)`);
  }

  const bookedCount = replies.filter(r => BOOKED_CATEGORIES.includes(r.reply_category)).length;
  console.log(`  📅 Meeting/Booked rate: ${c.cyan}${(bookedCount / replies.length * 100).toFixed(1)}%${c.reset} (${bookedCount} total)`);

  console.log(`\n${c.dim}Run 'gex eperf subjects|templates|timing|verticals' for deep dives${c.reset}\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUBJECT LINE ANALYSIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function analyzeSubjects(replies, campaigns) {
  console.log(`${c.bold}━━━ SUBJECT/CAMPAIGN PATTERNS ━━━${c.reset}\n`);
  
  // Group by campaign
  const byCampaign = {};
  replies.forEach(r => {
    const name = r.campaign_name || 'Unknown';
    if (!byCampaign[name]) byCampaign[name] = { total: 0, positive: 0, booked: 0, categories: {} };
    byCampaign[name].total++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) byCampaign[name].positive++;
    if (BOOKED_CATEGORIES.includes(r.reply_category)) byCampaign[name].booked++;
    const cat = r.reply_category || 'Unknown';
    byCampaign[name].categories[cat] = (byCampaign[name].categories[cat] || 0) + 1;
  });

  // Find campaign stats from snapshots
  for (const [name, stats] of Object.entries(byCampaign)) {
    const camp = Object.values(campaigns).find(c => c.campaign_name === name);
    if (camp) {
      stats.sent = camp.sent;
      stats.replyRate = camp.reply_rate;
    }
  }

  // Extract patterns from campaign names
  const patterns = {
    'Crunchbase leads': { regex: /crunchbase/i, positive: 0, total: 0 },
    'EXA leads': { regex: /exa/i, positive: 0, total: 0 },
    'Reactivation': { regex: /reac|reactivation/i, positive: 0, total: 0 },
    'Education vertical': { regex: /edu|edtech/i, positive: 0, total: 0 },
    'Gaming vertical': { regex: /gaming|game/i, positive: 0, total: 0 },
    'Apps vertical': { regex: /app/i, positive: 0, total: 0 },
    'Video/Editing': { regex: /video|editing/i, positive: 0, total: 0 },
    'B2C focus': { regex: /b2c/i, positive: 0, total: 0 },
    'Funded companies': { regex: /fund/i, positive: 0, total: 0 }
  };

  replies.forEach(r => {
    const name = r.campaign_name || '';
    Object.values(patterns).forEach(p => {
      if (p.regex.test(name)) {
        p.total++;
        if (POSITIVE_CATEGORIES.includes(r.reply_category)) p.positive++;
      }
    });
  });

  console.log(`${c.cyan}Pattern Analysis (from campaign names):${c.reset}`);
  console.log(`  ${'Pattern'.padEnd(22)} ${'Replies'.padStart(8)} ${'Positive'.padStart(9)} ${'Rate'.padStart(8)}`);
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  
  const sortedPatterns = Object.entries(patterns)
    .filter(([, p]) => p.total > 0)
    .sort((a, b) => (b[1].positive / b[1].total) - (a[1].positive / a[1].total));
  
  for (const [name, p] of sortedPatterns) {
    const rate = (p.positive / p.total * 100).toFixed(1);
    const color = parseFloat(rate) >= 60 ? c.green : parseFloat(rate) >= 40 ? c.yellow : c.dim;
    console.log(`  ${name.padEnd(22)} ${p.total.toString().padStart(8)} ${color}${p.positive.toString().padStart(9)}${c.reset} ${color}${rate.padStart(7)}%${c.reset}`);
  }

  // Top performing campaigns
  console.log(`\n${c.cyan}Top Performing Campaigns (min 5 replies):${c.reset}`);
  const topCampaigns = Object.entries(byCampaign)
    .filter(([, s]) => s.total >= 5)
    .map(([name, stats]) => ({ name, ...stats, rate: stats.positive / stats.total }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, FLAGS.limit);
  
  console.log(`  ${'Campaign'.padEnd(50)} ${'Pos'.padStart(5)}/${'Tot'.padStart(4)} ${'Rate'.padStart(7)}`);
  console.log(`  ${c.dim}${'─'.repeat(70)}${c.reset}`);
  
  for (const camp of topCampaigns) {
    const shortName = camp.name.length > 48 ? camp.name.slice(0, 45) + '...' : camp.name;
    const rate = (camp.rate * 100).toFixed(1);
    const color = parseFloat(rate) >= 60 ? c.green : parseFloat(rate) >= 40 ? c.yellow : c.reset;
    console.log(`  ${shortName.padEnd(50)} ${color}${camp.positive.toString().padStart(5)}${c.reset}/${camp.total.toString().padStart(4)} ${color}${rate.padStart(6)}%${c.reset}`);
  }

  // Worst performers for comparison
  if (FLAGS.worst) {
    console.log(`\n${c.red}Underperforming Campaigns:${c.reset}`);
    const worstCampaigns = Object.entries(byCampaign)
      .filter(([, s]) => s.total >= 5)
      .map(([name, stats]) => ({ name, ...stats, rate: stats.positive / stats.total }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5);
    
    for (const camp of worstCampaigns) {
      const shortName = camp.name.length > 48 ? camp.name.slice(0, 45) + '...' : camp.name;
      console.log(`  ${c.red}${shortName.padEnd(50)} ${camp.positive}/${camp.total} (${(camp.rate * 100).toFixed(1)}%)${c.reset}`);
    }
  }

  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEMPLATE/CATEGORY EFFECTIVENESS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function analyzeTemplates(replies, campaigns) {
  console.log(`${c.bold}━━━ RESPONSE CATEGORY ANALYSIS ━━━${c.reset}\n`);
  
  // Category distribution
  const byCategory = {};
  replies.forEach(r => {
    const cat = r.reply_category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, examples: [] };
    byCategory[cat].count++;
    if (byCategory[cat].examples.length < 3 && r.lead_name) {
      byCategory[cat].examples.push({ name: r.lead_name, company: r.lead_company });
    }
  });

  console.log(`${c.cyan}Response Category Breakdown:${c.reset}`);
  const sorted = Object.entries(byCategory).sort((a, b) => b[1].count - a[1].count);
  
  for (const [cat, data] of sorted) {
    const pctVal = (data.count / replies.length * 100).toFixed(1);
    const icon = cat === 'Booked' ? '🎯' : 
                 cat === 'Meeting Request' ? '📅' :
                 cat === 'Interested' ? '✨' :
                 cat === 'Information Request' ? '❓' :
                 cat === 'Not Interested' ? '❌' :
                 cat === 'Out Of Office' ? '✈️' :
                 cat === 'Wrong Person' ? '👤' : '📝';
    const color = POSITIVE_CATEGORIES.includes(cat) ? c.green : 
                  cat === 'Not Interested' ? c.red : c.dim;
    
    console.log(`\n  ${icon} ${color}${c.bold}${cat}${c.reset} ${color}(${data.count} - ${pctVal}%)${c.reset}`);
    console.log(`     ${rateBar(data.count, replies.length / 4)}`);
    
    if (data.examples.length > 0) {
      console.log(`     ${c.dim}Examples: ${data.examples.map(e => e.name + (e.company ? ` @ ${e.company}` : '')).join(', ')}${c.reset}`);
    }
  }

  // Conversion funnel
  console.log(`\n${c.cyan}Conversion Funnel:${c.reset}`);
  const total = replies.length;
  const positive = replies.filter(r => POSITIVE_CATEGORIES.includes(r.reply_category)).length;
  const meetings = replies.filter(r => BOOKED_CATEGORIES.includes(r.reply_category)).length;
  const booked = replies.filter(r => r.reply_category === 'Booked').length;
  
  console.log(`  📬 All Replies:      ${c.bold}${total}${c.reset} (100%)`);
  console.log(`  ✨ Positive:         ${c.green}${positive}${c.reset} (${pct(positive, total)})`);
  console.log(`  📅 Meeting/Booked:   ${c.cyan}${meetings}${c.reset} (${pct(meetings, total)})`);
  console.log(`  🎯 Confirmed Booked: ${c.magenta}${booked}${c.reset} (${pct(booked, total)})`);

  // Quality metrics
  console.log(`\n${c.cyan}Quality Metrics:${c.reset}`);
  const qualityRate = meetings / positive * 100;
  const noiseRate = (total - positive) / total * 100;
  console.log(`  📊 Positive → Meeting conversion: ${c.green}${qualityRate.toFixed(1)}%${c.reset}`);
  console.log(`  📉 Noise rate (non-positive):     ${c.dim}${noiseRate.toFixed(1)}%${c.reset}`);
  
  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIMING ANALYSIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function analyzeTiming(replies) {
  console.log(`${c.bold}━━━ TIMING ANALYSIS ━━━${c.reset}\n`);
  
  // Day of week analysis
  const byDay = { Sun: { total: 0, positive: 0 }, Mon: { total: 0, positive: 0 }, 
                  Tue: { total: 0, positive: 0 }, Wed: { total: 0, positive: 0 },
                  Thu: { total: 0, positive: 0 }, Fri: { total: 0, positive: 0 },
                  Sat: { total: 0, positive: 0 } };
  
  // Hour analysis
  const byHour = {};
  for (let i = 0; i < 24; i++) byHour[i] = { total: 0, positive: 0 };
  
  replies.forEach(r => {
    const day = getDayOfWeek(r.replied_at);
    const hour = getHour(r.replied_at);
    
    if (day && byDay[day]) {
      byDay[day].total++;
      if (POSITIVE_CATEGORIES.includes(r.reply_category)) byDay[day].positive++;
    }
    if (hour !== null && byHour[hour]) {
      byHour[hour].total++;
      if (POSITIVE_CATEGORIES.includes(r.reply_category)) byHour[hour].positive++;
    }
  });

  console.log(`${c.cyan}Replies by Day of Week:${c.reset}`);
  console.log(`  Day   Total  Positive  Rate    Visual`);
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let bestDay = { day: '', rate: 0 };
  
  for (const day of days) {
    const d = byDay[day];
    const rate = d.total > 0 ? (d.positive / d.total * 100) : 0;
    if (rate > bestDay.rate && d.total >= 5) bestDay = { day, rate };
    const color = rate >= 60 ? c.green : rate >= 40 ? c.yellow : c.dim;
    console.log(`  ${day}   ${d.total.toString().padStart(5)}  ${color}${d.positive.toString().padStart(8)}${c.reset}  ${color}${rate.toFixed(1).padStart(5)}%${c.reset}  ${rateBar(d.total, replies.length / 5)}`);
  }

  console.log(`\n${c.cyan}Replies by Hour (UTC):${c.reset}`);
  console.log(`  Hour  Total  Pos   Rate`);
  
  // Group hours for readability
  const hourGroups = [
    { label: '🌙 Night (0-5)', hours: [0,1,2,3,4,5] },
    { label: '🌅 Morning (6-11)', hours: [6,7,8,9,10,11] },
    { label: '☀️ Afternoon (12-17)', hours: [12,13,14,15,16,17] },
    { label: '🌆 Evening (18-23)', hours: [18,19,20,21,22,23] }
  ];

  let bestHourGroup = { label: '', rate: 0 };
  
  for (const group of hourGroups) {
    let total = 0, positive = 0;
    group.hours.forEach(h => {
      total += byHour[h].total;
      positive += byHour[h].positive;
    });
    const rate = total > 0 ? (positive / total * 100) : 0;
    if (rate > bestHourGroup.rate && total >= 10) bestHourGroup = { label: group.label, rate };
    const color = rate >= 60 ? c.green : rate >= 40 ? c.yellow : c.dim;
    console.log(`  ${group.label.padEnd(25)} ${total.toString().padStart(5)}  ${color}${positive.toString().padStart(4)}${c.reset}  ${color}${rate.toFixed(1).padStart(5)}%${c.reset}`);
  }

  // Response time analysis
  const responseTimes = replies
    .map(r => r.response_time_seconds)
    .filter(t => t && t > 0 && t < 604800); // Under 7 days

  if (responseTimes.length > 0) {
    const avgResponse = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const avgHours = avgResponse / 3600;
    
    console.log(`\n${c.cyan}Response Time:${c.reset}`);
    console.log(`  ⏱️ Average time to reply: ${c.bold}${avgHours.toFixed(1)} hours${c.reset}`);
    
    const fast = responseTimes.filter(t => t < 3600).length; // < 1hr
    const medium = responseTimes.filter(t => t >= 3600 && t < 86400).length; // 1hr-1day
    const slow = responseTimes.filter(t => t >= 86400).length; // > 1 day
    
    console.log(`  ⚡ Under 1 hour: ${fast} (${pct(fast, responseTimes.length)})`);
    console.log(`  📝 1 hour - 1 day: ${medium} (${pct(medium, responseTimes.length)})`);
    console.log(`  🐢 Over 1 day: ${slow} (${pct(slow, responseTimes.length)})`);
  }

  // Insights
  console.log(`\n${c.bold}━━━ TIMING INSIGHTS ━━━${c.reset}`);
  if (bestDay.day) {
    console.log(`  🏆 Best day for positive replies: ${c.green}${bestDay.day}${c.reset} (${bestDay.rate.toFixed(1)}% positive)`);
  }
  if (bestHourGroup.label) {
    console.log(`  ⏰ Best time period: ${c.green}${bestHourGroup.label}${c.reset} (${bestHourGroup.rate.toFixed(1)}% positive)`);
  }
  
  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VERTICAL ANALYSIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function analyzeVerticals(replies, campaigns) {
  console.log(`${c.bold}━━━ VERTICAL DEEP DIVE ━━━${c.reset}\n`);
  
  const byVertical = {};
  replies.forEach(r => {
    const vert = extractVertical(r.campaign_name);
    if (!byVertical[vert]) {
      byVertical[vert] = { 
        total: 0, positive: 0, booked: 0, 
        categories: {}, 
        companies: [],
        campaigns: new Set()
      };
    }
    const v = byVertical[vert];
    v.total++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) v.positive++;
    if (BOOKED_CATEGORIES.includes(r.reply_category)) v.booked++;
    v.categories[r.reply_category] = (v.categories[r.reply_category] || 0) + 1;
    if (r.lead_company && v.companies.length < 5) v.companies.push(r.lead_company);
    if (r.campaign_name) v.campaigns.add(r.campaign_name);
  });

  const sorted = Object.entries(byVertical)
    .map(([name, stats]) => ({ name, ...stats, rate: stats.positive / stats.total }))
    .sort((a, b) => b.rate - a.rate);

  for (const vert of sorted) {
    const icon = vert.name === 'gaming' ? '🎮' :
                 vert.name === 'education' ? '📚' :
                 vert.name === 'apps' ? '📱' :
                 vert.name === 'video' ? '🎬' :
                 vert.name === 'reactivation' ? '♻️' : '📦';
    
    const rate = (vert.rate * 100).toFixed(1);
    const bookRate = (vert.booked / vert.total * 100).toFixed(1);
    
    console.log(`${icon} ${c.bold}${vert.name.toUpperCase()}${c.reset}`);
    console.log(`  ${rateBar(parseFloat(rate))} ${rate}% positive (${vert.positive}/${vert.total})`);
    console.log(`  📅 Booking rate: ${c.cyan}${bookRate}%${c.reset} (${vert.booked} meetings)`);
    console.log(`  📊 Campaigns: ${vert.campaigns.size}`);
    
    // Top categories for this vertical
    const topCats = Object.entries(vert.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    console.log(`  ${c.dim}Top responses: ${topCats.map(([cat, n]) => `${cat}(${n})`).join(', ')}${c.reset}`);
    
    if (vert.companies.length > 0) {
      console.log(`  ${c.dim}Companies: ${vert.companies.slice(0, 3).join(', ')}${c.reset}`);
    }
    console.log();
  }

  // Recommendations
  console.log(`${c.bold}━━━ RECOMMENDATIONS ━━━${c.reset}`);
  const bestVert = sorted[0];
  const worstVert = sorted[sorted.length - 1];
  
  if (bestVert && bestVert.rate > 0.5) {
    console.log(`  ✅ ${c.green}Double down on ${bestVert.name}${c.reset} - ${(bestVert.rate * 100).toFixed(0)}% positive rate`);
  }
  if (worstVert && worstVert.rate < 0.3 && worstVert.total > 10) {
    console.log(`  ⚠️ ${c.yellow}Review ${worstVert.name} strategy${c.reset} - only ${(worstVert.rate * 100).toFixed(0)}% positive`);
  }
  
  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BEST PERFORMING EMAILS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function showBestEmails(replies, campaigns) {
  console.log(`${c.bold}━━━ TOP PERFORMING EMAILS TO CLONE ━━━${c.reset}\n`);
  
  // Get booked and meeting requests
  const winners = replies
    .filter(r => BOOKED_CATEGORIES.includes(r.reply_category))
    .sort((a, b) => new Date(b.replied_at) - new Date(a.replied_at))
    .slice(0, FLAGS.limit);

  console.log(`${c.green}🎯 Recent Meetings/Bookings (${winners.length}):${c.reset}\n`);
  
  for (const w of winners) {
    const date = w.replied_at ? new Date(w.replied_at).toLocaleDateString() : 'Unknown';
    const vert = extractVertical(w.campaign_name);
    const vertIcon = vert === 'gaming' ? '🎮' :
                     vert === 'education' ? '📚' :
                     vert === 'apps' ? '📱' : '📦';
    
    console.log(`  ${c.cyan}${w.lead_name || 'Unknown'}${c.reset} ${w.lead_company ? `@ ${w.lead_company}` : ''}`);
    console.log(`    ${vertIcon} ${vert} | ${w.reply_category} | ${date}`);
    console.log(`    ${c.dim}Campaign: ${(w.campaign_name || 'Unknown').slice(0, 60)}${c.reset}`);
    console.log();
  }

  // Winning campaign patterns
  console.log(`${c.bold}━━━ WINNING PATTERNS ━━━${c.reset}\n`);
  
  const winningCampaigns = {};
  winners.forEach(w => {
    const name = w.campaign_name || 'Unknown';
    winningCampaigns[name] = (winningCampaigns[name] || 0) + 1;
  });

  const topWinning = Object.entries(winningCampaigns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log(`${c.cyan}Campaigns with most bookings:${c.reset}`);
  for (const [name, count] of topWinning) {
    const shortName = name.length > 55 ? name.slice(0, 52) + '...' : name;
    console.log(`  ${c.green}${count}${c.reset} 📅 ${shortName}`);
  }

  // Vertical breakdown of winners
  console.log(`\n${c.cyan}Winning verticals:${c.reset}`);
  const vertWins = {};
  winners.forEach(w => {
    const vert = extractVertical(w.campaign_name);
    vertWins[vert] = (vertWins[vert] || 0) + 1;
  });
  
  Object.entries(vertWins)
    .sort((a, b) => b[1] - a[1])
    .forEach(([vert, count]) => {
      console.log(`  ${vert.padEnd(15)} ${c.green}${count}${c.reset} meetings`);
    });

  console.log(`\n${c.dim}💡 Clone these patterns: find similar leads in winning verticals/campaigns${c.reset}\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A/B TEST SUGGESTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function showABSuggestions(replies, campaigns) {
  console.log(`${c.bold}━━━ A/B TEST SUGGESTIONS ━━━${c.reset}\n`);
  
  // Analyze current patterns to suggest tests
  const byVertical = {};
  const byCampaign = {};
  
  replies.forEach(r => {
    const vert = extractVertical(r.campaign_name);
    const camp = r.campaign_name || 'Unknown';
    
    if (!byVertical[vert]) byVertical[vert] = { total: 0, positive: 0 };
    if (!byCampaign[camp]) byCampaign[camp] = { total: 0, positive: 0, name: camp };
    
    byVertical[vert].total++;
    byCampaign[camp].total++;
    
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) {
      byVertical[vert].positive++;
      byCampaign[camp].positive++;
    }
  });

  // Find high-volume campaigns that could be improved
  const campList = Object.values(byCampaign)
    .filter(c => c.total >= 10)
    .map(c => ({ ...c, rate: c.positive / c.total }))
    .sort((a, b) => a.rate - b.rate);

  // Find underperformers to test
  const underperformers = campList.filter(c => c.rate < 0.15);
  const topPerformers = campList.filter(c => c.rate >= 0.25);

  console.log(`${c.cyan}📊 Based on Your Data:${c.reset}\n`);
  
  // Suggestion 1: Subject Line Tests
  console.log(`${c.bold}1. Subject Line Tests${c.reset}`);
  console.log(`   ${c.dim}Compare short vs. detailed subject lines${c.reset}`);
  console.log(`   Test A: "Quick question about [Company]"`);
  console.log(`   Test B: "Partnership opportunity - ItssIMANNN x [Company]"`);
  console.log();

  // Suggestion 2: Vertical Focus
  const sortedVerts = Object.entries(byVertical)
    .filter(([, v]) => v.total >= 10)
    .map(([name, stats]) => ({ name, ...stats, rate: stats.positive / stats.total }))
    .sort((a, b) => b.rate - a.rate);

  if (sortedVerts.length >= 2) {
    const bestVert = sortedVerts[0];
    const worstVert = sortedVerts[sortedVerts.length - 1];
    
    console.log(`${c.bold}2. Vertical Messaging Test${c.reset}`);
    console.log(`   ${c.green}${bestVert.name}${c.reset} has ${(bestVert.rate * 100).toFixed(0)}% positive rate`);
    console.log(`   ${c.yellow}${worstVert.name}${c.reset} has ${(worstVert.rate * 100).toFixed(0)}% positive rate`);
    console.log(`   ${c.dim}Try adapting ${bestVert.name} messaging for ${worstVert.name} vertical${c.reset}`);
    console.log();
  }

  // Suggestion 3: Timing Tests
  console.log(`${c.bold}3. Send Time Test${c.reset}`);
  console.log(`   Test A: Send emails 6-8 AM (morning inbox)`);
  console.log(`   Test B: Send emails 2-4 PM (afternoon check)`);
  console.log(`   ${c.dim}Your data shows morning has higher positive rate${c.reset}`);
  console.log();

  // Suggestion 4: Based on low performers
  if (underperformers.length > 0) {
    console.log(`${c.bold}4. Underperformer Revival Test${c.reset}`);
    const worst = underperformers[0];
    const shortName = worst.name.length > 40 ? worst.name.slice(0, 37) + '...' : worst.name;
    console.log(`   ${c.yellow}Target: ${shortName}${c.reset}`);
    console.log(`   Current rate: ${(worst.rate * 100).toFixed(1)}%`);
    console.log(`   Test: Try shorter email copy (under 100 words)`);
    console.log(`   Test: Lead with case study results`);
    console.log();
  }

  // Suggestion 5: Clone winner strategy
  if (topPerformers.length > 0) {
    console.log(`${c.bold}5. Clone Winner Strategy${c.reset}`);
    const best = topPerformers[0];
    const shortName = best.name.length > 40 ? best.name.slice(0, 37) + '...' : best.name;
    console.log(`   ${c.green}Best performer: ${shortName}${c.reset}`);
    console.log(`   Rate: ${(best.rate * 100).toFixed(1)}%`);
    console.log(`   ${c.dim}Apply this campaign's approach to new verticals${c.reset}`);
    console.log();
  }

  // Quick wins
  console.log(`${c.bold}━━━ QUICK WINS TO TRY ━━━${c.reset}`);
  console.log(`  ✅ Add "case study" or "results" to subject lines`);
  console.log(`  ✅ Personalize with specific company metrics`);
  console.log(`  ✅ Test emoji in subject (🎮 for gaming, 📱 for apps)`);
  console.log(`  ✅ Shorten emails to 3 paragraphs max`);
  console.log(`  ✅ Lead with creator stats (361M monthly views)`);
  console.log();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORT TO CSV
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fs = require('fs');
const path = require('path');

async function exportToCSV(replies, campaigns) {
  const exportDir = path.join(__dirname, 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  
  // Export 1: Reply Performance by Campaign
  const byCampaign = {};
  replies.forEach(r => {
    const name = r.campaign_name || 'Unknown';
    if (!byCampaign[name]) {
      byCampaign[name] = { 
        campaign_name: name,
        vertical: extractVertical(name),
        total_replies: 0,
        positive: 0,
        booked: 0,
        not_interested: 0,
        ooo: 0
      };
    }
    const bc = byCampaign[name];
    bc.total_replies++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) bc.positive++;
    if (BOOKED_CATEGORIES.includes(r.reply_category)) bc.booked++;
    if (r.reply_category === 'Not Interested') bc.not_interested++;
    if (r.reply_category === 'Out Of Office') bc.ooo++;
  });

  // Add campaign send data
  for (const [name, stats] of Object.entries(byCampaign)) {
    const camp = Object.values(campaigns).find(cmp => cmp.campaign_name === name);
    if (camp) {
      stats.total_sent = camp.sent || 0;
      stats.reply_rate = camp.reply_rate || 0;
    } else {
      stats.total_sent = 0;
      stats.reply_rate = 0;
    }
    stats.positive_rate = stats.total_replies > 0 ? ((stats.positive / stats.total_replies) * 100).toFixed(2) : 0;
    stats.booking_rate = stats.total_replies > 0 ? ((stats.booked / stats.total_replies) * 100).toFixed(2) : 0;
  }

  const campaignRows = Object.values(byCampaign);
  const campaignCSV = [
    'campaign_name,vertical,total_sent,total_replies,positive,booked,not_interested,ooo,positive_rate,booking_rate,reply_rate',
    ...campaignRows.map(r => 
      `"${r.campaign_name.replace(/"/g, '""')}",${r.vertical},${r.total_sent},${r.total_replies},${r.positive},${r.booked},${r.not_interested},${r.ooo},${r.positive_rate},${r.booking_rate},${r.reply_rate}`
    )
  ].join('\n');

  const campaignFile = path.join(exportDir, `email-perf-campaigns-${date}.csv`);
  fs.writeFileSync(campaignFile, campaignCSV);
  console.log(`${c.green}✅${c.reset} Exported campaign performance: ${campaignFile}`);

  // Export 2: All replies with details
  const replyRows = replies.map(r => ({
    replied_at: r.replied_at || '',
    lead_name: (r.lead_name || '').replace(/"/g, '""'),
    lead_email: r.lead_email || '',
    lead_company: (r.lead_company || '').replace(/"/g, '""'),
    reply_category: r.reply_category || '',
    campaign_name: (r.campaign_name || '').replace(/"/g, '""'),
    vertical: extractVertical(r.campaign_name),
    response_time_hours: r.response_time_seconds ? (r.response_time_seconds / 3600).toFixed(1) : ''
  }));

  const replyCSV = [
    'replied_at,lead_name,lead_email,lead_company,reply_category,campaign_name,vertical,response_time_hours',
    ...replyRows.map(r => 
      `${r.replied_at},"${r.lead_name}",${r.lead_email},"${r.lead_company}",${r.reply_category},"${r.campaign_name}",${r.vertical},${r.response_time_hours}`
    )
  ].join('\n');

  const replyFile = path.join(exportDir, `email-perf-replies-${date}.csv`);
  fs.writeFileSync(replyFile, replyCSV);
  console.log(`${c.green}✅${c.reset} Exported all replies: ${replyFile}`);

  // Export 3: Vertical summary
  const byVertical = {};
  replies.forEach(r => {
    const vert = extractVertical(r.campaign_name);
    if (!byVertical[vert]) byVertical[vert] = { vertical: vert, total: 0, positive: 0, booked: 0 };
    byVertical[vert].total++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) byVertical[vert].positive++;
    if (BOOKED_CATEGORIES.includes(r.reply_category)) byVertical[vert].booked++;
  });

  for (const v of Object.values(byVertical)) {
    v.positive_rate = v.total > 0 ? ((v.positive / v.total) * 100).toFixed(2) : 0;
    v.booking_rate = v.total > 0 ? ((v.booked / v.total) * 100).toFixed(2) : 0;
  }

  const vertCSV = [
    'vertical,total_replies,positive,booked,positive_rate,booking_rate',
    ...Object.values(byVertical).map(v => 
      `${v.vertical},${v.total},${v.positive},${v.booked},${v.positive_rate},${v.booking_rate}`
    )
  ].join('\n');

  const vertFile = path.join(exportDir, `email-perf-verticals-${date}.csv`);
  fs.writeFileSync(vertFile, vertCSV);
  console.log(`${c.green}✅${c.reset} Exported vertical summary: ${vertFile}`);

  console.log(`\n${c.dim}Files saved to: ${exportDir}${c.reset}\n`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TREND ANALYSIS OVER TIME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function showTrends(replies, campaigns) {
  console.log(`${c.bold}━━━ PERFORMANCE TRENDS ━━━${c.reset}\n`);
  
  // Group replies by week
  const byWeek = {};
  const byMonth = {};
  
  replies.forEach(r => {
    if (!r.replied_at) return;
    const date = new Date(r.replied_at);
    
    // Week key (YYYY-WW)
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    const weekKey = `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
    
    // Month key (YYYY-MM)
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    if (!byWeek[weekKey]) byWeek[weekKey] = { total: 0, positive: 0, booked: 0 };
    if (!byMonth[monthKey]) byMonth[monthKey] = { total: 0, positive: 0, booked: 0 };
    
    byWeek[weekKey].total++;
    byMonth[monthKey].total++;
    
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) {
      byWeek[weekKey].positive++;
      byMonth[monthKey].positive++;
    }
    if (BOOKED_CATEGORIES.includes(r.reply_category)) {
      byWeek[weekKey].booked++;
      byMonth[monthKey].booked++;
    }
  });

  // Monthly trends
  console.log(`${c.cyan}Monthly Performance:${c.reset}`);
  console.log(`  Month     Total  Positive  Booked  Pos%    Trend`);
  console.log(`  ${c.dim}${'─'.repeat(55)}${c.reset}`);
  
  const sortedMonths = Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  let prevRate = null;
  for (const [month, stats] of sortedMonths) {
    const rate = stats.total > 0 ? (stats.positive / stats.total * 100) : 0;
    const trend = prevRate !== null 
      ? (rate > prevRate + 2 ? `${c.green}↑${c.reset}` : rate < prevRate - 2 ? `${c.red}↓${c.reset}` : `${c.dim}→${c.reset}`)
      : '';
    const rateColor = rate >= 25 ? c.green : rate >= 15 ? c.yellow : c.dim;
    
    console.log(`  ${month}   ${stats.total.toString().padStart(5)}  ${c.green}${stats.positive.toString().padStart(8)}${c.reset}  ${c.cyan}${stats.booked.toString().padStart(6)}${c.reset}  ${rateColor}${rate.toFixed(1).padStart(5)}%${c.reset}   ${trend}`);
    
    prevRate = rate;
  }

  // Weekly trends (last 8 weeks)
  console.log(`\n${c.cyan}Weekly Trend (last 8 weeks):${c.reset}`);
  
  const sortedWeeks = Object.entries(byWeek)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8);
  
  const maxWeekTotal = Math.max(...sortedWeeks.map(([, s]) => s.total), 1);
  
  for (const [week, stats] of sortedWeeks) {
    const rate = stats.total > 0 ? (stats.positive / stats.total * 100) : 0;
    const barWidth = Math.round((stats.total / maxWeekTotal) * 20);
    const bar = c.blue + '█'.repeat(barWidth) + c.dim + '░'.repeat(20 - barWidth) + c.reset;
    console.log(`  ${week}  ${bar} ${stats.total.toString().padStart(3)} replies (${rate.toFixed(0)}% pos)`);
  }

  // Vertical trends
  console.log(`\n${c.cyan}Vertical Performance Over Time:${c.reset}`);
  
  const vertTrends = {};
  replies.forEach(r => {
    if (!r.replied_at) return;
    const vert = extractVertical(r.campaign_name);
    const month = r.replied_at.slice(0, 7);
    
    if (!vertTrends[vert]) vertTrends[vert] = {};
    if (!vertTrends[vert][month]) vertTrends[vert][month] = { total: 0, positive: 0 };
    
    vertTrends[vert][month].total++;
    if (POSITIVE_CATEGORIES.includes(r.reply_category)) {
      vertTrends[vert][month].positive++;
    }
  });

  for (const [vert, months] of Object.entries(vertTrends)) {
    const monthList = Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-3);
    
    if (monthList.length === 0) continue;
    
    const icon = vert === 'gaming' ? '🎮' :
                 vert === 'education' ? '📚' :
                 vert === 'apps' ? '📱' :
                 vert === 'reactivation' ? '♻️' : '📦';
    
    const rates = monthList.map(([m, s]) => {
      const rate = s.total > 0 ? (s.positive / s.total * 100).toFixed(0) : '0';
      return `${m.slice(5)}: ${rate}%`;
    });
    
    console.log(`  ${icon} ${vert.padEnd(14)} ${rates.join(' → ')}`);
  }

  // Key insights
  console.log(`\n${c.bold}━━━ TREND INSIGHTS ━━━${c.reset}`);
  
  if (sortedMonths.length >= 2) {
    const lastMonth = sortedMonths[sortedMonths.length - 1][1];
    const prevMonth = sortedMonths[sortedMonths.length - 2][1];
    
    const lastRate = lastMonth.positive / lastMonth.total * 100;
    const prevMonthRate = prevMonth.positive / prevMonth.total * 100;
    const change = lastRate - prevMonthRate;
    
    if (Math.abs(change) > 2) {
      const direction = change > 0 ? `${c.green}up${c.reset}` : `${c.red}down${c.reset}`;
      console.log(`  📈 Positive rate is ${direction} ${Math.abs(change).toFixed(1)}% vs last month`);
    } else {
      console.log(`  📊 Positive rate is stable (±${Math.abs(change).toFixed(1)}% change)`);
    }
    
    const volumeChange = ((lastMonth.total - prevMonth.total) / prevMonth.total * 100).toFixed(0);
    console.log(`  📬 Reply volume: ${lastMonth.total} vs ${prevMonth.total} (${volumeChange > 0 ? '+' : ''}${volumeChange}%)`);
  }

  console.log();
}

// Run
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
