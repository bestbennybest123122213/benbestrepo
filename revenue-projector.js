#!/usr/bin/env node
/**
 * Revenue Projector
 * 
 * Projects potential revenue based on current pipeline and conversion rates.
 * Provides forecasts and scenario analysis.
 * 
 * Usage:
 *   node revenue-projector.js              # Current projections
 *   node revenue-projector.js scenarios    # Best/worst case
 *   node revenue-projector.js targets      # Goal tracking
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'projection';

// Revenue assumptions
const DEAL_VALUE = 500;
const CONVERSION_RATES = {
  meeting_request: 0.40,  // 40% of meeting requests convert
  interested: 0.25,       // 25% of interested convert
  information: 0.10       // 10% of info requests convert
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  const projection = calculateProjection(leads);

  switch (VIEW) {
    case 'scenarios':
      showScenarios(projection);
      break;
    case 'targets':
      showTargets(projection);
      break;
    default:
      showProjection(projection);
  }
}

function calculateProjection(leads) {
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const info = leads.filter(l => l.reply_category === 'Information Request');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');

  // Current revenue
  const currentRevenue = booked.length * DEAL_VALUE;

  // Projected conversions
  const projectedFromMeetings = Math.round(meetings.length * CONVERSION_RATES.meeting_request);
  const projectedFromInterested = Math.round(interested.length * CONVERSION_RATES.interested);
  const projectedFromInfo = Math.round(info.length * CONVERSION_RATES.information);
  const totalProjected = projectedFromMeetings + projectedFromInterested + projectedFromInfo;

  // Revenue projections
  const projectedRevenue = totalProjected * DEAL_VALUE;
  const totalPotential = currentRevenue + projectedRevenue;

  // Fresh vs stale pipeline
  const freshLeads = unbooked.filter(l => getAgeDays(l.replied_at) <= 14);
  const staleLeads = unbooked.filter(l => getAgeDays(l.replied_at) > 14);

  // Adjusted projection (stale leads convert at half rate)
  const freshProjection = freshLeads.reduce((sum, l) => {
    const rate = CONVERSION_RATES[l.reply_category?.toLowerCase().replace(' ', '_')] || 0.1;
    return sum + rate;
  }, 0);
  const staleProjection = staleLeads.reduce((sum, l) => {
    const rate = (CONVERSION_RATES[l.reply_category?.toLowerCase().replace(' ', '_')] || 0.1) * 0.5;
    return sum + rate;
  }, 0);
  const adjustedProjection = Math.round(freshProjection + staleProjection) * DEAL_VALUE;

  // Weekly run rate
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const bookedThisWeek = booked.filter(l => new Date(l.created_at) > weekAgo).length;
  const weeklyRate = bookedThisWeek * DEAL_VALUE;
  const monthlyProjection = weeklyRate * 4;

  return {
    total: leads.length,
    booked: booked.length,
    meetings: meetings.length,
    interested: interested.length,
    info: info.length,
    fresh: freshLeads.length,
    stale: staleLeads.length,
    currentRevenue,
    projectedFromMeetings,
    projectedFromInterested,
    projectedFromInfo,
    totalProjected,
    projectedRevenue,
    totalPotential,
    adjustedProjection,
    bookedThisWeek,
    weeklyRate,
    monthlyProjection,
    conversionRate: leads.length > 0 ? (booked.length / leads.length * 100) : 0
  };
}

function showProjection(p) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  💰 REVENUE PROJECTOR                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💵 CURRENT REVENUE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  ✅ Booked deals:     ${p.booked}`);
  console.log(`  💰 Revenue:          $${p.currentRevenue.toLocaleString()}`);
  console.log(`  📈 Conversion rate:  ${p.conversionRate.toFixed(1)}%`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 PIPELINE PROJECTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  🤝 Meeting requests: ${p.meetings} → ~${p.projectedFromMeetings} bookings (40%)`);
  console.log(`  💡 Interested:       ${p.interested} → ~${p.projectedFromInterested} bookings (25%)`);
  console.log(`  ❓ Info requests:    ${p.info} → ~${p.projectedFromInfo} bookings (10%)`);
  console.log('  ─────────────────────────────────────────────────────');
  console.log(`  📈 Total projected:  ~${p.totalProjected} new bookings`);
  console.log(`  💵 Projected value:  $${p.projectedRevenue.toLocaleString()}`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💎 TOTAL POTENTIAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Current:    $${p.currentRevenue.toLocaleString()}`);
  console.log(`  + Pipeline: $${p.projectedRevenue.toLocaleString()}`);
  console.log(`  ─────────────────────`);
  console.log(`  = Total:    $${p.totalPotential.toLocaleString()}`);
  console.log('');

  // Adjusted for stale
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  ADJUSTED PROJECTION (accounts for stale leads)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  🟢 Fresh leads (<14d):  ${p.fresh} (full conversion rate)`);
  console.log(`  🔴 Stale leads (>14d):  ${p.stale} (50% conversion rate)`);
  console.log(`  📊 Realistic projection: $${(p.currentRevenue + p.adjustedProjection).toLocaleString()}`);
  console.log('');

  // Run rate
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 RUN RATE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  This week:     ${p.bookedThisWeek} bookings ($${p.weeklyRate.toLocaleString()})`);
  console.log(`  Monthly pace:  ~$${p.monthlyProjection.toLocaleString()}`);
  console.log('');
}

function showScenarios(p) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 SCENARIO ANALYSIS                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Best case (all meeting requests convert)
  const bestCase = p.currentRevenue + (p.meetings + p.interested) * DEAL_VALUE * 0.6;
  
  // Expected case
  const expectedCase = p.currentRevenue + p.projectedRevenue;
  
  // Worst case (only fresh leads, low conversion)
  const worstCase = p.currentRevenue + Math.round(p.fresh * 0.15) * DEAL_VALUE;

  console.log('  Scenario        | Bookings | Revenue');
  console.log('  ────────────────┼──────────┼────────────');
  console.log(`  🚀 Best case    | ${p.booked + p.meetings + p.interested}       | $${bestCase.toLocaleString()}`);
  console.log(`  📊 Expected     | ${p.booked + p.totalProjected}       | $${expectedCase.toLocaleString()}`);
  console.log(`  ⚠️  Worst case   | ${p.booked + Math.round(p.fresh * 0.15)}       | $${worstCase.toLocaleString()}`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 TO IMPROVE PROJECTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  1. Convert stale leads → +$' + (p.stale * 0.2 * DEAL_VALUE).toLocaleString());
  console.log('  2. Speed up meeting conversions → higher close rate');
  console.log('  3. Add more leads to pipeline → compound growth');
  console.log('');
}

function showTargets(p) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎯 TARGET TRACKING                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const targets = [
    { name: '30 bookings', target: 30, current: p.booked },
    { name: '50 bookings', target: 50, current: p.booked },
    { name: '$15K revenue', target: 15000, current: p.currentRevenue },
    { name: '$25K revenue', target: 25000, current: p.currentRevenue }
  ];

  targets.forEach(t => {
    const progress = (t.current / t.target * 100);
    const bar = '█'.repeat(Math.min(Math.round(progress / 5), 20)) + 
                '░'.repeat(Math.max(0, 20 - Math.round(progress / 5)));
    const status = progress >= 100 ? '✅' : progress >= 75 ? '🟡' : '🔴';
    
    console.log(`  ${status} ${t.name.padEnd(15)} [${bar}] ${progress.toFixed(0)}%`);
    console.log(`     ${t.current} / ${typeof t.target === 'number' && t.target > 100 ? '$' + t.target.toLocaleString() : t.target}`);
    console.log('');
  });

  // Gap analysis
  const gapTo30 = 30 - p.booked;
  const gapTo50 = 50 - p.booked;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 GAP ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  To hit 30 bookings: need ${gapTo30} more`);
  console.log(`    → Have ${p.meetings} meeting requests (${Math.round(p.meetings * 0.4)} expected)`);
  console.log('');
  console.log(`  To hit 50 bookings: need ${gapTo50} more`);
  console.log(`    → Need ${Math.ceil((gapTo50 - p.projectedFromMeetings) / 0.4)} more meeting requests`);
  console.log('');
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
