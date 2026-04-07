#!/usr/bin/env node
/**
 * Company Lookup
 * 
 * Quick company info lookup by domain or name.
 * 
 * Usage:
 *   node company-lookup.js unity.com         # Look up by domain
 *   node company-lookup.js "Unity"           # Look up by name
 *   node company-lookup.js leads unity       # Find leads from company
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0];
const TERM = args[1] || args[0];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  if (!ACTION) {
    showHelp();
    return;
  }

  if (ACTION === 'leads') {
    await findLeadsFromCompany(client, TERM);
  } else {
    await lookupCompany(client, ACTION);
  }
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏢 COMPANY LOOKUP                                                       ║
╚══════════════════════════════════════════════════════════════════════════╝

  Usage:
    node company-lookup.js <domain>           # Look up by domain
    node company-lookup.js leads <term>       # Find all leads from company

  Examples:
    node company-lookup.js unity.com
    node company-lookup.js leads unity
`);
}

async function lookupCompany(client, term) {
  // Search by domain or company name
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .or(`lead_company.ilike.%${term}%,lead_email.ilike.%${term}%`)
    .limit(20);

  if (!leads || leads.length === 0) {
    console.log(`\n❌ No leads found matching "${term}"\n`);
    return;
  }

  // Group by company
  const companies = {};
  leads.forEach(l => {
    const company = l.lead_company || extractCompanyFromEmail(l.lead_email);
    if (!companies[company]) {
      companies[company] = { leads: [], booked: 0 };
    }
    companies[company].leads.push(l);
    if (l.reply_category === 'Booked') companies[company].booked++;
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏢 COMPANY LOOKUP: "${term}"                                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  Object.entries(companies).forEach(([company, data]) => {
    console.log(`\n🏢 ${company}`);
    console.log('━'.repeat(50));
    console.log(`  Leads: ${data.leads.length} | Booked: ${data.booked}`);
    console.log('');
    
    data.leads.slice(0, 5).forEach(l => {
      const age = getAgeDays(l.replied_at);
      console.log(`  👤 ${l.lead_name}`);
      console.log(`     📧 ${l.lead_email}`);
      console.log(`     📊 ${l.reply_category} | ${age}d ago`);
    });

    if (data.leads.length > 5) {
      console.log(`  ... and ${data.leads.length - 5} more`);
    }
  });

  console.log('');
}

async function findLeadsFromCompany(client, term) {
  if (!term) {
    console.error('❌ Please provide a search term');
    return;
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .or(`lead_company.ilike.%${term}%,lead_email.ilike.%${term}%`)
    .order('replied_at', { ascending: false });

  if (!leads || leads.length === 0) {
    console.log(`\n❌ No leads found matching "${term}"\n`);
    return;
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 LEADS FROM "${term}"                                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const booked = leads.filter(l => l.reply_category === 'Booked');
  const notBooked = leads.filter(l => l.reply_category !== 'Booked');

  console.log(`  Found ${leads.length} leads | ${booked.length} booked\n`);

  leads.forEach(l => {
    const age = getAgeDays(l.replied_at);
    const status = l.reply_category === 'Booked' ? '✅' : '⏳';
    console.log(`  ${status} ${l.lead_name}`);
    console.log(`     📧 ${l.lead_email}`);
    console.log(`     🏢 ${l.lead_company || 'Unknown'} | ${l.reply_category} | ${age}d`);
    console.log('');
  });
}

function extractCompanyFromEmail(email) {
  if (!email) return 'Unknown';
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';
  return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
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
