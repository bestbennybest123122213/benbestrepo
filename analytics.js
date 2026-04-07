#!/usr/bin/env node
/**
 * Analytics Summary
 * 
 * Key business metrics for decision making.
 * 
 * Usage:
 *   node analytics.js           # Full analytics
 *   node analytics.js --quick   # Key numbers only
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');

async function getAnalytics() {
  const client = initSupabase();
  if (!client) {
    console.log('Database not available');
    return;
  }

  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Get all leads
  const { data: allLeads } = await client
    .from('positive_replies')
    .select('*');

  const { data: monthLeads } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString());

  const { data: weekLeads } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', sevenDaysAgo.toISOString());

  // Calculate metrics
  const totalLeads = allLeads?.length || 0;
  const monthlyLeads = monthLeads?.length || 0;
  const weeklyLeads = weekLeads?.length || 0;

  const booked = (allLeads || []).filter(l => 
    l.reply_category === 'Booked' || l.reply_category === 'Meeting Booked'
  ).length;

  const pending = (allLeads || []).filter(l => 
    l.follow_up_status === 'pending' && l.reply_category !== 'Booked'
  ).length;

  const meetingRequests = (allLeads || []).filter(l => 
    l.reply_category === 'Meeting Request'
  ).length;

  // Age analysis
  const ages = (allLeads || [])
    .filter(l => l.follow_up_status === 'pending')
    .map(l => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999);
  
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  const hot = ages.filter(a => a <= 3).length;
  const stale = ages.filter(a => a > 14).length;

  // Conversion rates
  const bookingRate = meetingRequests > 0 ? Math.round((booked / meetingRequests) * 100) : 0;

  // Revenue data
  let totalRevenue = 0;
  let pipelineValue = 0;
  
  try {
    const commPath = './data/commissions.json';
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      const comms = data.commissions || data || [];
      totalRevenue = comms.reduce((sum, c) => sum + (c.commission || 0), 0);
    }
  } catch (e) {}

  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      const deals = data.deals || data || [];
      pipelineValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
    }
  } catch (e) {}

  if (QUICK) {
    console.log(`
📊 KEY METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Leads (7d):     ${weeklyLeads}
Leads (30d):    ${monthlyLeads}
Hot leads:      ${hot}
Pending:        ${pending}
Booking rate:   ${bookingRate}%
Pipeline:       $${pipelineValue.toLocaleString()}
Avg lead age:   ${avgAge} days
`);
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📊 ANALYTICS SUMMARY                                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

📈 LEAD VOLUME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   This week:      ${weeklyLeads} leads
   This month:     ${monthlyLeads} leads
   All time:       ${totalLeads} leads

🎯 PIPELINE STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔴 Hot (0-3d):  ${hot} leads
   ⚪ Stale (14+d): ${stale} leads
   📋 Pending:     ${pending} leads
   Avg age:        ${avgAge} days

📅 MEETINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Meeting requests: ${meetingRequests}
   Meetings booked:  ${booked}
   Booking rate:     ${bookingRate}% ${bookingRate >= 40 ? '✅' : '⚠️'}

💰 REVENUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Historical:      $${Math.round(totalRevenue).toLocaleString()}
   Pipeline:        $${pipelineValue.toLocaleString()}
   Expected (30%):  $${Math.round(pipelineValue * 0.3).toLocaleString()}

🎯 KEY INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Generate insights
  if (hot > 0) {
    console.log(`   🔴 ${hot} hot leads need response TODAY`);
  }
  if (avgAge > 14) {
    console.log(`   ⚠️  Average lead age is ${avgAge} days - need faster follow-up`);
  }
  if (stale > pending * 0.5) {
    console.log(`   ⚠️  ${Math.round(stale/pending*100)}% of pipeline is stale`);
  }
  if (bookingRate < 30) {
    console.log(`   ⚠️  Booking rate is low - focus on converting meeting requests`);
  }
  if (hot === 0 && avgAge <= 7) {
    console.log(`   ✅ Pipeline is healthy`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: ${new Date().toLocaleString()}
`);
}

getAnalytics().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
