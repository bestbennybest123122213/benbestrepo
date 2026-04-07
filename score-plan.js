#!/usr/bin/env node
/**
 * Pipeline Score Improvement Plan
 * 
 * Analyzes the pipeline and provides a specific action plan
 * to improve the score from current level to target (80).
 * 
 * Usage:
 *   node score-plan.js              # Full improvement plan
 *   node score-plan.js --quick      # Quick summary
 *   node score-plan.js --actions    # Just the action list
 *   node score-plan.js --telegram   # Telegram format
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick') || args.includes('-q');
const ACTIONS = args.includes('--actions') || args.includes('-a');
const TELEGRAM = args.includes('--telegram') || args.includes('-t');
const HELP = args.includes('--help') || args.includes('-h');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Target score
const TARGET = 80;

// Scoring weights (must match pipeline-score.js)
const WEIGHTS = {
  freshness: 25,
  hotLeads: 20,
  responseRate: 20,
  conversion: 20,
  staleLeads: 15
};

// Thresholds
const THRESHOLDS = {
  fresh: 7,
  hot: 1,
  stale: 14,
  critical: 30,
  archive: 60
};

if (HELP) {
  console.log(`
${c.bold}Pipeline Score Improvement Plan${c.reset}
Get a specific action plan to reach score ${TARGET}.

${c.cyan}Usage:${c.reset}
  gex plan                  Full improvement plan
  gex plan --quick          Quick summary
  gex plan --actions        Just the action list
  gex plan --telegram       Telegram format

${c.cyan}Score Components:${c.reset}
  Freshness:    ${WEIGHTS.freshness} pts - Fresh leads (<${THRESHOLDS.fresh}d)
  Hot Leads:    ${WEIGHTS.hotLeads} pts - Very fresh (<${THRESHOLDS.hot}d)
  Response:     ${WEIGHTS.responseRate} pts - Fast response ratio
  Conversion:   ${WEIGHTS.conversion} pts - Meeting conversion
  Stale Penalty: -${WEIGHTS.staleLeads} pts - Stale leads (>${THRESHOLDS.stale}d)
`);
  process.exit(0);
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error(`${c.red}❌ Database not initialized${c.reset}`);
    process.exit(1);
  }

  // Get leads
  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Archived');

  if (error || !leads) {
    console.error(`${c.red}❌ Failed to load leads${c.reset}`);
    process.exit(1);
  }

  // Calculate current state
  const analysis = analyzeLeads(leads);
  const plan = createPlan(analysis);

  // Output
  if (TELEGRAM) {
    console.log(formatTelegram(analysis, plan));
  } else if (QUICK) {
    console.log(formatQuick(analysis, plan));
  } else if (ACTIONS) {
    console.log(formatActions(plan));
  } else {
    console.log(formatFull(analysis, plan));
  }
}

function analyzeLeads(leads) {
  const now = new Date();
  const daysSince = (dateStr) => {
    if (!dateStr) return 999;
    return Math.floor((now - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  };

  // Filter active leads
  const active = leads.filter(l => l.status !== 'Booked');
  const booked = leads.filter(l => l.status === 'Booked');

  // Age buckets
  const fresh = active.filter(l => daysSince(l.conversation_date) <= THRESHOLDS.fresh);
  const hot = active.filter(l => daysSince(l.conversation_date) <= THRESHOLDS.hot);
  const stale = active.filter(l => daysSince(l.conversation_date) > THRESHOLDS.stale);
  const critical = active.filter(l => daysSince(l.conversation_date) > THRESHOLDS.critical);
  const archivable = active.filter(l => daysSince(l.conversation_date) > THRESHOLDS.archive);
  
  // Meeting requests
  const meetingRequests = leads.filter(l => 
    l.reply_category === 'Meeting Request' && l.status !== 'Booked'
  );

  // Get scheduling leads for response rate
  const scheduling = leads.filter(l => l.status === 'Scheduling');
  
  // Calculate current score components (matching pipeline-score.js)
  const freshRatio = active.length > 0 ? fresh.length / active.length : 0;
  const hotScore = Math.min(hot.length / 3, 1); // Need 3+ hot for full points
  const schedulingRatio = leads.length > 0 ? scheduling.length / leads.length : 0;
  const conversionRatio = leads.length > 0 ? booked.length / leads.length : 0;
  const staleRatio = active.length > 0 ? stale.length / active.length : 0;
  
  const scores = {
    freshness: Math.round(freshRatio * WEIGHTS.freshness),
    hotLeads: Math.round(hotScore * WEIGHTS.hotLeads),
    responseRate: Math.round(Math.min(schedulingRatio * 2, 1) * WEIGHTS.responseRate),
    conversion: Math.round(Math.min(conversionRatio / 0.3, 1) * WEIGHTS.conversion), // 30%+ = full
    stalePenalty: -Math.round(Math.min(staleRatio, 1) * WEIGHTS.staleLeads)
  };

  const currentScore = Math.max(0, 
    scores.freshness + 
    scores.hotLeads + 
    scores.responseRate + 
    scores.conversion + 
    scores.stalePenalty
  );

  return {
    total: leads.length,
    active: active.length,
    booked: booked.length,
    fresh: fresh.length,
    hot: hot.length,
    stale: stale.length,
    critical: critical.length,
    archivable: archivable.length,
    meetingRequests: meetingRequests.length,
    scores,
    currentScore,
    gap: TARGET - currentScore
  };
}

function createPlan(analysis) {
  const actions = [];
  let potentialGain = 0;

  // Action 1: Archive dead leads
  if (analysis.archivable > 0) {
    const gain = Math.min(analysis.archivable * 0.15, 10);
    potentialGain += gain;
    actions.push({
      priority: 1,
      category: 'cleanup',
      title: `Archive ${analysis.archivable} dead leads`,
      description: `Leads >60 days old with no activity are dragging down your score.`,
      command: 'gex archive --execute --force',
      gain: Math.round(gain),
      effort: 'Low',
      time: '2 min'
    });
  }

  // Action 2: Clear stale leads
  if (analysis.stale > analysis.archivable) {
    const staleToClear = analysis.stale - analysis.archivable;
    const gain = Math.min(staleToClear * 0.1, 8);
    potentialGain += gain;
    actions.push({
      priority: 2,
      category: 'engagement',
      title: `Re-engage ${staleToClear} stale leads`,
      description: `Leads 14-60 days old need a follow-up or reactivation.`,
      command: 'gex stale',
      gain: Math.round(gain),
      effort: 'Medium',
      time: '30 min'
    });
  }

  // Action 3: Book meetings
  if (analysis.meetingRequests > 0) {
    const gain = Math.min(analysis.meetingRequests * 0.3, 15);
    potentialGain += gain;
    actions.push({
      priority: 3,
      category: 'conversion',
      title: `Book ${analysis.meetingRequests} meeting requests`,
      description: `Convert meeting requests to booked calls.`,
      command: 'gex book',
      gain: Math.round(gain),
      effort: 'Medium',
      time: '1 hour'
    });
  }

  // Action 4: Respond to hot leads
  if (analysis.hot < 5) {
    const gain = 5;
    potentialGain += gain;
    actions.push({
      priority: 4,
      category: 'freshness',
      title: 'Respond to all new leads within 24h',
      description: `Fast responses create hot leads which boost score.`,
      command: 'gex hb',
      gain,
      effort: 'Low',
      time: 'Daily'
    });
  }

  // Action 5: Add fresh leads
  if (analysis.fresh < 10) {
    const gain = 10;
    potentialGain += gain;
    actions.push({
      priority: 5,
      category: 'freshness',
      title: 'Add more fresh leads via outreach',
      description: `Fresh leads (<7d) are weighted heavily in the score.`,
      command: 'gex reactivate',
      gain,
      effort: 'High',
      time: '2 hours'
    });
  }

  // Calculate projected score
  const projectedScore = Math.min(analysis.currentScore + potentialGain, 100);

  // Determine priority order
  actions.sort((a, b) => {
    // Sort by gain/effort ratio
    const effortScore = { 'Low': 1, 'Medium': 2, 'High': 3 };
    const ratioA = a.gain / effortScore[a.effort];
    const ratioB = b.gain / effortScore[b.effort];
    return ratioB - ratioA;
  });

  // Re-number priorities
  actions.forEach((a, i) => a.priority = i + 1);

  return {
    actions,
    potentialGain: Math.round(potentialGain),
    projectedScore: Math.round(projectedScore),
    reachesTarget: projectedScore >= TARGET
  };
}

function formatFull(analysis, plan) {
  let output = '';

  output += `\n${c.bold}╔═══════════════════════════════════════════════════════════════════════════╗${c.reset}\n`;
  output += `${c.bold}║  📈 PIPELINE SCORE IMPROVEMENT PLAN                                        ║${c.reset}\n`;
  output += `${c.bold}╚═══════════════════════════════════════════════════════════════════════════╝${c.reset}\n`;

  // Current vs Target
  output += `\n${c.cyan}CURRENT STATE:${c.reset}\n`;
  output += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  
  const scoreColor = analysis.currentScore < 40 ? c.red : (analysis.currentScore < 60 ? c.yellow : c.green);
  output += `   Current Score:    ${scoreColor}${analysis.currentScore}${c.reset}/100\n`;
  output += `   Target Score:     ${c.green}${TARGET}${c.reset}/100\n`;
  output += `   Gap to Close:     ${c.yellow}+${analysis.gap}${c.reset} points\n`;

  output += `\n${c.cyan}SCORE BREAKDOWN:${c.reset}\n`;
  output += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  output += `   Freshness:        ${analysis.scores.freshness}/${WEIGHTS.freshness} ${c.dim}(${analysis.fresh} fresh leads)${c.reset}\n`;
  output += `   Hot Leads:        ${analysis.scores.hotLeads}/${WEIGHTS.hotLeads} ${c.dim}(${analysis.hot} hot)${c.reset}\n`;
  output += `   Response Rate:    ${analysis.scores.responseRate}/${WEIGHTS.responseRate}\n`;
  output += `   Conversion:       ${analysis.scores.conversion}/${WEIGHTS.conversion} ${c.dim}(${analysis.booked} booked)${c.reset}\n`;
  output += `   Stale Penalty:    ${c.red}${analysis.scores.stalePenalty}${c.reset}/${-WEIGHTS.staleLeads} ${c.dim}(${analysis.stale} stale)${c.reset}\n`;

  output += `\n${c.cyan}PIPELINE ISSUES:${c.reset}\n`;
  output += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  output += `   🔴 ${analysis.archivable} leads archivable (>60 days)\n`;
  output += `   🟠 ${analysis.critical - analysis.archivable} leads critical (30-60 days)\n`;
  output += `   🟡 ${analysis.stale - analysis.critical} leads stale (14-30 days)\n`;
  output += `   📅 ${analysis.meetingRequests} meeting requests pending\n`;

  output += `\n${c.bold}${c.cyan}ACTION PLAN (do these in order):${c.reset}\n`;
  output += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;

  for (const action of plan.actions) {
    const effortColor = action.effort === 'Low' ? c.green : (action.effort === 'Medium' ? c.yellow : c.red);
    
    output += `\n   ${c.bold}${action.priority}. ${action.title}${c.reset}\n`;
    output += `      ${c.dim}${action.description}${c.reset}\n`;
    output += `      ${c.green}+${action.gain} pts${c.reset} | ${effortColor}${action.effort}${c.reset} effort | ${c.dim}~${action.time}${c.reset}\n`;
    output += `      ${c.cyan}→ ${action.command}${c.reset}\n`;
  }

  output += `\n${c.cyan}PROJECTED RESULT:${c.reset}\n`;
  output += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  output += `   Current:    ${scoreColor}${analysis.currentScore}${c.reset}\n`;
  output += `   Potential:  ${c.green}+${plan.potentialGain}${c.reset} points\n`;
  output += `   Projected:  ${c.bold}${plan.projectedScore}${c.reset}/100\n`;
  
  if (plan.reachesTarget) {
    output += `   ${c.green}✓ This plan reaches your target of ${TARGET}${c.reset}\n`;
  } else {
    output += `   ${c.yellow}⚠ Need ${TARGET - plan.projectedScore} more points (add fresh leads)${c.reset}\n`;
  }

  output += `\n${c.bold}START NOW:${c.reset} ${c.cyan}${plan.actions[0]?.command || 'gex pscore'}${c.reset}\n\n`;

  return output;
}

function formatQuick(analysis, plan) {
  let output = `\n${c.bold}📈 SCORE IMPROVEMENT PLAN${c.reset}\n\n`;
  output += `Current: ${c.red}${analysis.currentScore}${c.reset} → Target: ${c.green}${TARGET}${c.reset} (need +${analysis.gap})\n\n`;
  output += `Top 3 Actions:\n`;
  
  for (const action of plan.actions.slice(0, 3)) {
    output += `  ${action.priority}. ${action.title} ${c.green}+${action.gain}pts${c.reset}\n`;
    output += `     ${c.cyan}${action.command}${c.reset}\n`;
  }
  
  output += `\nProjected: ${c.bold}${plan.projectedScore}${c.reset}/100\n\n`;
  return output;
}

function formatActions(plan) {
  let output = `\n${c.bold}ACTION LIST:${c.reset}\n\n`;
  
  for (const action of plan.actions) {
    output += `${action.priority}. ${action.title}\n`;
    output += `   ${c.cyan}${action.command}${c.reset}\n\n`;
  }
  
  return output;
}

function formatTelegram(analysis, plan) {
  let msg = '📈 *SCORE IMPROVEMENT PLAN*\n\n';
  msg += `Current: ${analysis.currentScore}/100 → Target: ${TARGET}/100\n\n`;
  msg += '*Top Actions:*\n';
  
  for (const action of plan.actions.slice(0, 3)) {
    msg += `${action.priority}. ${action.title} (+${action.gain}pts)\n`;
    msg += `   \`${action.command}\`\n`;
  }
  
  msg += `\nProjected: ${plan.projectedScore}/100`;
  return msg;
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
