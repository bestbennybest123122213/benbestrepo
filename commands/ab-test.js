#!/usr/bin/env node
/**
 * A/B Test Analyzer
 * Statistical analysis of email campaign variations
 * Based on Eric Nowoslawski's testing framework
 * 
 * Usage:
 *   node gex.js ab                     - Show all A/B test results
 *   node gex.js ab --campaign X        - Analyze specific campaign
 *   node gex.js ab --compare A B       - Compare two campaigns
 *   node gex.js ab --significant       - Show only significant results
 */

const fs = require('fs');
const path = require('path');

// Statistical functions
function calculateZScore(p1, n1, p2, n2) {
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1/n1 + 1/n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

function isSignificant(zScore, confidence = 0.95) {
  // Two-tailed test
  const criticalValues = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576
  };
  return Math.abs(zScore) > (criticalValues[confidence] || 1.96);
}

function calculateConfidenceInterval(p, n, confidence = 0.95) {
  const z = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 }[confidence] || 1.96;
  const se = Math.sqrt((p * (1 - p)) / n);
  return {
    lower: Math.max(0, p - z * se),
    upper: Math.min(1, p + z * se)
  };
}

// Sample size calculator (for planning tests)
function calculateRequiredSampleSize(baselineRate, minDetectableEffect, power = 0.8, alpha = 0.05) {
  // Simplified calculation
  const z_alpha = 1.96; // For alpha = 0.05, two-tailed
  const z_beta = 0.84;  // For power = 0.8
  
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minDetectableEffect);
  const p_bar = (p1 + p2) / 2;
  
  const n = 2 * Math.pow(z_alpha + z_beta, 2) * p_bar * (1 - p_bar) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

