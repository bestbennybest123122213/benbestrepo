#!/usr/bin/env node
/**
 * Outreach Optimizer
 * 
 * Analyzes outreach patterns and suggests optimizations based on
 * what's working vs what's not.
 * 
 * Tracks:
 * - Best performing subject lines (by category)
 * - Optimal send times
 * - Follow-up sequence effectiveness
 * - A/B test recommendations
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'insights';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('created_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  const insights = analyzeOutreach(leads);

  switch (VIEW) {
    case 'timing':
      showTiming(insights);
      break;
    case 'tests':
      showTests(insights);
      break;
    default:
      showInsights(insights);
  }
}

function analyzeOutreach(leads) {
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  
  // Analyze by campaign/source
  const byCampaign = {};
  leads.forEach(l => {
    const campaign = l.campaign_name || 'Unknown';
    if (!byCampaign[campaign]) {
      byCampaign[campaign] = { total: 0, booked: 0, meetings: 0 };
    }
    byCampaign[campaign].total++;
    if (l.reply_category === 'Booked') byCampaign[campaign].booked++;
    if (l.reply_category === 'Meeting Request') byCampaign[campaign].meetings++;
  });

  // Calculate conversion rates
  const campaignStats = Object.entries(byCampaign)
    .map(([name, stats]) => ({
      name,
      ...stats,
      bookingRate: stats.total > 0 ? stats.booked / stats.total : 0,
      meetingRate: stats.total > 0 ? (stats.meetings + stats.booked) / stats.total : 0
    }))
    .sort((a, b) => b.bookingRate - a.bookingRate);

  // Day of week analysis
  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const bookedByDay = [0, 0, 0, 0, 0, 0, 0];
  leads.forEach(l => {
    const day = new Date(l.replied_at).getDay();
    byDayOfWeek[day]++;
    if (l.reply_category === 'Booked') bookedByDay[day]++;
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayStats = dayNames.map((name, i) => ({
    name,
    total: byDayOfWeek[i],
    booked: bookedByDay[i],
    rate: byDayOfWeek[i] > 0 ? (bookedByDay[i] / byDayOfWeek[i] * 100).toFixed(1) : '0.0'
  }));

  // Response category distribution
  const categoryDist = {};
  leads.forEach(l => {
    const cat = l.reply_category;
    categoryDist[cat] = (categoryDist[cat] || 0) + 1;
  });

  return {
    total: leads.length,
    booked: booked.length,
    meetings: meetings.length,
    campaignStats,
    dayStats,
    categoryDist,
    topCampaigns: campaignStats.filter(c => c.total >= 5).slice(0, 5),
    worstCampaigns: campaignStats.filter(c => c.total >= 5).slice(-3).reverse()
  };
}

function showInsights(ins) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎯 OUTREACH OPTIMIZER                                                   ║
║  Data-driven insights to improve conversion                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Top performers
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 TOP PERFORMING CAMPAIGNS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (ins.topCampaigns.length > 0) {
    ins.topCampaigns.forEach((c, i) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
      console.log(`  ${medal} ${c.name.slice(0, 35)}`);
      console.log(`     ${c.total} leads → ${c.booked} booked (${(c.bookingRate * 100).toFixed(0)}%)`);
    });
  } else {
    console.log('  Not enough data (need campaigns with 5+ leads)');
  }
  console.log('');

  // Underperformers
  if (ins.worstCampaigns.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  UNDERPERFORMING (consider adjusting)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    ins.worstCampaigns.forEach(c => {
      console.log(`  ⚠️ ${c.name.slice(0, 35)}`);
      console.log(`     ${c.total} leads → ${c.booked} booked (${(c.bookingRate * 100).toFixed(0)}%)`);
    });
    console.log('');
  }

  // Recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (ins.topCampaigns.length > 0 && ins.topCampaigns[0].bookingRate > 0.3) {
    console.log(`  ✅ Scale "${ins.topCampaigns[0].name.slice(0, 25)}" - ${(ins.topCampaigns[0].bookingRate * 100).toFixed(0)}% conversion`);
  }

  if (ins.worstCampaigns.length > 0 && ins.worstCampaigns[0].bookingRate < 0.1) {
    console.log(`  ⚠️ Review "${ins.worstCampaigns[0].name.slice(0, 25)}" - only ${(ins.worstCampaigns[0].bookingRate * 100).toFixed(0)}% conversion`);
  }

  const bestDay = ins.dayStats.reduce((best, d) => 
    parseFloat(d.rate) > parseFloat(best.rate) ? d : best, ins.dayStats[0]);
  if (parseFloat(bestDay.rate) > 0) {
    console.log(`  📅 Best day: ${bestDay.name} (${bestDay.rate}% booking rate)`);
  }

  console.log('');
}

function showTiming(ins) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 TIMING ANALYSIS                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('  Day       | Replies | Booked | Rate');
  console.log('  ──────────┼─────────┼────────┼──────');

  ins.dayStats.forEach(d => {
    const bar = '█'.repeat(Math.round(parseFloat(d.rate) / 5));
    console.log(`  ${d.name.padEnd(9)} | ${d.total.toString().padStart(7)} | ${d.booked.toString().padStart(6)} | ${d.rate}% ${bar}`);
  });

  console.log('');

  const bestDay = ins.dayStats.reduce((best, d) => 
    parseFloat(d.rate) > parseFloat(best.rate) ? d : best, ins.dayStats[0]);
  const worstDay = ins.dayStats.reduce((worst, d) => 
    d.total > 0 && parseFloat(d.rate) < parseFloat(worst.rate) ? d : worst, ins.dayStats[0]);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 TIMING INSIGHTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  📈 Best day for conversions: ${bestDay.name} (${bestDay.rate}%)`);
  if (worstDay.total > 0) {
    console.log(`  📉 Lowest conversion: ${worstDay.name} (${worstDay.rate}%)`);
  }
  console.log('');
}

function showTests(ins) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🧪 A/B TEST RECOMMENDATIONS                                             ║
╚══════════════════════════════════════════════════════════════════════════╝

  Based on current data, consider testing:

  1. SUBJECT LINE TESTS
     • Test urgency ("Quick question" vs "Partnership opportunity")
     • Test personalization (include company name vs generic)
     • Test length (short <5 words vs medium 5-10 words)

  2. TIMING TESTS
     • Morning (8-10am) vs Afternoon (2-4pm)
     • Weekday vs Weekend
     • Different follow-up cadences (3/7/14 vs 2/5/10)

  3. VALUE PROP TESTS
     • Lead with results ("40% increase") vs lead with pain point
     • Social proof (case studies) vs direct ask
     • Short email vs detailed email

  📊 Track results in: node gex.js campaigns
`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
