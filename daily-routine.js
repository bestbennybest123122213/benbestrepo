#!/usr/bin/env node
/**
 * Daily Routine - The ONE script to run every morning
 * 
 * Runs all essential checks and generates actionable output
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function runDailyRoutine() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const now = new Date();
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🌅 DAILY ROUTINE - ${today.padEnd(30)}     ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // 1. Get all leads
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  // 2. Categorize
  const categories = {
    booked: leads.filter(l => l.reply_category === 'Booked'),
    meeting_request: leads.filter(l => l.reply_category === 'Meeting Request'),
    interested: leads.filter(l => l.reply_category === 'Interested'),
    info_request: leads.filter(l => l.reply_category === 'Information Request')
  };

  // 3. Calculate ages
  const getAge = (lead) => {
    if (!lead.replied_at) return 0;
    return Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24));
  };

  const stale = leads.filter(l => getAge(l) > 14);
  const critical = leads.filter(l => getAge(l) > 60);
  const fresh = leads.filter(l => getAge(l) <= 3);

  // 4. Enterprise leads
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise';
  });

  // 5. Print summary
  console.log('📊 PIPELINE SUMMARY');
  console.log('────────────────────────────────────────');
  console.log('  🎉 Booked:          ' + categories.booked.length);
  console.log('  🤝 Meeting Request: ' + categories.meeting_request.length);
  console.log('  ✨ Interested:      ' + categories.interested.length);
  console.log('  ❓ Info Request:    ' + categories.info_request.length);
  console.log('  ────────────────────');
  console.log('  📈 Total:           ' + leads.length);
  console.log('');

  // 6. Alerts
  console.log('⚠️  ALERTS');
  console.log('────────────────────────────────────────');
  if (critical.length > 0) {
    console.log('  🚨 CRITICAL: ' + critical.length + ' leads >60 days old!');
  }
  if (stale.length > 0) {
    console.log('  ⏰ STALE: ' + stale.length + ' leads >14 days old');
  }
  if (fresh.length > 0) {
    console.log('  🆕 FRESH: ' + fresh.length + ' leads in last 3 days');
  }
  console.log('');

  // 7. Priority Actions
  console.log('🎯 PRIORITY ACTIONS');
  console.log('════════════════════════════════════════');
  
  // Get unboooked enterprise
  const hotEnterprise = enterprise.filter(l => 
    l.reply_category === 'Meeting Request' || l.reply_category === 'Interested'
  );
  
  if (hotEnterprise.length > 0) {
    console.log('\n1️⃣  ENTERPRISE LEADS (respond first!)');
    for (const l of hotEnterprise.slice(0, 5)) {
      const info = getCompanyInfo(l.lead_email);
      const age = getAge(l);
      console.log('   ' + (l.lead_name || 'N/A').padEnd(25) + ' @ ' + (info?.name || l.lead_company || 'N/A'));
      console.log('      📧 ' + l.lead_email);
      console.log('      📊 ' + l.reply_category + ' | ⏰ ' + age + ' days');
      console.log('');
    }
  }

  // Fresh meeting requests
  const freshMeetings = categories.meeting_request.filter(l => getAge(l) <= 7);
  if (freshMeetings.length > 0) {
    console.log('2️⃣  FRESH MEETING REQUESTS (<7 days)');
    for (const l of freshMeetings.slice(0, 5)) {
      console.log('   ' + (l.lead_name || 'N/A').padEnd(25) + ' @ ' + (l.lead_company || 'N/A'));
      console.log('      📧 ' + l.lead_email);
      console.log('');
    }
  }

  // Critical stale
  if (critical.length > 0) {
    console.log('3️⃣  CRITICAL STALE (clear today!)');
    for (const l of critical.slice(0, 5)) {
      const age = getAge(l);
      console.log('   ' + (l.lead_name || 'N/A').padEnd(25) + ' - ' + age + ' days');
      console.log('      Action: Close or resurrect');
      console.log('');
    }
  }

  // 8. Checklist
  console.log('');
  console.log('✅ DAILY CHECKLIST');
  console.log('────────────────────────────────────────');
  console.log('  [ ] Check inbox for new replies');
  console.log('  [ ] Respond to enterprise leads');
  console.log('  [ ] Book meeting requests');
  console.log('  [ ] Follow up on stale leads');
  console.log('  [ ] Update CRM status');
  console.log('  [ ] Review tomorrow calendar');
  console.log('');

  // 9. Quick commands
  console.log('🛠️  QUICK COMMANDS');
  console.log('────────────────────────────────────────');
  console.log('  node smart-meeting-prep.js <email>   # Prep for a meeting');
  console.log('  node telegram-digest.js              # Generate Telegram summary');
  console.log('  node email-performance.js            # Campaign analytics');
  console.log('  node auto-scheduler.js               # Generate follow-up queue');
  console.log('');
  console.log('  Dashboard: http://localhost:3456');
  console.log('');

  // 10. Return summary for automation
  return {
    total: leads.length,
    booked: categories.booked.length,
    meeting_request: categories.meeting_request.length,
    interested: categories.interested.length,
    stale: stale.length,
    critical: critical.length,
    enterprise: enterprise.length
  };
}

async function main() {
  try {
    const summary = await runDailyRoutine();
    
    // Save summary
    const fs = require('fs');
    fs.writeFileSync('daily-summary.json', JSON.stringify({
      date: new Date().toISOString(),
      ...summary
    }, null, 2));
    
    console.log('────────────────────────────────────────');
    console.log('Summary saved to daily-summary.json');
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { runDailyRoutine };

if (require.main === module) {
  main();
}
