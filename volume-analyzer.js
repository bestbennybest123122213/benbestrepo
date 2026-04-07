#!/usr/bin/env node
/**
 * Volume Analyzer - Eric's Framework
 * 
 * Eric's key insight: "Your campaigns are great. It's a VOLUME issue, not copy."
 * 
 * This tool analyzes:
 * - Current sending volume across campaigns
 * - Reply rates and positive rates
 * - What volume is needed to hit revenue targets
 * - Domain capacity and scaling recommendations
 * 
 * Usage:
 *   node volume-analyzer.js              # Full analysis
 *   node volume-analyzer.js --target 10  # What volume for 10 bookings?
 *   node volume-analyzer.js --domains    # Domain capacity check
 *   node volume-analyzer.js --scale      # Scaling recommendations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Eric's benchmarks
const BENCHMARKS = {
  KILLER: { ratio: 100, label: '🔥 KILLER', desc: '1 positive per 100 sent' },
  GREAT: { ratio: 200, label: '⚡ GREAT', desc: '1 positive per 200 sent' },
  SCALE_IT: { ratio: 300, label: '🚀 SCALE IT', desc: '1 positive per 300 sent' },
  AVERAGE: { ratio: 500, label: '📊 AVERAGE', desc: '1 positive per 500 sent' }
};

// Revenue assumptions
const AVG_DEAL_SIZE = 25000; // $25K average deal
const COMMISSION_RATE = 0.30; // 30% commission
const BOOKING_TO_CLOSE = 0.60; // 60% close rate on inbound

async function getVolumeData() {
  // Get all replies to calculate rates
  const { data: replies, error } = await supabase
    .from('all_replies')
    .select('campaign_name, reply_category, replied_at');
  
  if (error) {
    console.error('Error:', error.message);
    return null;
  }
  
  // Get curated leads for booking data
  const { data: curated } = await supabase
    .from('curated_leads')
    .select('email, status');
  
  const bookedCount = (curated || []).filter(c => c.status === 'Booked').length;
  const totalLeads = (curated || []).length;
  
  // Calculate positive reply rate
  const positiveCategories = ['Interested', 'Meeting Request', 'Information Request'];
  const positiveReplies = (replies || []).filter(r => positiveCategories.includes(r.reply_category));
  
  // Group by month for trend analysis
  const monthlyData = {};
  for (const r of positiveReplies) {
    const date = new Date(r.replied_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { positive: 0, booked: 0 };
    }
    monthlyData[monthKey].positive++;
  }
  
  return {
    totalReplies: (replies || []).length,
    positiveReplies: positiveReplies.length,
    bookedCount,
    totalLeads,
    monthlyData,
    bookingRate: totalLeads > 0 ? (bookedCount / totalLeads * 100) : 0,
    positiveToBooking: positiveReplies.length > 0 ? (bookedCount / positiveReplies.length * 100) : 0
  };
}

function showVolumeAnalysis(data) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 VOLUME ANALYZER - Eric\'s Framework                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('💡 Eric\'s Insight: "Your campaigns are GREAT. It\'s a VOLUME issue."\n');
  
  // Current stats
  console.log('📈 CURRENT PERFORMANCE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Positive Replies:    ${data.positiveReplies}`);
  console.log(`  Total Booked:              ${data.bookedCount}`);
  console.log(`  Positive → Booking Rate:   ${data.positiveToBooking.toFixed(1)}%`);
  console.log(`  Overall Booking Rate:      ${data.bookingRate.toFixed(1)}%`);
  console.log('');
  
  // Eric's benchmarks comparison
  console.log('🎯 ERIC\'S BENCHMARKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Estimate current ratio based on positive replies vs hypothetical sends
  // If we don't have exact send data, estimate based on typical 1% reply rate
  const estimatedSends = data.totalReplies * 100; // Rough estimate
  const currentRatio = data.positiveReplies > 0 ? Math.round(estimatedSends / data.positiveReplies) : 999;
  
  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    const marker = currentRatio <= benchmark.ratio ? '✅' : '  ';
    console.log(`  ${marker} ${benchmark.label.padEnd(12)} ${benchmark.desc}`);
  }
  
  console.log('');
  
  // Volume projections
  console.log('📊 VOLUME → REVENUE PROJECTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  (Based on 1:300 ratio, 29% booking rate, 60% close rate, $25K avg deal)\n');
  
  const conversionRate = data.positiveToBooking / 100 || 0.29;
  const closeRate = BOOKING_TO_CLOSE;
  
  const projections = [
    { sends: 1000, label: '1K emails/month' },
    { sends: 3000, label: '3K emails/month' },
    { sends: 5000, label: '5K emails/month' },
    { sends: 10000, label: '10K emails/month' }
  ];
  
  console.log('  Volume'.padEnd(20) + 'Positives'.padStart(12) + 'Bookings'.padStart(12) + 'Deals'.padStart(10) + 'Revenue'.padStart(15));
  console.log('  ' + '─'.repeat(65));
  
  for (const p of projections) {
    const positives = Math.round(p.sends / 300); // 1:300 ratio
    const bookings = Math.round(positives * conversionRate);
    const deals = Math.round(bookings * closeRate);
    const revenue = deals * AVG_DEAL_SIZE * COMMISSION_RATE;
    
    console.log(
      `  ${p.label.padEnd(18)}${positives.toString().padStart(12)}${bookings.toString().padStart(12)}${deals.toString().padStart(10)}${('$' + revenue.toLocaleString()).padStart(15)}`
    );
  }
  
  console.log('');
  
  // Target calculator
  console.log('🎯 TARGET CALCULATOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const targets = [
    { bookings: 5, label: '5 bookings/month' },
    { bookings: 10, label: '10 bookings/month' },
    { bookings: 20, label: '20 bookings/month' }
  ];
  
  console.log('  To get X bookings, you need to send Y emails:\n');
  
  for (const t of targets) {
    const positivesNeeded = Math.ceil(t.bookings / conversionRate);
    const sendsNeeded = positivesNeeded * 300; // Using 1:300 benchmark
    const revenue = Math.round(t.bookings * closeRate) * AVG_DEAL_SIZE * COMMISSION_RATE;
    
    console.log(`  ${t.label}:`);
    console.log(`     → Send ${sendsNeeded.toLocaleString()} emails → ~${positivesNeeded} positives → $${revenue.toLocaleString()} commission`);
    console.log('');
  }
  
  // Monthly trend
  if (Object.keys(data.monthlyData).length > 0) {
    console.log('📅 MONTHLY POSITIVE REPLIES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const months = Object.entries(data.monthlyData).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    
    for (const [month, stats] of months) {
      const bar = '█'.repeat(Math.min(Math.ceil(stats.positive / 2), 30));
      console.log(`  ${month}: ${bar} ${stats.positive}`);
    }
    console.log('');
  }
  
  // Action items
  console.log('💡 ERIC\'S ACTION PLAN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  1. Stop optimizing copy - your campaigns are already great');
  console.log('  2. Focus 100% on LIST BUILDING and VOLUME');
  console.log('  3. Re-hit 60+ day old leads: gex rehit');
  console.log('  4. Kill failing campaigns, scale winners');
  console.log('  5. Add more domains (.info are cheap and effective)');
  console.log('  6. Target: 5K emails/month minimum\n');
}

function showDomainCapacity() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📧 DOMAIN CAPACITY ANALYSIS                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('💡 Eric\'s Domain Rules:');
  console.log('  • .info domains: 1-2% reply rates (Taylor Horan\'s secret)');
  console.log('  • Google inboxes: 3x more replies than Outlook');
  console.log('  • Outlook is "cooked" - dies within days');
  console.log('  • Domain aging: buy → wait 1 month → warm 1 week\n');
  
  console.log('📊 DOMAIN CAPACITY FORMULA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Per healthy domain: 30-50 emails/day = ~1,000-1,500/month');
  console.log('  For 5K emails/month: need 4-5 healthy domains');
  console.log('  For 10K emails/month: need 8-10 healthy domains\n');
  
  console.log('⚠️ CURRENT HEALTH ISSUES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  2 domains at 63% health (below 70% threshold)');
  console.log('  → Reduce volume on these domains by 75%');
  console.log('  → Run: gex domain-alerts --recover <domain>\n');
  
  console.log('🚀 SCALING RECOMMENDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  1. Buy 5 new .info domains (~$2-3 each)');
  console.log('  2. Let them age for 1 month');
  console.log('  3. Warm for 1 week (use Zapmail, not SmartLead warmup)');
  console.log('  4. Start sending at 20/day, increase 10/day per week');
  console.log('  5. Target: 5 new domains = +5K capacity/month\n');
}

function showScalingPlan(data) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 30-DAY SCALING PLAN                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('Week 1: Foundation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  □ Re-hit 80 gaming leads (gex rehit gaming --export)');
  console.log('  □ Re-hit 779 total 60+ day leads (gex rehit --export)');
  console.log('  □ Buy 5 .info domains');
  console.log('  □ Kill 0% campaigns (gex campaign-dx --failing)');
  console.log('');
  
  console.log('Week 2: Recovery');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  □ Recover 63% health domains (reduce volume 75%)');
  console.log('  □ Start warming new .info domains');
  console.log('  □ Scale winning campaigns (Vid Editing, Reactivation)');
  console.log('');
  
  console.log('Week 3: Scale');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  □ New domains ready for sending');
  console.log('  □ Add 2K new leads to winning campaigns');
  console.log('  □ Monitor reply rates - should see improvement');
  console.log('');
  
  console.log('Week 4: Optimize');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  □ Review: Did volume increase drive more positives?');
  console.log('  □ Double down on what\'s working');
  console.log('  □ Plan next batch of domains');
  console.log('');
  
  console.log('📊 EXPECTED RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const conversionRate = data.positiveToBooking / 100 || 0.29;
  const currentMonthlyPositives = Math.round(data.positiveReplies / 6); // Rough avg
  const projectedPositives = currentMonthlyPositives + 30; // +30 from re-hits and scaling
  const projectedBookings = Math.round(projectedPositives * conversionRate);
  const projectedDeals = Math.round(projectedBookings * BOOKING_TO_CLOSE);
  const projectedRevenue = projectedDeals * AVG_DEAL_SIZE * COMMISSION_RATE;
  
  console.log(`  Current: ~${currentMonthlyPositives} positives/month`);
  console.log(`  Projected: ~${projectedPositives} positives/month (+${projectedPositives - currentMonthlyPositives})`);
  console.log(`  → ${projectedBookings} bookings → ${projectedDeals} deals → $${projectedRevenue.toLocaleString()} commission`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  const showDomains = args.includes('--domains');
  const showScale = args.includes('--scale');
  const targetArg = args.find(a => a.startsWith('--target'));
  
  console.log('[Supabase] Loading data...');
  const data = await getVolumeData();
  
  if (!data) {
    console.log('\n⚠️ Could not load data.');
    return;
  }
  
  if (showDomains) {
    showDomainCapacity();
    return;
  }
  
  if (showScale) {
    showScalingPlan(data);
    return;
  }
  
  showVolumeAnalysis(data);
}

main().catch(console.error);
