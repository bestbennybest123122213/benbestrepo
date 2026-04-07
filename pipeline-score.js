#!/usr/bin/env node
/**
 * Pipeline Health Score
 * 
 * Single number (0-100) summarizing overall pipeline health.
 * Quick at-a-glance indicator with trend tracking.
 * 
 * Scoring factors:
 *   - Fresh leads (<7d): +points
 *   - Hot leads (responded <24h): +points
 *   - Stale leads (>14d): -points
 *   - Response rate: +points for fast
 *   - Meeting conversion: +points
 * 
 * Color coded: 🟢 80+ | 🟡 60-79 | 🟠 40-59 | 🔴 <40
 * 
 * Usage:
 *   node pipeline-score.js              # Show score with breakdown
 *   node pipeline-score.js --history    # Show score trend
 *   node pipeline-score.js --quick      # Just the number
 *   node pipeline-score.js --telegram   # Telegram format
 *   node pipeline-score.js --weekly     # Weekly report
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const HISTORY_FILE = path.join(__dirname, '.gex-score-history.json');

// Help flag
if (args.includes('--help') || args.includes('-?')) {
  console.log(`
Pipeline Health Score - Single number (0-100) for pipeline health

Usage: gex pscore [options]

Options:
  --quick, -q      Just the score number
  --history, -h    Show score trend over time
  --telegram, -t   Telegram-friendly format
  --weekly, -w     Weekly report
  --help, -?       Show this help

Aliases: pscore, health-score, phealth

Score Range:
  🟢 80-100  Excellent
  🟡 60-79   Good
  🟠 40-59   Needs Attention
  🔴 0-39    Critical
`);
  process.exit(0);
}

// Score weights (total max: 100)
const WEIGHTS = {
  freshness: 25,      // Fresh leads (<7d)
  hotLeads: 20,       // Very recent (<24h)
  responseRate: 20,   // Fast response ratio
  conversion: 20,     // Meeting → Booked conversion
  staleLeads: 15      // Negative for stale (>14d)
};

// Thresholds
const THRESHOLDS = {
  fresh: 7,           // Days for "fresh"
  hot: 1,             // Days for "hot" (responded <24h)
  stale: 14,          // Days for "stale"
  critical: 30        // Days for "critical"
};

// Goals
const GOALS = {
  target: 80,         // Target score
  minimum: 60         // Minimum acceptable
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get leads from canonical source
  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*');

  if (error || !leads) {
    console.error('❌ Failed to load leads:', error?.message || 'No data');
    process.exit(1);
  }

  const scoreData = calculateScore(leads);
  
  // Save to history
  saveToHistory(scoreData);
  
  // Handle different output modes
  if (args.includes('--quick') || args.includes('-q')) {
    showQuick(scoreData);
  } else if (args.includes('--history') || args.includes('-h')) {
    showHistory(scoreData);
  } else if (args.includes('--telegram') || args.includes('-t')) {
    showTelegram(scoreData);
  } else if (args.includes('--weekly') || args.includes('-w')) {
    showWeekly(scoreData);
  } else {
    showFull(scoreData);
  }
}

function calculateScore(leads) {
  const now = new Date();
  const total = leads.length;
  
  // Filter active leads (excluding booked - they're done)
  const active = leads.filter(l => l.status !== 'Booked');
  const booked = leads.filter(l => l.status === 'Booked');
  const scheduling = leads.filter(l => l.status === 'Scheduling');
  
  // Age calculations
  const getAgeDays = (dateStr) => {
    if (!dateStr) return 999;
    return Math.floor((now - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  };
  
  // Lead buckets
  const fresh = active.filter(l => getAgeDays(l.conversation_date) <= THRESHOLDS.fresh);
  const hot = active.filter(l => getAgeDays(l.conversation_date) <= THRESHOLDS.hot);
  const stale = active.filter(l => getAgeDays(l.conversation_date) > THRESHOLDS.stale);
  const critical = active.filter(l => getAgeDays(l.conversation_date) > THRESHOLDS.critical);
  
  // Calculate component scores
  const scores = {};
  
  // 1. Freshness Score (0-25)
  // Higher ratio of fresh leads = better
  const freshRatio = active.length > 0 ? fresh.length / active.length : 0;
  scores.freshness = Math.round(freshRatio * WEIGHTS.freshness);
  
  // 2. Hot Leads Score (0-20)
  // Having 3+ hot leads = full points, 0 = no points
  const hotScore = Math.min(hot.length / 3, 1);
  scores.hotLeads = Math.round(hotScore * WEIGHTS.hotLeads);
  
  // 3. Response Rate Score (0-20)
  // Based on scheduling ratio - higher = responding well
  const schedulingRatio = total > 0 ? scheduling.length / total : 0;
  scores.responseRate = Math.round(Math.min(schedulingRatio * 2, 1) * WEIGHTS.responseRate);
  
  // 4. Conversion Score (0-20)
  // Booking rate from total leads
  const conversionRatio = total > 0 ? booked.length / total : 0;
  // 30%+ booking rate = full points
  scores.conversion = Math.round(Math.min(conversionRatio / 0.3, 1) * WEIGHTS.conversion);
  
  // 5. Stale Penalty (0 to -15)
  // More stale leads = bigger penalty
  const staleRatio = active.length > 0 ? stale.length / active.length : 0;
  scores.stalePenalty = -Math.round(staleRatio * WEIGHTS.staleLeads);
  
  // Total score
  const totalScore = Math.max(0, Math.min(100,
    scores.freshness + 
    scores.hotLeads + 
    scores.responseRate + 
    scores.conversion + 
    scores.stalePenalty
  ));
  
  // Generate recommendations
  const recommendations = generateRecommendations(scores, {
    total, active, booked, scheduling, fresh, hot, stale, critical
  });
  
  return {
    score: totalScore,
    breakdown: scores,
    stats: {
      total,
      active: active.length,
      booked: booked.length,
      scheduling: scheduling.length,
      fresh: fresh.length,
      hot: hot.length,
      stale: stale.length,
      critical: critical.length,
      bookingRate: (total > 0 ? (booked.length / total * 100).toFixed(1) : 0)
    },
    recommendations,
    timestamp: now.toISOString()
  };
}

function generateRecommendations(scores, stats) {
  const recs = [];
  
  // Priority order based on impact
  if (scores.stalePenalty < -10) {
    recs.push({
      priority: 1,
      action: `Clear ${stats.stale.length} stale leads`,
      impact: `Could add +${Math.abs(scores.stalePenalty)} points`
    });
  }
  
  if (scores.hotLeads < 10) {
    recs.push({
      priority: 2,
      action: 'Generate more fresh leads',
      impact: `Currently ${stats.hot.length} hot leads (need 3+ for max score)`
    });
  }
  
  if (scores.freshness < 15) {
    recs.push({
      priority: 3,
      action: 'Follow up on recent leads faster',
      impact: `Only ${stats.fresh.length}/${stats.active.length} leads are fresh (<7d)`
    });
  }
  
  if (scores.conversion < 10 && stats.scheduling.length > 3) {
    recs.push({
      priority: 4,
      action: 'Push scheduling leads to booked',
      impact: `${stats.scheduling.length} leads in scheduling phase`
    });
  }
  
  if (stats.critical.length > 0) {
    recs.push({
      priority: 1,
      action: `⚠️ ${stats.critical.length} critical leads (>30 days)`,
      impact: 'Book or close these immediately'
    });
  }
  
  return recs.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function getScoreEmoji(score) {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

function getScoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Attention';
  return 'Critical';
}

function getTrendEmoji(current, previous) {
  if (!previous) return '→';
  const diff = current - previous;
  if (diff > 3) return '↑';
  if (diff < -3) return '↓';
  return '→';
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors, return empty
  }
  return [];
}

function saveToHistory(scoreData) {
  try {
    const history = loadHistory();
    const today = scoreData.timestamp.split('T')[0];
    
    // Remove today's entry if exists (update with latest)
    const filtered = history.filter(h => !h.date.startsWith(today));
    
    // Add new entry
    filtered.push({
      date: scoreData.timestamp,
      score: scoreData.score,
      breakdown: scoreData.breakdown,
      stats: scoreData.stats
    });
    
    // Keep last 90 days
    const recent = filtered.slice(-90);
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(recent, null, 2));
  } catch (e) {
    // Ignore save errors
  }
}

function showQuick(data) {
  const history = loadHistory();
  const yesterday = history.length > 1 ? history[history.length - 2]?.score : null;
  const trend = getTrendEmoji(data.score, yesterday);
  
  console.log(`${getScoreEmoji(data.score)} ${data.score}/100 ${trend}`);
}

function showFull(data) {
  const history = loadHistory();
  const yesterday = history.length > 1 ? history[history.length - 2]?.score : null;
  const lastWeek = history.length > 7 ? history[history.length - 8]?.score : null;
  const trend = getTrendEmoji(data.score, yesterday);
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ${getScoreEmoji(data.score)} PIPELINE HEALTH SCORE: ${data.score}/100 ${trend}  ${getScoreLabel(data.score).padEnd(15)}
╚══════════════════════════════════════════════════════════════╝
`);

  // Breakdown
  console.log('📊 SCORE BREAKDOWN');
  console.log('─'.repeat(50));
  console.log(`   Freshness:     ${formatScore(data.breakdown.freshness, WEIGHTS.freshness)}`);
  console.log(`   Hot Leads:     ${formatScore(data.breakdown.hotLeads, WEIGHTS.hotLeads)}`);
  console.log(`   Response Rate: ${formatScore(data.breakdown.responseRate, WEIGHTS.responseRate)}`);
  console.log(`   Conversion:    ${formatScore(data.breakdown.conversion, WEIGHTS.conversion)}`);
  console.log(`   Stale Penalty: ${data.breakdown.stalePenalty >= 0 ? '+' : ''}${data.breakdown.stalePenalty}/${-WEIGHTS.staleLeads}`);
  console.log('─'.repeat(50));
  console.log(`   TOTAL:         ${data.score}/100\n`);

  // Stats
  console.log('📈 PIPELINE STATS');
  console.log(`   Total: ${data.stats.total} | Booked: ${data.stats.booked} (${data.stats.bookingRate}%)`);
  console.log(`   Fresh: ${data.stats.fresh} | Hot: ${data.stats.hot} | Stale: ${data.stats.stale} | Critical: ${data.stats.critical}\n`);

  // Trend
  console.log('📉 TREND');
  if (yesterday !== null) {
    const dayDiff = data.score - yesterday;
    console.log(`   vs Yesterday: ${dayDiff >= 0 ? '+' : ''}${dayDiff} points`);
  } else {
    console.log('   vs Yesterday: No data');
  }
  if (lastWeek !== null) {
    const weekDiff = data.score - lastWeek;
    console.log(`   vs Last Week: ${weekDiff >= 0 ? '+' : ''}${weekDiff} points`);
  } else {
    console.log('   vs Last Week: No data');
  }
  console.log('');

  // Goal progress
  const goalDiff = GOALS.target - data.score;
  if (goalDiff > 0) {
    console.log(`🎯 GOAL: ${GOALS.target} (need +${goalDiff} points)`);
  } else {
    console.log(`🎯 GOAL: ${GOALS.target} ✅ Exceeded by ${Math.abs(goalDiff)} points!`);
  }
  console.log('');

  // Recommendations
  if (data.recommendations.length > 0 && data.score < GOALS.target) {
    console.log('💡 TOP ACTIONS TO IMPROVE SCORE');
    data.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec.action}`);
      console.log(`      → ${rec.impact}`);
    });
    console.log('');
  }
}

function showHistory(data) {
  const history = loadHistory();
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  📊 PIPELINE SCORE HISTORY
╚══════════════════════════════════════════════════════════════╝
`);

  if (history.length === 0) {
    console.log('   No history yet. Run `gex pscore` daily to build history.\n');
    return;
  }

  // Show last 14 days
  const recent = history.slice(-14);
  
  console.log('LAST 14 DAYS');
  console.log('─'.repeat(60));
  
  recent.forEach((entry, i) => {
    const date = new Date(entry.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    const bar = '█'.repeat(Math.floor(entry.score / 5));
    const prevScore = i > 0 ? recent[i - 1].score : null;
    const trend = getTrendEmoji(entry.score, prevScore);
    
    console.log(`   ${date.padEnd(12)} ${getScoreEmoji(entry.score)} ${String(entry.score).padStart(3)} ${trend} ${bar}`);
  });
  
  console.log('─'.repeat(60));
  
  // Calculate averages
  const scores = recent.map(r => r.score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  
  console.log(`\n   Average: ${avg} | Min: ${min} | Max: ${max}`);
  console.log(`   Current: ${data.score} | Target: ${GOALS.target}\n`);
  
  // Weekly summary
  if (history.length >= 7) {
    const thisWeek = history.slice(-7).map(h => h.score);
    const lastWeek = history.slice(-14, -7).map(h => h.score);
    
    const thisAvg = Math.round(thisWeek.reduce((a, b) => a + b, 0) / thisWeek.length);
    
    if (lastWeek.length > 0) {
      const lastAvg = Math.round(lastWeek.reduce((a, b) => a + b, 0) / lastWeek.length);
      const diff = thisAvg - lastAvg;
      console.log(`📅 WEEKLY: This week avg ${thisAvg} vs last week ${lastAvg} (${diff >= 0 ? '+' : ''}${diff})`);
    }
  }
  console.log('');
}

function showWeekly(data) {
  const history = loadHistory();
  
  console.log(`
📊 WEEKLY PIPELINE SCORE REPORT
${'═'.repeat(50)}
`);

  if (history.length < 7) {
    console.log('Not enough data for weekly report. Need at least 7 days.\n');
    showFull(data);
    return;
  }

  const thisWeek = history.slice(-7);
  const lastWeek = history.slice(-14, -7);
  
  // This week stats
  const thisScores = thisWeek.map(h => h.score);
  const thisAvg = Math.round(thisScores.reduce((a, b) => a + b, 0) / thisScores.length);
  const thisMin = Math.min(...thisScores);
  const thisMax = Math.max(...thisScores);
  
  console.log('THIS WEEK');
  console.log(`   Average Score: ${getScoreEmoji(thisAvg)} ${thisAvg}/100`);
  console.log(`   Range: ${thisMin} - ${thisMax}`);
  console.log(`   Current: ${data.score}/100`);
  
  // Comparison
  if (lastWeek.length >= 5) {
    const lastScores = lastWeek.map(h => h.score);
    const lastAvg = Math.round(lastScores.reduce((a, b) => a + b, 0) / lastScores.length);
    const diff = thisAvg - lastAvg;
    
    console.log(`\nLAST WEEK`);
    console.log(`   Average Score: ${getScoreEmoji(lastAvg)} ${lastAvg}/100`);
    console.log(`\n   ${diff >= 0 ? '📈' : '📉'} Week-over-week: ${diff >= 0 ? '+' : ''}${diff} points`);
  }
  
  // Goals
  console.log(`\n🎯 GOAL STATUS`);
  const daysAtTarget = thisScores.filter(s => s >= GOALS.target).length;
  console.log(`   Days at target (${GOALS.target}+): ${daysAtTarget}/7`);
  console.log(`   Days below minimum (${GOALS.minimum}): ${thisScores.filter(s => s < GOALS.minimum).length}/7`);
  
  // Daily breakdown
  console.log(`\nDAILY SCORES`);
  thisWeek.forEach(entry => {
    const date = new Date(entry.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    console.log(`   ${date.padEnd(12)} ${getScoreEmoji(entry.score)} ${entry.score}`);
  });
  
  console.log('');
}

function showTelegram(data) {
  const history = loadHistory();
  const yesterday = history.length > 1 ? history[history.length - 2]?.score : null;
  const trend = getTrendEmoji(data.score, yesterday);
  const dayDiff = yesterday ? data.score - yesterday : 0;
  
  let msg = `${getScoreEmoji(data.score)} *Pipeline Score: ${data.score}/100* ${trend}\n`;
  msg += `_${getScoreLabel(data.score)}_\n\n`;
  msg += `📊 *Breakdown:*\n`;
  msg += `Freshness: +${data.breakdown.freshness}\n`;
  msg += `Hot Leads: +${data.breakdown.hotLeads}\n`;
  msg += `Response: +${data.breakdown.responseRate}\n`;
  msg += `Conversion: +${data.breakdown.conversion}\n`;
  msg += `Stale: ${data.breakdown.stalePenalty}\n\n`;
  
  if (yesterday !== null) {
    msg += `📈 vs Yesterday: ${dayDiff >= 0 ? '+' : ''}${dayDiff}\n`;
  }
  
  if (data.recommendations.length > 0 && data.score < GOALS.target) {
    msg += `\n💡 *Top Action:* ${data.recommendations[0].action}`;
  }
  
  console.log(msg);
}

function formatScore(score, max) {
  const sign = score >= 0 ? '+' : '';
  return `${sign}${score}/${max}`;
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