// Load campaign data
function getCampaignData() {
  try {
    const dataPath = path.join(__dirname, '..', 'data', 'positive-replies-processed.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return data.leads || [];
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Group leads by campaign/status for A/B analysis
function analyzeByMonth(leads) {
  const months = {};
  
  leads.forEach(lead => {
    const month = `${lead.conv_month} ${lead.conv_year}`;
    if (!months[month]) {
      months[month] = {
        name: month,
        total: 0,
        booked: 0,
        scheduling: 0,
        not_booked: 0,
        avg_response_time: 0,
        response_times: []
      };
    }
    
    months[month].total++;
    if (lead.status === 'Booked') months[month].booked++;
    if (lead.status === 'Scheduling') months[month].scheduling++;
    if (lead.status === 'Not booked') months[month].not_booked++;
    
    // Parse response time
    if (lead.ert) {
      const parts = lead.ert.split(':').map(Number);
      const hours = parts[0] + (parts[1] || 0) / 60;
      months[month].response_times.push(hours);
    }
  });
  
  // Calculate averages
  Object.values(months).forEach(m => {
    if (m.response_times.length > 0) {
      m.avg_response_time = m.response_times.reduce((a, b) => a + b, 0) / m.response_times.length;
    }
    m.booking_rate = m.total > 0 ? m.booked / m.total : 0;
    m.positive_rate = m.total > 0 ? (m.booked + m.scheduling) / m.total : 0;
  });
  
  return Object.values(months);
}

// Compare two campaigns/periods
function compareGroups(groupA, groupB) {
  const rateA = groupA.booking_rate;
  const rateB = groupB.booking_rate;
  const nA = groupA.total;
  const nB = groupB.total;
  
  const zScore = calculateZScore(rateA, nA, rateB, nB);
  const significant = isSignificant(zScore);
  
  const lift = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : 0;
  
  return {
    groupA: {
      name: groupA.name,
      rate: rateA,
      n: nA,
      ci: calculateConfidenceInterval(rateA, nA)
    },
    groupB: {
      name: groupB.name,
      rate: rateB,
      n: nB,
      ci: calculateConfidenceInterval(rateB, nB)
    },
    zScore,
    significant,
    lift,
    winner: rateA > rateB ? groupA.name : groupB.name,
    recommendation: significant 
      ? `${rateA > rateB ? groupA.name : groupB.name} significantly outperforms (${Math.abs(lift).toFixed(1)}% lift)`
      : 'No significant difference - need more data or larger effect size'
  };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'ab' && a !== 'ab-test');
  
  // Parse flags
  const flags = {
    significant: args.includes('--significant') || args.includes('-s'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    plan: args.includes('--plan'),
    compare: null
  };
  
  // Parse compare
  const compareIdx = args.findIndex(a => a === '--compare' || a === '-c');
  if (compareIdx !== -1 && args[compareIdx + 1] && args[compareIdx + 2]) {
    flags.compare = [args[compareIdx + 1], args[compareIdx + 2]];
  }
  
  console.log('');
  console.log('📊 \x1b[1mA/B TEST ANALYZER\x1b[0m');
  console.log('   Statistical analysis of campaign performance');
  console.log('');
  
  if (flags.plan) {
    // Sample size planning mode
    console.log('🧮 \x1b[1mSAMPLE SIZE CALCULATOR\x1b[0m');
    console.log('');
    console.log('   How many emails do you need for a valid A/B test?');
    console.log('');
    
    const scenarios = [
      { baseline: 0.01, effect: 0.5, label: 'Reply rate (1% → 1.5%)' },
      { baseline: 0.21, effect: 0.2, label: 'Booking rate (21% → 25%)' },
      { baseline: 0.30, effect: 0.2, label: 'Positive rate (30% → 36%)' }
    ];
    
    scenarios.forEach(s => {
      const n = calculateRequiredSampleSize(s.baseline, s.effect);
      console.log(`   ${s.label}`);
      console.log(`   → Need ${n.toLocaleString()} per variation (${(n * 2).toLocaleString()} total)`);
      console.log('');
    });
    
    console.log('\x1b[2m💡 Based on 80% power, 95% confidence\x1b[0m');
    console.log('');
    return;
  }
  
  // Get data
  const leads = getCampaignData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found.\x1b[0m');
    return;
  }
  
  // Analyze by month
  const months = analyzeByMonth(leads);
  
  console.log('📅 \x1b[1mMONTHLY PERFORMANCE\x1b[0m');
  console.log('');
  
  // Sort by date
  months.sort((a, b) => {
    const dateA = new Date(`${a.name.split(' ')[0]} 1, ${a.name.split(' ')[1]}`);
    const dateB = new Date(`${b.name.split(' ')[0]} 1, ${b.name.split(' ')[1]}`);
    return dateA - dateB;
  });
  
  console.log('┌────────────┬───────┬─────────┬──────────────┬──────────────────┐');
  console.log('│ Month      │ Total │ Booked  │ Booking Rate │ 95% CI           │');
  console.log('├────────────┼───────┼─────────┼──────────────┼──────────────────┤');
  
  months.forEach(m => {
    const name = m.name.slice(0, 10).padEnd(10);
    const total = String(m.total).padStart(5);
    const booked = String(m.booked).padStart(7);
    const rate = (m.booking_rate * 100).toFixed(1).padStart(10) + '%';
    const ci = m.ci || calculateConfidenceInterval(m.booking_rate, m.total);
    const ciStr = `${(ci.lower * 100).toFixed(1)}% - ${(ci.upper * 100).toFixed(1)}%`.padEnd(16);
    
    console.log(`│ ${name} │ ${total} │ ${booked} │ ${rate}   │ ${ciStr} │`);
  });
  
  console.log('└────────────┴───────┴─────────┴──────────────┴──────────────────┘');
  console.log('');
  
  // Compare consecutive months
  if (months.length >= 2) {
    console.log('🔬 \x1b[1mMONTH-OVER-MONTH COMPARISONS\x1b[0m');
    console.log('');
    
    for (let i = 0; i < months.length - 1; i++) {
      const result = compareGroups(months[i], months[i + 1]);
      
      if (flags.significant && !result.significant) continue;
      
      const sigIcon = result.significant ? '✅' : '⚪';
      const liftStr = result.lift > 0 ? `+${result.lift.toFixed(1)}%` : `${result.lift.toFixed(1)}%`;
      const liftColor = result.lift > 0 ? '\x1b[32m' : '\x1b[31m';
      
      console.log(`   ${sigIcon} ${result.groupA.name} → ${result.groupB.name}`);
      console.log(`      Rate: ${(result.groupA.rate * 100).toFixed(1)}% → ${(result.groupB.rate * 100).toFixed(1)}% (${liftColor}${liftStr}\x1b[0m)`);
      console.log(`      Z-score: ${result.zScore.toFixed(2)} | ${result.significant ? 'SIGNIFICANT' : 'Not significant'}`);
      console.log('');
    }
  }
  
  // Specific comparison
  if (flags.compare) {
    console.log('🔍 \x1b[1mCUSTOM COMPARISON\x1b[0m');
    console.log('');
    
    const groupA = months.find(m => m.name.toLowerCase().includes(flags.compare[0].toLowerCase()));
    const groupB = months.find(m => m.name.toLowerCase().includes(flags.compare[1].toLowerCase()));
    
    if (groupA && groupB) {
      const result = compareGroups(groupA, groupB);
      
      console.log(`   Comparing: ${result.groupA.name} vs ${result.groupB.name}`);
      console.log('');
      console.log(`   ${result.groupA.name}:`);
      console.log(`      Rate: ${(result.groupA.rate * 100).toFixed(1)}% (${result.groupA.n} leads)`);
      console.log(`      95% CI: ${(result.groupA.ci.lower * 100).toFixed(1)}% - ${(result.groupA.ci.upper * 100).toFixed(1)}%`);
      console.log('');
      console.log(`   ${result.groupB.name}:`);
      console.log(`      Rate: ${(result.groupB.rate * 100).toFixed(1)}% (${result.groupB.n} leads)`);
      console.log(`      95% CI: ${(result.groupB.ci.lower * 100).toFixed(1)}% - ${(result.groupB.ci.upper * 100).toFixed(1)}%`);
      console.log('');
      console.log(`   Result: ${result.recommendation}`);
    } else {
      console.log(`   \x1b[33m⚠️  Could not find both groups. Available: ${months.map(m => m.name).join(', ')}\x1b[0m`);
    }
    console.log('');
  }
  
  // Eric's testing advice
  console.log('💡 \x1b[1mERIC\'S A/B TESTING RULES\x1b[0m');
  console.log('');
  console.log('   \x1b[2mDON\'T test (trivial):\x1b[0m');
  console.log('   • "Hello" vs "Hey"');
  console.log('   • Small CTA word changes');
  console.log('   • Subject line capitalization');
  console.log('');
  console.log('   \x1b[2mDO test (non-trivial):\x1b[0m');
  console.log('   • Different offers / lead magnets');
  console.log('   • Different problems addressed');
  console.log('   • Different value propositions');
  console.log('   • Lead magnet vs straight-to-call');
  console.log('');
  console.log('\x1b[2m💡 Use --plan to calculate required sample sizes | --compare A B to compare\x1b[0m');
  console.log('');
}

main().catch(console.error);
