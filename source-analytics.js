#!/usr/bin/env node
/**
 * Source Analytics - Track which lead sources convert best
 * Usage: node source-analytics.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function sourceAnalytics() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  📊 SOURCE ANALYTICS - Lead Source Performance                ║
╚══════════════════════════════════════════════════════════════╝
`);

  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*');
  
  if (!leads) {
    console.log('Error fetching data');
    return;
  }

  // Categorize by source from notes
  const sources = {
    cold_email: { total: 0, booked: 0, scheduling: 0, notBooked: 0 },
    inbound: { total: 0, booked: 0, scheduling: 0, notBooked: 0 },
    reactivation: { total: 0, booked: 0, scheduling: 0, notBooked: 0 },
    unknown: { total: 0, booked: 0, scheduling: 0, notBooked: 0 }
  };

  leads.forEach(l => {
    const notes = (l.notes || '').toLowerCase();
    let source = 'unknown';
    
    if (notes.includes('[cold_email]')) source = 'cold_email';
    else if (notes.includes('[inbound]')) source = 'inbound';
    else if (notes.includes('[reactivation]')) source = 'reactivation';
    
    sources[source].total++;
    
    if (l.status === 'Booked') sources[source].booked++;
    else if (l.status === 'Scheduling') sources[source].scheduling++;
    else if (l.status === 'Not booked') sources[source].notBooked++;
  });

  console.log('📈 CONVERSION BY SOURCE\n');
  console.log('Source          Total    Booked    Rate      Scheduling    Not Booked');
  console.log('─'.repeat(70));
  
  const sourceOrder = ['cold_email', 'inbound', 'reactivation', 'unknown'];
  const sourceNames = {
    cold_email: '🧊 Cold Email',
    inbound: '📥 Inbound',
    reactivation: '🔄 Reactivation',
    unknown: '❓ Unknown'
  };
  
  sourceOrder.forEach(s => {
    const data = sources[s];
    if (data.total === 0) return;
    
    const rate = ((data.booked / data.total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(parseFloat(rate) / 5)) + '░'.repeat(20 - Math.floor(parseFloat(rate) / 5));
    
    console.log(
      `${sourceNames[s].padEnd(16)} ${String(data.total).padStart(5)}    ${String(data.booked).padStart(6)}    ${rate.padStart(5)}%    ${String(data.scheduling).padStart(10)}    ${String(data.notBooked).padStart(10)}`
    );
    console.log(`                 ${bar}`);
  });

  // Best performer
  const ranked = sourceOrder
    .map(s => ({ source: s, rate: sources[s].total > 0 ? sources[s].booked / sources[s].total : 0, total: sources[s].total }))
    .filter(s => s.total > 5) // Need at least 5 leads for meaningful comparison
    .sort((a, b) => b.rate - a.rate);

  if (ranked.length > 0) {
    console.log(`
💡 INSIGHTS

Best converting source: ${sourceNames[ranked[0].source]} (${(ranked[0].rate * 100).toFixed(1)}%)
`);
  }

  // Overall
  const totalLeads = leads.length;
  const totalBooked = leads.filter(l => l.status === 'Booked').length;
  const overallRate = ((totalBooked / totalLeads) * 100).toFixed(1);
  
  console.log(`
📊 OVERALL
   Total:     ${totalLeads} leads
   Booked:    ${totalBooked} (${overallRate}%)
`);

  // Recommendations
  console.log('🎯 RECOMMENDATIONS');
  
  if (sources.inbound.total > 0 && (sources.inbound.booked / sources.inbound.total) > (sources.cold_email.booked / sources.cold_email.total)) {
    console.log('   • Inbound converts better - consider increasing inbound lead gen');
  }
  
  if (sources.cold_email.scheduling > 50) {
    console.log('   • ' + sources.cold_email.scheduling + ' cold email leads in Scheduling - prioritize follow-ups');
  }
  
  if (sources.unknown.total > 10) {
    console.log('   • ' + sources.unknown.total + ' leads without source tag - consider tagging for better tracking');
  }
  
  console.log('');
}

sourceAnalytics();
