#!/usr/bin/env node
/**
 * Weekly Trends Tracker
 * Analyzes week-over-week performance changes
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📈 WEEKLY TRENDS TRACKER                                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Categorize leads by when they replied
const thisWeek = leads.filter(l => (now - new Date(l.replied_at)) < ONE_WEEK);
const lastWeek = leads.filter(l => {
  const age = now - new Date(l.replied_at);
  return age >= ONE_WEEK && age < 2 * ONE_WEEK;
});
const older = leads.filter(l => (now - new Date(l.replied_at)) >= 2 * ONE_WEEK);

console.log('📊 LEAD VOLUME BY WEEK');
console.log('─'.repeat(60));
console.log(`  This Week:  ${thisWeek.length} new leads`);
console.log(`  Last Week:  ${lastWeek.length} leads`);
console.log(`  Older:      ${older.length} leads`);

const weekChange = thisWeek.length - lastWeek.length;
const changeIcon = weekChange > 0 ? '📈' : weekChange < 0 ? '📉' : '➡️';
console.log(`  Change:     ${changeIcon} ${weekChange > 0 ? '+' : ''}${weekChange} (${lastWeek.length > 0 ? ((weekChange / lastWeek.length) * 100).toFixed(0) : 0}%)`);

// Category breakdown this week vs last week
console.log('\n📋 CATEGORY BREAKDOWN');
console.log('─'.repeat(60));

const categories = ['Meeting Request', 'Interested', 'Information Request', 'Booked'];
categories.forEach(cat => {
  const thisWeekCat = thisWeek.filter(l => l.reply_category === cat).length;
  const lastWeekCat = lastWeek.filter(l => l.reply_category === cat).length;
  const change = thisWeekCat - lastWeekCat;
  const icon = change > 0 ? '↑' : change < 0 ? '↓' : '=';
  console.log(`  ${cat.padEnd(20)} This: ${String(thisWeekCat).padStart(2)} | Last: ${String(lastWeekCat).padStart(2)} | ${icon} ${change}`);
});

// Conversion trends
console.log('\n📈 CONVERSION TRENDS');
console.log('─'.repeat(60));

const thisWeekBooked = thisWeek.filter(l => l.reply_category === 'Booked').length;
const lastWeekBooked = lastWeek.filter(l => l.reply_category === 'Booked').length;
const thisWeekBookingRate = thisWeek.length > 0 ? (thisWeekBooked / thisWeek.length * 100).toFixed(1) : 0;
const lastWeekBookingRate = lastWeek.length > 0 ? (lastWeekBooked / lastWeek.length * 100).toFixed(1) : 0;

console.log(`  Booking Rate This Week: ${thisWeekBookingRate}%`);
console.log(`  Booking Rate Last Week: ${lastWeekBookingRate}%`);
console.log(`  Trend: ${parseFloat(thisWeekBookingRate) >= parseFloat(lastWeekBookingRate) ? '✅ Improving or stable' : '⚠️ Declining'}`);

// Response time trends
console.log('\n⏱️  RESPONSE TIME TRENDS');
console.log('─'.repeat(60));

const getAvgResponseTime = (leadsArr) => {
  const withResponse = leadsArr.filter(l => l.response_time_seconds);
  if (withResponse.length === 0) return null;
  return withResponse.reduce((sum, l) => sum + l.response_time_seconds, 0) / withResponse.length / 3600;
};

const thisWeekAvgResponse = getAvgResponseTime(thisWeek);
const lastWeekAvgResponse = getAvgResponseTime(lastWeek);

console.log(`  Avg Response This Week: ${thisWeekAvgResponse ? thisWeekAvgResponse.toFixed(1) + 'h' : 'N/A'}`);
console.log(`  Avg Response Last Week: ${lastWeekAvgResponse ? lastWeekAvgResponse.toFixed(1) + 'h' : 'N/A'}`);
if (thisWeekAvgResponse && lastWeekAvgResponse) {
  const faster = thisWeekAvgResponse < lastWeekAvgResponse;
  console.log(`  Trend: ${faster ? '✅ Getting faster!' : '⚠️ Slowing down'}`);
}

// Campaign performance this week
console.log('\n🎯 TOP CAMPAIGNS THIS WEEK');
console.log('─'.repeat(60));

const campaignsThisWeek = {};
thisWeek.forEach(l => {
  const name = (l.campaign_name || 'Unknown').substring(0, 40);
  campaignsThisWeek[name] = (campaignsThisWeek[name] || 0) + 1;
});

Object.entries(campaignsThisWeek)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([name, count], i) => {
    console.log(`  ${i + 1}. ${name} (${count} leads)`);
  });

// Tier distribution trends
console.log('\n🏢 TIER DISTRIBUTION');
console.log('─'.repeat(60));

const tiers = ['enterprise', 'midmarket', 'startup', 'unknown'];
tiers.forEach(tier => {
  const thisWeekTier = thisWeek.filter(l => (l.tier || 'unknown') === tier).length;
  const lastWeekTier = lastWeek.filter(l => (l.tier || 'unknown') === tier).length;
  const change = thisWeekTier - lastWeekTier;
  const icon = change > 0 ? '↑' : change < 0 ? '↓' : '=';
  console.log(`  ${tier.padEnd(12)} This: ${String(thisWeekTier).padStart(2)} | Last: ${String(lastWeekTier).padStart(2)} | ${icon}`);
});

// Key insights
console.log('\n💡 KEY INSIGHTS');
console.log('─'.repeat(60));

const insights = [];

if (weekChange > 0) {
  insights.push(`✅ Lead volume up ${weekChange} from last week`);
} else if (weekChange < 0) {
  insights.push(`⚠️ Lead volume down ${Math.abs(weekChange)} from last week`);
}

const enterpriseThisWeek = thisWeek.filter(l => l.tier === 'enterprise').length;
if (enterpriseThisWeek > 0) {
  insights.push(`🏢 ${enterpriseThisWeek} enterprise leads this week!`);
}

const meetingReqThisWeek = thisWeek.filter(l => l.reply_category === 'Meeting Request').length;
if (meetingReqThisWeek > 0) {
  insights.push(`🎯 ${meetingReqThisWeek} meeting requests this week - follow up fast!`);
}

if (thisWeekAvgResponse && thisWeekAvgResponse < 24) {
  insights.push(`⚡ Good response time this week (${thisWeekAvgResponse.toFixed(0)}h avg)`);
} else if (thisWeekAvgResponse && thisWeekAvgResponse >= 48) {
  insights.push(`⚠️ Response time needs improvement (${thisWeekAvgResponse.toFixed(0)}h avg)`);
}

insights.forEach(i => console.log(`  ${i}`));

// Save weekly snapshot
const snapshot = {
  date: new Date().toISOString(),
  thisWeek: {
    total: thisWeek.length,
    byCategory: {
      meetingRequest: thisWeek.filter(l => l.reply_category === 'Meeting Request').length,
      interested: thisWeek.filter(l => l.reply_category === 'Interested').length,
      infoRequest: thisWeek.filter(l => l.reply_category === 'Information Request').length,
      booked: thisWeekBooked
    },
    avgResponseTimeHours: thisWeekAvgResponse,
    bookingRate: parseFloat(thisWeekBookingRate)
  },
  lastWeek: {
    total: lastWeek.length,
    booked: lastWeekBooked,
    avgResponseTimeHours: lastWeekAvgResponse,
    bookingRate: parseFloat(lastWeekBookingRate)
  }
};

// Append to history
let history = [];
try {
  history = JSON.parse(fs.readFileSync('./weekly-history.json', 'utf8'));
} catch (e) {}
history.push(snapshot);
fs.writeFileSync('./weekly-history.json', JSON.stringify(history.slice(-12), null, 2)); // Keep last 12 weeks

console.log('\n✅ Weekly snapshot saved to weekly-history.json');
