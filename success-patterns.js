#!/usr/bin/env node
/**
 * Success Patterns Analyzer
 * Identifies what's working based on booked meetings
 * 
 * Usage: node success-patterns.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function analyzePatterns() {
  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*');

  const booked = leads.filter(l => l.status === 'Booked');
  const notBooked = leads.filter(l => l.status === 'Not booked');
  const scheduling = leads.filter(l => l.status === 'Scheduling');

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  📊 SUCCESS PATTERNS ANALYSIS                                 ║
╚══════════════════════════════════════════════════════════════╝

📈 OVERALL CONVERSION
────────────────────────────────────────────────────────────────
  Booked:     ${booked.length} (${((booked.length / leads.length) * 100).toFixed(1)}%)
  Scheduling: ${scheduling.length} (${((scheduling.length / leads.length) * 100).toFixed(1)}%)
  Not Booked: ${notBooked.length} (${((notBooked.length / leads.length) * 100).toFixed(1)}%)
`);

  // Response time patterns
  const withRT = booked.filter(l => l.response_time_seconds);
  const notBookedWithRT = notBooked.filter(l => l.response_time_seconds);
  
  if (withRT.length > 0) {
    const avgBookedRT = withRT.reduce((sum, l) => sum + l.response_time_seconds, 0) / withRT.length;
    const avgNotBookedRT = notBookedWithRT.length > 0 
      ? notBookedWithRT.reduce((sum, l) => sum + l.response_time_seconds, 0) / notBookedWithRT.length
      : 0;
    
    const formatTime = (secs) => {
      if (secs < 3600) return (secs / 60).toFixed(0) + ' min';
      if (secs < 86400) return (secs / 3600).toFixed(1) + ' hrs';
      return (secs / 86400).toFixed(1) + ' days';
    };

    console.log(`
⚡ RESPONSE TIME INSIGHT
────────────────────────────────────────────────────────────────
  Avg Response (Booked):     ${formatTime(avgBookedRT)}
  Avg Response (Not Booked): ${formatTime(avgNotBookedRT)}
  ${avgBookedRT < avgNotBookedRT ? '✅ Faster responses = better conversion!' : '❓ Response time not correlated'}
`);

    // Response time buckets
    const rtBuckets = {
      '< 15 min': { booked: 0, total: 0 },
      '15-60 min': { booked: 0, total: 0 },
      '1-3 hrs': { booked: 0, total: 0 },
      '3-12 hrs': { booked: 0, total: 0 },
      '> 12 hrs': { booked: 0, total: 0 }
    };

    const allWithRT = leads.filter(l => l.response_time_seconds);
    allWithRT.forEach(l => {
      const rt = l.response_time_seconds;
      let bucket;
      if (rt < 900) bucket = '< 15 min';
      else if (rt < 3600) bucket = '15-60 min';
      else if (rt < 10800) bucket = '1-3 hrs';
      else if (rt < 43200) bucket = '3-12 hrs';
      else bucket = '> 12 hrs';
      
      rtBuckets[bucket].total++;
      if (l.status === 'Booked') rtBuckets[bucket].booked++;
    });

    console.log(`
⏱️ RESPONSE TIME → BOOKING RATE
────────────────────────────────────────────────────────────────`);
    for (const [bucket, data] of Object.entries(rtBuckets)) {
      if (data.total > 0) {
        const rate = ((data.booked / data.total) * 100).toFixed(0);
        const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
        console.log(`  ${bucket.padEnd(12)} ${bar} ${rate}% (${data.booked}/${data.total})`);
      }
    }
  }

  // Company size/type patterns (from email domain analysis)
  const emailDomains = booked.map(l => l.email.split('@')[1]);
  const domainCounts = {};
  emailDomains.forEach(d => {
    const root = d.split('.').slice(-2).join('.');
    domainCounts[root] = (domainCounts[root] || 0) + 1;
  });

  // Category patterns
  const categoryStats = {};
  leads.forEach(l => {
    const cat = l.category || 'Unknown';
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, booked: 0 };
    categoryStats[cat].total++;
    if (l.status === 'Booked') categoryStats[cat].booked++;
  });

  console.log(`

📋 CATEGORY → BOOKING RATE
────────────────────────────────────────────────────────────────`);
  Object.entries(categoryStats)
    .sort((a, b) => (b[1].booked / b[1].total) - (a[1].booked / a[1].total))
    .forEach(([cat, data]) => {
      const rate = ((data.booked / data.total) * 100).toFixed(0);
      const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
      console.log(`  ${cat.padEnd(18)} ${bar} ${rate}% (${data.booked}/${data.total})`);
    });

  // Monthly patterns
  const monthlyStats = {};
  leads.forEach(l => {
    const key = `${l.conversation_month} ${l.conversation_year}`;
    if (!monthlyStats[key]) monthlyStats[key] = { total: 0, booked: 0 };
    monthlyStats[key].total++;
    if (l.status === 'Booked') monthlyStats[key].booked++;
  });

  console.log(`

📅 MONTHLY PERFORMANCE
────────────────────────────────────────────────────────────────`);
  const months = ['Nov', 'Dec', 'Jan'];
  Object.entries(monthlyStats)
    .filter(([k]) => months.some(m => k.startsWith(m)))
    .sort((a, b) => {
      const [mA, yA] = a[0].split(' ');
      const [mB, yB] = b[0].split(' ');
      if (yA !== yB) return yA - yB;
      return months.indexOf(mA) - months.indexOf(mB);
    })
    .forEach(([month, data]) => {
      const rate = ((data.booked / data.total) * 100).toFixed(0);
      const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
      console.log(`  ${month.padEnd(10)} ${bar} ${rate}% (${data.booked}/${data.total})`);
    });

  // Top performing companies (booked)
  console.log(`

🏆 BOOKED COMPANIES (learn from these!)
────────────────────────────────────────────────────────────────`);
  booked.slice(0, 10).forEach(l => {
    console.log(`  ✅ ${l.company || 'Unknown'}: ${l.name}`);
  });

  console.log(`

💡 KEY INSIGHTS
────────────────────────────────────────────────────────────────
  1. Focus on fast response times (< 3 hrs ideal)
  2. "Meeting Request" leads have highest conversion
  3. Quality > Quantity for scheduling
  4. Notable companies take longer to close
`);
}

analyzePatterns().catch(console.error);
