#!/usr/bin/env node
/**
 * Revenue Milestone Tracker & Win Celebration
 * Track and celebrate revenue milestones for BY Influence Company
 * 
 * Usage:
 *   node milestones.js                    # Dashboard of all milestones
 *   node milestones.js log 5000 "Acme"    # Log a new win
 *   node milestones.js history            # All wins over time
 *   node milestones.js streak             # Current streak and best streaks
 *   node milestones.js --month            # This month's progress
 *   node milestones.js goal 20000         # Set monthly goal
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA_DIR = path.join(__dirname, 'data');
const MILESTONES_FILE = path.join(DATA_DIR, 'milestones.json');
const COMMISSION_FILE = path.join(DATA_DIR, 'commissions.json');

// Revenue milestones to celebrate
const MILESTONE_LEVELS = [
  { amount: 10000, emoji: '🥉', label: 'Bronze', message: 'First $10K! You\'re in the game!' },
  { amount: 25000, emoji: '🥈', label: 'Silver', message: '$25K milestone! Building momentum!' },
  { amount: 50000, emoji: '🥇', label: 'Gold', message: '$50K! Half way to six figures!' },
  { amount: 75000, emoji: '💎', label: 'Diamond', message: '$75K! Crushing it!' },
  { amount: 100000, emoji: '👑', label: 'Crown', message: 'SIX FIGURES! You made it!' },
  { amount: 150000, emoji: '🚀', label: 'Rocket', message: '$150K! To the moon!' },
  { amount: 200000, emoji: '⭐', label: 'Star', message: '$200K! You\'re a star!' },
  { amount: 250000, emoji: '🌟', label: 'Superstar', message: 'Quarter million! Legend status!' },
  { amount: 500000, emoji: '💫', label: 'Galaxy', message: 'HALF MILLION! Absolutely insane!' },
  { amount: 1000000, emoji: '🏆', label: 'Millionaire', message: 'ONE MILLION DOLLARS! 🎉🎉🎉' },
];

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Data Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadMilestones() {
  try {
    if (fs.existsSync(MILESTONES_FILE)) {
      return JSON.parse(fs.readFileSync(MILESTONES_FILE, 'utf8'));
    }
  } catch (e) {}
  return { 
    wins: [], 
    lastId: 0, 
    monthlyGoal: 15000,
    quarterlyGoal: 45000,
    yearlyGoal: 180000,
    celebratedMilestones: []
  };
}

function saveMilestones(data) {
  ensureDataDir();
  fs.writeFileSync(MILESTONES_FILE, JSON.stringify(data, null, 2));
}

function loadCommissions() {
  try {
    if (fs.existsSync(COMMISSION_FILE)) {
      return JSON.parse(fs.readFileSync(COMMISSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return { commissions: [], lastId: 0 };
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ASCII Art Confetti & Celebrations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONFETTI_PARTICLES = ['★', '✦', '✧', '◆', '●', '♦', '✹', '❖', '◇', '⬟'];
const CONFETTI_COLORS = [c.yellow, c.magenta, c.cyan, c.green, c.red, c.blue];

function showConfetti(lines = 3) {
  console.log('');
  for (let i = 0; i < lines; i++) {
    let line = '  ';
    for (let j = 0; j < 15; j++) {
      const particle = CONFETTI_PARTICLES[Math.floor(Math.random() * CONFETTI_PARTICLES.length)];
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const spacing = Math.random() > 0.5 ? '  ' : '   ';
      line += `${color}${particle}${c.reset}${spacing}`;
    }
    console.log(line);
  }
  console.log('');
}

function showBigWin() {
  console.log(`
  ${c.yellow}╔════════════════════════════════════════════════════════════╗${c.reset}
  ${c.yellow}║${c.reset}   ${c.green}██╗    ██╗██╗███╗   ██╗${c.reset}    ${c.cyan}██╗${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}║${c.reset}   ${c.green}██║    ██║██║████╗  ██║${c.reset}    ${c.cyan}██║${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}║${c.reset}   ${c.green}██║ █╗ ██║██║██╔██╗ ██║${c.reset}    ${c.cyan}██║${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}║${c.reset}   ${c.green}██║███╗██║██║██║╚██╗██║${c.reset}    ${c.cyan}╚═╝${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}║${c.reset}   ${c.green}╚███╔███╔╝██║██║ ╚████║${c.reset}    ${c.cyan}██╗${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}║${c.reset}   ${c.green} ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝${c.reset}    ${c.cyan}╚═╝${c.reset}                          ${c.yellow}║${c.reset}
  ${c.yellow}╚════════════════════════════════════════════════════════════╝${c.reset}
  `);
}

function showMilestoneCelebration(milestone) {
  console.log(`
${c.yellow}  ╔═══════════════════════════════════════════════════════════════════════╗${c.reset}
${c.yellow}  ║${c.reset}                                                                       ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}      ${c.bold}${c.magenta}🎉  MILESTONE UNLOCKED!  🎉${c.reset}                                   ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}                                                                       ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}                ${milestone.emoji}  ${c.bold}${milestone.label.toUpperCase()}${c.reset}  ${milestone.emoji}                               ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}                                                                       ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}       ${c.green}${formatCurrency(milestone.amount)}${c.reset}                                                  ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}                                                                       ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}       ${c.dim}${milestone.message}${c.reset}                              ${c.yellow}║${c.reset}
${c.yellow}  ║${c.reset}                                                                       ${c.yellow}║${c.reset}
${c.yellow}  ╚═══════════════════════════════════════════════════════════════════════╝${c.reset}
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Revenue Calculations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAllWins() {
  const milestones = loadMilestones();
  const commissions = loadCommissions();
  
  // Combine wins from both sources
  const allWins = [];
  
  // Add milestone wins
  for (const win of milestones.wins) {
    allWins.push({
      ...win,
      source: 'milestone'
    });
  }
  
  // Add commission data (as wins)
  for (const c of commissions.commissions) {
    allWins.push({
      id: `comm-${c.id}`,
      dealName: c.company,
      amount: c.commission,
      dealValue: c.dealValue,
      date: c.date,
      creator: c.creator,
      source: 'commission'
    });
  }
  
  // Sort by date
  allWins.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return allWins;
}

function getTotalRevenue(wins = null) {
  wins = wins || getAllWins();
  return wins.reduce((sum, w) => sum + w.amount, 0);
}

function getRevenueByPeriod(wins, period) {
  const now = new Date();
  return wins.filter(w => {
    const date = new Date(w.date);
    if (period === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    } else if (period === 'quarter') {
      const currentQ = Math.floor(now.getMonth() / 3);
      const winQ = Math.floor(date.getMonth() / 3);
      return winQ === currentQ && date.getFullYear() === now.getFullYear();
    } else if (period === 'year') {
      return date.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function getDaysSinceLastWin(wins) {
  if (wins.length === 0) return null;
  const lastWin = wins[wins.length - 1];
  const lastDate = new Date(lastWin.date);
  const now = new Date();
  return Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
}

function getRevenueVelocity(wins) {
  if (wins.length < 2) return null;
  
  const last90Days = wins.filter(w => {
    const date = new Date(w.date);
    const now = new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);
    return diffDays <= 90;
  });
  
  if (last90Days.length < 2) return null;
  
  const totalRevenue = last90Days.reduce((sum, w) => sum + w.amount, 0);
  const avgPerDeal = totalRevenue / last90Days.length;
  const dealsPerMonth = (last90Days.length / 90) * 30;
  
  return {
    dealsLast90Days: last90Days.length,
    revenueLast90Days: totalRevenue,
    avgPerDeal,
    dealsPerMonth: dealsPerMonth.toFixed(1),
    revenuePerMonth: avgPerDeal * dealsPerMonth
  };
}

function getNextMilestone(totalRevenue) {
  for (const milestone of MILESTONE_LEVELS) {
    if (totalRevenue < milestone.amount) {
      return milestone;
    }
  }
  return null;
}

function getCurrentMilestone(totalRevenue) {
  let current = null;
  for (const milestone of MILESTONE_LEVELS) {
    if (totalRevenue >= milestone.amount) {
      current = milestone;
    }
  }
  return current;
}

function getBestMonths(wins) {
  const byMonth = {};
  
  for (const win of wins) {
    const date = new Date(win.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) {
      byMonth[key] = { month: key, revenue: 0, deals: 0 };
    }
    byMonth[key].revenue += win.amount;
    byMonth[key].deals++;
  }
  
  return Object.values(byMonth).sort((a, b) => b.revenue - a.revenue);
}

function getLeaderboard(wins) {
  const byCreator = {};
  
  for (const win of wins) {
    const creator = win.creator || 'Unknown';
    if (!byCreator[creator]) {
      byCreator[creator] = { creator, revenue: 0, deals: 0, avgDeal: 0 };
    }
    byCreator[creator].revenue += win.amount;
    byCreator[creator].deals++;
  }
  
  // Calculate averages
  for (const key of Object.keys(byCreator)) {
    byCreator[key].avgDeal = byCreator[key].revenue / byCreator[key].deals;
  }
  
  return Object.values(byCreator).sort((a, b) => b.revenue - a.revenue);
}

function getProjectionToMilestone(wins, totalRevenue) {
  const velocity = getRevenueVelocity(wins);
  const nextMilestone = getNextMilestone(totalRevenue);
  
  if (!velocity || !nextMilestone) return null;
  
  const remaining = nextMilestone.amount - totalRevenue;
  const daysToMilestone = (remaining / velocity.revenuePerMonth) * 30;
  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + Math.ceil(daysToMilestone));
  
  return {
    milestone: nextMilestone,
    remaining,
    daysToMilestone: Math.ceil(daysToMilestone),
    projectedDate: projectedDate.toISOString().split('T')[0],
    monthlyRate: velocity.revenuePerMonth
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function progressBar(current, target, width = 30) {
  const pct = Math.min(current / target, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = pct >= 1 ? c.green : pct >= 0.7 ? c.yellow : c.red;
  return `${color}${bar}${c.reset} ${(pct * 100).toFixed(0)}%`;
}

function showDashboard() {
  const wins = getAllWins();
  const milestones = loadMilestones();
  const totalRevenue = getTotalRevenue(wins);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🏆 REVENUE MILESTONE TRACKER                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  // Current milestone status
  const currentMilestone = getCurrentMilestone(totalRevenue);
  const nextMilestone = getNextMilestone(totalRevenue);
  
  console.log(`${c.bold}📊 TOTAL REVENUE${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${c.green}${c.bold}${formatCurrency(totalRevenue)}${c.reset} earned from ${wins.length} deals`);
  
  if (currentMilestone) {
    console.log(`  Current level: ${currentMilestone.emoji} ${currentMilestone.label}`);
  }
  
  if (nextMilestone) {
    const remaining = nextMilestone.amount - totalRevenue;
    console.log(`  ${progressBar(totalRevenue, nextMilestone.amount)}`);
    console.log(`  ${c.cyan}${formatCurrency(remaining)}${c.reset} to ${nextMilestone.emoji} ${nextMilestone.label} (${formatCurrency(nextMilestone.amount)})`);
  }
  
  // Days since last win
  const daysSince = getDaysSinceLastWin(wins);
  console.log('\n' + `${c.bold}⏱️ DAYS SINCE LAST WIN${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (daysSince === null) {
    console.log(`  ${c.yellow}No wins recorded yet. Log your first win!${c.reset}`);
  } else if (daysSince === 0) {
    console.log(`  ${c.green}🔥 WON TODAY! Keep the momentum!${c.reset}`);
  } else if (daysSince <= 7) {
    console.log(`  ${c.green}${daysSince} days - Looking good!${c.reset}`);
  } else if (daysSince <= 14) {
    console.log(`  ${c.yellow}${daysSince} days - Time to close something!${c.reset}`);
  } else if (daysSince <= 30) {
    console.log(`  ${c.red}${daysSince} days - ⚠️ Pipeline needs attention!${c.reset}`);
  } else {
    console.log(`  ${c.red}${c.bold}${daysSince} days - 🚨 URGENT: Close a deal ASAP!${c.reset}`);
  }
  
  // Goal Progress
  const monthWins = getRevenueByPeriod(wins, 'month');
  const quarterWins = getRevenueByPeriod(wins, 'quarter');
  const yearWins = getRevenueByPeriod(wins, 'year');
  
  const monthRevenue = monthWins.reduce((s, w) => s + w.amount, 0);
  const quarterRevenue = quarterWins.reduce((s, w) => s + w.amount, 0);
  const yearRevenue = yearWins.reduce((s, w) => s + w.amount, 0);
  
  console.log('\n' + `${c.bold}🎯 GOAL PROGRESS${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Monthly:    ${formatCurrency(monthRevenue).padEnd(10)} / ${formatCurrency(milestones.monthlyGoal).padEnd(10)} ${progressBar(monthRevenue, milestones.monthlyGoal, 20)}`);
  console.log(`  Quarterly:  ${formatCurrency(quarterRevenue).padEnd(10)} / ${formatCurrency(milestones.quarterlyGoal).padEnd(10)} ${progressBar(quarterRevenue, milestones.quarterlyGoal, 20)}`);
  console.log(`  Yearly:     ${formatCurrency(yearRevenue).padEnd(10)} / ${formatCurrency(milestones.yearlyGoal).padEnd(10)} ${progressBar(yearRevenue, milestones.yearlyGoal, 20)}`);
  
  // Revenue velocity
  const velocity = getRevenueVelocity(wins);
  if (velocity) {
    console.log('\n' + `${c.bold}🚀 REVENUE VELOCITY (Last 90 Days)${c.reset}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Deals closed:    ${velocity.dealsLast90Days}`);
    console.log(`  Revenue:         ${formatCurrency(velocity.revenueLast90Days)}`);
    console.log(`  Avg per deal:    ${formatCurrency(velocity.avgPerDeal)}`);
    console.log(`  Deals/month:     ${velocity.dealsPerMonth}`);
    console.log(`  Projected/month: ${formatCurrency(velocity.revenuePerMonth)}`);
  }
  
  // Recent wins
  console.log('\n' + `${c.bold}🏆 RECENT WINS${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const recent = wins.slice(-5).reverse();
  if (recent.length === 0) {
    console.log(`  ${c.dim}No wins yet. Log your first with: gex wins log 5000 "Company Name"${c.reset}`);
  } else {
    for (const win of recent) {
      const date = formatDate(win.date);
      const name = (win.dealName || win.company || 'Unknown').substring(0, 25).padEnd(25);
      console.log(`  ${date.padEnd(14)} ${name} ${c.green}${formatCurrency(win.amount).padStart(10)}${c.reset}`);
    }
  }
  
  // Milestones achieved
  console.log('\n' + `${c.bold}🎖️ MILESTONES ACHIEVED${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let achievedAny = false;
  for (const milestone of MILESTONE_LEVELS) {
    if (totalRevenue >= milestone.amount) {
      console.log(`  ${milestone.emoji} ${milestone.label.padEnd(12)} ${formatCurrency(milestone.amount).padStart(10)} ✓`);
      achievedAny = true;
    }
  }
  
  if (!achievedAny) {
    console.log(`  ${c.dim}No milestones achieved yet. Keep pushing!${c.reset}`);
  }
  
  console.log('');
}

function showMonthView() {
  const wins = getAllWins();
  const milestones = loadMilestones();
  const monthWins = getRevenueByPeriod(wins, 'month');
  const monthRevenue = monthWins.reduce((s, w) => s + w.amount, 0);
  
  const now = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  📅 ${monthName.toUpperCase().padEnd(66)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`${c.bold}Monthly Goal Progress${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${progressBar(monthRevenue, milestones.monthlyGoal, 40)}`);
  console.log(`  ${c.green}${formatCurrency(monthRevenue)}${c.reset} / ${formatCurrency(milestones.monthlyGoal)} goal`);
  
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const dailyTarget = (milestones.monthlyGoal - monthRevenue) / Math.max(daysRemaining, 1);
  
  console.log(`\n  ${c.cyan}Days remaining: ${daysRemaining}${c.reset}`);
  if (monthRevenue < milestones.monthlyGoal) {
    console.log(`  ${c.yellow}Need ${formatCurrency(dailyTarget)}/day to hit goal${c.reset}`);
  } else {
    console.log(`  ${c.green}🎉 Goal achieved! ${formatCurrency(monthRevenue - milestones.monthlyGoal)} surplus!${c.reset}`);
  }
  
  console.log(`\n${c.bold}This Month's Wins (${monthWins.length})${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (monthWins.length === 0) {
    console.log(`  ${c.dim}No wins this month yet${c.reset}`);
  } else {
    for (const win of monthWins) {
      const date = formatDate(win.date);
      const name = (win.dealName || 'Unknown').substring(0, 30).padEnd(30);
      console.log(`  ${date.padEnd(14)} ${name} ${c.green}${formatCurrency(win.amount).padStart(10)}${c.reset}`);
    }
  }
  
  console.log('');
}

function showHistory() {
  const wins = getAllWins();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📜 WIN HISTORY                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (wins.length === 0) {
    console.log(`  ${c.dim}No wins recorded yet${c.reset}\n`);
    return;
  }
  
  // Group by month
  const byMonth = {};
  for (const win of wins) {
    const date = new Date(win.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) {
      byMonth[key] = [];
    }
    byMonth[key].push(win);
  }
  
  const sortedMonths = Object.keys(byMonth).sort().reverse();
  
  for (const month of sortedMonths) {
    const monthDate = new Date(month + '-01');
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthWins = byMonth[month];
    const monthTotal = monthWins.reduce((s, w) => s + w.amount, 0);
    
    console.log(`${c.bold}${monthName}${c.reset} - ${c.green}${formatCurrency(monthTotal)}${c.reset} (${monthWins.length} deals)`);
    console.log('─'.repeat(70));
    
    for (const win of monthWins.reverse()) {
      const date = new Date(win.date).toLocaleDateString('en-US', { day: 'numeric' });
      const name = (win.dealName || 'Unknown').substring(0, 35).padEnd(35);
      const creator = (win.creator || '').substring(0, 12).padEnd(12);
      console.log(`  ${date.padStart(2)}  ${name} ${c.dim}${creator}${c.reset} ${c.green}${formatCurrency(win.amount).padStart(10)}${c.reset}`);
    }
    console.log('');
  }
}

function showStreak() {
  const wins = getAllWins();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔥 WIN STREAKS                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (wins.length === 0) {
    console.log(`  ${c.dim}No wins recorded yet${c.reset}\n`);
    return;
  }
  
  // Calculate winning months streak
  const byMonth = getBestMonths(wins);
  
  // Current streak (consecutive months with wins)
  let currentStreak = 0;
  const now = new Date();
  let checkMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  for (let i = 0; i < 24; i++) {
    const key = `${checkMonth.getFullYear()}-${String(checkMonth.getMonth() + 1).padStart(2, '0')}`;
    if (byMonth.find(m => m.month === key)) {
      currentStreak++;
      checkMonth.setMonth(checkMonth.getMonth() - 1);
    } else {
      break;
    }
  }
  
  console.log(`${c.bold}Current Win Streak${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${currentStreak > 0 ? '🔥'.repeat(Math.min(currentStreak, 6)) : '❄️'} ${currentStreak} consecutive months with wins`);
  
  // Days since last win
  const daysSince = getDaysSinceLastWin(wins);
  if (daysSince !== null) {
    console.log(`  Last win: ${daysSince === 0 ? 'Today!' : `${daysSince} days ago`}`);
  }
  
  // Best months
  console.log(`\n${c.bold}🏆 Best Months (Top 5)${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const topMonths = byMonth.slice(0, 5);
  for (let i = 0; i < topMonths.length; i++) {
    const m = topMonths[i];
    const monthDate = new Date(m.month + '-01');
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`  ${medal} ${monthName.padEnd(20)} ${c.green}${formatCurrency(m.revenue).padStart(10)}${c.reset} (${m.deals} deals)`);
  }
  
  // Total stats
  const totalRevenue = getTotalRevenue(wins);
  const avgPerMonth = byMonth.length > 0 ? totalRevenue / byMonth.length : 0;
  
  console.log(`\n${c.bold}📊 Overall Stats${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total deals:      ${wins.length}`);
  console.log(`  Active months:    ${byMonth.length}`);
  console.log(`  Avg per month:    ${formatCurrency(avgPerMonth)}`);
  console.log(`  Total revenue:    ${c.green}${formatCurrency(totalRevenue)}${c.reset}`);
  console.log('');
}

function showLeaderboard() {
  const wins = getAllWins();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🏅 CREATOR LEADERBOARD                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (wins.length === 0) {
    console.log(`  ${c.dim}No wins recorded yet${c.reset}\n`);
    return;
  }
  
  const leaderboard = getLeaderboard(wins);
  const totalRevenue = getTotalRevenue(wins);
  
  console.log(`${c.bold}Revenue by Creator${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const share = ((entry.revenue / totalRevenue) * 100).toFixed(1);
    const bar = progressBar(entry.revenue, totalRevenue, 15);
    
    console.log(`\n  ${medal} ${c.bold}${entry.creator}${c.reset}`);
    console.log(`     Revenue:   ${c.green}${formatCurrency(entry.revenue).padStart(10)}${c.reset} (${share}%)`);
    console.log(`     Deals:     ${entry.deals}`);
    console.log(`     Avg/Deal:  ${formatCurrency(entry.avgDeal)}`);
    console.log(`     ${bar}`);
  }
  
  console.log('');
}

function showWallOfFame() {
  const wins = getAllWins();
  const totalRevenue = getTotalRevenue(wins);
  
  console.log('\n');
  console.log(`${c.yellow}    ╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.yellow}    ║                                                              ║${c.reset}`);
  console.log(`${c.yellow}    ║${c.reset}              ${c.bold}🏆 WALL OF FAME 🏆${c.reset}                          ${c.yellow}║${c.reset}`);
  console.log(`${c.yellow}    ║${c.reset}                                                              ${c.yellow}║${c.reset}`);
  console.log(`${c.yellow}    ╚══════════════════════════════════════════════════════════════╝${c.reset}`);
  
  // All-time total
  console.log(`\n        ${c.dim}━━━━━━━━━━━ ALL-TIME EARNINGS ━━━━━━━━━━━${c.reset}`);
  console.log(`\n              ${c.green}${c.bold}${formatCurrency(totalRevenue)}${c.reset}`);
  console.log(`              ${c.dim}from ${wins.length} legendary deals${c.reset}`);
  
  // Milestones achieved with visual
  console.log(`\n        ${c.dim}━━━━━━━━━━━ MILESTONES ACHIEVED ━━━━━━━━━━━${c.reset}\n`);
  
  let achievedCount = 0;
  for (const milestone of MILESTONE_LEVELS) {
    if (totalRevenue >= milestone.amount) {
      achievedCount++;
      console.log(`           ${milestone.emoji}  ${milestone.label.padEnd(12)} ${formatCurrency(milestone.amount).padStart(10)} ✓`);
    } else {
      console.log(`           ${c.dim}○  ${milestone.label.padEnd(12)} ${formatCurrency(milestone.amount).padStart(10)}${c.reset}`);
    }
  }
  
  // Top deals
  const topDeals = [...wins].sort((a, b) => b.amount - a.amount).slice(0, 5);
  console.log(`\n        ${c.dim}━━━━━━━━━━━ LEGENDARY DEALS ━━━━━━━━━━━${c.reset}\n`);
  
  for (let i = 0; i < topDeals.length; i++) {
    const deal = topDeals[i];
    const trophy = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐';
    const name = (deal.dealName || 'Unknown').substring(0, 20).padEnd(20);
    console.log(`           ${trophy}  ${name} ${c.green}${formatCurrency(deal.amount).padStart(10)}${c.reset}`);
  }
  
  // Projection
  const projection = getProjectionToMilestone(wins, totalRevenue);
  if (projection) {
    console.log(`\n        ${c.dim}━━━━━━━━━━━ NEXT MILESTONE ━━━━━━━━━━━${c.reset}\n`);
    console.log(`           ${projection.milestone.emoji}  ${projection.milestone.label}: ${formatCurrency(projection.milestone.amount)}`);
    console.log(`           ${c.cyan}${formatCurrency(projection.remaining)}${c.reset} remaining`);
    console.log(`           ${c.dim}Projected: ${formatDate(projection.projectedDate)} (~${projection.daysToMilestone} days)${c.reset}`);
    console.log(`           ${c.dim}At current pace of ${formatCurrency(projection.monthlyRate)}/month${c.reset}`);
  }
  
  console.log('\n');
}

function showProjection() {
  const wins = getAllWins();
  const totalRevenue = getTotalRevenue(wins);
  const projection = getProjectionToMilestone(wins, totalRevenue);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔮 MILESTONE PROJECTION                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (!projection) {
    console.log(`  ${c.dim}Not enough data to project (need at least 2 deals in last 90 days)${c.reset}\n`);
    return;
  }
  
  const currentMilestone = getCurrentMilestone(totalRevenue);
  console.log(`${c.bold}Current Status${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Revenue:  ${c.green}${formatCurrency(totalRevenue)}${c.reset}`);
  if (currentMilestone) {
    console.log(`  Current Level:  ${currentMilestone.emoji} ${currentMilestone.label}`);
  }
  
  console.log(`\n${c.bold}Next Milestone: ${projection.milestone.emoji} ${projection.milestone.label}${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Target:         ${formatCurrency(projection.milestone.amount)}`);
  console.log(`  Remaining:      ${c.cyan}${formatCurrency(projection.remaining)}${c.reset}`);
  console.log(`  ${progressBar(totalRevenue, projection.milestone.amount, 40)}`);
  
  console.log(`\n${c.bold}Projection (at current velocity)${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Monthly rate:   ${formatCurrency(projection.monthlyRate)}`);
  console.log(`  Days to reach:  ${projection.daysToMilestone}`);
  console.log(`  Projected date: ${c.green}${formatDate(projection.projectedDate)}${c.reset}`);
  
  // What-if scenarios
  console.log(`\n${c.bold}⚡ Accelerate! What if you...${c.reset}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const scenarios = [
    { multiplier: 1.5, label: 'Close 50% more deals' },
    { multiplier: 2, label: 'Double your pace' },
    { multiplier: 3, label: 'Triple your pace' },
  ];
  
  for (const scenario of scenarios) {
    const acceleratedDays = Math.ceil(projection.daysToMilestone / scenario.multiplier);
    const acceleratedDate = new Date();
    acceleratedDate.setDate(acceleratedDate.getDate() + acceleratedDays);
    console.log(`  ${scenario.label}: ${c.cyan}${acceleratedDays} days${c.reset} (${formatDate(acceleratedDate.toISOString().split('T')[0])})`);
  }
  
  console.log('');
}

function showQuickStats() {
  const wins = getAllWins();
  const milestones = loadMilestones();
  const totalRevenue = getTotalRevenue(wins);
  const daysSince = getDaysSinceLastWin(wins);
  const currentMilestone = getCurrentMilestone(totalRevenue);
  const nextMilestone = getNextMilestone(totalRevenue);
  const velocity = getRevenueVelocity(wins);
  
  // One-liner summary
  const level = currentMilestone ? `${currentMilestone.emoji} ${currentMilestone.label}` : '🆕 New';
  const daysLabel = daysSince === 0 ? '🔥TODAY' : daysSince === null ? '⏳' : `${daysSince}d`;
  const pctToNext = nextMilestone ? Math.floor((totalRevenue / nextMilestone.amount) * 100) : 100;
  
  console.log(`\n💰 ${c.green}${formatCurrency(totalRevenue)}${c.reset} | ${level} | ${daysLabel} since win | ${pctToNext}% to next`);
  
  // Monthly goal progress
  const monthWins = getRevenueByPeriod(wins, 'month');
  const monthRevenue = monthWins.reduce((s, w) => s + w.amount, 0);
  const monthPct = Math.floor((monthRevenue / milestones.monthlyGoal) * 100);
  
  console.log(`📅 Month: ${formatCurrency(monthRevenue)}/${formatCurrency(milestones.monthlyGoal)} (${monthPct}%) | ${velocity ? `${formatCurrency(velocity.revenuePerMonth)}/mo` : 'No velocity data'}`);
  console.log('');
}

function showMotivation() {
  const wins = getAllWins();
  const daysSince = getDaysSinceLastWin(wins);
  
  const motivations = {
    hot: [
      "🔥 You're on FIRE! Keep the momentum!",
      "⚡ Deals are FLOWING! This is your groove!",
      "🚀 Unstoppable! Champions keep winning!",
    ],
    warm: [
      "💪 Good rhythm! Keep those deals coming!",
      "✨ Solid pace - stay consistent!",
      "📈 Building momentum nicely!",
    ],
    cool: [
      "⏰ Pipeline check: time for some outreach!",
      "🎯 Focus time - find that next win!",
      "💼 Review your pipeline - there's gold in there!",
    ],
    cold: [
      "🚨 Time to hustle! Your next big win is waiting!",
      "⚡ URGENT: The pipeline needs your attention!",
      "💪 Dig deep - every champion has slow days. Get after it!",
      "🔥 Time to turn things around. You've done it before!",
    ]
  };
  
  let category;
  if (daysSince === null || daysSince === 0) category = 'hot';
  else if (daysSince <= 7) category = 'hot';
  else if (daysSince <= 14) category = 'warm';
  else if (daysSince <= 21) category = 'cool';
  else category = 'cold';
  
  const messages = motivations[category];
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  console.log(`\n${message}\n`);
}

function logWin(amount, dealName, creator = 'ItssIMANNN') {
  // Input validation
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log(`\n  ${c.red}Error: Invalid amount "${amount}"${c.reset}`);
    console.log(`  Amount must be a positive number.`);
    console.log(`  Example: gex wins log 5000 "Acme Corp"\n`);
    return;
  }
  
  if (!dealName || dealName.trim() === '') {
    console.log(`\n  ${c.red}Error: Deal name required${c.reset}`);
    console.log(`  Example: gex wins log ${amount} "Company Name"\n`);
    return;
  }
  
  const data = loadMilestones();
  data.lastId++;
  
  const win = {
    id: data.lastId,
    dealName: dealName.trim(),
    amount: parsedAmount,
    date: new Date().toISOString().split('T')[0],
    creator: creator.trim() || 'ItssIMANNN',
    createdAt: new Date().toISOString()
  };
  
  data.wins.push(win);
  
  // Check for new milestones
  const allWins = getAllWins();
  allWins.push(win);
  const newTotal = getTotalRevenue(allWins);
  
  let newMilestone = null;
  for (const milestone of MILESTONE_LEVELS) {
    if (newTotal >= milestone.amount && !data.celebratedMilestones.includes(milestone.amount)) {
      newMilestone = milestone;
      data.celebratedMilestones.push(milestone.amount);
    }
  }
  
  saveMilestones(data);
  
  // Celebration!
  showConfetti(2);
  showBigWin();
  
  console.log(`\n  ${c.green}${c.bold}+${formatCurrency(win.amount)}${c.reset} logged!`);
  console.log(`  Deal: ${dealName}`);
  console.log(`  Creator: ${creator}`);
  console.log(`  Date: ${formatDate(win.date)}`);
  
  if (newMilestone) {
    showConfetti(4);
    showMilestoneCelebration(newMilestone);
    showConfetti(4);
  }
  
  console.log(`\n  Total revenue: ${c.green}${formatCurrency(newTotal)}${c.reset}`);
  console.log('');
}

function setGoal(type, amount) {
  const data = loadMilestones();
  const parsedAmount = parseFloat(amount);
  
  if (type === 'monthly' || type === 'month') {
    data.monthlyGoal = parsedAmount;
    console.log(`\n  ✅ Monthly goal set to ${formatCurrency(parsedAmount)}\n`);
  } else if (type === 'quarterly' || type === 'quarter') {
    data.quarterlyGoal = parsedAmount;
    console.log(`\n  ✅ Quarterly goal set to ${formatCurrency(parsedAmount)}\n`);
  } else if (type === 'yearly' || type === 'year') {
    data.yearlyGoal = parsedAmount;
    console.log(`\n  ✅ Yearly goal set to ${formatCurrency(parsedAmount)}\n`);
  } else {
    // Default to monthly
    data.monthlyGoal = parsedAmount;
    console.log(`\n  ✅ Monthly goal set to ${formatCurrency(parsedAmount)}\n`);
  }
  
  saveMilestones(data);
}

function showHelp() {
  console.log(`
${c.bold}Revenue Milestone Tracker${c.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Track and celebrate your revenue wins!

${c.cyan}Usage:${c.reset}
  gex milestones                      Dashboard of all milestones
  gex milestones log <amt> "<name>"   Log a new win
  gex milestones history              All wins over time  
  gex milestones streak               Current streak and best streaks
  gex milestones --month              This month's progress
  gex milestones goal <amount>        Set monthly goal
  gex milestones leaderboard          Revenue by creator
  gex milestones fame                 Wall of Fame visualization
  gex milestones projection           Projection to next milestone
  gex milestones stats                Quick one-line summary
  gex milestones motivation           Get motivational message

${c.cyan}Goal Commands:${c.reset}
  gex milestones goal monthly 20000   Set monthly goal
  gex milestones goal quarterly 60000 Set quarterly goal
  gex milestones goal yearly 200000   Set yearly goal

${c.cyan}Aliases:${c.reset}
  gex wins, gex revenue-wins, gex celebrate

${c.cyan}Examples:${c.reset}
  gex wins log 5000 "Acme Corp"
  gex wins log 12500 "Big Brand" "Alasdair"
  gex wins goal 25000
  gex wins streak
  gex wins leaderboard
  gex wins fame
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  // Ensure data directory
  ensureDataDir();
  
  // Handle flags
  if (args.includes('--month') || args.includes('-m')) {
    return showMonthView();
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    return showHelp();
  }
  
  switch (cmd) {
    case 'log':
    case 'add':
      if (!args[1]) {
        console.log(`\n  ${c.red}Error: Amount required${c.reset}`);
        console.log(`  Usage: gex wins log <amount> "<deal name>" [creator]\n`);
        return;
      }
      const amount = args[1];
      const dealName = args[2] || 'Unknown Deal';
      const creator = args[3] || 'ItssIMANNN';
      logWin(amount, dealName, creator);
      break;
      
    case 'history':
    case 'all':
      showHistory();
      break;
      
    case 'streak':
    case 'streaks':
      showStreak();
      break;
      
    case 'goal':
    case 'goals':
      if (!args[1]) {
        const data = loadMilestones();
        console.log(`\n${c.bold}Current Goals:${c.reset}`);
        console.log(`  Monthly:   ${formatCurrency(data.monthlyGoal)}`);
        console.log(`  Quarterly: ${formatCurrency(data.quarterlyGoal)}`);
        console.log(`  Yearly:    ${formatCurrency(data.yearlyGoal)}\n`);
      } else if (args[2]) {
        setGoal(args[1], args[2]);
      } else {
        setGoal('monthly', args[1]);
      }
      break;
      
    case 'help':
      showHelp();
      break;
      
    case 'leaderboard':
    case 'leaders':
    case 'creators':
      showLeaderboard();
      break;
      
    case 'fame':
    case 'wall':
    case 'walloffame':
      showWallOfFame();
      break;
      
    case 'projection':
    case 'project':
    case 'forecast':
      showProjection();
      break;
      
    case 'quick':
    case 'stats':
    case 'summary':
      showQuickStats();
      break;
      
    case 'motivation':
    case 'motive':
    case 'inspire':
      showMotivation();
      break;
      
    default:
      showDashboard();
  }
}

main().catch(console.error);
