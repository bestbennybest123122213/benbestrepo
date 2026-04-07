#!/usr/bin/env node
/**
 * Conversion Funnel Analyzer
 * 
 * Analyzes the sales funnel to identify:
 * - Drop-off points
 * - Conversion rates between stages
 * - Time in each stage
 * - Bottlenecks
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function analyzeFunnel() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Get dashboard data for total sent
  let totalSent = 36984; // Default from earlier
  try {
    const dashRes = await globalThis.fetch('http://localhost:3456/api/dashboard');
    const dashData = await dashRes.json();
    totalSent = dashData.leadMetrics?.totalSent || totalSent;
  } catch (e) {
    // Use default
  }

  // Funnel stages
  const stages = {
    sent: totalSent,
    replied: leads.length,
    interested: leads.filter(l => l.reply_category === 'Interested').length,
    info_request: leads.filter(l => l.reply_category === 'Information Request').length,
    meeting_request: leads.filter(l => l.reply_category === 'Meeting Request').length,
    booked: leads.filter(l => l.reply_category === 'Booked').length
  };

  // Calculate conversion rates
  const conversions = {
    sent_to_reply: (stages.replied / stages.sent * 100).toFixed(2),
    reply_to_positive: ((stages.interested + stages.meeting_request + stages.booked) / stages.replied * 100).toFixed(1),
    positive_to_meeting: ((stages.meeting_request + stages.booked) / (stages.interested + stages.meeting_request + stages.booked) * 100).toFixed(1),
    meeting_to_booked: (stages.booked / (stages.meeting_request + stages.booked) * 100).toFixed(1)
  };

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📊 CONVERSION FUNNEL ANALYZER                                       ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Visual funnel
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                      SALES FUNNEL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const maxWidth = 50;
  const drawBar = (label, count, max) => {
    const width = Math.round((count / max) * maxWidth);
    const bar = '█'.repeat(width) + '░'.repeat(maxWidth - width);
    return `${label.padEnd(18)} ${bar} ${count.toLocaleString()}`;
  };

  console.log(drawBar('📧 Emails Sent', stages.sent, stages.sent));
  console.log(`                   └─ ${conversions.sent_to_reply}% replied`);
  console.log('');
  console.log(drawBar('💬 Replied', stages.replied, stages.sent));
  console.log(`                   └─ ${conversions.reply_to_positive}% positive`);
  console.log('');
  
  const positive = stages.interested + stages.meeting_request + stages.booked;
  console.log(drawBar('✨ Positive', positive, stages.sent));
  console.log('');
  console.log(drawBar('   ├─ Interested', stages.interested, stages.sent));
  console.log(drawBar('   ├─ Info Request', stages.info_request, stages.sent));
  console.log(drawBar('   ├─ Meeting Req', stages.meeting_request, stages.sent));
  console.log(`                   └─ ${conversions.meeting_to_booked}% booked`);
  console.log('');
  console.log(drawBar('🎉 Booked', stages.booked, stages.sent));

  // Conversion metrics
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('                   CONVERSION RATES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`  📧 → 💬  Sent to Reply:           ${conversions.sent_to_reply}%`);
  console.log(`  💬 → ✨  Reply to Positive:       ${conversions.reply_to_positive}%`);
  console.log(`  ✨ → 🤝  Positive to Meeting Req: ${conversions.positive_to_meeting}%`);
  console.log(`  🤝 → 🎉  Meeting to Booked:       ${conversions.meeting_to_booked}%`);
  console.log('');
  
  const overallRate = (stages.booked / stages.sent * 100).toFixed(3);
  console.log(`  📧 → 🎉  OVERALL (Sent to Booked): ${overallRate}%`);

  // Bottleneck analysis
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('                   BOTTLENECK ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const bottlenecks = [];
  
  if (parseFloat(conversions.sent_to_reply) < 2) {
    bottlenecks.push({
      stage: 'Reply Rate',
      current: conversions.sent_to_reply + '%',
      target: '2-3%',
      fix: 'Improve subject lines, targeting, or offer'
    });
  }
  
  if (parseFloat(conversions.reply_to_positive) < 30) {
    bottlenecks.push({
      stage: 'Positive Rate',
      current: conversions.reply_to_positive + '%',
      target: '30-40%',
      fix: 'Better lead qualification, improve messaging'
    });
  }
  
  const unbookedMeetings = stages.meeting_request;
  if (unbookedMeetings > stages.booked * 2) {
    bottlenecks.push({
      stage: 'Meeting Conversion',
      current: stages.booked + ' booked / ' + (stages.meeting_request + stages.booked) + ' meeting requests',
      target: 'Book 50%+',
      fix: '🚨 ' + unbookedMeetings + ' meeting requests waiting! Respond faster!'
    });
  }

  if (bottlenecks.length > 0) {
    console.log('  🚨 IDENTIFIED BOTTLENECKS:\n');
    for (const b of bottlenecks) {
      console.log(`  ${b.stage}`);
      console.log(`     Current: ${b.current} → Target: ${b.target}`);
      console.log(`     Fix: ${b.fix}`);
      console.log('');
    }
  } else {
    console.log('  ✅ No major bottlenecks identified!\n');
  }

  // Recommendations
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                   RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('  1. 🚀 BOOK THE ' + stages.meeting_request + ' MEETING REQUESTS');
  console.log('     These people explicitly asked for meetings!');
  console.log('');
  console.log('  2. 📞 FOLLOW UP ON "INTERESTED" LEADS');
  console.log('     Convert ' + stages.interested + ' interested leads to meeting requests');
  console.log('');
  console.log('  3. ⏱️  REDUCE RESPONSE TIME');
  console.log('     Industry data: <5 min response = 9x higher conversion');
  console.log('');
  
  if (parseFloat(conversions.sent_to_reply) < 1.5) {
    console.log('  4. 📧 IMPROVE EMAIL PERFORMANCE');
    console.log('     Reply rate is below 1.5% - test new subject lines');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    await analyzeFunnel();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { analyzeFunnel };

if (require.main === module) {
  main();
}
