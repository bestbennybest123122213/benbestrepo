#!/usr/bin/env node
/**
 * Competitor Rates Tracker
 * Track pricing intelligence for other agencies/managers
 *
 * Usage:
 *   node competitor-rates.js add "Agency" "Creator Tier" "Deal Type" "Rate Range" "Source" "Notes"
 *   node competitor-rates.js list
 *   node competitor-rates.js analyze
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RATES_FILE = path.join(__dirname, 'data', 'competitor-rates.json');

function loadRates() {
  try {
    if (fs.existsSync(RATES_FILE)) {
      return JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading competitor rates:', e.message);
  }
  return { rates: [], lastId: 0 };
}

function saveRates(data) {
  const dir = path.dirname(RATES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(RATES_FILE, JSON.stringify(data, null, 2));
}

function parseRateRange(range) {
  if (!range) return null;
  const isPercent = /%/.test(range);
  const cleaned = range.toLowerCase().replace(/[$,%]/g, '').replace(/\s/g, '');
  const parts = cleaned.split(/-|to/).filter(Boolean);
  if (parts.length === 0) return null;

  const numbers = parts.map(p => {
    const mult = p.includes('k') ? 1000 : 1;
    const num = parseFloat(p.replace(/k/g, ''));
    return Number.isFinite(num) ? num * mult : null;
  }).filter(n => n !== null);

  if (numbers.length === 0) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  return { min, max, unit: isPercent ? 'percent' : 'amount' };
}

function formatRate(min, max, unit) {
  if (min == null || max == null) return 'n/a';
  if (unit === 'percent') {
    return `${min.toFixed(1)}%-${max.toFixed(1)}%`;
  }
  const fmt = (v) => '$' + Math.round(v).toLocaleString();
  return `${fmt(min)}-${fmt(max)}`;
}

function addRate(agencyName, creatorTier, dealType, rateRange, source, notes) {
  if (!agencyName || !creatorTier || !dealType || !rateRange || !source) {
    console.log('Usage: node competitor-rates.js add "Agency" "Creator Tier" "Deal Type" "Rate Range" "Source" "Notes"');
    process.exit(1);
  }

  const data = loadRates();
  data.lastId += 1;

  const entry = {
    id: data.lastId,
    agency_name: agencyName,
    creator_tier: creatorTier,
    deal_type: dealType,
    rate_range: rateRange,
    source,
    notes: notes || null,
    created_at: new Date().toISOString()
  };

  data.rates.push(entry);
  saveRates(data);

  console.log(`✅ Added competitor rate #${entry.id}: ${agencyName} (${creatorTier})`);
}

function listRates() {
  const data = loadRates();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🧭 COMPETITOR RATES                                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (data.rates.length === 0) {
    console.log('No competitor rates recorded yet.');
    console.log('Add one with: node competitor-rates.js add "Agency" "Creator Tier" "Deal Type" "Rate Range" "Source" "Notes"\n');
    return;
  }

  console.log('Agency             Tier            Deal Type           Rate Range        Source');
  console.log('─'.repeat(90));

  data.rates.forEach(r => {
    console.log(
      `${r.agency_name.substring(0, 18).padEnd(18)} ` +
      `${r.creator_tier.substring(0, 14).padEnd(14)} ` +
      `${r.deal_type.substring(0, 18).padEnd(18)} ` +
      `${r.rate_range.substring(0, 18).padEnd(18)} ` +
      `${r.source.substring(0, 16).padEnd(16)}`
    );
  });
  console.log('');
}

function analyzeRates() {
  const data = loadRates();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📈 COMPETITOR RATE ANALYSIS                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (data.rates.length === 0) {
    console.log('No competitor rates to analyze. Add entries first.\n');
    return;
  }

  const byTier = {};
  data.rates.forEach(r => {
    const parsed = parseRateRange(r.rate_range);
    if (!parsed) return;

    const key = `${r.creator_tier}::${parsed.unit}`;
    if (!byTier[key]) {
      byTier[key] = { tier: r.creator_tier, unit: parsed.unit, count: 0, minSum: 0, maxSum: 0 };
    }
    byTier[key].count += 1;
    byTier[key].minSum += parsed.min;
    byTier[key].maxSum += parsed.max;
  });

  const rows = Object.values(byTier).sort((a, b) => a.tier.localeCompare(b.tier));

  console.log('Creator Tier        Unit       Avg Range               Entries');
  console.log('─'.repeat(70));

  rows.forEach(row => {
    const avgMin = row.minSum / row.count;
    const avgMax = row.maxSum / row.count;
    const range = formatRate(avgMin, avgMax, row.unit);

    console.log(
      `${row.tier.substring(0, 18).padEnd(18)} ` +
      `${row.unit.padEnd(9)} ` +
      `${range.padEnd(22)} ` +
      `${String(row.count).padStart(7)}`
    );
  });

  console.log('');
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'add':
    addRate(args[1], args[2], args[3], args[4], args[5], args.slice(6).join(' '));
    break;
  case 'list':
    listRates();
    break;
  case 'analyze':
    analyzeRates();
    break;
  default:
    listRates();
    break;
}
