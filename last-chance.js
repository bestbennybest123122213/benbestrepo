#!/usr/bin/env node
/**
 * Last Chance Email Generator
 * 
 * Generates "last chance" emails for borderline leads (60-90 days)
 * before they get archived. One final attempt to re-engage.
 * 
 * Usage:
 *   node last-chance.js              # Show borderline leads
 *   node last-chance.js --generate   # Generate emails
 *   node last-chance.js --export     # Export to SmartLead CSV
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Last chance email template
const LAST_CHANCE_TEMPLATE = {
  subject: "Should I close your file?",
  body: `Hi {{first_name}},

I've reached out a few times about working with ItssIMANNN and haven't heard back. Totally understand if the timing isn't right or {{company}} has other priorities.

I'll assume this isn't a fit for now and won't keep emailing. But if things change in the future, my door is always open.

Just let me know either way - even a quick "not interested" helps me keep my records clean.

Wishing you and the {{company}} team all the best.

Best,
Jan`
};

// Alternative templates for variety
const TEMPLATES = [
  {
    subject: "Closing the loop - {{company}}",
    body: `Hi {{first_name}},

I wanted to close the loop on our previous conversation about ItssIMANNN partnerships.

If {{company}} isn't exploring influencer marketing right now, no problem at all. I'll remove you from my follow-up list.

If anything changes, feel free to reach out anytime.

All the best,
Jan`
  },
  {
    subject: "One last check-in",
    body: `Hi {{first_name}},

Quick check-in - I know you're busy, but wanted to see if {{company}} has any Q2 marketing campaigns where ItssIMANNN might be a fit.

If not, I'll close this out and wish you well.

Best,
Jan`
  }
];

function extractFirstName(fullName) {
  if (!fullName) return 'there';
  const parts = fullName.trim().split(' ');
  return parts[0] || 'there';
}

function extractCompany(lead) {
  if (lead.lead_company) return lead.lead_company;
  if (lead.lead_email) {
    const domain = lead.lead_email.split('@')[1];
    if (domain) {
      const company = domain.split('.')[0];
      return company.charAt(0).toUpperCase() + company.slice(1);
    }
  }
  return 'your company';
}

async function getBorderlineLeads() {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const { data, error } = await supabase
    .from('all_replies')
    .select('*')
    .lt('replied_at', sixtyDaysAgo.toISOString())
    .gt('replied_at', ninetyDaysAgo.toISOString())
    .in('reply_category', ['Interested', 'Meeting Request', 'Information Request'])
    .order('replied_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error.message);
    return [];
  }
  
  return (data || []).map(lead => ({
    ...lead,
    age_days: Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
  }));
}

function showSummary(leads) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⏰ LAST CHANCE - Borderline Leads (60-90 days)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📋 These leads responded 60-90 days ago but never booked.');
  console.log('   They\'re about to be archived. One last email might save them.\n');
  
  console.log(`📊 Total: ${leads.length} borderline leads\n`);
  
  if (leads.length === 0) {
    console.log('✅ No borderline leads found. Pipeline is clean.\n');
    return;
  }
  
  console.log('🎯 TOP 10 BORDERLINE LEADS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const top10 = leads.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const lead = top10[i];
    const firstName = extractFirstName(lead.lead_name);
    const company = extractCompany(lead);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${firstName} @ ${company}`);
    console.log(`      ${lead.reply_category} | ${lead.age_days} days | ${lead.lead_email}`);
  }
  
  console.log('\n💡 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  node last-chance.js --generate   # See sample emails');
  console.log('  node last-chance.js --export     # Export to SmartLead CSV\n');
}

function generateEmails(leads) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📧 LAST CHANCE EMAILS                                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  const sample = leads.slice(0, 5);
  
  for (const lead of sample) {
    const firstName = extractFirstName(lead.lead_name);
    const company = extractCompany(lead);
    
    const subject = LAST_CHANCE_TEMPLATE.subject
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    const body = LAST_CHANCE_TEMPLATE.body
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To: ${lead.lead_email} (${lead.age_days} days)`);
    console.log(`Subject: ${subject}\n`);
    console.log(body);
    console.log('');
  }
  
  console.log(`Showing ${sample.length} of ${leads.length} total.\n`);
  console.log('Run with --export to get SmartLead-ready CSV.\n');
}

function exportToSmartLead(leads) {
  const filename = `last-chance-${new Date().toISOString().split('T')[0]}.csv`;
  
  const headers = ['email', 'first_name', 'last_name', 'company_name', 'custom1', 'custom2', 'custom3'];
  
  const rows = leads.map((lead, index) => {
    // Rotate through templates for variety
    const template = index % 3 === 0 ? LAST_CHANCE_TEMPLATE : TEMPLATES[index % 2];
    
    const nameParts = (lead.lead_name || '').split(' ');
    const firstName = nameParts[0] || 'there';
    const lastName = nameParts.slice(1).join(' ') || '';
    const company = extractCompany(lead);
    
    const subject = template.subject
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    const body = template.body
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    return [
      lead.lead_email,
      firstName,
      lastName,
      company,
      subject,
      body.substring(0, 500),
      `last-chance-${lead.age_days}d`
    ].map(v => `"${String(v).replace(/"/g, '""').replace(/\n/g, '\\n')}"`).join(',');
  });
  
  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(filename, csv);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📧 LAST CHANCE - SMARTLEAD EXPORT                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`✅ Exported ${leads.length} leads to ${filename}`);
  console.log('\n📋 CSV columns:');
  console.log('   email, first_name, last_name, company_name, custom1 (subject), custom2 (body), custom3 (tag)');
  console.log('\n💡 After sending last chance emails:');
  console.log('   - Wait 7 days for responses');
  console.log('   - Run: gex archive --execute to clean up non-responders');
  console.log('   - Pipeline will be cleaner and scores will improve\n');
}

async function main() {
  const args = process.argv.slice(2);
  
  const generateFlag = args.includes('--generate');
  const exportFlag = args.includes('--export');
  
  console.log('[Supabase] Fetching borderline leads...');
  const leads = await getBorderlineLeads();
  
  if (generateFlag) {
    generateEmails(leads);
    return;
  }
  
  if (exportFlag) {
    exportToSmartLead(leads);
    return;
  }
  
  showSummary(leads);
}

main().catch(console.error);
