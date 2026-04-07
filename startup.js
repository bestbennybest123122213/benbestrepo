#!/usr/bin/env node
/**
 * Startup Script
 * 
 * Run this when you start working:
 * - Pipeline status
 * - Hot leads alert
 * - Today's priorities
 * - Quick stats
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
// Try to load lead-enrichment, but don't fail if it's missing
let getCompanyInfo = null;
try {
  getCompanyInfo = require('./lead-enrichment').getCompanyInfo;
} catch (e) {
  // Module might not exist, that's OK
}

async function runStartup() {
  console.log('\n🚀 Starting up GEX OS...\n');

  const client = initSupabase();
  if (!client) {
    console.log('❌ Database connection failed!');
    console.log('   Run: node gex.js doctor\n');
    console.log('   💡 TIP: Use "node gex.js start" for offline-capable morning routine\n');
    return;
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.log('❌ Could not load leads');
    return;
  }

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Calculate stats
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const meetings = unbooked.filter(l => l.reply_category === 'Meeting Request');
  const hot = unbooked.filter(l => getAge(l) <= 3);
  const enterprise = unbooked.filter(l => {
    if (!getCompanyInfo) return false;
    try {
      const info = getCompanyInfo(l.lead_email);
      return info?.tier === 'enterprise';
    } catch {
      return false;
    }
  });

  const date = new Date().toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });

  console.log(`╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ☀️  Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}! ${date.padEnd(40)}║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝\n`);

  // Quick pulse
  console.log(`📊 ${leads.length} leads | ✅ ${booked.length} booked | 🔥 ${hot.length} hot | 🏢 ${enterprise.length} enterprise\n`);

  // Helper to safely get company name
  const getCompany = (l) => {
    if (l.lead_company) return l.lead_company;
    if (getCompanyInfo) {
      try {
        return getCompanyInfo(l.lead_email)?.name || 'Unknown';
      } catch {
        return 'Unknown';
      }
    }
    return l.lead_email?.split('@')[1] || 'Unknown';
  };

  // Alerts
  if (hot.length > 0) {
    console.log('🔥 HOT LEADS (respond today!):');
    hot.forEach(l => {
      console.log(`   • ${l.lead_name || 'N/A'} @ ${getCompany(l)} (${l.reply_category})`);
    });
    console.log('');
  }

  if (enterprise.length > 0) {
    console.log(`🏢 ENTERPRISE ACCOUNTS (${enterprise.length}):`);
    enterprise.slice(0, 5).forEach(l => {
      console.log(`   • ${l.lead_name || 'N/A'} @ ${getCompany(l)}`);
    });
    if (enterprise.length > 5) console.log(`   ... +${enterprise.length - 5} more`);
    console.log('');
  }

  // Today's focus
  console.log('📋 TODAY\'S FOCUS:');
  console.log(`   1. Respond to ${hot.length} hot lead(s)`);
  console.log(`   2. Book ${Math.min(5, meetings.length)} meeting requests`);
  console.log(`   3. Follow up on ${Math.min(3, enterprise.length)} enterprise accounts`);
  console.log('');

  // Quick commands
  console.log('⚡ QUICK COMMANDS:');
  console.log('   node gex.js planner     - Today\'s full action plan');
  console.log('   node gex.js dash        - Visual dashboard');
  console.log('   node gex.js rank        - Priority leads');
  console.log('   node gex.js calendar    - Meeting booking messages');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('Ready to work! 💪\n');
}

module.exports = { runStartup };

if (require.main === module) {
  runStartup().catch(console.error);
}
