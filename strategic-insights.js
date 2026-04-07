#!/usr/bin/env node
/**
 * Strategic Insights Generator
 * Analyzes campaign performance and provides actionable recommendations
 * 
 * Commands:
 *   gex insights          - Full strategic analysis
 *   gex insights --quick  - Top 3 recommendations
 *   gex insights --focus  - Show focus areas
 *   gex insights --avoid  - Show areas to deprioritize
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const args = process.argv.slice(2);
const QUICK = args.includes('--quick') || args.includes('-q');
const FOCUS = args.includes('--focus') || args.includes('-f');
const AVOID = args.includes('--avoid') || args.includes('-a');
const TELEGRAM = args.includes('--telegram') || args.includes('-t');

// Vertical detection from campaign names
function detectVertical(campaignName) {
  const name = (campaignName || '').toLowerCase();
  if (name.includes('edu')) return 'Education';
  if (name.includes('gaming') || name.includes('game')) return 'Gaming';
  if (name.includes('crypto')) return 'Crypto';
  if (name.includes('ai')) return 'AI/Tech';
  if (name.includes('app')) return 'Apps';
  if (name.includes('lifestyle') || name.includes('comm')) return 'Lifestyle';
  return 'General';
}

// Score a vertical based on performance
function scoreVertical(stats) {
  // Weight factors
  const positiveWeight = 0.5;  // Positive rate matters most
  const volumeWeight = 0.2;    // Volume matters
  const replyWeight = 0.3;     // Reply rate matters
  
  const positiveScore = Math.min(stats.positiveRate * 100, 100);
  const volumeScore = Math.min(stats.totalInterested / 5, 100);  // 50 interested = max
  const replyScore = Math.min(stats.replyRate * 10, 100);  // 10% reply rate = max
  
  return (positiveScore * positiveWeight) + (volumeScore * volumeWeight) + (replyScore * replyWeight);
}

async function generateInsights() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log(`${c.red}❌ Supabase not configured${c.reset}`);
    return;
  }

  // Get campaign data from dashboard API
  let campaignList = [];
  try {
    const res = await globalThis.fetch('http://localhost:3456/api/dashboard');
    const data = await res.json();
    if (data.campaigns) {
      campaignList = data.campaigns.map(c => ({
        campaign_id: c.id,
        campaign_name: c.name,
        sent_count: c.sent,
        reply_count: c.replied,
        positive_reply_count: c.interested
      }));
    }
  } catch (e) {
    // Fallback to positive_replies table
    const { data: replies } = await supabase
      .from('imann_positive_replies')
      .select('campaign_name');
    
    // Aggregate by campaign
    const byCampaign = {};
    for (const r of replies || []) {
      const name = r.campaign_name || 'Unknown';
      if (!byCampaign[name]) {
        byCampaign[name] = { campaign_name: name, positive_reply_count: 0 };
      }
      byCampaign[name].positive_reply_count++;
    }
    campaignList = Object.values(byCampaign);
  }

  // Aggregate by vertical
  const verticals = {};
  for (const camp of campaignList) {
    const vertical = detectVertical(camp.campaign_name);
    if (!verticals[vertical]) {
      verticals[vertical] = {
        campaigns: 0,
        totalSent: 0,
        totalReplied: 0,
        totalInterested: 0
      };
    }
    verticals[vertical].campaigns++;
    verticals[vertical].totalSent += camp.sent_count || 0;
    verticals[vertical].totalReplied += camp.reply_count || 0;
    verticals[vertical].totalInterested += camp.positive_reply_count || 0;
  }

  // Calculate rates and scores
  const verticalStats = [];
  for (const [name, stats] of Object.entries(verticals)) {
    const replyRate = stats.totalSent > 0 ? (stats.totalReplied / stats.totalSent) * 100 : 0;
    const positiveRate = stats.totalReplied > 0 ? (stats.totalInterested / stats.totalReplied) * 100 : 0;
    const score = scoreVertical({ ...stats, replyRate, positiveRate });
    
    verticalStats.push({
      name,
      ...stats,
      replyRate,
      positiveRate,
      score
    });
  }

  // Sort by score
  verticalStats.sort((a, b) => b.score - a.score);

  // Get lead counts by vertical from positive replies
  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Booked');

  // Generate recommendations
  const recommendations = [];
  
  // Top verticals recommendation
  const topVerticals = verticalStats.filter(v => v.positiveRate > 30);
  if (topVerticals.length > 0) {
    recommendations.push({
      priority: 1,
      type: 'focus',
      title: `Focus on ${topVerticals.map(v => v.name).join(', ')}`,
      reason: `${topVerticals[0].positiveRate.toFixed(0)}%+ positive response rate`,
      action: `Prioritize leads from these verticals in your outreach`
    });
  }

  // Low-performing verticals
  const lowVerticals = verticalStats.filter(v => v.positiveRate < 15 && v.totalSent > 1000);
  if (lowVerticals.length > 0) {
    recommendations.push({
      priority: 2,
      type: 'avoid',
      title: `Deprioritize ${lowVerticals.map(v => v.name).join(', ')}`,
      reason: `Only ${lowVerticals[0].positiveRate.toFixed(0)}% positive rate despite high volume`,
      action: `Reduce email volume to these verticals or improve targeting`
    });
  }

  // Volume opportunity
  const highPotential = verticalStats.find(v => v.positiveRate > 40 && v.totalSent < 1000);
  if (highPotential) {
    recommendations.push({
      priority: 3,
      type: 'opportunity',
      title: `Scale up ${highPotential.name} outreach`,
      reason: `${highPotential.positiveRate.toFixed(0)}% positive rate but only ${highPotential.totalSent} emails sent`,
      action: `Find more ${highPotential.name} leads - high ROI potential`
    });
  }

  // Reply speed recommendation
  const hotLeads = leads?.filter(l => {
    const age = (Date.now() - new Date(l.replied_at || l.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return age < 3;
  }) || [];
  
  if (hotLeads.length > 0) {
    recommendations.push({
      priority: 1,
      type: 'urgent',
      title: `Respond to ${hotLeads.length} hot leads immediately`,
      reason: `Leads replied in last 3 days - highest conversion window`,
      action: `Run: gex send --html`
    });
  }

  // Meeting requests
  const meetingRequests = leads?.filter(l => 
    (l.reply_category || '').toLowerCase().includes('meeting')
  ) || [];
  
  if (meetingRequests.length > 5) {
    recommendations.push({
      priority: 2,
      type: 'opportunity',
      title: `${meetingRequests.length} meeting requests unbooked`,
      reason: `These leads explicitly asked to meet - highest intent`,
      action: `Run: gex book --send`
    });
  }

  // Output
  if (TELEGRAM) {
    outputTelegram(verticalStats, recommendations);
  } else if (QUICK) {
    outputQuick(recommendations);
  } else if (FOCUS) {
    outputFocus(verticalStats, recommendations);
  } else if (AVOID) {
    outputAvoid(verticalStats, recommendations);
  } else {
    outputFull(verticalStats, recommendations, campaignList.length);
  }
}

function outputFull(verticals, recommendations, campaignCount) {
  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  🧠 STRATEGIC INSIGHTS                                                  ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  // Vertical Performance
  console.log(`${c.cyan}VERTICAL PERFORMANCE${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);
  console.log(`  ${'Vertical'.padEnd(15)} ${'Sent'.padStart(8)} ${'Replied'.padStart(8)} ${'Positive'.padStart(10)} ${'Score'.padStart(8)}`);
  console.log(`  ${c.dim}${'─'.repeat(68)}${c.reset}`);
  
  for (const v of verticals) {
    const scoreColor = v.score >= 50 ? c.green : v.score >= 30 ? c.yellow : c.red;
    const posColor = v.positiveRate >= 40 ? c.green : v.positiveRate >= 20 ? c.yellow : c.dim;
    console.log(`  ${v.name.padEnd(15)} ${v.totalSent.toString().padStart(8)} ${v.totalReplied.toString().padStart(8)} ${posColor}${v.positiveRate.toFixed(1).padStart(9)}%${c.reset} ${scoreColor}${v.score.toFixed(0).padStart(7)}${c.reset}`);
  }
  console.log();

  // Recommendations
  console.log(`${c.cyan}RECOMMENDATIONS${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);
  
  const priorityRecs = recommendations.sort((a, b) => a.priority - b.priority);
  for (const rec of priorityRecs.slice(0, 5)) {
    const icon = rec.type === 'urgent' ? '🔴' : 
                 rec.type === 'focus' ? '🎯' : 
                 rec.type === 'avoid' ? '⚠️' : '💡';
    const color = rec.type === 'urgent' ? c.red : 
                  rec.type === 'focus' ? c.green : 
                  rec.type === 'avoid' ? c.yellow : c.cyan;
    
    console.log(`  ${icon} ${color}${c.bold}${rec.title}${c.reset}`);
    console.log(`     ${c.dim}${rec.reason}${c.reset}`);
    console.log(`     → ${rec.action}`);
    console.log();
  }

  // Summary
  console.log(`${c.cyan}${'━'.repeat(72)}${c.reset}`);
  console.log(`  ${c.dim}Based on ${campaignCount} campaigns | Run: gex insights --quick${c.reset}\n`);
}

function outputQuick(recommendations) {
  console.log(`\n${c.bold}🧠 TOP 3 STRATEGIC ACTIONS${c.reset}\n`);
  
  const top3 = recommendations.sort((a, b) => a.priority - b.priority).slice(0, 3);
  top3.forEach((rec, i) => {
    const icon = rec.type === 'urgent' ? '🔴' : 
                 rec.type === 'focus' ? '🎯' : '💡';
    console.log(`${i + 1}. ${icon} ${rec.title}`);
    console.log(`   → ${rec.action}\n`);
  });
}

function outputFocus(verticals, recommendations) {
  console.log(`\n${c.bold}${c.green}🎯 FOCUS AREAS${c.reset}\n`);
  
  const focus = verticals.filter(v => v.positiveRate > 30);
  focus.forEach(v => {
    console.log(`  ${c.green}●${c.reset} ${c.bold}${v.name}${c.reset}`);
    console.log(`    ${v.positiveRate.toFixed(0)}% positive rate | ${v.totalInterested} interested leads`);
  });
  
  if (focus.length === 0) {
    console.log(`  ${c.dim}No verticals above 30% positive rate${c.reset}`);
  }
  console.log();
}

function outputAvoid(verticals, recommendations) {
  console.log(`\n${c.bold}${c.yellow}⚠️ DEPRIORITIZE${c.reset}\n`);
  
  const avoid = verticals.filter(v => v.positiveRate < 15 && v.totalSent > 500);
  avoid.forEach(v => {
    console.log(`  ${c.yellow}●${c.reset} ${c.bold}${v.name}${c.reset}`);
    console.log(`    Only ${v.positiveRate.toFixed(0)}% positive rate from ${v.totalSent} emails`);
  });
  
  if (avoid.length === 0) {
    console.log(`  ${c.dim}No clear underperformers to deprioritize${c.reset}`);
  }
  console.log();
}

function outputTelegram(verticals, recommendations) {
  let msg = `🧠 *STRATEGIC INSIGHTS*\n\n`;
  
  msg += `📊 *Top Verticals:*\n`;
  verticals.slice(0, 3).forEach(v => {
    msg += `• ${v.name}: ${v.positiveRate.toFixed(0)}% positive\n`;
  });
  
  msg += `\n🎯 *Top Actions:*\n`;
  recommendations.slice(0, 3).forEach(rec => {
    msg += `• ${rec.title}\n`;
  });
  
  console.log(msg);
}

// CLI
generateInsights().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
