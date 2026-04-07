#!/usr/bin/env node
/**
 * Pipeline Velocity Tracker
 * 
 * Tracks how fast leads move through the pipeline:
 * - Average time to book
 * - Response velocity
 * - Conversion speed
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function analyzeVelocity() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚡ PIPELINE VELOCITY TRACKER                                            ║
║  How fast are leads moving through your funnel?                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const now = Date.now();
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');

  // Calculate average age by category
  const categories = ['Meeting Request', 'Interested', 'Information Request'];
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 AVERAGE AGE BY CATEGORY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  categories.forEach(cat => {
    const catLeads = unbooked.filter(l => l.reply_category === cat);
    if (catLeads.length === 0) return;
    
    const ages = catLeads.map(l => {
      if (!l.replied_at) return 0;
      return Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    });
    
    const avgAge = (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1);
    const bar = '█'.repeat(Math.min(30, Math.floor(avgAge / 2))) + '░'.repeat(Math.max(0, 30 - Math.floor(avgAge / 2)));
    
    console.log(`  ${cat.padEnd(20)} ${bar} ${avgAge} days avg`);
    console.log(`  ${''.padEnd(20)} ${catLeads.length} leads\n`);
  });

  // Age distribution
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 AGE DISTRIBUTION (Unbooked leads)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const ageBuckets = {
    '0-3 days (Hot)': 0,
    '4-7 days (Warm)': 0,
    '8-14 days (Cool)': 0,
    '15-30 days (Stale)': 0,
    '30+ days (Cold)': 0
  };

  unbooked.forEach(l => {
    if (!l.replied_at) return;
    const age = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    if (age <= 3) ageBuckets['0-3 days (Hot)']++;
    else if (age <= 7) ageBuckets['4-7 days (Warm)']++;
    else if (age <= 14) ageBuckets['8-14 days (Cool)']++;
    else if (age <= 30) ageBuckets['15-30 days (Stale)']++;
    else ageBuckets['30+ days (Cold)']++;
  });

  const maxBucket = Math.max(...Object.values(ageBuckets));
  Object.entries(ageBuckets).forEach(([label, count]) => {
    const barLen = Math.floor((count / maxBucket) * 30);
    const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
    const pct = ((count / unbooked.length) * 100).toFixed(1);
    console.log(`  ${label.padEnd(22)} ${bar} ${count.toString().padStart(3)} (${pct}%)`);
  });

  // Velocity metrics
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚡ VELOCITY METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const totalUnbooked = unbooked.length;
  const hotLeads = ageBuckets['0-3 days (Hot)'];
  const coldLeads = ageBuckets['15-30 days (Stale)'] + ageBuckets['30+ days (Cold)'];
  
  const fastResponseRate = ((hotLeads / totalUnbooked) * 100).toFixed(1);
  const staleRate = ((coldLeads / totalUnbooked) * 100).toFixed(1);
  
  console.log(`  🔥 Fast Response Rate:   ${fastResponseRate}% (target: 80%+)`);
  console.log(`  ⚠️  Stale Rate:           ${staleRate}% (target: <20%)`);
  console.log(`  📊 Booking Rate:         ${((booked.length / leads.length) * 100).toFixed(1)}%`);

  // Recommendations
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (parseFloat(fastResponseRate) < 30) {
    console.log('  🚨 CRITICAL: Fast response rate is very low!');
    console.log('     • Set up alerts for new positive replies');
    console.log('     • Respond within 24 hours for 9x conversion');
    console.log('     • Use "node gex.js pulse" to check hourly');
  }

  if (parseFloat(staleRate) > 50) {
    console.log('  ⚠️  HIGH STALE RATE: Too many leads going cold');
    console.log('     • Run "node gex.js reactivate" for win-back campaign');
    console.log('     • Process 10 stale leads daily');
    console.log('     • Consider closing very old leads');
  }

  if (ageBuckets['Meeting Request'] > 30) {
    console.log('  📅 MEETING BOTTLENECK: Many unbooked meeting requests');
    console.log('     • Run "node gex.js calendar" to generate booking messages');
    console.log('     • Focus on enterprise accounts first');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

module.exports = { analyzeVelocity };

if (require.main === module) {
  analyzeVelocity().catch(console.error);
}
