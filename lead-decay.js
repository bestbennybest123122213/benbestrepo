#!/usr/bin/env node
/**
 * Lead Decay Visualizer - Show how lead value degrades over time
 * 
 * Motivate faster response by visualizing the cost of delays.
 * 
 * Usage:
 *   gex decay              # Full decay analysis
 *   gex decay --quick      # One-line summary
 *   gex decay --cost       # Focus on lost value
 *   gex decay --top10      # Top 10 aging leads breakdown
 *   gex decay --trend      # Weekly decay trend
 *   gex decay --tg         # Telegram format output
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
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
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const c = {
  error: (s) => `${COLORS.red}${s}${COLORS.reset}`,
  success: (s) => `${COLORS.green}${s}${COLORS.reset}`,
  warn: (s) => `${COLORS.yellow}${s}${COLORS.reset}`,
  info: (s) => `${COLORS.cyan}${s}${COLORS.reset}`,
  bold: (s) => `${COLORS.bold}${s}${COLORS.reset}`,
  dim: (s) => `${COLORS.dim}${s}${COLORS.reset}`,
  fire: (s) => `${COLORS.bgRed}${COLORS.white}${COLORS.bold}${s}${COLORS.reset}`
};

// Decay curve: exponential decay model
// Day 0: 100%, Day 7: 50%, Day 14: 25%, Day 30: 5%
// Using: value = 100 * e^(-k * days) where k ≈ 0.099 gives ~50% at day 7
const DECAY_CONSTANT = 0.099;

// Business constants
const AVG_DEAL_VALUE = 25000;  // Average deal in USD
const COMMISSION_RATE = 0.30;  // 30% commission
const CLOSE_RATE_FRESH = 0.60; // 60% close rate on fresh leads
const CLOSE_RATE_STALE = 0.10; // 10% close rate on 7+ day leads

// ═══════════════════════════════════════════════════════════════════════════
// DECAY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate lead value remaining (0-100%)
 */
function getDecayValue(days) {
  if (days <= 0) return 100;
  return Math.max(5, Math.round(100 * Math.exp(-DECAY_CONSTANT * days)));
}

/**
 * Calculate dollar value lost due to delay
 */
function calculateLostValue(lead, daysOld) {
  const currentValue = getDecayValue(daysOld) / 100;
  const fullPotential = AVG_DEAL_VALUE * COMMISSION_RATE * CLOSE_RATE_FRESH;
  const currentPotential = AVG_DEAL_VALUE * COMMISSION_RATE * currentValue * CLOSE_RATE_FRESH;
  return Math.round(fullPotential - currentPotential);
}

/**
 * Get decay rate (dollars lost per hour)
 */
function getHourlyDecayRate(daysOld) {
  const v1 = getDecayValue(daysOld);
  const v2 = getDecayValue(daysOld + 1/24); // 1 hour later
  const hourlyLoss = (v1 - v2) / 100 * AVG_DEAL_VALUE * COMMISSION_RATE * CLOSE_RATE_FRESH;
  return Math.max(0, hourlyLoss);
}

// ═══════════════════════════════════════════════════════════════════════════
// ASCII CHART RENDERING
// ═══════════════════════════════════════════════════════════════════════════

