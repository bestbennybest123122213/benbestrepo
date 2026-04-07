#!/usr/bin/env node
/**
 * Weekly Scorecard - Eric's Benchmarks
 * 
 * Tracks performance week-over-week using Eric's framework:
 * - Reply rates and trends
 * - Booking rates by campaign
 * - Domain health history
 * - Revenue projections vs actuals
 * 
 * Usage:
 *   node weekly-scorecard.js              # This week's scorecard
 *   node weekly-scorecard.js --compare    # Compare to last week
 *   node weekly-scorecard.js --history    # Last 4 weeks
 *   node weekly-scorecard.js --save       # Save snapshot
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Eric's benchmarks
const BENCHMARKS = {
  positiveRate: { killer: 1, great: 0.5, scaleIt: 0.33 }, // per 100 sent
  bookingRate: { target: 30 }, // 30% positive → booked
  domainHealth: { danger: 70, critical: 60 }
};

// Get date range for a week
function getWeekRange(weeksAgo = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek - (weeksAgo * 7));
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return { start: startOfWeek, end: endOfWeek };
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function getWeeklyData(weeksAgo = 0) {
  const { start, end } = getWeekRange(weeksAgo);
  
  // Get replies for this week
  const { data: replies } = await supabase
    .from('all_replies')
    .select('reply_category, replied_at, campaign_name')
    .gte('replied_at', start.toISOString())
    .lte('replied_at', end.toISOString());
  
  // Get bookings for this week
  const { data: curated } = await supabase
    .from('curated_leads')
    .select('status, created_at')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());
  
  // Calculate metrics
  const positiveCategories = ['Interested', 'Meeting Request', 'Information Request'];
  const positiveReplies = (replies || []).filter(r => positiveCategories.includes(r.reply_category));
  const bookings = (curated || []).filter(c => c.status === 'Booked');
  
  // Group by campaign
  const byCampaign = {};
  for (const r of positiveReplies) {
    const campaign = r.campaign_name || 'Unknown';
    if (!byCampaign[campaign]) byCampaign[campaign] = 0;
    byCampaign[campaign]++;
  }
  
  return {
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
    weeksAgo,
    totalReplies: (replies || []).length,
    positiveReplies: positiveReplies.length,
    bookings: bookings.length,
    bookingRate: positiveReplies.length > 0 ? (bookings.length / positiveReplies.length * 100) : 0,
    byCampaign: Object.entries(byCampaign).sort((a, b) => b[1] - a[1])
  };
}

async function getAllTimeData() {
  const { data: curated } = await supabase
    .from('curated_leads')
    .select('status, email');
  
  const { data: replies } = await supabase
    .from('all_replies')
    .select('reply_category');
  
  const positiveCategories = ['Interested', 'Meeting Request', 'Information Request'];
  const positiveReplies = (replies || []).filter(r => positiveCategories.includes(r.reply_category));
  const bookings = (curated || []).filter(c => c.status === 'Booked');
  const totalLeads = (curated || []).length;
  
  return {
    totalLeads,
    totalBooked: bookings.length,
    totalPositive: positiveReplies.length,
    overallBookingRate: totalLeads > 0 ? (bookings.length / totalLeads * 100) : 0
  };
}

function showScorecard(thisWeek, lastWeek, allTime) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 WEEKLY SCORECARD - Eric\'s Framework                                  ║');
  console.log(`║  Week: ${thisWeek.weekStart} to ${thisWeek.weekEnd}                                   ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  // Eric's benchmarks reminder
  console.log('🎯 ERIC\'S BENCHMARKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔥 KILLER: 1 positive per 100 emails');
  console.log('  ⚡ GREAT: 1 positive per 200 emails');
  console.log('  🚀 SCALE IT: 1 positive per 300 emails');
  console.log('  📈 Target: 30% positive → booked');
  console.log('');
  
  // This week's numbers
  console.log('📈 THIS WEEK\'S PERFORMANCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const positiveDiff = thisWeek.positiveReplies - lastWeek.positiveReplies;
  const bookingDiff = thisWeek.bookings - lastWeek.bookings;
  const rateDiff = thisWeek.bookingRate - lastWeek.bookingRate;
  
  const positiveTrend = positiveDiff > 0 ? `↑ +${positiveDiff}` : positiveDiff < 0 ? `↓ ${positiveDiff}` : '→ 0';
  const bookingTrend = bookingDiff > 0 ? `↑ +${bookingDiff}` : bookingDiff < 0 ? `↓ ${bookingDiff}` : '→ 0';
  const rateTrend = rateDiff > 0 ? `↑ +${rateDiff.toFixed(1)}%` : rateDiff < 0 ? `↓ ${rateDiff.toFixed(1)}%` : '→ 0%';
  
  console.log(`  Positive Replies:    ${thisWeek.positiveReplies.toString().padStart(3)}  (${positiveTrend} vs last week)`);
  console.log(`  Bookings:            ${thisWeek.bookings.toString().padStart(3)}  (${bookingTrend} vs last week)`);
  console.log(`  Booking Rate:        ${thisWeek.bookingRate.toFixed(1)}%  (${rateTrend} vs last week)`);
  console.log('');
  
  // Performance grade
  let grade = '📊 AVERAGE';
  if (thisWeek.bookingRate >= 30) grade = '🔥 EXCELLENT';
  else if (thisWeek.bookingRate >= 25) grade = '⚡ GREAT';
  else if (thisWeek.bookingRate >= 20) grade = '🟢 GOOD';
  else if (thisWeek.bookingRate >= 15) grade = '🟡 OK';
  else if (thisWeek.bookingRate < 10) grade = '🔴 NEEDS WORK';
  
  console.log(`  Grade: ${grade}`);
  console.log('');
  
  // All-time stats
  console.log('📊 ALL-TIME STATS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Leads:         ${allTime.totalLeads}`);
  console.log(`  Total Booked:        ${allTime.totalBooked}`);
  console.log(`  Overall Rate:        ${allTime.overallBookingRate.toFixed(1)}%`);
  console.log('');
  
  // Top campaigns this week
  if (thisWeek.byCampaign.length > 0) {
    console.log('🏆 TOP CAMPAIGNS THIS WEEK');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const top5 = thisWeek.byCampaign.slice(0, 5);
    for (const [campaign, count] of top5) {
      const name = campaign.length > 40 ? campaign.substring(0, 40) + '...' : campaign;
      const bar = '█'.repeat(Math.min(count * 2, 20));
      console.log(`  ${bar} ${count} - ${name}`);
    }
    console.log('');
  }
  
  // Week-over-week comparison
  console.log('📆 WEEK-OVER-WEEK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Metric'.padEnd(20) + 'This Week'.padStart(12) + 'Last Week'.padStart(12) + 'Change'.padStart(12));
  console.log('  ' + '─'.repeat(52));
  console.log(`  ${'Positives'.padEnd(18)}${thisWeek.positiveReplies.toString().padStart(12)}${lastWeek.positiveReplies.toString().padStart(12)}${positiveTrend.padStart(12)}`);
  console.log(`  ${'Bookings'.padEnd(18)}${thisWeek.bookings.toString().padStart(12)}${lastWeek.bookings.toString().padStart(12)}${bookingTrend.padStart(12)}`);
  console.log(`  ${'Booking Rate'.padEnd(18)}${(thisWeek.bookingRate.toFixed(1) + '%').padStart(12)}${(lastWeek.bookingRate.toFixed(1) + '%').padStart(12)}${rateTrend.padStart(12)}`);
  console.log('');
  
  // Action items
  console.log('💡 ACTION ITEMS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (thisWeek.positiveReplies < lastWeek.positiveReplies) {
    console.log('  ⚠️ Positive replies down - increase sending volume');
    console.log('     → Run: gex rehit --smartlead to re-hit old leads');
  }
  
  if (thisWeek.bookingRate < 25) {
    console.log('  📞 Booking rate below 25% - focus on follow-ups');
    console.log('     → Run: gex quickwin to find easy conversions');
  }
  
  if (thisWeek.positiveReplies >= lastWeek.positiveReplies && thisWeek.bookingRate >= 25) {
    console.log('  ✅ Great week! Keep scaling what\'s working.');
    console.log('     → Run: gex volume --scale to plan next week');
  }
  
  console.log('');
}

async function showHistory() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 4-WEEK HISTORY                                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  const weeks = [];
  for (let i = 0; i < 4; i++) {
    const data = await getWeeklyData(i);
    weeks.push(data);
  }
  
  console.log('Week'.padEnd(25) + 'Positives'.padStart(12) + 'Bookings'.padStart(12) + 'Rate'.padStart(10));
  console.log('─'.repeat(60));
  
  for (const week of weeks) {
    const label = week.weeksAgo === 0 ? 'This Week' : week.weeksAgo === 1 ? 'Last Week' : `${week.weeksAgo} weeks ago`;
    const dateRange = `${week.weekStart}`;
    console.log(
      `${label.padEnd(15)}${dateRange.padEnd(10)}${week.positiveReplies.toString().padStart(12)}${week.bookings.toString().padStart(12)}${(week.bookingRate.toFixed(1) + '%').padStart(10)}`
    );
  }
  
  console.log('─'.repeat(60));
  
  // Trend analysis
  const trend = weeks[0].positiveReplies - weeks[3].positiveReplies;
  const trendLabel = trend > 0 ? `📈 Up ${trend} positives over 4 weeks` : trend < 0 ? `📉 Down ${Math.abs(trend)} positives over 4 weeks` : '➡️ Flat over 4 weeks';
  console.log(`\n${trendLabel}\n`);
}

function saveSnapshot(thisWeek, allTime) {
  const snapshotDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir);
  }
  
  const filename = path.join(snapshotDir, `scorecard-${thisWeek.weekStart}.json`);
  const snapshot = {
    date: new Date().toISOString(),
    week: thisWeek,
    allTime
  };
  
  fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Snapshot saved to ${filename}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  
  const showHistoryFlag = args.includes('--history');
  const saveFlag = args.includes('--save');
  
  console.log('[Supabase] Loading weekly data...');
  
  if (showHistoryFlag) {
    await showHistory();
    return;
  }
  
  const thisWeek = await getWeeklyData(0);
  const lastWeek = await getWeeklyData(1);
  const allTime = await getAllTimeData();
  
  showScorecard(thisWeek, lastWeek, allTime);
  
  if (saveFlag) {
    saveSnapshot(thisWeek, allTime);
  }
}

main().catch(console.error);
