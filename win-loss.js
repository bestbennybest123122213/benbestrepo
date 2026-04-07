#!/usr/bin/env node
/**
 * Win/Loss Analysis
 * 
 * Track and analyze why deals are won or lost.
 * Helps identify patterns and improve close rates.
 * 
 * Usage:
 *   node win-loss.js                      # Show analysis
 *   node win-loss.js log won COMPANY      # Log a win
 *   node win-loss.js log lost COMPANY     # Log a loss
 *   node win-loss.js reasons              # Show common reasons
 */

require('dotenv').config();
const fs = require('fs');

const args = process.argv.slice(2);
const ACTION = args[0] || 'show';
const OUTCOME = args[1];
const COMPANY = args.slice(2).join(' ');

const DATA_FILE = './data/win-loss.json';

// Load/save data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    wins: [],
    losses: [],
    reasons: {
      won: {},
      lost: {}
    }
  };
}

function saveData(data) {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Common reasons
const WIN_REASONS = [
  'Great case study fit',
  'Right budget',
  'Fast response time',
  'Strong relationship',
  'Competitive pricing',
  'Perfect timing',
  'Decision maker engaged',
  'Clear ROI demonstrated'
];

const LOSS_REASONS = [
  'Budget too low',
  'Timing not right',
  'Went with competitor',
  'Internal priorities changed',
  'No response / ghosted',
  'Price too high',
  'Audience mismatch',
  'Decision maker changed',
  'Contract terms',
  'Too slow to respond'
];

function logOutcome(outcome, company, reason) {
  if (!company) {
    console.log(`Usage: gex winloss log ${outcome} "Company Name"`);
    return;
  }

  const data = loadData();
  
  const record = {
    id: Date.now(),
    company,
    date: new Date().toISOString(),
    reason: reason || 'Not specified'
  };

  if (outcome === 'won' || outcome === 'win') {
    data.wins.push(record);
    console.log(`✅ Logged WIN: ${company}`);
  } else if (outcome === 'lost' || outcome === 'loss') {
    data.losses.push(record);
    console.log(`❌ Logged LOSS: ${company}`);
  } else {
    console.log('Outcome must be "won" or "lost"');
    return;
  }

  saveData(data);
  
  console.log(`\nTo add a reason, edit: ${DATA_FILE}`);
  console.log(`Or run: gex winloss reasons`);
}

function showAnalysis() {
  const data = loadData();
  
  const wins = data.wins.length;
  const losses = data.losses.length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📊 WIN/LOSS ANALYSIS                                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

📈 OVERALL STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Wins:      ${wins}
   Losses:    ${losses}
   Total:     ${total}
   Win Rate:  ${winRate}% ${winRate >= 60 ? '✅' : winRate >= 40 ? '🟡' : '⚠️'}
`);

  if (wins > 0) {
    console.log(`✅ RECENT WINS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    data.wins.slice(-5).reverse().forEach(w => {
      const date = new Date(w.date).toLocaleDateString('en-GB');
      console.log(`   ${w.company} — ${date}`);
      if (w.reason && w.reason !== 'Not specified') {
        console.log(`      Reason: ${w.reason}`);
      }
    });
    console.log('');
  }

  if (losses > 0) {
    console.log(`❌ RECENT LOSSES`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    data.losses.slice(-5).reverse().forEach(l => {
      const date = new Date(l.date).toLocaleDateString('en-GB');
      console.log(`   ${l.company} — ${date}`);
      if (l.reason && l.reason !== 'Not specified') {
        console.log(`      Reason: ${l.reason}`);
      }
    });
    console.log('');
  }

  // Reason analysis
  const lossReasons = {};
  data.losses.forEach(l => {
    if (l.reason && l.reason !== 'Not specified') {
      lossReasons[l.reason] = (lossReasons[l.reason] || 0) + 1;
    }
  });

  if (Object.keys(lossReasons).length > 0) {
    console.log(`📋 TOP LOSS REASONS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    Object.entries(lossReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => {
        console.log(`   ${count}x ${reason}`);
      });
    console.log('');
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands:
  gex winloss log won "Company"   Log a win
  gex winloss log lost "Company"  Log a loss
  gex winloss reasons             Show common reasons
`);
}

function showReasons() {
  console.log(`
📋 COMMON WIN REASONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  WIN_REASONS.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));

  console.log(`
❌ COMMON LOSS REASONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  LOSS_REASONS.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));

  console.log(`
💡 To log with a reason, edit ${DATA_FILE} after logging.
`);
}

// Main router
switch (ACTION) {
  case 'show':
  case 'analysis':
    showAnalysis();
    break;
  case 'log':
    logOutcome(OUTCOME, COMPANY);
    break;
  case 'reasons':
    showReasons();
    break;
  default:
    showAnalysis();
}
