#!/usr/bin/env node
/**
 * Daily Planner
 * 
 * Generates a complete daily action plan:
 * - Priority leads to contact
 * - Scheduled follow-ups
 * - Goals progress
 * - Time estimates
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function generateDailyPlan() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Categorize leads
  const hot = leads.filter(l => getAge(l) <= 3);
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise';
  });
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const stale = leads.filter(l => getAge(l) > 14);

  const date = new Date();
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   📋 DAILY ACTION PLAN                                                   ║
║   ${dayName}, ${dateStr}                                             
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Morning priorities
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('☀️  MORNING PRIORITIES (9:00-12:00)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let taskNum = 1;
  let totalTime = 0;

  // Hot leads first
  if (hot.length > 0) {
    console.log(`  🔥 RESPOND TO HOT LEADS (${hot.length})`);
    console.log('     These leads are fresh - 9x higher conversion rate!\n');
    hot.slice(0, 5).forEach(l => {
      const info = getCompanyInfo(l.lead_email);
      console.log(`     ${taskNum}. ${l.lead_name || 'N/A'} @ ${info?.name || 'N/A'}`);
      console.log(`        ${l.lead_email} (${l.reply_category})`);
      taskNum++;
    });
    totalTime += hot.length * 5;
    console.log(`\n     ⏱️  Est. time: ${hot.length * 5} min\n`);
  }

  // Enterprise leads
  const uncontactedEnterprise = enterprise.filter(l => !l.follow_up_status || l.follow_up_status === 'pending');
  if (uncontactedEnterprise.length > 0) {
    console.log(`  🏢 ENTERPRISE ACCOUNTS (${uncontactedEnterprise.length})`);
    console.log('     High-value accounts - prioritize these!\n');
    uncontactedEnterprise.slice(0, 5).forEach(l => {
      const info = getCompanyInfo(l.lead_email);
      console.log(`     ${taskNum}. ${l.lead_name || 'N/A'} @ ${info?.name || 'N/A'}`);
      console.log(`        ${info?.funding || ''} - ${l.reply_category}`);
      taskNum++;
    });
    totalTime += uncontactedEnterprise.length * 10;
    console.log(`\n     ⏱️  Est. time: ${uncontactedEnterprise.length * 10} min\n`);
  }

  // Afternoon tasks
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌤️  AFTERNOON TASKS (13:00-17:00)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Book meetings
  const unbookedMeetings = meetings.filter(l => l.reply_category === 'Meeting Request').slice(0, 10);
  if (unbookedMeetings.length > 0) {
    console.log(`  📅 BOOK MEETINGS (${unbookedMeetings.length})`);
    console.log('     Send calendar links to these meeting requests\n');
    unbookedMeetings.slice(0, 5).forEach(l => {
      console.log(`     ${taskNum}. ${l.lead_name || 'N/A'} - ${l.lead_email}`);
      taskNum++;
    });
    if (unbookedMeetings.length > 5) {
      console.log(`     ... +${unbookedMeetings.length - 5} more`);
    }
    totalTime += unbookedMeetings.length * 3;
    console.log(`\n     ⏱️  Est. time: ${unbookedMeetings.length * 3} min\n`);
  }

  // Process stale leads
  if (stale.length > 0) {
    console.log(`  ⏰ PROCESS STALE LEADS (${Math.min(10, stale.length)} of ${stale.length})`);
    console.log('     Follow up or close out\n');
    stale.slice(0, 5).forEach(l => {
      console.log(`     ${taskNum}. ${l.lead_name || 'N/A'} (${getAge(l)} days)`);
      taskNum++;
    });
    totalTime += 10 * 3;
    console.log(`\n     ⏱️  Est. time: 30 min\n`);
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TODAY\'S SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  Tasks:        ${taskNum - 1}`);
  console.log(`  Total time:   ~${Math.ceil(totalTime / 60)} hours`);
  console.log(`\n  Pipeline:`);
  console.log(`  • Hot leads:       ${hot.length}`);
  console.log(`  • Enterprise:      ${enterprise.length}`);
  console.log(`  • Meeting reqs:    ${meetings.length}`);
  console.log(`  • Stale:           ${stale.length}`);

  // Quick tips
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 QUICK TIPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  • Respond to hot leads first - timing is everything');
  console.log('  • Enterprise accounts are worth 10x the effort');
  console.log('  • Use "node gex.js drafts 5" to generate emails');
  console.log('  • Use "node gex.js calendar" for booking messages');
  console.log('  • Mark completed leads: "node gex.js mark <email> contacted"');

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

module.exports = { generateDailyPlan };

if (require.main === module) {
  generateDailyPlan().catch(console.error);
}
