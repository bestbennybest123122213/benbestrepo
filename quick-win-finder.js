#!/usr/bin/env node
/**
 * Quick Win Finder
 * Identifies leads most likely to convert with minimal effort
 */

const { leads } = require('./enriched-leads.json');

const now = Date.now();
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
});

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  ⚡ QUICK WIN FINDER                                           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Score leads by "quick win" potential
// High score = easiest to convert
const quickWinLeads = leads
  .filter(l => l.reply_category !== 'Booked')
  .map(lead => {
    let score = 0;
    let reasons = [];
    
    // Category (Meeting Request = already wants to meet!)
    if (lead.reply_category === 'Meeting Request') {
      score += 50;
      reasons.push('Already requested meeting');
    } else if (lead.reply_category === 'Interested') {
      score += 30;
      reasons.push('Showed interest');
    } else if (lead.reply_category === 'Information Request') {
      score += 15;
      reasons.push('Asked for info');
    }
    
    // Age (fresher = easier)
    if (lead.age_days <= 3) {
      score += 40;
      reasons.push('Very fresh (< 3 days)');
    } else if (lead.age_days <= 7) {
      score += 30;
      reasons.push('Recent (< 1 week)');
    } else if (lead.age_days <= 14) {
      score += 20;
      reasons.push('Still warm');
    } else if (lead.age_days <= 21) {
      score += 10;
      reasons.push('Getting stale');
    }
    
    // Fast response history (they replied quickly = engaged)
    if (lead.response_time_seconds && lead.response_time_seconds < 86400) {
      score += 20;
      reasons.push('Fast responder');
    } else if (lead.response_time_seconds && lead.response_time_seconds < 172800) {
      score += 10;
      reasons.push('Engaged (2-day response)');
    }
    
    // Known company (easier to research/personalize)
    if (lead.tier === 'enterprise') {
      score += 15;
      reasons.push('Enterprise (high value)');
    } else if (lead.tier === 'midmarket') {
      score += 10;
      reasons.push('Mid-market');
    } else if (lead.tier === 'startup') {
      score += 5;
      reasons.push('Startup');
    }
    
    // Company info available
    if (lead.company_info && lead.company_info.funding) {
      score += 5;
      reasons.push('Has company intel');
    }
    
    return {
      ...lead,
      quickWinScore: score,
      reasons
    };
  })
  .sort((a, b) => b.quickWinScore - a.quickWinScore);

// Display results
console.log('📊 QUICK WIN ANALYSIS');
console.log('─'.repeat(65));
console.log(`  Total unbooked leads: ${quickWinLeads.length}`);
console.log(`  High potential (80+): ${quickWinLeads.filter(l => l.quickWinScore >= 80).length}`);
console.log(`  Medium potential (50-79): ${quickWinLeads.filter(l => l.quickWinScore >= 50 && l.quickWinScore < 80).length}`);
console.log(`  Lower potential (<50): ${quickWinLeads.filter(l => l.quickWinScore < 50).length}`);

// Top 15 Quick Wins
console.log('\n\n🎯 TOP 15 QUICK WINS');
console.log('─'.repeat(65));

quickWinLeads.slice(0, 15).forEach((lead, i) => {
  const tier = lead.tier === 'enterprise' ? ' ⭐' : '';
  const value = lead.tier === 'enterprise' ? '$1,000' : '$500';
  
  console.log(`\n  ${i + 1}. ${lead.lead_company}${tier} (Score: ${lead.quickWinScore})`);
  console.log(`     📧 ${lead.lead_email}`);
  console.log(`     📋 ${lead.reply_category} | ${lead.age_days}d old | ${value}`);
  console.log(`     ✓ ${lead.reasons.join(', ')}`);
});

// Action summary
console.log('\n\n⚡ ACTION PLAN');
console.log('─'.repeat(65));

const top5 = quickWinLeads.slice(0, 5);
const totalValue = top5.reduce((sum, l) => sum + (l.tier === 'enterprise' ? 1000 : 500), 0);

console.log(`\n  Focus on these 5 leads today:`);
top5.forEach((l, i) => {
  const action = l.reply_category === 'Meeting Request' 
    ? 'Send calendar link' 
    : l.reply_category === 'Interested' 
      ? 'Send case study' 
      : 'Send detailed info';
  console.log(`  ${i + 1}. ${l.lead_company} → ${action}`);
});

console.log(`\n  Potential value: $${totalValue.toLocaleString()}`);
console.log(`  Time estimate: ~30 minutes total`);

// Calculate expected outcome
const expectedConversions = Math.ceil(5 * 0.4); // 40% conversion for quick wins
const expectedRevenue = expectedConversions * (totalValue / 5);
console.log(`\n  Expected outcome (40% conversion):`);
console.log(`  → ${expectedConversions} bookings = $${expectedRevenue.toLocaleString()}`);

console.log('\n💡 TIP: Start with the highest-scoring leads for maximum impact!');
console.log('    Run: node gex.js email <company> to generate personalized email\n');
