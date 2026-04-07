#!/usr/bin/env node
/**
 * Commission Calculator & Tracker
 * Calculate earnings per deal and track total revenue
 * 
 * Usage:
 *   node commission.js                        # Show commission summary
 *   node commission.js calc 25000 0.25        # Calculate commission on $25K at 25%
 *   node commission.js add "Company" 25000 0.25 "ItssIMANNN" "2026-02-06"
 *   node commission.js report                 # Monthly/yearly report
 *   node commission.js by-creator             # Earnings by creator
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const COMMISSION_FILE = path.join(__dirname, 'data', 'commissions.json');

// Default commission rates by deal size
const DEFAULT_RATES = {
  small: { min: 0, max: 15000, rate: 0.50 },      // 50% on small deals
  medium: { min: 15000, max: 30000, rate: 0.35 }, // 35% on medium
  large: { min: 30000, max: 50000, rate: 0.25 },  // 25% on large
  enterprise: { min: 50000, max: Infinity, rate: 0.20 } // 20% on enterprise
};

function loadCommissions() {
  try {
    if (fs.existsSync(COMMISSION_FILE)) {
      return JSON.parse(fs.readFileSync(COMMISSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return { commissions: [], lastId: 0 };
}

function saveCommissions(data) {
  const dir = path.dirname(COMMISSION_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COMMISSION_FILE, JSON.stringify(data, null, 2));
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultRate(dealValue) {
  for (const [tier, config] of Object.entries(DEFAULT_RATES)) {
    if (dealValue >= config.min && dealValue < config.max) {
      return config.rate;
    }
  }
  return 0.25; // Default 25%
}

function calculateCommission(dealValue, rate = null) {
  const actualRate = rate || getDefaultRate(dealValue);
  return {
    dealValue,
    rate: actualRate,
    commission: dealValue * actualRate,
    ratePercent: (actualRate * 100).toFixed(0) + '%'
  };
}

function showSummary() {
  const data = loadCommissions();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  💰 COMMISSION TRACKER                                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (data.commissions.length === 0) {
    console.log('No commissions recorded yet.');
    console.log('Add with: node commission.js add "Company" 25000 0.25 "Creator" "YYYY-MM-DD"\n');
    
    // Show calculation example
    console.log('📊 COMMISSION RATE TIERS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Small deals (<$15K):        50%');
    console.log('  Medium deals ($15K-$30K):   35%');
    console.log('  Large deals ($30K-$50K):    25%');
    console.log('  Enterprise deals (>$50K):   20%\n');
    return;
  }
  
  // Calculate totals
  const totalDeals = data.commissions.reduce((sum, c) => sum + c.dealValue, 0);
  const totalCommission = data.commissions.reduce((sum, c) => sum + c.commission, 0);
  const avgRate = totalCommission / totalDeals;
  
  // This month
  const now = new Date();
  const thisMonth = data.commissions.filter(c => {
    const date = new Date(c.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlyDeals = thisMonth.reduce((sum, c) => sum + c.dealValue, 0);
  const monthlyCommission = thisMonth.reduce((sum, c) => sum + c.commission, 0);
  
  // This year
  const thisYear = data.commissions.filter(c => {
    const date = new Date(c.date);
    return date.getFullYear() === now.getFullYear();
  });
  const yearlyDeals = thisYear.reduce((sum, c) => sum + c.dealValue, 0);
  const yearlyCommission = thisYear.reduce((sum, c) => sum + c.commission, 0);
  
  console.log('📈 EARNINGS SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  This Month:     ${formatCurrency(monthlyCommission).padStart(12)} (${thisMonth.length} deals, ${formatCurrency(monthlyDeals)} total)`);
  console.log(`  This Year:      ${formatCurrency(yearlyCommission).padStart(12)} (${thisYear.length} deals, ${formatCurrency(yearlyDeals)} total)`);
  console.log(`  All Time:       ${formatCurrency(totalCommission).padStart(12)} (${data.commissions.length} deals)`);
  console.log(`  Average Rate:   ${(avgRate * 100).toFixed(1)}%`);
  
  // Recent commissions
  console.log('\n📋 RECENT COMMISSIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const recent = data.commissions.slice(-5).reverse();
  for (const c of recent) {
    const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    console.log(`  ${date.padEnd(8)} ${c.company.substring(0, 20).padEnd(20)} ${formatCurrency(c.dealValue).padStart(10)} × ${c.ratePercent.padStart(4)} = ${formatCurrency(c.commission).padStart(10)}`);
  }
  console.log('');
}

function addCommission(company, dealValue, rate, creator, date) {
  const data = loadCommissions();
  data.lastId++;
  
  const calc = calculateCommission(parseFloat(dealValue), rate ? parseFloat(rate) : null);
  
  const commission = {
    id: data.lastId,
    company,
    dealValue: calc.dealValue,
    rate: calc.rate,
    ratePercent: calc.ratePercent,
    commission: calc.commission,
    creator: creator || 'ItssIMANNN',
    date: date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };
  
  data.commissions.push(commission);
  saveCommissions(data);
  
  console.log(`\n✅ Commission recorded:`);
  console.log(`   Company: ${company}`);
  console.log(`   Deal: ${formatCurrency(calc.dealValue)}`);
  console.log(`   Rate: ${calc.ratePercent}`);
  console.log(`   Commission: ${formatCurrency(calc.commission)}`);
  console.log(`   Creator: ${commission.creator}`);
  console.log('');
  
  return commission;
}

function showByCreator() {
  const data = loadCommissions();
  
  console.log('\n👥 EARNINGS BY CREATOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const byCreator = {};
  for (const c of data.commissions) {
    if (!byCreator[c.creator]) {
      byCreator[c.creator] = { deals: 0, totalValue: 0, commission: 0 };
    }
    byCreator[c.creator].deals++;
    byCreator[c.creator].totalValue += c.dealValue;
    byCreator[c.creator].commission += c.commission;
  }
  
  for (const [creator, stats] of Object.entries(byCreator)) {
    console.log(`\n  ${creator}`);
    console.log(`    Deals: ${stats.deals}`);
    console.log(`    Total Value: ${formatCurrency(stats.totalValue)}`);
    console.log(`    Commission: ${formatCurrency(stats.commission)}`);
  }
  console.log('');
}

function showMonthlyReport() {
  const data = loadCommissions();
  
  console.log('\n📅 MONTHLY COMMISSION REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const byMonth = {};
  for (const c of data.commissions) {
    const month = c.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) {
      byMonth[month] = { deals: 0, totalValue: 0, commission: 0 };
    }
    byMonth[month].deals++;
    byMonth[month].totalValue += c.dealValue;
    byMonth[month].commission += c.commission;
  }
  
  const months = Object.keys(byMonth).sort().reverse();
  for (const month of months) {
    const stats = byMonth[month];
    const bar = '█'.repeat(Math.min(Math.floor(stats.commission / 1000), 30));
    console.log(`  ${month}  ${bar.padEnd(30)} ${formatCurrency(stats.commission).padStart(12)} (${stats.deals} deals)`);
  }
  console.log('');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'summary') {
  showSummary();
} else if (command === 'calc') {
  // Quick calculation
  const dealValue = parseFloat(args[1]);
  const rate = args[2] ? parseFloat(args[2]) : null;
  
  if (!dealValue) {
    console.log('Usage: node commission.js calc <deal_value> [rate]');
    console.log('Example: node commission.js calc 25000 0.25');
  } else {
    const calc = calculateCommission(dealValue, rate);
    console.log(`\n💰 Commission Calculator`);
    console.log(`   Deal Value: ${formatCurrency(calc.dealValue)}`);
    console.log(`   Rate: ${calc.ratePercent}`);
    console.log(`   Commission: ${formatCurrency(calc.commission)}\n`);
  }
} else if (command === 'add') {
  // node commission.js add "Company" 25000 0.25 "Creator" "2026-02-06"
  const [, company, dealValue, rate, creator, date] = args;
  if (!company || !dealValue) {
    console.log('Usage: node commission.js add "Company" <deal_value> [rate] [creator] [date]');
  } else {
    addCommission(company, dealValue, rate, creator, date);
  }
} else if (command === 'report' || command === 'monthly') {
  showMonthlyReport();
} else if (command === 'by-creator' || command === 'creators') {
  showByCreator();
} else {
  console.log(`Unknown command: ${command}`);
  console.log('Commands: summary, calc, add, report, by-creator');
}
