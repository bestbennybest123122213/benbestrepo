#!/usr/bin/env node
/**
 * Vertical Deep Dive Tool
 * 
 * Drill into any vertical to see comprehensive stats:
 * - All leads with current status
 * - Performance stats (emails sent, positive rate, conversion)
 * - Revenue from that vertical (historical and pipeline)
 * - Best-performing email templates
 * - Suggested companies to target
 * - Recommended action: scale up, maintain, or deprioritize
 * 
 * Usage:
 *   node gex.js vertical              # List all verticals with quick stats
 *   node gex.js vertical education    # Deep dive into Education vertical
 *   node gex.js vertical gaming --leads  # Show all gaming leads
 *   node gex.js vertical compare      # Compare all verticals side by side
 *   node gex.js vertical --export     # Export to CSV
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m'
};

const args = process.argv.slice(2);
const SHOW_LEADS = args.includes('--leads') || args.includes('-l');
const EXPORT = args.includes('--export') || args.includes('-e');
const HELP = args.includes('--help') || args.includes('-h');
const PROPOSAL = args.includes('--proposal') || args.includes('-p');
const ROI = args.includes('--roi') || args.includes('-r');
const SCORE_BREAKDOWN = args.includes('--score') || args.includes('-s') || args.includes('--debug');

// First non-flag argument is the vertical name or subcommand
const targetArg = args.find(a => !a.startsWith('-'));

// Vertical detection patterns from campaign names & emails
const VERTICAL_PATTERNS = {
  'Education': ['edu', 'learn', 'school', 'course', 'academy', 'tutor', 'study', 'gauth', 'unstop', 'brainly', 'chegg', 'photomath'],
  'Gaming': ['gaming', 'game', 'studio', 'play', 'esport', 'whiteout', 'stillfront', 'supercell', 'zynga', 'riot', 'epic'],
  'AI/Tech': ['ai', '.ai', 'artificial', 'ml', 'machine', 'software', 'saas', 'cloud', 'data', 'allison', 'claude'],
  'Apps': ['app', 'mobile', 'ios', 'android', 'download'],
  'Finance': ['bank', 'finance', 'fintech', 'insurance', 'invest', 'trading', 'crypto', 'defi'],
  'E-commerce': ['shop', 'store', 'retail', 'commerce', 'marketplace', 'fashion'],
  'Lifestyle': ['lifestyle', 'health', 'fitness', 'wellness', 'beauty', 'typology'],
  'Travel': ['travel', 'hotel', 'flight', 'booking', 'omio', 'vacation'],
  'Media': ['media', 'news', 'entertainment', 'content', 'streaming', 'music']
};

// Known company database with richer data
const COMPANY_DATABASE = {
  'Gaming': [
    { name: 'Stillfront', domain: 'stillfront.com', tier: 'Enterprise', revenue: '$500M+', contacted: false },
    { name: 'Supercell', domain: 'supercell.com', tier: 'Enterprise', revenue: '$1B+', contacted: false },
    { name: 'Zynga', domain: 'zynga.com', tier: 'Enterprise', revenue: '$1B+', contacted: false },
    { name: 'Riot Games', domain: 'riotgames.com', tier: 'Enterprise', revenue: '$1.5B+', contacted: false },
    { name: 'Epic Games', domain: 'epicgames.com', tier: 'Enterprise', revenue: '$5B+', contacted: false },
    { name: 'Paradox Interactive', domain: 'paradoxplaza.com', tier: 'Large', revenue: '$100M+', contacted: false },
    { name: 'NAVER Z', domain: 'naverz-corp.com', tier: 'Enterprise', revenue: '$200M+', contacted: false },
    { name: 'Dream11', domain: 'dream11.com', tier: 'Large', revenue: '$400M+', contacted: false }
  ],
  'Education': [
    { name: 'Gauth', domain: 'gauthmath.com', tier: 'Large', revenue: '$50M+', contacted: true },
    { name: 'Brainly', domain: 'brainly.com', tier: 'Large', revenue: '$80M+', contacted: false },
    { name: 'Chegg', domain: 'chegg.com', tier: 'Enterprise', revenue: '$700M+', contacted: false },
    { name: 'Photomath', domain: 'photomath.com', tier: 'Large', revenue: '$100M+', contacted: false },
    { name: 'Unstop', domain: 'unstop.com', tier: 'Medium', revenue: '$10M+', contacted: true },
    { name: 'Numerade', domain: 'numerade.com', tier: 'Medium', revenue: '$20M+', contacted: false },
    { name: 'Studocu', domain: 'studocu.com', tier: 'Medium', revenue: '$30M+', contacted: false },
    { name: 'Course Hero', domain: 'coursehero.com', tier: 'Large', revenue: '$200M+', contacted: false }
  ],
  'AI/Tech': [
    { name: 'Allison AI', domain: 'runallison.ai', tier: 'Medium', revenue: '$10M+', contacted: true },
    { name: 'Jasper', domain: 'jasper.ai', tier: 'Large', revenue: '$150M+', contacted: false },
    { name: 'Copy.ai', domain: 'copy.ai', tier: 'Medium', revenue: '$50M+', contacted: false },
    { name: 'Writesonic', domain: 'writesonic.com', tier: 'Medium', revenue: '$30M+', contacted: false },
    { name: 'Synthesia', domain: 'synthesia.io', tier: 'Large', revenue: '$90M+', contacted: false }
  ],
  'Apps': [
    { name: 'Headspace', domain: 'headspace.com', tier: 'Large', revenue: '$200M+', contacted: false },
    { name: 'Calm', domain: 'calm.com', tier: 'Large', revenue: '$300M+', contacted: false },
    { name: 'Duolingo', domain: 'duolingo.com', tier: 'Enterprise', revenue: '$500M+', contacted: false }
  ]
};

// Email template performance by vertical (simulated based on patterns)
const TEMPLATE_PERFORMANCE = {
  'Education': [
    { name: 'Student Success Focus', positiveRate: 68, uses: 245 },
    { name: 'Learning Outcomes', positiveRate: 62, uses: 180 },
    { name: 'Gen-Z Audience Match', positiveRate: 55, uses: 77 }
  ],
  'Gaming': [
    { name: 'Gaming Community', positiveRate: 42, uses: 520 },
    { name: 'Player Engagement', positiveRate: 38, uses: 340 },
    { name: 'Whiteout Case Study', positiveRate: 55, uses: 150 }
  ],
  'AI/Tech': [
    { name: 'Tech Innovation', positiveRate: 35, uses: 280 },
    { name: 'AI Tool Demo', positiveRate: 40, uses: 190 }
  ]
};

function detectVertical(text) {
  const lowerText = (text || '').toLowerCase();
  for (const [vertical, patterns] of Object.entries(VERTICAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        return vertical;
      }
    }
  }
  return 'Other';
}

function getOpportunityScore(stats) {
  // Multi-factor opportunity scoring algorithm
  // Higher score = better opportunity to invest resources
  
  let score = 0;
  const breakdown = {};
  
  // Factor 1: Positive Rate (0-40 points)
  // Most important - high conversion is key
  const positiveScore = Math.min(stats.positiveRate * 0.6, 40);
  breakdown.positiveRate = positiveScore;
  score += positiveScore;
  
  // Factor 2: Volume Gap (0-30 points)
  // Untapped potential - low volume with high rate = opportunity
  const volumeGap = stats.totalSent < 2000 
    ? Math.max(0, (2000 - stats.totalSent) / 66.7)  // Max 30 pts at 0 sent
    : 0;
  breakdown.volumeGap = volumeGap;
  score += volumeGap;
  
  // Factor 3: Revenue Proof (0-20 points)
  // Already generating money = proven vertical
  const revenueScore = stats.revenue > 0 ? Math.min(stats.revenue / 1000, 20) : 0;
  breakdown.revenue = revenueScore;
  score += revenueScore;
  
  // Factor 4: Pipeline Value (0-10 points)
  // Active deals in progress
  const pipelineScore = stats.pipelineValue > 0 ? Math.min(stats.pipelineValue / 5000, 10) : 0;
  breakdown.pipeline = pipelineScore;
  score += pipelineScore;
  
  // Factor 5: Active Lead Density (0-10 points)
  // Many leads relative to emails = engaged audience
  const leadDensity = stats.totalSent > 0 
    ? (stats.leadsCount / stats.totalSent) * 1000
    : 0;
  const densityScore = Math.min(leadDensity, 10);
  breakdown.density = densityScore;
  score += densityScore;
  
  // Penalty: High volume + low rate = already saturated/poor fit
  if (stats.totalSent > 5000 && stats.positiveRate < 20) {
    score -= 20;
    breakdown.penalty = -20;
  }
  
  stats.scoreBreakdown = breakdown;
  return Math.max(0, Math.round(score));
}

function getRecommendation(stats) {
  const { positiveRate, totalSent, opportunityScore } = stats;
  
  if (positiveRate >= 50 && totalSent < 1000) {
    return { action: '🚀 SCALE UP', color: c.green, reason: 'High conversion, low volume - massive opportunity!' };
  }
  if (positiveRate >= 40 && totalSent >= 1000) {
    return { action: '📈 MAINTAIN', color: c.cyan, reason: 'Strong performer, keep current volume' };
  }
  if (positiveRate >= 25) {
    return { action: '📊 OPTIMIZE', color: c.yellow, reason: 'Test new templates, refine targeting' };
  }
  if (totalSent > 2000 && positiveRate < 20) {
    return { action: '⚠️ DEPRIORITIZE', color: c.red, reason: 'Low ROI despite high volume' };
  }
  return { action: '🔍 INVESTIGATE', color: c.dim, reason: 'Needs more data or new approach' };
}

async function loadDeals() {
  // Load deals and commissions to calculate vertical revenue
  const deals = { deals: [], commissions: [] };
  try {
    const dealsPath = path.join(__dirname, 'data', 'deals.json');
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      deals.deals = data.deals || data || [];
    }
  } catch (e) {}
  
  try {
    const commPath = path.join(__dirname, 'data', 'commissions.json');
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      deals.commissions = data.commissions || data || [];
    }
  } catch (e) {}
  
  return deals;
}

async function getVerticalStats() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log(`${c.red}❌ Database not configured. Run: gex doctor${c.reset}`);
    process.exit(1);
  }

  // Get campaign data
  let campaigns = [];
  try {
    const res = await globalThis.fetch('http://localhost:3456/api/dashboard');
    const data = await res.json();
    if (data.campaigns) campaigns = data.campaigns;
  } catch (e) {
    // Fallback: aggregate from positive replies
  }

  // Get positive replies
  const { data: leads } = await supabase
    .from('positive_replies')
    .select('*');

  // Get deals/revenue
  const { deals, commissions } = await loadDeals();

  // Aggregate by vertical
  const verticals = {};
  
  // From campaigns
  for (const camp of campaigns) {
    const vertical = detectVertical(camp.name);
    if (!verticals[vertical]) {
      verticals[vertical] = {
        name: vertical,
        campaigns: [],
        totalSent: 0,
        totalReplied: 0,
        totalPositive: 0,
        leads: [],
        revenue: 0,
        pipelineValue: 0
      };
    }
    verticals[vertical].campaigns.push(camp.name);
    verticals[vertical].totalSent += camp.sent || 0;
    verticals[vertical].totalReplied += camp.replied || 0;
    verticals[vertical].totalPositive += camp.interested || 0;
  }

  // Add leads to verticals
  for (const lead of leads || []) {
    const vertical = detectVertical(lead.campaign_name || lead.lead_email || lead.lead_company || '');
    if (!verticals[vertical]) {
      verticals[vertical] = {
        name: vertical,
        campaigns: [],
        totalSent: 0,
        totalReplied: 0,
        totalPositive: 0,
        leads: [],
        revenue: 0,
        pipelineValue: 0
      };
    }
    verticals[vertical].leads.push(lead);
    // Count as positive if not already counted from campaigns
    if (campaigns.length === 0) {
      verticals[vertical].totalPositive++;
    }
  }

  // Add revenue from commissions
  for (const comm of commissions) {
    const vertical = detectVertical(comm.company || comm.client || '');
    if (verticals[vertical]) {
      verticals[vertical].revenue += comm.commission || comm.amount || 0;
    }
  }

  // Add pipeline from deals
  for (const deal of deals) {
    const vertical = detectVertical(deal.company || deal.client || '');
    if (verticals[vertical]) {
      if (deal.status === 'closed' || deal.status === 'won') {
        verticals[vertical].revenue += deal.value || 0;
      } else {
        verticals[vertical].pipelineValue += deal.value || 0;
      }
    }
  }

  // Calculate rates and scores
  const stats = Object.values(verticals).map(v => {
    const replyRate = v.totalSent > 0 ? (v.totalReplied / v.totalSent) * 100 : 0;
    const positiveRate = v.totalReplied > 0 ? (v.totalPositive / v.totalReplied) * 100 : 
                         v.totalSent > 0 ? (v.totalPositive / v.totalSent) * 100 : 0;
    
    const stats = {
      ...v,
      replyRate,
      positiveRate,
      leadsCount: v.leads.length
    };
    
    stats.opportunityScore = getOpportunityScore(stats);
    stats.recommendation = getRecommendation(stats);
    
    return stats;
  });

  return stats.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function showHelp() {
  console.log(`
${c.bold}🔍 Vertical Deep Dive Tool${c.reset}

${c.cyan}USAGE:${c.reset}
  node gex.js vertical                    List all verticals with quick stats
  node gex.js vertical <name>             Deep dive into specific vertical
  node gex.js vertical <name> --leads     Show all leads in that vertical
  node gex.js vertical compare            Compare all verticals side by side
  node gex.js vertical roi                ROI analysis across verticals
  node gex.js vertical <name> --proposal  Proposal mode with pitch points
  node gex.js vertical --export           Export data to CSV

${c.cyan}FLAGS:${c.reset}
  --leads, -l      Show all leads in the vertical
  --export, -e     Export vertical stats to CSV
  --proposal, -p   Generate proposal talking points
  --roi, -r        Show ROI analysis

${c.cyan}EXAMPLES:${c.reset}
  gex vertical education          Deep dive into Education vertical
  gex vdive gaming --leads        Show all gaming leads
  gex vd compare                  Compare all verticals
  gex drill ai --proposal         Proposal mode for AI/Tech
  gex vertical roi                ROI analysis

${c.cyan}ALIASES:${c.reset}
  vertical, vdive, vd, drill

${c.cyan}KEY INSIGHT:${c.reset}
  ${c.green}Education has 67% positive rate but only 502 emails - needs scaling!${c.reset}
`);
}

function showAllVerticals(stats) {
  console.log(`\n${c.bold}╔${'═'.repeat(76)}╗${c.reset}`);
  console.log(`${c.bold}║  🎯 VERTICAL PERFORMANCE OVERVIEW                                          ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(76)}╝${c.reset}\n`);

  console.log(`  ${c.dim}${'Vertical'.padEnd(14)}${'Sent'.padStart(8)}${'Positive'.padStart(10)}${'Rate'.padStart(8)}${'Revenue'.padStart(12)}${'Score'.padStart(8)}  ${'Recommendation'}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(74)}${c.reset}`);

  for (const v of stats) {
    const rateColor = v.positiveRate >= 50 ? c.green : v.positiveRate >= 30 ? c.yellow : c.dim;
    const revenueStr = v.revenue > 0 ? `$${(v.revenue / 1000).toFixed(1)}K` : '-';
    const rec = v.recommendation;
    
    console.log(`  ${v.name.padEnd(14)}${v.totalSent.toString().padStart(8)}${v.totalPositive.toString().padStart(10)}${rateColor}${v.positiveRate.toFixed(0).padStart(7)}%${c.reset}${revenueStr.padStart(12)}${v.opportunityScore.toString().padStart(8)}  ${rec.color}${rec.action}${c.reset}`);
  }

  // Highlight key insight
  const eduStats = stats.find(v => v.name === 'Education');
  if (eduStats && eduStats.positiveRate > 50 && eduStats.totalSent < 1000) {
    console.log(`\n  ${c.bgGreen}${c.bold} 💎 KEY INSIGHT ${c.reset}`);
    console.log(`  ${c.green}Education has ${eduStats.positiveRate.toFixed(0)}% positive rate but only ${eduStats.totalSent} emails${c.reset}`);
    console.log(`  ${c.green}This is your highest ROI opportunity - SCALE UP!${c.reset}`);
  }

  console.log(`\n  ${c.dim}Run: gex vertical <name> for deep dive | gex vertical compare for side-by-side${c.reset}\n`);
}

function showVerticalDeepDive(vertical, allStats, showLeads = false) {
  const stats = allStats.find(v => v.name.toLowerCase() === vertical.toLowerCase());
  
  if (!stats) {
    console.log(`${c.red}❌ Vertical "${vertical}" not found${c.reset}`);
    console.log(`\nAvailable verticals: ${allStats.map(v => v.name).join(', ')}`);
    process.exit(1);
  }

  const rec = stats.recommendation;
  
  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  🔍 ${stats.name.toUpperCase()} VERTICAL DEEP DIVE                                     ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  // Recommendation banner
  console.log(`  ${rec.color}${c.bold}${rec.action}${c.reset} - ${rec.reason}\n`);

  // Performance Stats
  console.log(`${c.cyan}📊 PERFORMANCE${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Emails Sent:      ${c.bold}${stats.totalSent.toLocaleString()}${c.reset}`);
  console.log(`  Total Replies:    ${stats.totalReplied.toLocaleString()}`);
  console.log(`  Positive Replies: ${c.green}${stats.totalPositive.toLocaleString()}${c.reset}`);
  console.log(`  Reply Rate:       ${stats.replyRate.toFixed(1)}%`);
  console.log(`  Positive Rate:    ${stats.positiveRate >= 50 ? c.green : stats.positiveRate >= 30 ? c.yellow : c.dim}${stats.positiveRate.toFixed(1)}%${c.reset}`);
  console.log(`  Active Leads:     ${stats.leadsCount}`);
  console.log(`  Opportunity Score: ${c.bold}${stats.opportunityScore}/100${c.reset}`);
  console.log();

  // Revenue
  console.log(`${c.cyan}💰 REVENUE${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  console.log(`  Closed Revenue:   ${c.green}$${stats.revenue.toLocaleString()}${c.reset}`);
  console.log(`  Pipeline Value:   ${c.yellow}$${stats.pipelineValue.toLocaleString()}${c.reset}`);
  console.log(`  Revenue per Lead: ${stats.leadsCount > 0 ? `$${(stats.revenue / stats.leadsCount).toFixed(0)}` : 'N/A'}`);
  console.log();

  // Best Templates
  const templates = TEMPLATE_PERFORMANCE[stats.name];
  if (templates && templates.length > 0) {
    console.log(`${c.cyan}📝 TOP EMAIL TEMPLATES${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    templates.forEach((t, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      console.log(`  ${medal} ${t.name.padEnd(25)} ${t.positiveRate}% positive (${t.uses} uses)`);
    });
    console.log();
  }

  // Campaigns in this vertical
  if (stats.campaigns.length > 0) {
    console.log(`${c.cyan}📧 CAMPAIGNS (${stats.campaigns.length})${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    stats.campaigns.slice(0, 5).forEach(camp => {
      console.log(`  • ${camp}`);
    });
    if (stats.campaigns.length > 5) {
      console.log(`  ${c.dim}... and ${stats.campaigns.length - 5} more${c.reset}`);
    }
    console.log();
  }

  // Target companies
  const targetCompanies = COMPANY_DATABASE[stats.name];
  if (targetCompanies && targetCompanies.length > 0) {
    console.log(`${c.cyan}🎯 COMPANIES TO TARGET${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    const notContacted = targetCompanies.filter(c => !c.contacted);
    notContacted.slice(0, 5).forEach(comp => {
      console.log(`  ${c.green}●${c.reset} ${comp.name.padEnd(20)} ${comp.tier.padEnd(12)} ${comp.revenue}`);
    });
    if (notContacted.length > 5) {
      console.log(`  ${c.dim}... and ${notContacted.length - 5} more prospects${c.reset}`);
    }
    console.log();
  }

  // Show leads if requested
  if (showLeads && stats.leads.length > 0) {
    console.log(`${c.cyan}👥 LEADS (${stats.leads.length})${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(70)}${c.reset}`);
    console.log(`  ${'Name'.padEnd(20)} ${'Company'.padEnd(20)} ${'Status'.padEnd(15)} ${'Age'}`);
    console.log(`  ${c.dim}${'─'.repeat(66)}${c.reset}`);
    
    stats.leads.slice(0, 15).forEach(lead => {
      const age = lead.replied_at 
        ? Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
        : '?';
      const ageStr = `${age}d`;
      const statusColor = lead.follow_up_status === 'contacted' ? c.green : 
                         lead.follow_up_status === 'pending' ? c.yellow : c.dim;
      
      console.log(`  ${(lead.lead_name || 'N/A').slice(0, 19).padEnd(20)} ${(lead.lead_company || 'N/A').slice(0, 19).padEnd(20)} ${statusColor}${(lead.follow_up_status || 'pending').padEnd(15)}${c.reset} ${ageStr}`);
    });
    
    if (stats.leads.length > 15) {
      console.log(`  ${c.dim}... and ${stats.leads.length - 15} more leads${c.reset}`);
    }
    console.log();
  }

  // Action steps
  console.log(`${c.cyan}🚀 NEXT STEPS${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(40)}${c.reset}`);
  
  if (stats.positiveRate >= 50 && stats.totalSent < 1000) {
    console.log(`  1. Build more ${stats.name} lead lists immediately`);
    console.log(`  2. Launch new campaigns targeting above companies`);
    console.log(`  3. Goal: 3x email volume in next 30 days`);
  } else if (stats.positiveRate >= 30) {
    console.log(`  1. Maintain current volume`);
    console.log(`  2. A/B test new templates to improve conversion`);
    console.log(`  3. Follow up on all pending leads`);
  } else {
    console.log(`  1. Analyze why positive rate is low`);
    console.log(`  2. Review email copy and targeting`);
    console.log(`  3. Consider pausing and reallocating budget`);
  }
  console.log();
}

function showComparison(stats) {
  console.log(`\n${c.bold}╔${'═'.repeat(80)}╗${c.reset}`);
  console.log(`${c.bold}║  📊 VERTICAL COMPARISON                                                        ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(80)}╝${c.reset}\n`);

  // Header
  console.log(`  ${c.dim}${'Metric'.padEnd(20)}${stats.map(v => v.name.slice(0, 10).padStart(12)).join('')}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(20 + stats.length * 12)}${c.reset}`);

  // Rows
  const metrics = [
    { label: 'Emails Sent', key: 'totalSent', format: v => v.toLocaleString() },
    { label: 'Replies', key: 'totalReplied', format: v => v.toLocaleString() },
    { label: 'Positive', key: 'totalPositive', format: v => v.toLocaleString() },
    { label: 'Reply Rate %', key: 'replyRate', format: v => v.toFixed(1) + '%' },
    { label: 'Positive Rate %', key: 'positiveRate', format: v => v.toFixed(1) + '%', highlight: true },
    { label: 'Revenue', key: 'revenue', format: v => v > 0 ? '$' + (v/1000).toFixed(1) + 'K' : '-' },
    { label: 'Pipeline', key: 'pipelineValue', format: v => v > 0 ? '$' + (v/1000).toFixed(1) + 'K' : '-' },
    { label: 'Opp. Score', key: 'opportunityScore', format: v => v.toString() }
  ];

  for (const metric of metrics) {
    let row = `  ${metric.label.padEnd(20)}`;
    
    const values = stats.map(v => v[metric.key]);
    const maxVal = Math.max(...values);
    
    for (const v of stats) {
      const val = v[metric.key];
      const formatted = metric.format(val);
      let color = '';
      
      if (metric.highlight && val === maxVal && val > 0) {
        color = c.green + c.bold;
      }
      
      row += `${color}${formatted.padStart(12)}${color ? c.reset : ''}`;
    }
    console.log(row);
  }

  // Recommendation row
  console.log(`  ${c.dim}${'─'.repeat(20 + stats.length * 12)}${c.reset}`);
  let recRow = `  ${'Recommendation'.padEnd(20)}`;
  for (const v of stats) {
    recRow += `${v.recommendation.color}${v.recommendation.action.slice(2, 12).padStart(12)}${c.reset}`;
  }
  console.log(recRow);

  console.log(`\n  ${c.dim}Legend: 🚀 Scale Up | 📈 Maintain | 📊 Optimize | ⚠️ Deprioritize${c.reset}\n`);
}

async function exportToCsv(stats) {
  const lines = [
    'Vertical,Emails Sent,Replies,Positive,Reply Rate,Positive Rate,Revenue,Pipeline,Opportunity Score,Recommendation'
  ];
  
  for (const v of stats) {
    lines.push([
      v.name,
      v.totalSent,
      v.totalReplied,
      v.totalPositive,
      v.replyRate.toFixed(2),
      v.positiveRate.toFixed(2),
      v.revenue,
      v.pipelineValue,
      v.opportunityScore,
      v.recommendation.action.replace(/[🚀📈📊⚠️🔍]/g, '').trim()
    ].join(','));
  }
  
  const exportDir = path.join(__dirname, 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  const filename = `vertical-analysis-${new Date().toISOString().split('T')[0]}.csv`;
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, lines.join('\n'));
  
  console.log(`${c.green}✅ Exported to ${filepath}${c.reset}`);
}

// Score Breakdown Display
function showScoreBreakdown(stats) {
  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  🧮 OPPORTUNITY SCORE BREAKDOWN                                        ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  console.log(`  ${c.dim}${'Vertical'.padEnd(14)}${'Score'.padStart(7)}  ${'Pos%'.padStart(6)}${'Gap'.padStart(6)}${'Rev'.padStart(6)}${'Pipe'.padStart(6)}${'Dens'.padStart(6)}${'Pen'.padStart(6)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(58)}${c.reset}`);

  for (const v of stats) {
    const b = v.scoreBreakdown || {};
    const scoreColor = v.opportunityScore >= 80 ? c.green : v.opportunityScore >= 50 ? c.yellow : c.dim;
    
    console.log(`  ${v.name.padEnd(14)}${scoreColor}${v.opportunityScore.toString().padStart(7)}${c.reset}  ${(b.positiveRate || 0).toFixed(1).padStart(6)}${(b.volumeGap || 0).toFixed(1).padStart(6)}${(b.revenue || 0).toFixed(1).padStart(6)}${(b.pipeline || 0).toFixed(1).padStart(6)}${(b.density || 0).toFixed(1).padStart(6)}${(b.penalty || 0).toFixed(1).padStart(6)}`);
  }

  console.log(`\n  ${c.cyan}Score Components:${c.reset}`);
  console.log(`  ${c.dim}Pos% = Positive Rate Score (max 40)${c.reset}`);
  console.log(`  ${c.dim}Gap  = Untapped Volume (max 30, higher when sent < 2000)${c.reset}`);
  console.log(`  ${c.dim}Rev  = Revenue Proof (max 20, $1K = 1pt)${c.reset}`);
  console.log(`  ${c.dim}Pipe = Pipeline Value (max 10, $5K = 1pt)${c.reset}`);
  console.log(`  ${c.dim}Dens = Lead Density (max 10, leads/emails*1000)${c.reset}`);
  console.log(`  ${c.dim}Pen  = Saturation Penalty (-20 if high vol + low rate)${c.reset}`);
  console.log();
}

// ROI Analysis
function showROIAnalysis(stats) {
  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  💰 ROI ANALYSIS BY VERTICAL                                           ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  // Calculate ROI metrics
  const roiStats = stats.map(v => {
    // Estimate cost per email at $0.05 (rough average)
    const emailCost = v.totalSent * 0.05;
    const roi = emailCost > 0 ? ((v.revenue - emailCost) / emailCost) * 100 : 0;
    const revenuePerEmail = v.totalSent > 0 ? v.revenue / v.totalSent : 0;
    const costPerLead = v.totalPositive > 0 ? emailCost / v.totalPositive : 0;
    
    return {
      ...v,
      emailCost,
      roi,
      revenuePerEmail,
      costPerLead
    };
  }).sort((a, b) => b.roi - a.roi);

  console.log(`  ${c.dim}${'Vertical'.padEnd(14)}${'Cost'.padStart(10)}${'Revenue'.padStart(12)}${'ROI'.padStart(10)}${'$/Email'.padStart(10)}${'$/Lead'.padStart(10)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(66)}${c.reset}`);

  for (const v of roiStats) {
    const roiColor = v.roi > 500 ? c.green : v.roi > 100 ? c.yellow : v.roi > 0 ? c.dim : c.red;
    const costStr = `$${v.emailCost.toFixed(0)}`;
    const revStr = v.revenue > 0 ? `$${v.revenue.toLocaleString()}` : '-';
    const roiStr = v.roi > 0 ? `${v.roi.toFixed(0)}%` : '-';
    const perEmailStr = v.revenuePerEmail > 0 ? `$${v.revenuePerEmail.toFixed(2)}` : '-';
    const perLeadStr = v.costPerLead > 0 ? `$${v.costPerLead.toFixed(2)}` : '-';
    
    console.log(`  ${v.name.padEnd(14)}${costStr.padStart(10)}${revStr.padStart(12)}${roiColor}${roiStr.padStart(10)}${c.reset}${perEmailStr.padStart(10)}${perLeadStr.padStart(10)}`);
  }

  // Best ROI insight
  const bestROI = roiStats.find(v => v.roi > 0);
  if (bestROI) {
    console.log(`\n  ${c.bgGreen}${c.bold} 💎 BEST ROI ${c.reset}`);
    console.log(`  ${c.green}${bestROI.name} delivers ${bestROI.roi.toFixed(0)}% ROI${c.reset}`);
    console.log(`  ${c.green}Every $1 spent returns $${(1 + bestROI.roi / 100).toFixed(2)}${c.reset}`);
  }

  // Underperforming warning
  const negativeROI = roiStats.filter(v => v.totalSent > 1000 && v.revenue === 0);
  if (negativeROI.length > 0) {
    console.log(`\n  ${c.bgYellow}${c.bold} ⚠️ ZERO REVENUE ${c.reset}`);
    console.log(`  ${c.yellow}${negativeROI.map(v => v.name).join(', ')} have sent ${negativeROI.reduce((a, v) => a + v.totalSent, 0).toLocaleString()} emails with no closed revenue${c.reset}`);
  }

  console.log();
}

// Proposal Integration
function showProposalMode(vertical, allStats) {
  const stats = allStats.find(v => v.name.toLowerCase() === vertical.toLowerCase());
  
  if (!stats) {
    console.log(`${c.red}❌ Vertical "${vertical}" not found${c.reset}`);
    process.exit(1);
  }

  // Get companies to target
  const targetCompanies = COMPANY_DATABASE[stats.name] || [];
  const notContacted = targetCompanies.filter(c => !c.contacted);

  console.log(`\n${c.bold}╔${'═'.repeat(70)}╗${c.reset}`);
  console.log(`${c.bold}║  📋 PROPOSAL MODE: ${stats.name.toUpperCase().padEnd(47)}  ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(70)}╝${c.reset}\n`);

  // Quick pitch points
  console.log(`${c.cyan}🎯 PITCH POINTS${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  • ${stats.positiveRate.toFixed(0)}% positive response rate in ${stats.name} vertical`);
  if (stats.revenue > 0) {
    console.log(`  • $${stats.revenue.toLocaleString()} revenue generated from ${stats.name} campaigns`);
  }
  console.log(`  • ${stats.totalPositive} interested leads in pipeline`);
  
  // Templates
  const templates = TEMPLATE_PERFORMANCE[stats.name];
  if (templates && templates.length > 0) {
    console.log(`  • Top template: "${templates[0].name}" (${templates[0].positiveRate}% positive)`);
  }
  console.log();

  // Suggested companies
  if (notContacted.length > 0) {
    console.log(`${c.cyan}🏢 PROSPECT LIST FOR PROPOSALS${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
    notContacted.forEach(comp => {
      console.log(`  ${c.green}□${c.reset} ${comp.name.padEnd(22)} ${comp.tier.padEnd(12)} ${comp.revenue}`);
      console.log(`      ${c.dim}Domain: ${comp.domain}${c.reset}`);
    });
    console.log();
  }

  // Quick command hints
  console.log(`${c.cyan}🚀 QUICK COMMANDS${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  console.log(`  Generate proposal:  gex proposal ${stats.name.toLowerCase()}`);
  console.log(`  Quick pitch:        gex qp ${stats.name.toLowerCase()}`);
  console.log(`  Email templates:    gex templates --vertical=${stats.name.toLowerCase()}`);
  console.log();
}

// Main
async function main() {
  if (HELP) {
    showHelp();
    return;
  }

  const stats = await getVerticalStats();

  if (EXPORT) {
    await exportToCsv(stats);
    return;
  }

  if (ROI) {
    showROIAnalysis(stats);
    return;
  }

  if (SCORE_BREAKDOWN) {
    showScoreBreakdown(stats);
    return;
  }

  if (!targetArg) {
    showAllVerticals(stats);
    return;
  }

  if (targetArg.toLowerCase() === 'compare') {
    showComparison(stats);
    return;
  }

  if (targetArg.toLowerCase() === 'roi') {
    showROIAnalysis(stats);
    return;
  }

  // Proposal mode for specific vertical
  if (PROPOSAL) {
    showProposalMode(targetArg, stats);
    return;
  }

  // Deep dive into specific vertical
  showVerticalDeepDive(targetArg, stats, SHOW_LEADS);
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
