#!/usr/bin/env node
/**
 * Deal Velocity Tracker
 * Track how long deals take from first reply to close
 *
 * Usage:
 *   node deal-velocity.js report
 *   node deal-velocity.js slow
 *   node deal-velocity.js fast
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DEALS_FILE = path.join(__dirname, 'data', 'deals.json');

const STAGE_ORDER = [
  'Lead',
  'Contacted',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
  'Contract Sent',
  'Closed Won',
  'Closed Lost'
];

const STAGE_THRESHOLDS = {
  'Lead': 7,
  'Contacted': 7,
  'Meeting Scheduled': 10,
  'Proposal Sent': 14,
  'Negotiation': 21,
  'Contract Sent': 14
};

function loadDeals() {
  try {
    if (fs.existsSync(DEALS_FILE)) {
      return JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading deals:', e.message);
  }
  return { deals: [], lastId: 0 };
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function getStageEvents(deal) {
  const history = Array.isArray(deal.history) ? deal.history : [];
  const events = history
    .filter(h => h.stage && h.date)
    .map(h => ({ stage: h.stage, date: h.date }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (events.length === 0) {
    const startDate = deal.createdAt || deal.created_at || new Date().toISOString();
    return [{ stage: deal.stage || 'Lead', date: startDate }];
  }

  const lastEvent = events[events.length - 1];
  if (deal.stage && lastEvent.stage !== deal.stage) {
    events.push({
      stage: deal.stage,
      date: deal.updatedAt || deal.updated_at || new Date().toISOString()
    });
  }

  return events;
}

function calculateStageDurations(deal) {
  const events = getStageEvents(deal);
  const durations = {};

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const next = events[i + 1];

    let endDate = next?.date;
    if (!endDate) {
      if (deal.stage === 'Closed Won' || deal.stage === 'Closed Lost') {
        endDate = deal.closedAt || deal.closed_at || deal.updatedAt || deal.updated_at || new Date().toISOString();
      } else {
        endDate = new Date().toISOString();
      }
    }

    const days = daysBetween(current.date, endDate);
    if (days == null) continue;

    if (!durations[current.stage]) durations[current.stage] = [];
    durations[current.stage].push(days);
  }

  return durations;
}

function getTotalDaysToClose(deal) {
  const start = deal.createdAt || deal.created_at || (deal.history?.[0]?.date || null);
  const end = deal.closedAt || deal.closed_at || deal.updatedAt || deal.updated_at;
  return daysBetween(start, end);
}

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function report() {
  const data = loadDeals();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⚡ DEAL VELOCITY REPORT                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (data.deals.length === 0) {
    console.log('No deals found in data/deals.json. Add deals first.\n');
    return;
  }

  const closedWon = data.deals.filter(d => d.stage === 'Closed Won');
  const closedLost = data.deals.filter(d => d.stage === 'Closed Lost');
  const active = data.deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');

  const closeTimes = closedWon
    .map(getTotalDaysToClose)
    .filter(v => v != null);

  const avgClose = average(closeTimes);
  const fastest = closeTimes.length > 0 ? Math.min(...closeTimes) : null;
  const slowest = closeTimes.length > 0 ? Math.max(...closeTimes) : null;

  console.log('📊 PIPELINE VELOCITY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Active Deals:     ${active.length}`);
  console.log(`  Closed Won:       ${closedWon.length}`);
  console.log(`  Closed Lost:      ${closedLost.length}`);
  console.log(`  Avg Close Time:   ${avgClose.toFixed(1)} days`);
  if (fastest != null && slowest != null) {
    console.log(`  Fastest Close:    ${fastest} days`);
    console.log(`  Slowest Close:    ${slowest} days`);
  }

  const stageDurations = {};
  data.deals.forEach(deal => {
    const durations = calculateStageDurations(deal);
    Object.entries(durations).forEach(([stage, values]) => {
      if (!stageDurations[stage]) stageDurations[stage] = [];
      stageDurations[stage].push(...values);
    });
  });

  console.log('\n⏱️  AVERAGE DAYS IN STAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  STAGE_ORDER.forEach(stage => {
    if (!stageDurations[stage]) return;
    const avg = average(stageDurations[stage]);
    const bar = '█'.repeat(Math.min(Math.round(avg), 25));
    console.log(`  ${stage.padEnd(18)} ${bar.padEnd(25)} ${avg.toFixed(1)}d`);
  });

  console.log('');
}

function slowDeals() {
  const data = loadDeals();
  const active = data.deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🐌 SLOW DEALS                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (active.length === 0) {
    console.log('No active deals.\n');
    return;
  }

  const stuck = active.map(deal => {
    const events = getStageEvents(deal);
    const lastEvent = events[events.length - 1];
    const age = daysBetween(lastEvent.date, new Date().toISOString());
    const threshold = STAGE_THRESHOLDS[lastEvent.stage] || 14;
    return { deal, stage: lastEvent.stage, age, threshold };
  }).filter(d => d.age != null && d.age > d.threshold)
    .sort((a, b) => b.age - a.age);

  if (stuck.length === 0) {
    console.log('✅ No deals stuck beyond thresholds.\n');
    return;
  }

  console.log('ID   Company               Stage               Days Stuck   Threshold');
  console.log('─'.repeat(80));

  stuck.forEach(({ deal, stage, age, threshold }) => {
    console.log(
      `${String(deal.id).padEnd(4)} ` +
      `${deal.company.substring(0, 20).padEnd(20)} ` +
      `${stage.substring(0, 18).padEnd(18)} ` +
      `${String(age).padStart(5).padEnd(11)} ` +
      `${threshold}d`
    );
  });
  console.log('');
}

function fastDeals() {
  const data = loadDeals();
  const closedWon = data.deals.filter(d => d.stage === 'Closed Won');

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 FAST DEALS                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (closedWon.length === 0) {
    console.log('No closed won deals yet.\n');
    return;
  }

  const ranked = closedWon.map(d => ({
    deal: d,
    days: getTotalDaysToClose(d)
  })).filter(d => d.days != null)
    .sort((a, b) => a.days - b.days);

  if (ranked.length === 0) {
    console.log('No closed won deals with timing data.\n');
    return;
  }

  console.log('ID   Company               Days to Close   Value');
  console.log('─'.repeat(70));

  ranked.slice(0, 10).forEach(({ deal, days }) => {
    console.log(
      `${String(deal.id).padEnd(4)} ` +
      `${deal.company.substring(0, 20).padEnd(20)} ` +
      `${String(days).padStart(5).padEnd(14)} ` +
      `$${Number(deal.value || 0).toLocaleString()}`
    );
  });
  console.log('');
}

const args = process.argv.slice(2);
const command = args[0] || 'report';

switch (command) {
  case 'report':
    report();
    break;
  case 'slow':
    slowDeals();
    break;
  case 'fast':
    fastDeals();
    break;
  default:
    report();
    break;
}
