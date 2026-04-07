#!/usr/bin/env node
/**
 * Enterprise Tracker
 * 
 * Special view focused on enterprise leads (high value).
 * 
 * Usage:
 *   node enterprise-tracker.js          # Show all enterprise leads
 *   node enterprise-tracker.js active   # Active enterprise deals
 *   node enterprise-tracker.js hot      # Hot enterprise leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'all';

// Known enterprise companies
const ENTERPRISE_SIGNALS = [
  'unity', 'naver', 'paradox', 'replit', 'udemy', 'stillfront',
  'outfit7', 'atari', 'ubisoft', 'ea', 'epic', 'riot', 'blizzard',
  'microsoft', 'google', 'amazon', 'meta', 'apple', 'netflix'
];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  // Identify enterprise leads
  const enterprise = leads.filter(l => isEnterprise(l));

  switch (VIEW) {
    case 'active':
      showActive(enterprise);
      break;
    case 'hot':
      showHot(enterprise);
      break;
    default:
      showAll(enterprise, leads.length);
  }
}

function isEnterprise(lead) {
  // Check company size field
  if (lead.company_size === 'enterprise') return true;
  
  // Check against known enterprise list
  const company = (lead.lead_company || '').toLowerCase();
  const email = (lead.lead_email || '').toLowerCase();
  
  for (const signal of ENTERPRISE_SIGNALS) {
    if (company.includes(signal) || email.includes(signal)) return true;
  }
  
  // Check funding
  if (lead.funding_amount && lead.funding_amount > 100000000) return true;
  
  return false;
}

function showAll(enterprise, totalLeads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏢 ENTERPRISE TRACKER                                                   ║
║  High-value leads requiring special attention                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const booked = enterprise.filter(l => l.reply_category === 'Booked');
  const unbooked = enterprise.filter(l => l.reply_category !== 'Booked');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ENTERPRISE SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Total enterprise: ${enterprise.length} (${((enterprise.length / totalLeads) * 100).toFixed(1)}% of pipeline)`);
  console.log(`  ✅ Booked: ${booked.length}`);
  console.log(`  ⏳ In progress: ${unbooked.length}`);
  console.log('');

  if (unbooked.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏳ ACTIVE ENTERPRISE DEALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    unbooked.forEach(l => {
      const age = getAgeDays(l.replied_at);
      const urgency = age <= 3 ? '🔥' : age <= 7 ? '🌡️' : age <= 14 ? '❄️' : '⚠️';
      const funding = l.funding_amount ? `$${(l.funding_amount / 1000000).toFixed(0)}M` : '';
      
      console.log(`  ${urgency} ${l.lead_name} @ ${l.lead_company || 'Unknown'} ${funding}`);
      console.log(`     📧 ${l.lead_email}`);
      console.log(`     📊 ${l.reply_category} | ${age} days ago`);
      console.log('');
    });
  }

  if (booked.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ BOOKED ENTERPRISE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    booked.forEach(l => {
      console.log(`  ✅ ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
    });
    console.log('');
  }

  // Revenue impact
  const avgDealSize = 2000; // Higher for enterprise
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 REVENUE IMPACT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Booked revenue: $${(booked.length * avgDealSize).toLocaleString()}`);
  console.log(`  Pipeline value: $${(unbooked.length * avgDealSize * 0.4).toLocaleString()} (at 40% conversion)`);
  console.log('');
}

function showActive(enterprise) {
  const active = enterprise.filter(l => l.reply_category !== 'Booked');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⏳ ACTIVE ENTERPRISE DEALS                                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (active.length === 0) {
    console.log('  No active enterprise deals.\n');
    return;
  }

  // Sort by age (most urgent first)
  active.sort((a, b) => getAgeDays(a.replied_at) - getAgeDays(b.replied_at));

  active.forEach((l, i) => {
    const age = getAgeDays(l.replied_at);
    const urgency = age <= 3 ? '🔴' : age <= 7 ? '🟠' : age <= 14 ? '🟡' : '⚠️';
    
    console.log(`  ${urgency} ${i + 1}. ${l.lead_name}`);
    console.log(`      📧 ${l.lead_email}`);
    console.log(`      🏢 ${l.lead_company || 'Unknown'}`);
    console.log(`      📊 ${l.reply_category} | ${age}d ago`);
    console.log('');
  });
}

function showHot(enterprise) {
  const hot = enterprise
    .filter(l => l.reply_category !== 'Booked' && getAgeDays(l.replied_at) <= 7);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔥 HOT ENTERPRISE LEADS                                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (hot.length === 0) {
    console.log('  No hot enterprise leads (≤7 days old).\n');
    return;
  }

  hot.forEach(l => {
    const age = getAgeDays(l.replied_at);
    console.log(`  🔥 ${l.lead_name} @ ${l.lead_company}`);
    console.log(`     ${l.reply_category} | ${age}d ago`);
    console.log(`     📧 ${l.lead_email}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  💡 Prioritize these! Enterprise deals = higher value');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
