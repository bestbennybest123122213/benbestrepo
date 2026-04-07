#!/usr/bin/env node
/**
 * Opportunity Finder
 * 
 * Identifies quick wins and easy opportunities:
 * - Meeting requests not yet booked
 * - Fresh leads not yet contacted
 * - Enterprise leads without follow-up
 * - Leads close to going stale
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function findOpportunities() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // 1. Meeting requests not booked (highest priority)
  const meetingRequests = leads.filter(l => l.reply_category === 'Meeting Request');
  
  // 2. Fresh leads (last 7 days) not booked
  const fresh = leads.filter(l => getAge(l) <= 7 && l.reply_category !== 'Booked');

  // 3. Enterprise leads not booked
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
  });

  // 4. About to go stale (10-14 days)
  const aboutToStale = leads.filter(l => {
    const age = getAge(l);
    return age >= 10 && age <= 14 && l.reply_category !== 'Booked';
  });

  // 5. Quick wins - interested + enterprise + fresh
  const quickWins = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    const age = getAge(l);
    return (info?.tier === 'enterprise' || info?.tier === 'midmarket') 
      && age <= 14 
      && l.reply_category !== 'Booked';
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🎯 OPPORTUNITY FINDER                                               ║
║  Quick wins and easy conversions                                     ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // URGENT: Meeting requests
  console.log('🚨 URGENT: MEETING REQUESTS (' + meetingRequests.length + ')');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('These people ASKED for a meeting. Book them NOW.\n');
  
  for (const l of meetingRequests.slice(0, 8)) {
    const info = getCompanyInfo(l.lead_email);
    const age = getAge(l);
    const urgency = age <= 3 ? '🔴' : age <= 7 ? '🟡' : '⚪';
    console.log(`  ${urgency} ${(l.lead_name || 'N/A').padEnd(25)} @ ${(info?.name || l.lead_company || 'N/A').padEnd(20)} (${age}d)`);
  }
  if (meetingRequests.length > 8) {
    console.log(`  ... +${meetingRequests.length - 8} more`);
  }

  // Fresh opportunities
  console.log('\n\n🆕 FRESH LEADS (<7 DAYS) - ' + fresh.length);
  console.log('────────────────────────────────────────────────────────────────');
  console.log('High response rate window. Act now.\n');
  
  for (const l of fresh.slice(0, 5)) {
    const info = getCompanyInfo(l.lead_email);
    const age = getAge(l);
    console.log(`  ${(l.lead_name || 'N/A').padEnd(25)} @ ${(info?.name || l.lead_company || 'N/A').padEnd(20)}`);
    console.log(`     ${l.reply_category} | ${age} days | ${l.lead_email}`);
    console.log('');
  }

  // Enterprise
  if (enterprise.length > 0) {
    console.log('\n🏢 ENTERPRISE LEADS NOT BOOKED - ' + enterprise.length);
    console.log('────────────────────────────────────────────────────────────────');
    console.log('High-value accounts. Prioritize.\n');
    
    for (const l of enterprise.slice(0, 5)) {
      const info = getCompanyInfo(l.lead_email);
      const age = getAge(l);
      console.log(`  ${(l.lead_name || 'N/A').padEnd(25)} @ ${info?.name || 'N/A'}`);
      console.log(`     ${l.reply_category} | ${info?.funding || 'N/A'} | ${age} days`);
      console.log('');
    }
  }

  // About to go stale
  if (aboutToStale.length > 0) {
    console.log('\n⏰ ABOUT TO GO STALE (10-14 DAYS) - ' + aboutToStale.length);
    console.log('────────────────────────────────────────────────────────────────');
    console.log('Last chance before they go cold.\n');
    
    for (const l of aboutToStale.slice(0, 5)) {
      const age = getAge(l);
      const daysLeft = 14 - age;
      console.log(`  ${(l.lead_name || 'N/A').padEnd(25)} - ${daysLeft} days left!`);
    }
  }

  // Summary
  console.log('\n\n════════════════════════════════════════════════════════════════');
  console.log('📊 OPPORTUNITY SUMMARY');
  console.log('════════════════════════════════════════════════════════════════\n');
  
  console.log(`  🎯 Total opportunities:    ${leads.length - leads.filter(l => l.reply_category === 'Booked').length}`);
  console.log(`  🚨 Meeting requests:       ${meetingRequests.length}`);
  console.log(`  🆕 Fresh (<7d):            ${fresh.length}`);
  console.log(`  🏢 Enterprise unbooked:    ${enterprise.length}`);
  console.log(`  ⏰ About to stale:         ${aboutToStale.length}`);
  console.log(`  🏆 Quick wins:             ${quickWins.length}`);

  // Estimated value
  const avgDealValue = 5000; // Estimated
  const conversionRate = 0.3;
  const estimatedPipeline = quickWins.length * avgDealValue * conversionRate;
  
  console.log(`\n  💰 Estimated pipeline value: $${estimatedPipeline.toLocaleString()}`);
  console.log(`     (Based on ${quickWins.length} quick wins @ $${avgDealValue} avg, 30% close rate)`);

  console.log('\n');
}

async function main() {
  try {
    await findOpportunities();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { findOpportunities };

if (require.main === module) {
  main();
}
