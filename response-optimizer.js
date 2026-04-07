#!/usr/bin/env node
/**
 * Response Time Optimizer
 * 
 * Analyzes response patterns and suggests:
 * - Best times to follow up
 * - Leads requiring immediate attention
 * - Response time improvements
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function analyzeResponseTimes() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  const now = Date.now();
  
  // Categorize by age
  const ageGroups = {
    immediate: [], // 0-1 days - respond NOW
    urgent: [],    // 2-3 days - respond TODAY
    soon: [],      // 4-7 days - respond this week
    stale: [],     // 8-14 days - at risk
    cold: []       // 15+ days - likely lost
  };

  leads.filter(l => l.reply_category !== 'Booked').forEach(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    const enriched = { ...lead, age };
    
    if (age <= 1) ageGroups.immediate.push(enriched);
    else if (age <= 3) ageGroups.urgent.push(enriched);
    else if (age <= 7) ageGroups.soon.push(enriched);
    else if (age <= 14) ageGroups.stale.push(enriched);
    else ageGroups.cold.push(enriched);
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  ⏱️  RESPONSE TIME OPTIMIZER                                          ║
║  Never miss the optimal response window                              ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Response window analysis
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    RESPONSE WINDOWS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const windows = [
    { name: '🔴 IMMEDIATE (0-1d)', data: ageGroups.immediate, rate: '9x conversion', color: '\x1b[31m' },
    { name: '🟠 URGENT (2-3d)', data: ageGroups.urgent, rate: '4x conversion', color: '\x1b[33m' },
    { name: '🟡 SOON (4-7d)', data: ageGroups.soon, rate: '2x conversion', color: '\x1b[33m' },
    { name: '⚪ AT RISK (8-14d)', data: ageGroups.stale, rate: '1x conversion', color: '\x1b[37m' },
    { name: '🔵 COLD (15+d)', data: ageGroups.cold, rate: '0.5x conversion', color: '\x1b[34m' }
  ];

  windows.forEach(w => {
    const bar = '█'.repeat(Math.min(30, w.data.length * 2)) + '░'.repeat(Math.max(0, 30 - w.data.length * 2));
    console.log(`  ${w.name.padEnd(22)} ${bar} ${w.data.length.toString().padStart(3)}`);
    console.log(`  ${' '.repeat(22)} ${w.rate}`);
    console.log('');
  });

  // Immediate action needed
  if (ageGroups.immediate.length > 0 || ageGroups.urgent.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('                    🚨 RESPOND NOW');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const urgent = [...ageGroups.immediate, ...ageGroups.urgent];
    urgent.forEach(lead => {
      const emoji = lead.age <= 1 ? '🔴' : '🟠';
      console.log(`  ${emoji} ${(lead.lead_name || 'N/A').padEnd(25)} ${lead.age}d`);
      console.log(`     ${lead.lead_email}`);
      console.log(`     ${lead.reply_category}`);
      console.log('');
    });
  }

  // Response time recommendations
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    📊 RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const totalUnbooked = leads.filter(l => l.reply_category !== 'Booked').length;
  const respondedFast = ageGroups.immediate.length + ageGroups.urgent.length;
  const atRisk = ageGroups.stale.length + ageGroups.cold.length;
  const fastResponseRate = ((respondedFast / totalUnbooked) * 100).toFixed(1);

  console.log(`  📈 Fast Response Rate: ${fastResponseRate}% (within 3 days)`);
  console.log(`     Target: 80%+`);
  console.log('');
  console.log(`  ⚠️  At Risk Leads: ${atRisk} (${((atRisk / totalUnbooked) * 100).toFixed(1)}%)`);
  console.log(`     Action: Follow up or close out`);
  console.log('');

  if (ageGroups.cold.length > 20) {
    console.log(`  🧊 Cold Lead Backlog: ${ageGroups.cold.length} leads`);
    console.log(`     Suggestion: Run a reactivation campaign`);
    console.log('');
  }

  // Action plan
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    📋 TODAY\'S ACTION PLAN');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let actionNum = 1;
  if (ageGroups.immediate.length > 0) {
    console.log(`  ${actionNum++}. Respond to ${ageGroups.immediate.length} immediate leads (0-1 day old)`);
  }
  if (ageGroups.urgent.length > 0) {
    console.log(`  ${actionNum++}. Follow up on ${ageGroups.urgent.length} urgent leads (2-3 days)`);
  }
  if (ageGroups.stale.length > 0) {
    console.log(`  ${actionNum++}. Process ${Math.min(10, ageGroups.stale.length)} at-risk leads`);
  }

  console.log(`\n  Time estimate: ${(ageGroups.immediate.length + ageGroups.urgent.length) * 5 + Math.min(10, ageGroups.stale.length) * 3} minutes`);
  
  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    await analyzeResponseTimes();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { analyzeResponseTimes };

if (require.main === module) {
  main();
}
