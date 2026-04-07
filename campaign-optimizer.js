#!/usr/bin/env node
/**
 * Campaign Optimizer - Analyze what's working and suggest improvements
 */

const { leads } = require('./enriched-leads.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🎯 CAMPAIGN OPTIMIZER                                         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Group leads by campaign
const campaigns = {};
leads.forEach(l => {
  const name = l.campaign_name || 'Unknown';
  if (!campaigns[name]) {
    campaigns[name] = { 
      leads: [], 
      booked: 0, 
      meetingReq: 0, 
      interested: 0, 
      infoReq: 0,
      totalResponseTime: 0,
      responseCount: 0
    };
  }
  campaigns[name].leads.push(l);
  
  if (l.reply_category === 'Booked') campaigns[name].booked++;
  if (l.reply_category === 'Meeting Request') campaigns[name].meetingReq++;
  if (l.reply_category === 'Interested') campaigns[name].interested++;
  if (l.reply_category === 'Information Request') campaigns[name].infoReq++;
  
  if (l.response_time_seconds) {
    campaigns[name].totalResponseTime += l.response_time_seconds;
    campaigns[name].responseCount++;
  }
});

// Calculate metrics for each campaign
const campaignStats = Object.entries(campaigns).map(([name, data]) => {
  const total = data.leads.length;
  const bookingRate = total > 0 ? (data.booked / total * 100) : 0;
  const meetingRate = total > 0 ? (data.meetingReq / total * 100) : 0;
  const positiveRate = total > 0 ? ((data.booked + data.meetingReq + data.interested) / total * 100) : 0;
  const avgResponseTime = data.responseCount > 0 ? (data.totalResponseTime / data.responseCount / 3600) : null;
  
  // Determine campaign type from name
  let type = 'Unknown';
  const nameLower = name.toLowerCase();
  if (nameLower.includes('reac') || nameLower.includes('positive response')) type = 'Reactivation';
  else if (nameLower.includes('gaming')) type = 'Gaming';
  else if (nameLower.includes('crunchbase')) type = 'Crunchbase';
  else if (nameLower.includes('broad')) type = 'Broad';
  else if (nameLower.includes('ycombinator')) type = 'YC';
  
  return {
    name: name.substring(0, 55),
    type,
    total,
    booked: data.booked,
    meetingReq: data.meetingReq,
    interested: data.interested,
    bookingRate: bookingRate.toFixed(1),
    positiveRate: positiveRate.toFixed(1),
    avgResponseTimeHrs: avgResponseTime ? avgResponseTime.toFixed(1) : 'N/A',
    score: (bookingRate * 2 + meetingRate + positiveRate * 0.5).toFixed(1)
  };
});

// Sort by score
campaignStats.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

// Display
console.log('📊 CAMPAIGN PERFORMANCE RANKING');
console.log('─'.repeat(70));
console.log('Rank | Campaign                                              | Total | Book% | Score');
console.log('─'.repeat(70));

campaignStats.slice(0, 15).forEach((c, i) => {
  const rank = String(i + 1).padStart(2);
  const name = c.name.substring(0, 50).padEnd(50);
  const total = String(c.total).padStart(3);
  const bookRate = c.bookingRate.padStart(5);
  const score = c.score.padStart(5);
  console.log(`  ${rank} | ${name} | ${total} | ${bookRate}% | ${score}`);
});

// Type analysis
console.log('\n📈 PERFORMANCE BY CAMPAIGN TYPE');
console.log('─'.repeat(70));

const byType = {};
campaignStats.forEach(c => {
  if (!byType[c.type]) {
    byType[c.type] = { total: 0, booked: 0, meetingReq: 0, campaigns: 0 };
  }
  byType[c.type].total += c.total;
  byType[c.type].booked += c.booked;
  byType[c.type].meetingReq += c.meetingReq;
  byType[c.type].campaigns++;
});

Object.entries(byType)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([type, data]) => {
    const bookRate = data.total > 0 ? (data.booked / data.total * 100).toFixed(1) : 0;
    const meetRate = data.total > 0 ? (data.meetingReq / data.total * 100).toFixed(1) : 0;
    console.log(`  ${type.padEnd(15)} | ${String(data.campaigns).padStart(2)} campaigns | ${String(data.total).padStart(3)} leads | Book: ${bookRate}% | MeetReq: ${meetRate}%`);
  });

// Best and worst performers
console.log('\n🏆 TOP PERFORMERS');
console.log('─'.repeat(70));
const topPerformers = campaignStats.filter(c => c.total >= 3).slice(0, 5);
topPerformers.forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.name.substring(0, 45)}`);
  console.log(`     ${c.total} leads | ${c.booked} booked (${c.bookingRate}%) | ${c.meetingReq} meeting requests`);
});

console.log('\n⚠️  UNDERPERFORMERS (need optimization)');
console.log('─'.repeat(70));
const underperformers = campaignStats.filter(c => c.total >= 5 && parseFloat(c.bookingRate) < 15);
underperformers.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.name.substring(0, 45)}`);
  console.log(`     ${c.total} leads | Only ${c.booked} booked (${c.bookingRate}%) | ${c.meetingReq} stuck in meeting req`);
});

// Recommendations
console.log('\n💡 OPTIMIZATION RECOMMENDATIONS');
console.log('─'.repeat(70));
console.log('  1. ✅ Reactivation campaigns show high engagement - expand them');
console.log('  2. ⚠️  Gaming campaigns have many Meeting Requests but low booking rate');
console.log('     → Focus on faster follow-up for gaming leads');
console.log('  3. 📧 Broad campaigns generate volume but need better qualification');
console.log('  4. 🎯 Crunchbase-sourced leads may need more personalization');
console.log('  5. 💼 Consider enterprise-specific campaigns for higher-value targets');

// Calculate potential
const stuckMeetingReqs = leads.filter(l => l.reply_category === 'Meeting Request');
const potentialRevenue = stuckMeetingReqs.length * 500;
console.log(`\n  💰 ${stuckMeetingReqs.length} stuck Meeting Requests = $${potentialRevenue.toLocaleString()} potential`);
console.log('     If just 50% convert = $' + (potentialRevenue * 0.5).toLocaleString());
