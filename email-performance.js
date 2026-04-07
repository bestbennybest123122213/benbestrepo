#!/usr/bin/env node
/**
 * Email Performance Analyzer
 * 
 * Analyzes campaign performance to find:
 * - Best performing subject lines
 * - Optimal send times
 * - Top performing campaigns
 * - Conversion funnel analysis
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function analyzePerformance() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log('📊 Analyzing email performance...\n');

  // Get campaign data from dashboard API (Node 18+ has native fetch)
  try {
    const res = await globalThis.fetch('http://localhost:3456/api/dashboard');
    const data = await res.json();
    
    if (!data.campaigns) {
      console.log('No campaign data available. Is the dashboard running?');
      return;
    }

    const campaigns = data.campaigns;
    
    // Sort by positive reply rate
    const byReplyRate = [...campaigns]
      .filter(c => c.sent > 100) // Only campaigns with significant volume
      .sort((a, b) => parseFloat(b.positiveReplyRate) - parseFloat(a.positiveReplyRate));
    
    // Sort by total replies
    const byVolume = [...campaigns]
      .sort((a, b) => b.replied - a.replied);
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📈 TOP CAMPAIGNS BY POSITIVE REPLY RATE');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    for (const c of byReplyRate.slice(0, 5)) {
      const rate = parseFloat(c.positiveReplyRate).toFixed(1);
      const bar = '█'.repeat(Math.min(20, Math.round(rate / 5)));
      console.log(`${c.name.substring(0, 50).padEnd(50)}`);
      console.log(`   ${bar} ${rate}% positive`);
      console.log(`   Sent: ${c.sent} | Replied: ${c.replied} | Interested: ${c.interested}`);
      console.log('');
    }
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📊 TOP CAMPAIGNS BY REPLY VOLUME');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    for (const c of byVolume.slice(0, 5)) {
      console.log(`${c.name.substring(0, 50).padEnd(50)}`);
      console.log(`   Replied: ${c.replied} | Rate: ${parseFloat(c.replyRate).toFixed(2)}%`);
      console.log(`   Interested: ${c.interested} (${parseFloat(c.positiveReplyRate).toFixed(1)}% positive)`);
      console.log('');
    }
    
    // Aggregate stats
    const totalSent = campaigns.reduce((sum, c) => sum + c.sent, 0);
    const totalReplied = campaigns.reduce((sum, c) => sum + c.replied, 0);
    const totalInterested = campaigns.reduce((sum, c) => sum + c.interested, 0);
    const avgReplyRate = (totalReplied / totalSent * 100).toFixed(2);
    const avgPositiveRate = (totalInterested / totalReplied * 100).toFixed(2);
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 AGGREGATE STATS');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    console.log(`   Total campaigns:    ${campaigns.length}`);
    console.log(`   Total sent:         ${totalSent.toLocaleString()}`);
    console.log(`   Total replied:      ${totalReplied.toLocaleString()}`);
    console.log(`   Total interested:   ${totalInterested.toLocaleString()}`);
    console.log(`   Avg reply rate:     ${avgReplyRate}%`);
    console.log(`   Avg positive rate:  ${avgPositiveRate}%`);
    
    // Campaign type analysis (HyperTide vs Google)
    const hypertide = campaigns.filter(c => c.name.includes('HYPERTIDE'));
    const google = campaigns.filter(c => c.name.includes('GOOGLE'));
    
    if (hypertide.length > 0 && google.length > 0) {
      const htSent = hypertide.reduce((sum, c) => sum + c.sent, 0);
      const htReplied = hypertide.reduce((sum, c) => sum + c.replied, 0);
      const htInterested = hypertide.reduce((sum, c) => sum + c.interested, 0);
      
      const gSent = google.reduce((sum, c) => sum + c.sent, 0);
      const gReplied = google.reduce((sum, c) => sum + c.replied, 0);
      const gInterested = google.reduce((sum, c) => sum + c.interested, 0);
      
      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('🔥 HYPERTIDE vs GOOGLE COMPARISON');
      console.log('════════════════════════════════════════════════════════════════\n');
      
      console.log('   HYPERTIDE:');
      console.log(`      Campaigns: ${hypertide.length}`);
      console.log(`      Sent: ${htSent.toLocaleString()} | Replied: ${htReplied} | Rate: ${(htReplied/htSent*100).toFixed(2)}%`);
      console.log(`      Interested: ${htInterested} | Positive: ${(htInterested/htReplied*100).toFixed(1)}%`);
      
      console.log('\n   GOOGLE:');
      console.log(`      Campaigns: ${google.length}`);
      console.log(`      Sent: ${gSent.toLocaleString()} | Replied: ${gReplied} | Rate: ${(gReplied/gSent*100).toFixed(2)}%`);
      console.log(`      Interested: ${gInterested} | Positive: ${(gInterested/gReplied*100).toFixed(1)}%`);
      
      const winner = (htInterested/htReplied) > (gInterested/gReplied) ? 'HYPERTIDE' : 'GOOGLE';
      console.log(`\n   🏆 Winner by positive rate: ${winner}`);
    }
    
    // Recommendations
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('💡 RECOMMENDATIONS');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    const bestCampaign = byReplyRate[0];
    const worstCampaign = byReplyRate[byReplyRate.length - 1];
    
    if (bestCampaign) {
      console.log(`   ✅ REPLICATE: "${bestCampaign.name.substring(0, 40)}..."`);
      console.log(`      This campaign has ${bestCampaign.positiveReplyRate}% positive rate`);
    }
    
    if (worstCampaign && parseFloat(worstCampaign.positiveReplyRate) < 15) {
      console.log(`\n   ⚠️  REVIEW: "${worstCampaign.name.substring(0, 40)}..."`);
      console.log(`      Only ${worstCampaign.positiveReplyRate}% positive rate - consider pausing`);
    }
    
    // High bounce alerts
    const highBounce = campaigns.filter(c => parseFloat(c.bounceRate) > 3);
    if (highBounce.length > 0) {
      console.log(`\n   🚨 HIGH BOUNCE: ${highBounce.length} campaigns with >3% bounce rate`);
      for (const c of highBounce.slice(0, 3)) {
        console.log(`      - ${c.name.substring(0, 40)}... (${c.bounceRate}%)`);
      }
    }
    
    console.log('\n════════════════════════════════════════════════════════════════\n');
    
  } catch (err) {
    console.error('Error fetching dashboard data:', err.message);
    console.log('Make sure the dashboard server is running on localhost:3456');
  }
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📊 EMAIL PERFORMANCE ANALYZER                                ║
║  Insights to optimize your campaigns                          ║
╚═══════════════════════════════════════════════════════════════╝
`);

  await analyzePerformance();
}

module.exports = { analyzePerformance };

if (require.main === module) {
  main();
}