function renderDecayCurve(leads) {
  const width = 60;
  const height = 12;
  const chart = [];
  
  // Create empty chart grid
  for (let y = 0; y < height; y++) {
    chart.push(new Array(width).fill(' '));
  }
  
  // Draw decay curve
  for (let x = 0; x < width; x++) {
    const day = Math.round(x * 30 / width); // 0-30 day range
    const value = getDecayValue(day);
    const y = height - 1 - Math.round((value / 100) * (height - 1));
    if (y >= 0 && y < height) {
      chart[y][x] = '─';
    }
  }
  
  // Plot lead positions on curve
  const leadPositions = {};
  for (const lead of leads) {
    const age = getLeadAge(lead);
    if (age >= 0 && age <= 30) {
      const x = Math.round(age * width / 30);
      if (x < width) {
        leadPositions[x] = (leadPositions[x] || 0) + 1;
      }
    }
  }
  
  // Add lead markers
  for (const [xStr, count] of Object.entries(leadPositions)) {
    const x = parseInt(xStr);
    const day = Math.round(x * 30 / width);
    const value = getDecayValue(day);
    const y = height - 1 - Math.round((value / 100) * (height - 1));
    if (y >= 0 && y < height) {
      const marker = count > 9 ? '+' : count.toString();
      chart[y][x] = count > 3 ? c.fire(marker) : (count > 1 ? c.warn(marker) : c.success(marker));
    }
  }
  
  // Build output
  let output = [];
  output.push(c.bold('\n📉 LEAD VALUE DECAY CURVE'));
  output.push(c.dim('    Numbers show lead count at that age'));
  output.push('');
  
  // Y-axis labels and chart
  const yLabels = ['100%', ' 75%', ' 50%', ' 25%', '  0%'];
  for (let y = 0; y < height; y++) {
    let label = '    ';
    if (y === 0) label = yLabels[0];
    else if (y === Math.round(height * 0.25)) label = yLabels[1];
    else if (y === Math.round(height * 0.50)) label = yLabels[2];
    else if (y === Math.round(height * 0.75)) label = yLabels[3];
    else if (y === height - 1) label = yLabels[4];
    
    output.push(`${c.dim(label)} │${chart[y].join('')}│`);
  }
  
  // X-axis
  output.push(`${c.dim('     ')}└${'─'.repeat(width)}┘`);
  output.push(`${c.dim('      Day 0')}${' '.repeat(width/2 - 10)}${c.dim('Day 15')}${' '.repeat(width/2 - 12)}${c.dim('Day 30')}`);
  
  // Legend
  output.push('');
  output.push(`  ${c.dim('Legend:')} ${c.success('●')} Fresh  ${c.warn('●')} Aging  ${c.fire(' ● ')} Critical`);
  
  return output.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD DATA HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getLeadAge(lead) {
  const responseDate = lead.conversation_date || lead.lead_response_at || lead.created_at;
  if (!responseDate) return 999;
  const date = new Date(responseDate);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function getLeadName(lead) {
  return lead.name || lead.email?.split('@')[0] || 'Unknown';
}

function getLeadCompany(lead) {
  return lead.company || lead.email?.split('@')[1]?.split('.')[0] || 'Unknown';
}

async function fetchLeads() {
  const client = initSupabase();
  if (!client) {
    console.error(c.error('❌ Database connection failed'));
    return [];
  }
  
  const { data, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .not('status', 'eq', 'Booked')
    .not('status', 'eq', 'Lost')
    .order('conversation_date', { ascending: true });
  
  if (error) {
    console.error(c.error(`❌ Query failed: ${error.message}`));
    return [];
  }
  
  return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISPLAY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function showFullDecay(leads) {
  console.log('\n' + '═'.repeat(70));
  console.log(c.bold('  🔥 LEAD DECAY VISUALIZER - Stop Burning Money'));
  console.log('═'.repeat(70));
  
  // Calculate statistics
  const stats = calculateStats(leads);
  
  // 1. Decay curve
  console.log(renderDecayCurve(leads));
  
  // 2. Key metrics box
  console.log('\n' + c.bold('📊 DECAY STATISTICS'));
  console.log('┌' + '─'.repeat(48) + '┐');
  console.log(`│ Total Active Leads:      ${stats.total.toString().padStart(20)} │`);
  console.log(`│ Fresh (0-2 days):        ${c.success(stats.fresh.toString().padStart(20))} │`);
  console.log(`│ Aging (3-7 days):        ${c.warn(stats.aging.toString().padStart(20))} │`);
  console.log(`│ Critical (7+ days):      ${c.error(stats.critical.toString().padStart(20))} │`);
  console.log(`│ Average Lead Age:        ${stats.avgAge.toFixed(1).padStart(18)} days │`);
  console.log('└' + '─'.repeat(48) + '┘');
  
  // 3. Lost value calculator
  console.log('\n' + c.bold('💸 LOST VALUE THIS WEEK'));
  console.log('┌' + '─'.repeat(48) + '┐');
  console.log(`│ Leads aged 7+ days:      ${stats.critical.toString().padStart(20)} │`);
  console.log(`│ Est. value lost:         ${c.error('$' + stats.lostValue.toLocaleString()).padStart(20)} │`);
  console.log(`│ If closed fresh:         ${c.success('$' + stats.potentialValue.toLocaleString()).padStart(20)} │`);
  console.log(`│ Difference:              ${c.warn('$' + (stats.potentialValue - stats.currentValue).toLocaleString()).padStart(20)} │`);
  console.log('└' + '─'.repeat(48) + '┘');
  
  // 4. Response time comparison
  console.log('\n' + c.bold('⚡ RESPONSE TIME IMPACT'));
  showComparisonStats(leads);
  
  // 5. Urgency indicator
  console.log('\n' + c.bold('🚨 REAL-TIME URGENCY'));
  showUrgencyIndicator(stats);
  
  console.log('\n' + '═'.repeat(70));
}

function calculateStats(leads) {
  const now = Date.now();
  let totalAge = 0;
  let lostValue = 0;
  let potentialValue = 0;
  let currentValue = 0;
  
  const stats = {
    total: leads.length,
    fresh: 0,
    aging: 0,
    critical: 0,
    avgAge: 0,
    lostValue: 0,
    potentialValue: 0,
    currentValue: 0,
    hourlyBurn: 0
  };
  
  for (const lead of leads) {
    const age = getLeadAge(lead);
    totalAge += age;
    
    if (age <= 2) stats.fresh++;
    else if (age <= 7) stats.aging++;
    else stats.critical++;
    
    // Calculate values
    const fullPotential = AVG_DEAL_VALUE * COMMISSION_RATE * CLOSE_RATE_FRESH;
    const currentPotential = fullPotential * (getDecayValue(age) / 100);
    
    potentialValue += fullPotential;
    currentValue += currentPotential;
    lostValue += calculateLostValue(lead, age);
    
    // Add to hourly burn
    stats.hourlyBurn += getHourlyDecayRate(age);
  }
  
  stats.avgAge = leads.length > 0 ? totalAge / leads.length : 0;
  stats.lostValue = Math.round(lostValue);
  stats.potentialValue = Math.round(potentialValue);
  stats.currentValue = Math.round(currentValue);
  
  return stats;
}

function showComparisonStats(leads) {
  // Simulated comparison (in real scenario, would track historical close rates)
  console.log('┌' + '─'.repeat(58) + '┐');
  console.log(`│ ${c.bold('Response Time')}        ${c.bold('Est. Close Rate')}      ${c.bold('Difference')}    │`);
  console.log('├' + '─'.repeat(58) + '┤');
  console.log(`│ < 24 hours            ${c.success('60%')}                  ━━━━━━━━━━   │`);
  console.log(`│ 1-3 days              ${c.warn('45%')}                  ━━━━━━━      │`);
  console.log(`│ 3-7 days              ${c.warn('25%')}                  ━━━━         │`);
  console.log(`│ > 7 days              ${c.error('10%')}                  ━            │`);
  console.log('└' + '─'.repeat(58) + '┘');
  console.log(`${c.dim('  ⚠️  Every day delay = ~8% drop in conversion probability')}`);
}

function showUrgencyIndicator(stats) {
  const hourlyBurn = Math.round(stats.hourlyBurn);
  const dailyBurn = hourlyBurn * 24;
  
  console.log('┌' + '─'.repeat(58) + '┐');
  
  if (stats.critical > 0) {
    console.log(`│ ${c.fire(' 🔥 VALUE BURNING RIGHT NOW 🔥 ')}                         │`);
    console.log(`│                                                          │`);
    console.log(`│   ${stats.critical} leads are losing $${hourlyBurn}/hour in value             │`);
    console.log(`│   That's $${dailyBurn}/day evaporating                        │`);
    console.log(`│                                                          │`);
    console.log(`│   ${c.bold('⏰ ACT NOW to recover:')} $${stats.currentValue.toLocaleString()} still on the table     │`);
  } else if (stats.aging > 0) {
    console.log(`│ ${c.warn('⚠️  AGING LEADS DETECTED')}                                 │`);
    console.log(`│   ${stats.aging} leads entering decay zone                        │`);
    console.log(`│   ${c.success('Respond today to maximize value')}                       │`);
  } else {
    console.log(`│ ${c.success('✅ ALL LEADS FRESH!')}                                       │`);
    console.log(`│   Great job! Keep response times under 24 hours          │`);
  }
  
  console.log('└' + '─'.repeat(58) + '┘');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK MODE
// ═══════════════════════════════════════════════════════════════════════════

async function showQuick(leads) {
  const stats = calculateStats(leads);
  const hourlyBurn = Math.round(stats.hourlyBurn);
  
  // One-line output
  let status = '';
  if (stats.critical > 0) {
    status = c.error(`🔥 ${stats.critical} critical`);
  } else if (stats.aging > 0) {
    status = c.warn(`⚠️ ${stats.aging} aging`);
  } else {
    status = c.success('✅ All fresh');
  }
  
  console.log(`📉 ${stats.total} leads | ${status} | Lost: $${stats.lostValue.toLocaleString()} | Burning: $${hourlyBurn}/hr`);
}

// ═══════════════════════════════════════════════════════════════════════════
// COST MODE
// ═══════════════════════════════════════════════════════════════════════════

async function showCost(leads) {
  const stats = calculateStats(leads);
  
  console.log('\n' + c.bold('💰 LEAD DECAY COST ANALYSIS'));
  console.log('═'.repeat(60));
  
  // Big number display
  console.log('\n' + c.bold('This week you lost:'));
  console.log(`\n   ${c.fire(' $' + stats.lostValue.toLocaleString() + ' ')} in lead value due to delays\n`);
  
  // Breakdown
  console.log(c.dim('Breakdown:'));
  console.log(`  • ${stats.critical} leads aged 7+ days`);
  console.log(`  • Each day delay = ~8% value drop`);
  console.log(`  • Avg deal: $${AVG_DEAL_VALUE.toLocaleString()} × ${(COMMISSION_RATE * 100).toFixed(0)}% commission`);
  
  console.log('\n' + c.bold('If you had responded same-day:'));
  console.log(`  • Potential value: ${c.success('$' + stats.potentialValue.toLocaleString())}`);
  console.log(`  • Current value:   ${c.warn('$' + stats.currentValue.toLocaleString())}`);
  console.log(`  • Value lost:      ${c.error('$' + (stats.potentialValue - stats.currentValue).toLocaleString())}`);
  
  console.log('\n' + c.bold('Right now:'));
  const hourlyBurn = Math.round(stats.hourlyBurn);
  console.log(`  • ${c.error(stats.critical + ' leads')} are losing ${c.error('$' + hourlyBurn + '/hour')}`);
  console.log(`  • That's ${c.error('$' + (hourlyBurn * 24).toLocaleString() + '/day')} vanishing`);
  
  console.log('\n' + '═'.repeat(60));
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP 10 AGING LEADS
// ═══════════════════════════════════════════════════════════════════════════

async function showTop10(leads) {
  console.log('\n' + c.bold('🔟 TOP 10 AGING LEADS - Highest Value at Risk'));
  console.log('═'.repeat(75));
  
  // Sort by age (oldest first)
  const sorted = [...leads]
    .map(l => ({
      ...l,
      age: getLeadAge(l),
      value: getDecayValue(getLeadAge(l)),
      lost: calculateLostValue(l, getLeadAge(l)),
      hourlyBurn: getHourlyDecayRate(getLeadAge(l))
    }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 10);
  
  console.log(`\n${'#'.padEnd(3)} ${'Lead'.padEnd(20)} ${'Company'.padEnd(15)} ${'Age'.padEnd(8)} ${'Value'.padEnd(8)} ${'Lost'.padEnd(10)} Status`);
  console.log('─'.repeat(75));
  
  for (let i = 0; i < sorted.length; i++) {
    const lead = sorted[i];
    const num = (i + 1).toString().padEnd(3);
    const name = getLeadName(lead).slice(0, 18).padEnd(20);
    const company = getLeadCompany(lead).slice(0, 13).padEnd(15);
    const age = (lead.age + 'd').padEnd(8);
    const value = (lead.value + '%').padEnd(8);
    const lost = ('$' + lead.lost.toLocaleString()).padEnd(10);
    
    let status = '';
    if (lead.age > 14) status = c.error('🔥 CRITICAL');
    else if (lead.age > 7) status = c.warn('⚠️ URGENT');
    else status = c.info('📋 AGING');
    
    console.log(`${num} ${name} ${company} ${c.dim(age)} ${lead.value < 30 ? c.error(value) : c.warn(value)} ${c.error(lost)} ${status}`);
  }
  
  // Summary
  const totalLost = sorted.reduce((sum, l) => sum + l.lost, 0);
  console.log('─'.repeat(75));
  console.log(`${c.bold('Total lost in top 10:')} ${c.error('$' + totalLost.toLocaleString())}`);
  console.log(`${c.bold('Action:')} Respond to these leads TODAY to recover remaining value`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY TREND
// ═══════════════════════════════════════════════════════════════════════════

async function showTrend(leads) {
  console.log('\n' + c.bold('📈 WEEKLY DECAY TREND - Are We Getting Faster?'));
  console.log('═'.repeat(65));
  
  // Group leads by week
  const weeks = {};
  const now = new Date();
  
  for (const lead of leads) {
    const age = getLeadAge(lead);
    const leadDate = new Date(lead.conversation_date || lead.created_at);
    const weekNum = Math.floor((now - leadDate) / (7 * 24 * 60 * 60 * 1000));
    const weekKey = weekNum <= 0 ? 'This Week' : 
                    weekNum === 1 ? 'Last Week' : 
                    `${weekNum} Weeks Ago`;
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = { leads: [], totalAge: 0, count: 0 };
    }
    weeks[weekKey].leads.push(lead);
    weeks[weekKey].totalAge += age;
    weeks[weekKey].count++;
  }
  
  console.log(`\n${'Week'.padEnd(15)} ${'Leads'.padEnd(8)} ${'Avg Age'.padEnd(10)} ${'Trend'.padEnd(20)} Health`);
  console.log('─'.repeat(65));
  
  const weekKeys = ['This Week', 'Last Week', '2 Weeks Ago', '3 Weeks Ago'];
  let prevAvg = null;
  
  for (const week of weekKeys) {
    if (!weeks[week]) continue;
    
    const data = weeks[week];
    const avgAge = data.count > 0 ? data.totalAge / data.count : 0;
    
    let trend = '';
    let trendEmoji = '';
    if (prevAvg !== null) {
      const diff = avgAge - prevAvg;
      if (diff < -1) {
        trendEmoji = c.success('↓ Improving');
      } else if (diff > 1) {
        trendEmoji = c.error('↑ Slowing');
      } else {
        trendEmoji = c.dim('→ Steady');
      }
    } else {
      trendEmoji = c.dim('─ Baseline');
    }
    
    const health = avgAge < 3 ? c.success('🟢 Excellent') :
                   avgAge < 7 ? c.warn('🟡 Good') :
                   c.error('🔴 Poor');
    
    console.log(`${week.padEnd(15)} ${data.count.toString().padEnd(8)} ${avgAge.toFixed(1).padEnd(10)} ${trendEmoji.padEnd(20)} ${health}`);
    prevAvg = avgAge;
  }
  
  console.log('─'.repeat(65));
  console.log(c.dim('Goal: Keep average lead age under 3 days for maximum value'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM FORMAT
// ═══════════════════════════════════════════════════════════════════════════

async function showTelegram(leads) {
  const stats = calculateStats(leads);
  const hourlyBurn = Math.round(stats.hourlyBurn);
  
  let output = [];
  output.push('📉 *LEAD DECAY REPORT*');
  output.push('');
  output.push('*Pipeline Status:*');
  output.push(`• Total: ${stats.total} leads`);
  output.push(`• Fresh: ${stats.fresh} ✅`);
  output.push(`• Aging: ${stats.aging} ⚠️`);
  output.push(`• Critical: ${stats.critical} 🔥`);
  output.push('');
  output.push('*Value at Risk:*');
  output.push(`• Lost this week: *$${stats.lostValue.toLocaleString()}*`);
  output.push(`• Burning now: $${hourlyBurn}/hr`);
  output.push(`• Still recoverable: $${stats.currentValue.toLocaleString()}`);
  output.push('');
  
  if (stats.critical > 0) {
    output.push('🚨 *ACTION NEEDED*: Respond to critical leads today!');
  } else if (stats.aging > 0) {
    output.push('⚡ Good status - keep responding within 24h');
  } else {
    output.push('✨ Excellent! All leads are fresh');
  }
  
  console.log(output.join('\n'));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick') || args.includes('-q');
  const isCost = args.includes('--cost') || args.includes('-c');
  const isTop10 = args.includes('--top10') || args.includes('--top');
  const isTrend = args.includes('--trend') || args.includes('-t');
  const isTelegram = args.includes('--tg') || args.includes('--telegram');
  const isHelp = args.includes('--help') || args.includes('-h');
  
  if (isHelp) {
    console.log(`
${c.bold('Lead Decay Visualizer')} - Show how lead value degrades over time

${c.bold('Usage:')}
  gex decay              Full decay analysis with chart
  gex decay --quick      One-line summary for quick check
  gex decay --cost       Focus on lost revenue
  gex decay --top10      Top 10 aging leads breakdown
  gex decay --trend      Weekly trend analysis
  gex decay --tg         Telegram-formatted output

${c.bold('Aliases:')} decay, value-loss, aging

${c.bold('How Decay Works:')}
  Day 0:  100% value (respond immediately!)
  Day 7:   50% value (half the potential gone)
  Day 14:  25% value (3/4 lost)
  Day 30:   5% value (nearly worthless)

${c.bold('Why This Matters:')}
  Fresh leads close at 60%. Stale leads close at 10%.
  Every day you wait costs ~8% of the deal's value.
`);
    return;
  }
  
  const leads = await fetchLeads();
  
  if (leads.length === 0) {
    console.log(c.warn('No active leads found'));
    return;
  }
  
  if (isQuick) {
    await showQuick(leads);
  } else if (isCost) {
    await showCost(leads);
  } else if (isTop10) {
    await showTop10(leads);
  } else if (isTrend) {
    await showTrend(leads);
  } else if (isTelegram) {
    await showTelegram(leads);
  } else {
    await showFullDecay(leads);
  }
}

main().catch(err => {
  console.error(c.error(`Error: ${err.message}`));
  process.exit(1);
});
