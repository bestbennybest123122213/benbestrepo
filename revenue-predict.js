#!/usr/bin/env node
/**
 * Revenue Predictor - Advanced Pipeline Revenue Forecasting
 * 
 * Predicts monthly and quarterly revenue based on current pipeline data.
 * Helps understand what's likely to close and when.
 * 
 * Usage:
 *   node revenue-predict.js              # This month's forecast
 *   node revenue-predict.js --quarter    # Q1 2026 forecast
 *   node revenue-predict.js --scenario   # All three scenarios
 *   node revenue-predict.js --gap        # Gap to monthly goal
 *   node revenue-predict.js --deals      # Show deals in forecast
 *   node revenue-predict.js --history    # Show historical accuracy
 * 
 * Aliases: predict, forecast-revenue, revenue-forecast, projection
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const STAGE_PROBABILITIES = {
  'booked': 0.90,
  'contract sent': 0.85,
  'contract_sent': 0.85,
  'contracted': 0.85,
  'pricing discussion': 0.70,
  'pricing_discussion': 0.70,
  'negotiating': 0.70,
  'meeting request': 0.50,
  'meeting_request': 0.50,
  'scheduling': 0.50,
  'interested': 0.30,
  'warm': 0.25,
  'contacted': 0.15,
  'cold': 0.05,
  'unknown': 0.10
};

const SCENARIO_MODIFIERS = {
  conservative: 0.30,
  realistic: 0.50,
  optimistic: 0.70
};

const CONFIG = {
  avgDealSize: 25000,
  defaultCommissionRate: 0.30,
  monthlyGoal: 15000, // Commission goal
  dataDir: path.join(__dirname, 'data'),
  historyFile: path.join(__dirname, 'data', 'forecast-history.json')
};

// ANSI colors
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
  
  error: (s) => `\x1b[31m${s}\x1b[0m`,
  success: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  info: (s) => `\x1b[36m${s}\x1b[0m`,
  money: (s) => `\x1b[32m\x1b[1m${s}\x1b[0m`
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════════

function loadLocalDeals() {
  const dealsPath = path.join(CONFIG.dataDir, 'deals.json');
  try {
    if (fs.existsSync(dealsPath)) {
      return JSON.parse(fs.readFileSync(dealsPath, 'utf8')).deals || [];
    }
  } catch (e) {
    console.error(c.dim(`[debug] Error loading deals.json: ${e.message}`));
  }
  return [];
}

function loadCommissions() {
  const commPath = path.join(CONFIG.dataDir, 'commissions.json');
  try {
    if (fs.existsSync(commPath)) {
      return JSON.parse(fs.readFileSync(commPath, 'utf8')).commissions || [];
    }
  } catch (e) {
    console.error(c.dim(`[debug] Error loading commissions.json: ${e.message}`));
  }
  return [];
}

function loadGoals() {
  const goalsPath = path.join(CONFIG.dataDir, 'goals.json');
  try {
    if (fs.existsSync(goalsPath)) {
      return JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
    }
  } catch (e) {}
  return { goals: { revenue: { target: CONFIG.monthlyGoal } } };
}

function loadForecastHistory() {
  try {
    if (fs.existsSync(CONFIG.historyFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
    }
  } catch (e) {}
  return { forecasts: [], accuracy: [] };
}

function saveForecastHistory(history) {
  fs.writeFileSync(CONFIG.historyFile, JSON.stringify(history, null, 2));
}

function recordActual(month, actual) {
  const history = loadForecastHistory();
  
  // Find forecasts for this month
  const monthForecasts = history.forecasts.filter(f => {
    const fDate = new Date(f.date);
    return fDate.toLocaleString('default', { month: 'short', year: 'numeric' }) === month;
  });
  
  if (monthForecasts.length === 0) {
    console.log(c.error(`No forecasts found for ${month}`));
    return false;
  }
  
  // Use the average forecast for the month
  const avgForecast = monthForecasts.reduce((sum, f) => sum + f.weighted, 0) / monthForecasts.length;
  const accuracy = Math.min(100, (1 - Math.abs(actual - avgForecast) / avgForecast) * 100);
  
  // Initialize accuracy array if needed
  if (!history.accuracy) history.accuracy = [];
  
  // Check if we already have an entry for this month
  const existingIdx = history.accuracy.findIndex(a => a.month === month);
  const entry = {
    month,
    forecast: Math.round(avgForecast),
    actual,
    accuracy: Math.max(0, accuracy),
    recordedAt: new Date().toISOString()
  };
  
  if (existingIdx >= 0) {
    history.accuracy[existingIdx] = entry;
    console.log(c.success(`Updated actual for ${month}`));
  } else {
    history.accuracy.push(entry);
    console.log(c.success(`Recorded actual for ${month}`));
  }
  
  saveForecastHistory(history);
  
  console.log(`\n  Month:     ${month}`);
  console.log(`  Forecast:  $${Math.round(avgForecast).toLocaleString()}`);
  console.log(`  Actual:    $${actual.toLocaleString()}`);
  const accColor = accuracy >= 80 ? c.green : accuracy >= 60 ? c.yellow : c.red;
  console.log(`  Accuracy:  ${accColor}${accuracy.toFixed(1)}%${c.reset}\n`);
  
  return true;
}

function compareForecasts(history, daysBack = 7) {
  if (!history.forecasts || history.forecasts.length < 2) {
    return null;
  }
  
  const recent = history.forecasts.slice(-1)[0];
  const older = history.forecasts.slice(-daysBack - 1)[0] || history.forecasts[0];
  
  const change = recent.weighted - older.weighted;
  const percentChange = (change / older.weighted) * 100;
  
  return {
    current: recent,
    previous: older,
    change: Math.round(change),
    percentChange,
    daysApart: Math.round((new Date(recent.date) - new Date(older.date)) / (1000 * 60 * 60 * 24))
  };
}

async function loadSupabaseLeads() {
  try {
    const client = initSupabase();
    if (!client) return [];
    
    const { data, error } = await client
      .from('imann_positive_replies')
      .select('*')
      .order('conversation_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error(c.dim(`[debug] Supabase error: ${e.message}`));
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE PREDICTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeStage(stage) {
  if (!stage) return 'unknown';
  const s = stage.toLowerCase().trim();
  return s;
}

function getStageProbability(stage) {
  const normalized = normalizeStage(stage);
  for (const [key, prob] of Object.entries(STAGE_PROBABILITIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return prob;
    }
  }
  return 0.15; // Default for unknown stages
}

function calculateWeightedRevenue(deals) {
  let totalWeighted = 0;
  const byStage = {};
  
  for (const deal of deals) {
    const value = deal.value || deal.potential || deal.dealValue || CONFIG.avgDealSize;
    const stage = normalizeStage(deal.stage || deal.status);
    const probability = getStageProbability(stage);
    const commissionRate = deal.rate || deal.commissionRate || CONFIG.defaultCommissionRate;
    
    const commission = value * commissionRate;
    const weighted = commission * probability;
    
    if (!byStage[stage]) {
      byStage[stage] = {
        count: 0,
        totalValue: 0,
        totalCommission: 0,
        weightedCommission: 0,
        probability
      };
    }
    
    byStage[stage].count++;
    byStage[stage].totalValue += value;
    byStage[stage].totalCommission += commission;
    byStage[stage].weightedCommission += weighted;
    totalWeighted += weighted;
  }
  
  return { totalWeighted, byStage };
}

function calculateScenarios(deals) {
  const results = {};
  
  for (const [name, modifier] of Object.entries(SCENARIO_MODIFIERS)) {
    let total = 0;
    for (const deal of deals) {
      const value = deal.value || deal.potential || deal.dealValue || CONFIG.avgDealSize;
      const commissionRate = deal.rate || deal.commissionRate || CONFIG.defaultCommissionRate;
      total += value * commissionRate * modifier;
    }
    results[name] = total;
  }
  
  return results;
}

function calculateMonthlyProjection(deals, totalWeighted) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const projections = [];
  for (let i = 0; i < 4; i++) {
    const month = (currentMonth + i) % 12;
    const year = currentYear + Math.floor((currentMonth + i) / 12);
    const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
    
    // Distribution: 40% this month, 30% next, 20%, 10%
    const weights = [0.40, 0.30, 0.20, 0.10];
    const expected = totalWeighted * weights[i];
    
    projections.push({
      month: monthName,
      expected: Math.round(expected),
      isCurrentMonth: i === 0
    });
  }
  
  return projections;
}

function calculateQuarterlyForecast(deals, totalWeighted) {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const currentYear = now.getFullYear();
  
  const quarters = [];
  for (let i = 0; i < 4; i++) {
    const q = (currentQuarter + i) % 4;
    const year = currentYear + Math.floor((currentQuarter + i) / 4);
    const qName = `Q${q + 1} ${year}`;
    
    // More spread for quarterly
    const weights = [0.35, 0.30, 0.20, 0.15];
    const expected = totalWeighted * weights[i] * 3; // Quarterly is 3 months
    
    quarters.push({
      quarter: qName,
      expected: Math.round(expected),
      isCurrentQuarter: i === 0
    });
  }
  
  return quarters;
}

function calculateGap(forecast, monthlyGoal) {
  const gap = monthlyGoal - forecast;
  const percentage = ((forecast / monthlyGoal) * 100).toFixed(1);
  const dealsNeeded = Math.ceil(gap / (CONFIG.avgDealSize * CONFIG.defaultCommissionRate * 0.5));
  
  return {
    goal: monthlyGoal,
    forecast,
    gap: Math.max(0, gap),
    percentage: Math.min(100, parseFloat(percentage)),
    onTrack: gap <= 0,
    dealsNeeded: Math.max(0, dealsNeeded),
    pipelineNeeded: Math.max(0, Math.ceil(dealsNeeded / 0.15)) // At 15% close rate
  };
}

function generateRecommendations(gapAnalysis, byStage, deals) {
  const recs = [];
  
  // Priority 1: Gap-based recommendations
  if (!gapAnalysis.onTrack) {
    if (gapAnalysis.gap > 10000) {
      recs.push({
        priority: 1,
        icon: '🚨',
        action: `Need $${Math.round(gapAnalysis.gap).toLocaleString()} more to hit goal`,
        detail: `Add ${gapAnalysis.pipelineNeeded}+ new prospects or convert ${gapAnalysis.dealsNeeded} current deals`
      });
    }
    recs.push({
      priority: 2,
      icon: '📞',
      action: 'Focus on high-probability stages first',
      detail: 'Booked (90%) and Pricing Discussion (70%) are closest to closing'
    });
  }
  
  // Stage-specific recommendations
  const bookedCount = (byStage['booked']?.count || 0) + (byStage['scheduling']?.count || 0);
  const interestedCount = byStage['interested']?.count || 0;
  
  if (bookedCount > 0) {
    recs.push({
      priority: 1,
      icon: '📅',
      action: `${bookedCount} meetings to close`,
      detail: 'These have 90% close probability - follow up immediately'
    });
  }
  
  if (interestedCount > 5) {
    recs.push({
      priority: 3,
      icon: '🔥',
      action: `${interestedCount} interested leads to convert`,
      detail: 'Send meeting links to move them to scheduling'
    });
  }
  
  // Stale lead warning
  const now = new Date();
  const staleDeals = deals.filter(d => {
    const date = d.conversation_date || d.updatedAt || d.createdAt;
    if (!date) return false;
    const age = (now - new Date(date)) / (1000 * 60 * 60 * 24);
    return age > 14;
  });
  
  if (staleDeals.length > 10) {
    recs.push({
      priority: 2,
      icon: '⚠️',
      action: `${staleDeals.length} leads going stale`,
      detail: 'No activity in 14+ days - run reactivation campaign'
    });
  }
  
  return recs.sort((a, b) => a.priority - b.priority);
}

function calculateConfidenceInterval(totalWeighted, dealCount, historicalAccuracy = null) {
  // Enhanced confidence interval based on deal count and historical accuracy
  let baseError = 0.5 / Math.sqrt(Math.max(1, dealCount));
  
  // Adjust based on historical accuracy if available
  if (historicalAccuracy && historicalAccuracy.length > 3) {
    const avgDeviation = historicalAccuracy.reduce((sum, a) => sum + Math.abs(100 - a.accuracy), 0) / historicalAccuracy.length;
    baseError = avgDeviation / 100;
  }
  
  const standardError = totalWeighted * baseError;
  
  // Confidence level based on data quality
  let confidence = 'Low';
  if (dealCount > 20 && historicalAccuracy?.length > 5) confidence = 'Very High';
  else if (dealCount > 10) confidence = 'High';
  else if (dealCount > 5) confidence = 'Medium';
  
  return {
    low: Math.round(totalWeighted - 1.96 * standardError),
    high: Math.round(totalWeighted + 1.96 * standardError),
    confidence,
    standardError: Math.round(standardError)
  };
}

// Seasonality adjustments based on typical B2B patterns
function applySeasonality(baseAmount, month = null) {
  const SEASONALITY_FACTORS = {
    0: 0.85,   // January - slow start
    1: 0.95,   // February
    2: 1.05,   // March - Q1 budget push
    3: 1.00,   // April
    4: 1.00,   // May
    5: 0.95,   // June - summer starts
    6: 0.80,   // July - vacation season
    7: 0.75,   // August - vacation season
    8: 1.05,   // September - back to business
    9: 1.10,   // October - budget season
    10: 1.15,  // November - Q4 push
    11: 0.70   // December - holidays
  };
  
  const m = month !== null ? month : new Date().getMonth();
  return {
    adjusted: Math.round(baseAmount * SEASONALITY_FACTORS[m]),
    factor: SEASONALITY_FACTORS[m],
    impact: SEASONALITY_FACTORS[m] >= 1 ? 'positive' : 'negative'
  };
}

function calculateTrend(history) {
  if (!history.forecasts || history.forecasts.length < 3) {
    return { trend: 'insufficient_data', direction: 0, description: 'Need more data' };
  }
  
  // Get last 7 forecasts
  const recent = history.forecasts.slice(-7);
  
  // Calculate simple linear regression
  const n = recent.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recent[i].weighted;
    sumXY += i * recent[i].weighted;
    sumX2 += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const avgValue = sumY / n;
  const percentChange = (slope / avgValue) * 100;
  
  let trend, description;
  if (percentChange > 5) {
    trend = 'strong_up';
    description = `📈 Strong upward (+${percentChange.toFixed(1)}%/day)`;
  } else if (percentChange > 1) {
    trend = 'up';
    description = `📈 Growing (+${percentChange.toFixed(1)}%/day)`;
  } else if (percentChange < -5) {
    trend = 'strong_down';
    description = `📉 Declining fast (${percentChange.toFixed(1)}%/day)`;
  } else if (percentChange < -1) {
    trend = 'down';
    description = `📉 Declining (${percentChange.toFixed(1)}%/day)`;
  } else {
    trend = 'stable';
    description = `➡️ Stable`;
  }
  
  return {
    trend,
    direction: percentChange,
    description,
    dataPoints: n,
    latestValue: recent[n - 1]?.weighted || 0,
    previousValue: recent[0]?.weighted || 0
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function displayHeader() {
  console.log(`
${c.cyan}╔══════════════════════════════════════════════════════════════════════════════╗
║                    ${c.bold}💰 REVENUE PREDICTOR${c.reset}${c.cyan}                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function displayPipelineAnalysis(byStage, deals) {
  console.log(`${c.bold}═══ PIPELINE ANALYSIS ══════════════════════════════════════════════════════════${c.reset}\n`);
  console.log(`  Total Active Deals: ${c.bold}${deals.length}${c.reset}\n`);
  console.log(`  ${'Stage'.padEnd(20)} ${'Count'.padStart(6)} ${'Prob'.padStart(6)} ${'Value'.padStart(12)} ${c.green}${'Weighted'.padStart(12)}${c.reset}`);
  console.log(`  ${'─'.repeat(60)}`);
  
  const sorted = Object.entries(byStage)
    .sort((a, b) => b[1].probability - a[1].probability);
  
  for (const [stage, data] of sorted) {
    const probColor = data.probability >= 0.7 ? c.green : data.probability >= 0.4 ? c.yellow : c.dim;
    console.log(`  ${stage.padEnd(20)} ${String(data.count).padStart(6)} ${probColor}${(data.probability * 100).toFixed(0).padStart(5)}%${c.reset} $${Math.round(data.totalCommission).toLocaleString().padStart(10)} ${c.green}$${Math.round(data.weightedCommission).toLocaleString().padStart(10)}${c.reset}`);
  }
  console.log();
}

function displayForecast(totalWeighted, scenarios, interval) {
  console.log(`${c.bold}═══ REVENUE FORECAST ═══════════════════════════════════════════════════════════${c.reset}\n`);
  
  const bar = (val, max) => {
    const width = 30;
    const filled = Math.round((val / max) * width);
    return c.green + '█'.repeat(Math.min(filled, width)) + c.dim + '░'.repeat(Math.max(0, width - filled)) + c.reset;
  };
  
  const max = scenarios.optimistic;
  
  console.log(`  ${c.dim}Conservative (30% close):${c.reset}  ${bar(scenarios.conservative, max)} ${c.money('$' + Math.round(scenarios.conservative).toLocaleString())}`);
  console.log(`  ${c.yellow}Realistic (50% close):${c.reset}     ${bar(scenarios.realistic, max)} ${c.money('$' + Math.round(scenarios.realistic).toLocaleString())}`);
  console.log(`  ${c.green}Optimistic (70% close):${c.reset}    ${bar(scenarios.optimistic, max)} ${c.money('$' + Math.round(scenarios.optimistic).toLocaleString())}`);
  console.log();
  console.log(`  ${c.bold}Weighted Forecast:${c.reset}         ${c.money('$' + Math.round(totalWeighted).toLocaleString())}`);
  console.log(`  ${c.dim}95% Confidence Interval:${c.reset}   $${Math.round(interval.low).toLocaleString()} - $${Math.round(interval.high).toLocaleString()} (${interval.confidence})`);
  console.log();
}

function displayMonthlyProjection(projections) {
  console.log(`${c.bold}═══ MONTHLY PROJECTION ═════════════════════════════════════════════════════════${c.reset}\n`);
  
  const max = Math.max(...projections.map(p => p.expected));
  
  for (const proj of projections) {
    const bar = '█'.repeat(Math.round((proj.expected / max) * 20));
    const marker = proj.isCurrentMonth ? ' ◀ THIS MONTH' : '';
    console.log(`  ${proj.month.padEnd(10)} ${c.green}${bar.padEnd(20)}${c.reset} ${c.money('$' + proj.expected.toLocaleString())}${c.yellow}${marker}${c.reset}`);
  }
  console.log();
}

function displayQuarterlyForecast(quarters) {
  console.log(`${c.bold}═══ QUARTERLY FORECAST ═════════════════════════════════════════════════════════${c.reset}\n`);
  
  const max = Math.max(...quarters.map(q => q.expected));
  
  for (const q of quarters) {
    const bar = '█'.repeat(Math.round((q.expected / max) * 20));
    const marker = q.isCurrentQuarter ? ' ◀ CURRENT' : '';
    console.log(`  ${q.quarter.padEnd(10)} ${c.green}${bar.padEnd(20)}${c.reset} ${c.money('$' + q.expected.toLocaleString())}${c.yellow}${marker}${c.reset}`);
  }
  console.log();
}

function displayGapAnalysis(gap) {
  console.log(`${c.bold}═══ GAP ANALYSIS ═══════════════════════════════════════════════════════════════${c.reset}\n`);
  
  const progressBar = (pct) => {
    const width = 30;
    const filled = Math.round((Math.min(pct, 100) / 100) * width);
    const color = pct >= 100 ? c.green : pct >= 70 ? c.yellow : c.red;
    return color + '█'.repeat(filled) + c.dim + '░'.repeat(width - filled) + c.reset;
  };
  
  console.log(`  Monthly Goal:     ${c.money('$' + gap.goal.toLocaleString())}`);
  console.log(`  Current Forecast: ${c.money('$' + Math.round(gap.forecast).toLocaleString())}`);
  console.log(`  Progress:         ${progressBar(gap.percentage)} ${gap.percentage}%`);
  console.log();
  
  if (gap.onTrack) {
    console.log(`  ${c.success('✅ ON TRACK!')} Projected to exceed goal by $${Math.round(Math.abs(gap.gap)).toLocaleString()}`);
  } else {
    console.log(`  ${c.error('⚠️  GAP: $' + Math.round(gap.gap).toLocaleString())} needed to hit goal`);
    console.log(`  ${c.dim}To close gap: ~${gap.dealsNeeded} deals or ${gap.pipelineNeeded}+ new prospects${c.reset}`);
  }
  console.log();
}

function displayDeals(deals) {
  console.log(`${c.bold}═══ DEALS IN FORECAST ══════════════════════════════════════════════════════════${c.reset}\n`);
  
  if (deals.length === 0) {
    console.log(`  ${c.dim}No active deals found${c.reset}\n`);
    return;
  }
  
  console.log(`  ${'Company'.padEnd(25)} ${'Stage'.padEnd(15)} ${'Value'.padStart(10)} ${'Weighted'.padStart(10)}`);
  console.log(`  ${'─'.repeat(65)}`);
  
  const sorted = [...deals]
    .sort((a, b) => getStageProbability(b.stage || b.status) - getStageProbability(a.stage || a.status))
    .slice(0, 20);
  
  for (const deal of sorted) {
    const value = deal.value || deal.potential || deal.dealValue || CONFIG.avgDealSize;
    const stage = normalizeStage(deal.stage || deal.status);
    const prob = getStageProbability(stage);
    const commission = value * (deal.rate || CONFIG.defaultCommissionRate);
    const weighted = commission * prob;
    const name = (deal.company || deal.name || 'Unknown').substring(0, 24);
    
    console.log(`  ${name.padEnd(25)} ${stage.padEnd(15)} $${Math.round(commission).toLocaleString().padStart(9)} ${c.green}$${Math.round(weighted).toLocaleString().padStart(9)}${c.reset}`);
  }
  
  if (deals.length > 20) {
    console.log(`  ${c.dim}... and ${deals.length - 20} more${c.reset}`);
  }
  console.log();
}

function displayRecommendations(recs) {
  console.log(`${c.bold}═══ ACTION RECOMMENDATIONS ═════════════════════════════════════════════════════${c.reset}\n`);
  
  if (recs.length === 0) {
    console.log(`  ${c.success('✅ Pipeline looking healthy!')}`);
    console.log();
    return;
  }
  
  for (const rec of recs.slice(0, 5)) {
    const priorityColor = rec.priority === 1 ? c.red : rec.priority === 2 ? c.yellow : c.dim;
    console.log(`  ${rec.icon} ${priorityColor}[P${rec.priority}]${c.reset} ${c.bold}${rec.action}${c.reset}`);
    console.log(`     ${c.dim}${rec.detail}${c.reset}`);
    console.log();
  }
}

function displayHistoricalAccuracy(history) {
  console.log(`${c.bold}═══ HISTORICAL ACCURACY ════════════════════════════════════════════════════════${c.reset}\n`);
  
  if (!history.accuracy || history.accuracy.length === 0) {
    console.log(`  ${c.dim}No historical data yet. Forecasts will be tracked automatically.${c.reset}\n`);
    return;
  }
  
  const avgAccuracy = history.accuracy.reduce((sum, a) => sum + a.accuracy, 0) / history.accuracy.length;
  
  console.log(`  Average Accuracy: ${avgAccuracy.toFixed(1)}%`);
  console.log(`  Forecasts Tracked: ${history.accuracy.length}\n`);
  
  console.log(`  ${'Month'.padEnd(12)} ${'Forecast'.padStart(10)} ${'Actual'.padStart(10)} ${'Accuracy'.padStart(10)}`);
  console.log(`  ${'─'.repeat(45)}`);
  
  for (const entry of history.accuracy.slice(-6)) {
    const accColor = entry.accuracy >= 80 ? c.green : entry.accuracy >= 60 ? c.yellow : c.red;
    console.log(`  ${entry.month.padEnd(12)} $${entry.forecast.toLocaleString().padStart(9)} $${entry.actual.toLocaleString().padStart(9)} ${accColor}${entry.accuracy.toFixed(1)}%${c.reset}`);
  }
  console.log();
}

function displayTrend(trend, history) {
  console.log(`${c.bold}═══ FORECAST TREND ═════════════════════════════════════════════════════════════${c.reset}\n`);
  
  if (trend.trend === 'insufficient_data') {
    console.log(`  ${c.dim}${trend.description}${c.reset}\n`);
    return;
  }
  
  console.log(`  ${trend.description}`);
  console.log(`  Based on ${trend.dataPoints} data points\n`);
  
  // ASCII sparkline of last 7 forecasts
  if (history.forecasts && history.forecasts.length >= 3) {
    const recent = history.forecasts.slice(-7);
    const values = recent.map(f => f.weighted);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    
    const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const sparkline = values.map(v => {
      const idx = Math.floor(((v - min) / range) * 7);
      return sparkChars[Math.min(idx, 7)];
    }).join('');
    
    const trendColor = trend.direction > 0 ? c.green : trend.direction < 0 ? c.red : c.dim;
    console.log(`  7-Day Trend: ${trendColor}${sparkline}${c.reset}`);
    console.log(`  Range: $${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()}\n`);
  }
}

function displayCompare(comparison) {
  console.log(`${c.bold}═══ FORECAST COMPARISON ════════════════════════════════════════════════════════${c.reset}\n`);
  
  if (!comparison) {
    console.log(`  ${c.dim}Not enough data to compare${c.reset}\n`);
    return;
  }
  
  const changeColor = comparison.change >= 0 ? c.green : c.red;
  const changeIcon = comparison.change >= 0 ? '📈' : '📉';
  const changeSign = comparison.change >= 0 ? '+' : '';
  
  console.log(`  ${comparison.daysApart} Day Comparison:\n`);
  console.log(`  Previous (${comparison.previous.date}):  ${c.dim}$${Math.round(comparison.previous.weighted).toLocaleString()}${c.reset}`);
  console.log(`  Current  (${comparison.current.date}):  ${c.bold}$${Math.round(comparison.current.weighted).toLocaleString()}${c.reset}`);
  console.log();
  console.log(`  ${changeIcon} Change: ${changeColor}${changeSign}$${comparison.change.toLocaleString()} (${changeSign}${comparison.percentChange.toFixed(1)}%)${c.reset}`);
  console.log();
  
  // Deal count comparison
  if (comparison.current.dealCount !== undefined && comparison.previous.dealCount !== undefined) {
    const dealChange = comparison.current.dealCount - comparison.previous.dealCount;
    const dealSign = dealChange >= 0 ? '+' : '';
    console.log(`  Pipeline: ${comparison.previous.dealCount} → ${comparison.current.dealCount} deals (${dealSign}${dealChange})`);
    console.log();
  }
}

function displaySeasonality(seasonality, monthName) {
  console.log(`${c.bold}═══ SEASONALITY ADJUSTMENT ═════════════════════════════════════════════════════${c.reset}\n`);
  
  const impactColor = seasonality.impact === 'positive' ? c.green : c.yellow;
  const impactIcon = seasonality.impact === 'positive' ? '📈' : '📉';
  const factorPct = ((seasonality.factor - 1) * 100).toFixed(0);
  const factorSign = seasonality.factor >= 1 ? '+' : '';
  
  console.log(`  ${impactIcon} ${monthName} seasonality factor: ${impactColor}${factorSign}${factorPct}%${c.reset}`);
  console.log(`  Adjusted forecast: ${c.money('$' + seasonality.adjusted.toLocaleString())}`);
  console.log();
  
  // Show monthly heatmap
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const factors = [0.85, 0.95, 1.05, 1.00, 1.00, 0.95, 0.80, 0.75, 1.05, 1.10, 1.15, 0.70];
  
  console.log(`  Monthly Heatmap:`);
  let heatmap = '  ';
  for (let i = 0; i < 12; i++) {
    const f = factors[i];
    const char = f >= 1.10 ? c.green + '█' : f >= 1.0 ? c.green + '▓' : f >= 0.90 ? c.yellow + '▒' : c.red + '░';
    heatmap += char + c.reset;
  }
  console.log(heatmap);
  console.log(`  ${months.map(m => m[0]).join('')}`);
  console.log(`  ${c.green}█${c.reset}=Hot ${c.green}▓${c.reset}=Good ${c.yellow}▒${c.reset}=Slow ${c.red}░${c.reset}=Cold\n`);
}

function displayQuickSummary(totalWeighted, gap, monthlyProjection, trend = null) {
  const status = gap.onTrack ? c.success('✅') : c.error('⚠️');
  const thisMonth = monthlyProjection[0]?.expected || 0;
  console.log(`${status} Forecast: ${c.money('$' + Math.round(totalWeighted).toLocaleString())} weighted | This month: ${c.money('$' + thisMonth.toLocaleString())} | Goal: ${gap.percentage}%`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const flags = {
    quarter: args.includes('--quarter') || args.includes('-q'),
    scenario: args.includes('--scenario') || args.includes('-s'),
    gap: args.includes('--gap') || args.includes('-g'),
    deals: args.includes('--deals') || args.includes('-d'),
    history: args.includes('--history') || args.includes('-h') && !args.includes('--help'),
    trend: args.includes('--trend') || args.includes('-t'),
    seasonality: args.includes('--seasonality') || args.includes('--season'),
    compare: args.includes('--compare') || args.includes('-c'),
    record: args.includes('--record'),
    json: args.includes('--json'),
    quick: args.includes('--quick') || args.includes('--pulse'),
    help: args.includes('--help'),
    all: args.includes('--all') || args.includes('-a')
  };
  
  // Handle record actual command
  if (flags.record) {
    // gex predict --record "Jan 2026" 15000
    const recordIdx = args.indexOf('--record');
    const month = args[recordIdx + 1];
    const actual = parseFloat(args[recordIdx + 2]);
    
    if (!month || isNaN(actual)) {
      console.log(`\n${c.error('Usage:')} gex predict --record "Jan 2026" 15000\n`);
      return;
    }
    
    recordActual(month, actual);
    return;
  }
  
  if (flags.help) {
    console.log(`
${c.bold}Revenue Predictor${c.reset} - Pipeline Revenue Forecasting

${c.bold}Usage:${c.reset}
  node revenue-predict.js [options]

${c.bold}Options:${c.reset}
  --quarter, -q     Show quarterly forecast
  --scenario, -s    Show all three scenarios  
  --gap, -g         Show gap to monthly goal
  --deals, -d       List deals included in forecast
  --history, -h     Show historical accuracy
  --trend, -t       Show forecast trend over time
  --seasonality     Show seasonal adjustments
  --compare, -c     Compare to previous forecast
  --json            Output as JSON for automation
  --quick           One-line summary
  --all, -a         Show everything

${c.bold}Record Actuals:${c.reset}
  gex predict --record "Jan 2026" 15000

${c.bold}Probability Weights:${c.reset}
  Booked:           90%    Contract Sent:    85%
  Pricing Discussion: 70%  Meeting Request:  50%
  Interested:       30%    Contacted:        15%

${c.bold}Seasonality:${c.reset}
  Best months:  Oct-Nov (Q4 budget push)
  Slow months:  Jul-Aug (vacation), Dec (holidays)
`);
    return;
  }
  
  // Load data
  const localDeals = loadLocalDeals();
  const supabaseLeads = await loadSupabaseLeads();
  const commissions = loadCommissions();
  const goals = loadGoals();
  const forecastHistory = loadForecastHistory();
  
  // Combine all deals
  const allDeals = [...localDeals, ...supabaseLeads];
  
  // Calculate predictions
  const { totalWeighted, byStage } = calculateWeightedRevenue(allDeals);
  const scenarios = calculateScenarios(allDeals);
  const monthlyProjection = calculateMonthlyProjection(allDeals, totalWeighted);
  const quarterlyForecast = calculateQuarterlyForecast(allDeals, totalWeighted);
  const monthlyGoal = goals.goals?.revenue?.target || CONFIG.monthlyGoal;
  const gapAnalysis = calculateGap(monthlyProjection[0]?.expected || 0, monthlyGoal);
  const recommendations = generateRecommendations(gapAnalysis, byStage, allDeals);
  const confidenceInterval = calculateConfidenceInterval(totalWeighted, allDeals.length);
  
  // Save this forecast to history
  const today = new Date().toISOString().split('T')[0];
  forecastHistory.forecasts.push({
    date: today,
    weighted: totalWeighted,
    conservative: scenarios.conservative,
    realistic: scenarios.realistic,
    optimistic: scenarios.optimistic,
    dealCount: allDeals.length
  });
  // Keep last 90 days
  forecastHistory.forecasts = forecastHistory.forecasts.slice(-90);
  saveForecastHistory(forecastHistory);
  
  // Calculate additional features (needed for JSON and display)
  const trend = calculateTrend(forecastHistory);
  const seasonality = applySeasonality(monthlyProjection[0]?.expected || totalWeighted);
  const monthName = new Date().toLocaleString('default', { month: 'long' });
  
  // JSON output mode
  if (flags.json) {
    const output = {
      timestamp: new Date().toISOString(),
      pipeline: {
        totalDeals: allDeals.length,
        byStage
      },
      forecast: {
        weighted: Math.round(totalWeighted),
        conservative: Math.round(scenarios.conservative),
        realistic: Math.round(scenarios.realistic),
        optimistic: Math.round(scenarios.optimistic),
        confidenceInterval: {
          low: confidenceInterval.low,
          high: confidenceInterval.high,
          confidence: confidenceInterval.confidence
        }
      },
      monthly: monthlyProjection,
      quarterly: quarterlyForecast,
      gap: gapAnalysis,
      trend: {
        direction: trend.trend,
        percentChange: trend.direction,
        dataPoints: trend.dataPoints
      },
      seasonality: {
        month: monthName,
        factor: seasonality.factor,
        adjusted: seasonality.adjusted,
        impact: seasonality.impact
      },
      recommendations: recommendations.slice(0, 5)
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  // Quick mode
  if (flags.quick) {
    displayQuickSummary(totalWeighted, gapAnalysis, monthlyProjection, trend);
    return;
  }
  
  // Display
  displayHeader();
  
  // Default or --all shows everything
  const showAll = flags.all || (!flags.quarter && !flags.scenario && !flags.gap && !flags.deals && !flags.history && !flags.trend && !flags.seasonality);
  
  if (showAll || flags.scenario) {
    displayPipelineAnalysis(byStage, allDeals);
    displayForecast(totalWeighted, scenarios, confidenceInterval);
  }
  
  if (showAll) {
    displayMonthlyProjection(monthlyProjection);
  }
  
  if (flags.quarter) {
    displayQuarterlyForecast(quarterlyForecast);
  }
  
  if (showAll || flags.gap) {
    displayGapAnalysis(gapAnalysis);
  }
  
  if (flags.trend || flags.all) {
    displayTrend(trend, forecastHistory);
  }
  
  if (flags.compare) {
    const comparison = compareForecasts(forecastHistory, 7);
    displayCompare(comparison);
  }
  
  if (flags.seasonality || flags.all) {
    displaySeasonality(seasonality, monthName);
  }
  
  if (flags.deals) {
    displayDeals(allDeals);
  }
  
  if (flags.history) {
    displayHistoricalAccuracy(forecastHistory);
  }
  
  if (showAll) {
    displayRecommendations(recommendations);
  }
  
  // Footer
  console.log(`${c.dim}═══════════════════════════════════════════════════════════════════════════════
Generated: ${new Date().toISOString()} | BY Influence Company
═══════════════════════════════════════════════════════════════════════════════${c.reset}
`);
}

main().catch(console.error);
