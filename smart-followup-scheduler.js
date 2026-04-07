#!/usr/bin/env node
/**
 * Smart Follow-up Scheduler
 * Prioritizes and schedules follow-ups based on multiple factors
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📅 SMART FOLLOW-UP SCHEDULER                                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const now = Date.now();

// Calculate priority score for each lead
const scoredLeads = leads
  .filter(l => l.reply_category !== 'Booked') // Only unbooked
  .map(lead => {
    let score = 0;
    const ageDays = Math.floor((now - new Date(lead.replied_at)) / (1000 * 60 * 60 * 24));
    
    // Category weight (higher = more urgent)
    const categoryWeights = {
      'Meeting Request': 100,
      'Interested': 60,
      'Information Request': 40
    };
    score += categoryWeights[lead.reply_category] || 10;
    
    // Tier weight (enterprise = highest value)
    const tierWeights = {
      'enterprise': 80,
      'midmarket': 50,
      'startup': 30,
      'unknown': 20
    };
    score += tierWeights[lead.tier] || 20;
    
    // Age penalty (older = more urgent, but too old = less likely to convert)
    if (ageDays <= 3) score += 50; // Hot - needs immediate follow-up
    else if (ageDays <= 7) score += 40;
    else if (ageDays <= 14) score += 30;
    else if (ageDays <= 30) score += 20;
    else if (ageDays <= 60) score += 10;
    else score += 5; // Very cold
    
    // Funding/size bonus
    if (lead.company_info?.funding?.includes('Series')) score += 20;
    if (lead.company_info?.funding?.includes('Public')) score += 30;
    if (lead.company_info?.size?.includes('1000')) score += 25;
    
    return {
      ...lead,
      age_days: ageDays,
      priority_score: score,
      urgency: score >= 180 ? 'CRITICAL' : score >= 140 ? 'HIGH' : score >= 100 ? 'MEDIUM' : 'LOW'
    };
  })
  .sort((a, b) => b.priority_score - a.priority_score);

// Group by urgency
const critical = scoredLeads.filter(l => l.urgency === 'CRITICAL');
const high = scoredLeads.filter(l => l.urgency === 'HIGH');
const medium = scoredLeads.filter(l => l.urgency === 'MEDIUM');
const low = scoredLeads.filter(l => l.urgency === 'LOW');

console.log('📊 FOLLOW-UP PRIORITY BREAKDOWN');
console.log('─'.repeat(60));
console.log(`  🔴 CRITICAL: ${critical.length} leads (score 180+)`);
console.log(`  🟠 HIGH:     ${high.length} leads (score 140-179)`);
console.log(`  🟡 MEDIUM:   ${medium.length} leads (score 100-139)`);
console.log(`  ⚪ LOW:      ${low.length} leads (score <100)`);

// Daily schedule recommendations
console.log('\n📅 RECOMMENDED DAILY SCHEDULE');
console.log('─'.repeat(60));

// Morning batch (9 AM) - Critical + Top High
const morningBatch = [...critical, ...high.slice(0, 5)];
console.log(`\n  🌅 MORNING (9 AM) - ${morningBatch.length} follow-ups`);
morningBatch.slice(0, 10).forEach((l, i) => {
  const emoji = l.urgency === 'CRITICAL' ? '🔴' : '🟠';
  console.log(`     ${emoji} ${i + 1}. ${(l.lead_company || 'Unknown').substring(0, 20).padEnd(20)} | ${l.lead_name.substring(0, 15)} | ${l.age_days}d | ${l.reply_category}`);
});
if (morningBatch.length > 10) console.log(`     ... and ${morningBatch.length - 10} more`);

// Afternoon batch (2 PM) - Remaining High + Top Medium
const afternoonBatch = [...high.slice(5), ...medium.slice(0, 10)];
console.log(`\n  ☀️  AFTERNOON (2 PM) - ${afternoonBatch.length} follow-ups`);
afternoonBatch.slice(0, 8).forEach((l, i) => {
  const emoji = l.urgency === 'HIGH' ? '🟠' : '🟡';
  console.log(`     ${emoji} ${i + 1}. ${(l.lead_company || 'Unknown').substring(0, 20).padEnd(20)} | ${l.lead_name.substring(0, 15)} | ${l.age_days}d | ${l.reply_category}`);
});
if (afternoonBatch.length > 8) console.log(`     ... and ${afternoonBatch.length - 8} more`);

// Evening batch (6 PM) - Remaining Medium + Low
const eveningBatch = [...medium.slice(10), ...low.slice(0, 5)];
console.log(`\n  🌙 EVENING (6 PM) - ${eveningBatch.length} follow-ups`);
eveningBatch.slice(0, 5).forEach((l, i) => {
  console.log(`     🟡 ${i + 1}. ${(l.lead_company || 'Unknown').substring(0, 20).padEnd(20)} | ${l.lead_name.substring(0, 15)} | ${l.age_days}d`);
});
if (eveningBatch.length > 5) console.log(`     ... and ${eveningBatch.length - 5} more`);

// Export schedule
const schedule = {
  generated: new Date().toISOString(),
  summary: {
    critical: critical.length,
    high: high.length,
    medium: medium.length,
    low: low.length
  },
  morning: morningBatch.map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    category: l.reply_category,
    tier: l.tier,
    age_days: l.age_days,
    priority_score: l.priority_score,
    urgency: l.urgency
  })),
  afternoon: afternoonBatch.map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    category: l.reply_category,
    tier: l.tier,
    age_days: l.age_days,
    priority_score: l.priority_score,
    urgency: l.urgency
  })),
  evening: eveningBatch.map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    category: l.reply_category,
    tier: l.tier,
    age_days: l.age_days,
    priority_score: l.priority_score,
    urgency: l.urgency
  }))
};

fs.writeFileSync('./followup-schedule-today.json', JSON.stringify(schedule, null, 2));

// Top 10 urgent list
console.log('\n🚨 TOP 10 MOST URGENT (Follow up TODAY!)');
console.log('─'.repeat(60));
scoredLeads.slice(0, 10).forEach((l, i) => {
  const emoji = l.urgency === 'CRITICAL' ? '🔴' : l.urgency === 'HIGH' ? '🟠' : '🟡';
  const enterprise = l.tier === 'enterprise' ? ' [ENTERPRISE]' : '';
  console.log(`  ${emoji} ${i + 1}. ${(l.lead_company || 'Unknown').substring(0, 22)}${enterprise}`);
  console.log(`      ${l.lead_name} | ${l.reply_category} | ${l.age_days} days old`);
  console.log(`      📧 ${l.lead_email}`);
  console.log(`      Score: ${l.priority_score}\n`);
});

console.log('✅ Saved schedule to followup-schedule-today.json');
console.log('\n💡 TIP: Run `node gex.js drafts` to generate email drafts');
