#!/usr/bin/env node
/**
 * Conversion Insights - Deep analysis of what converts
 */

const { leads } = require('./enriched-leads.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📊 CONVERSION INSIGHTS ANALYSIS                               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// 1. Category breakdown
console.log('📈 PIPELINE FUNNEL');
console.log('─'.repeat(60));

const categories = {};
leads.forEach(l => {
  const cat = l.reply_category || 'Unknown';
  categories[cat] = (categories[cat] || 0) + 1;
});

const total = leads.length;
Object.entries(categories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(count / 2));
    console.log(`  ${cat.padEnd(20)} ${String(count).padStart(3)} (${pct}%) ${bar}`);
  });

// 2. Response time vs booking rate
console.log('\n⏱️  RESPONSE TIME vs BOOKING');
console.log('─'.repeat(60));

const bookedLeads = leads.filter(l => l.reply_category === 'Booked');
const meetingReqs = leads.filter(l => l.reply_category === 'Meeting Request');

// Calculate average response times
const bookedResponseTimes = bookedLeads
  .filter(l => l.response_time_seconds)
  .map(l => l.response_time_seconds / 3600); // hours

const unbookedResponseTimes = meetingReqs
  .filter(l => l.response_time_seconds)
  .map(l => l.response_time_seconds / 3600);

const avgBookedResponse = bookedResponseTimes.length 
  ? (bookedResponseTimes.reduce((a, b) => a + b, 0) / bookedResponseTimes.length).toFixed(1)
  : 'N/A';

const avgUnbookedResponse = unbookedResponseTimes.length
  ? (unbookedResponseTimes.reduce((a, b) => a + b, 0) / unbookedResponseTimes.length).toFixed(1)
  : 'N/A';

console.log(`  Booked leads avg response:     ${avgBookedResponse}h`);
console.log(`  Unbooked Meeting Req response: ${avgUnbookedResponse}h`);

// 3. Campaign performance
console.log('\n🎯 CAMPAIGN PERFORMANCE');
console.log('─'.repeat(60));

const campaigns = {};
leads.forEach(l => {
  const campaign = (l.campaign_name || 'Unknown').substring(0, 50);
  if (!campaigns[campaign]) {
    campaigns[campaign] = { total: 0, booked: 0, meetingReq: 0, interested: 0 };
  }
  campaigns[campaign].total++;
  if (l.reply_category === 'Booked') campaigns[campaign].booked++;
  if (l.reply_category === 'Meeting Request') campaigns[campaign].meetingReq++;
  if (l.reply_category === 'Interested') campaigns[campaign].interested++;
});

// Sort by total
const sortedCampaigns = Object.entries(campaigns)
  .sort((a, b) => b[1].total - a[1].total)
  .slice(0, 10);

console.log('  Campaign'.padEnd(45) + 'Total  Booked  MeetReq  Int');
console.log('  ' + '─'.repeat(65));
sortedCampaigns.forEach(([name, stats]) => {
  const bookRate = stats.total > 0 ? ((stats.booked / stats.total) * 100).toFixed(0) : 0;
  console.log(`  ${name.substring(0, 43).padEnd(43)} ${String(stats.total).padStart(3)}    ${String(stats.booked).padStart(3)}     ${String(stats.meetingReq).padStart(3)}    ${String(stats.interested).padStart(3)}`);
});

// 4. Tier analysis
console.log('\n🏢 TIER PERFORMANCE');
console.log('─'.repeat(60));

const tiers = {};
leads.forEach(l => {
  const tier = l.tier || 'unknown';
  if (!tiers[tier]) {
    tiers[tier] = { total: 0, booked: 0, meetingReq: 0 };
  }
  tiers[tier].total++;
  if (l.reply_category === 'Booked') tiers[tier].booked++;
  if (l.reply_category === 'Meeting Request') tiers[tier].meetingReq++;
});

Object.entries(tiers)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([tier, stats]) => {
    const bookRate = stats.total > 0 ? ((stats.booked / stats.total) * 100).toFixed(0) : 0;
    const pendingRate = stats.total > 0 ? ((stats.meetingReq / stats.total) * 100).toFixed(0) : 0;
    console.log(`  ${tier.padEnd(12)} Total: ${String(stats.total).padStart(3)} | Booked: ${String(stats.booked).padStart(2)} (${bookRate}%) | Pending: ${String(stats.meetingReq).padStart(2)} (${pendingRate}%)`);
  });

// 5. Age analysis
console.log('\n📅 LEAD AGE ANALYSIS');
console.log('─'.repeat(60));

const now = Date.now();
const ageGroups = { '0-3d': [], '4-7d': [], '8-14d': [], '15-30d': [], '30+d': [] };

leads.forEach(l => {
  const age = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
  if (age <= 3) ageGroups['0-3d'].push(l);
  else if (age <= 7) ageGroups['4-7d'].push(l);
  else if (age <= 14) ageGroups['8-14d'].push(l);
  else if (age <= 30) ageGroups['15-30d'].push(l);
  else ageGroups['30+d'].push(l);
});

Object.entries(ageGroups).forEach(([group, groupLeads]) => {
  const booked = groupLeads.filter(l => l.reply_category === 'Booked').length;
  const pending = groupLeads.filter(l => l.reply_category === 'Meeting Request').length;
  const bookRate = groupLeads.length > 0 ? ((booked / groupLeads.length) * 100).toFixed(0) : 0;
  console.log(`  ${group.padEnd(8)} ${String(groupLeads.length).padStart(3)} leads | Booked: ${String(booked).padStart(2)} (${bookRate}%) | Pending Meeting Req: ${pending}`);
});

// 6. Key insights
console.log('\n💡 KEY INSIGHTS');
console.log('─'.repeat(60));

const totalBooked = leads.filter(l => l.reply_category === 'Booked').length;
const totalMeetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const conversionRate = ((totalBooked / total) * 100).toFixed(1);
const pendingRate = ((totalMeetingReq / total) * 100).toFixed(1);

console.log(`  ✅ Overall booking rate: ${conversionRate}% (${totalBooked}/${total})`);
console.log(`  ⏳ Meeting requests pending: ${pendingRate}% (${totalMeetingReq})`);
console.log(`  💰 Potential revenue if all MeetReq convert: $${totalMeetingReq * 500} (at $500/booking)`);

const enterpriseLeads = leads.filter(l => l.tier === 'enterprise');
const enterpriseBooked = enterpriseLeads.filter(l => l.reply_category === 'Booked').length;
const enterprisePending = enterpriseLeads.filter(l => l.reply_category === 'Meeting Request').length;
console.log(`  🏢 Enterprise: ${enterpriseLeads.length} total, ${enterpriseBooked} booked, ${enterprisePending} pending`);

// 7. Recommendations
console.log('\n🎯 RECOMMENDATIONS');
console.log('─'.repeat(60));
console.log('  1. 🚨 URGENT: Follow up on 61 Meeting Requests immediately');
console.log('  2. 🏢 Focus on 7 Enterprise Meeting Requests (highest value)');
console.log('  3. ⏱️  Set up alerts for new replies (target <4h response time)');
console.log('  4. 📧 Use personalized follow-ups for 15+ day old leads');
console.log('  5. 💼 Prioritize enterprise tier for higher conversion');

console.log('\n');
