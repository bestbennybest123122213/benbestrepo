#!/usr/bin/env node
/**
 * Re-Hit System - Eric's Framework
 * 
 * Eric's advice (Feb 27 call):
 * - Re-hit anyone not contacted in 60 days
 * - Gaming leads from November are prime targets
 * - Benchmarks: 1/300 = hammer it, 1/100 = killer
 * - Focus on VOLUME, not copy
 * 
 * Usage:
 *   node rehit.js                    # Show 60+ day leads summary
 *   node rehit.js gaming             # Gaming leads only
 *   node rehit.js --all              # All verticals
 *   node rehit.js --campaigns        # Group by campaign
 *   node rehit.js --export           # Export to CSV for SmartLead
 *   node rehit.js --emails           # Generate re-hit emails
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Gaming company keywords
const GAMING_KEYWORDS = [
  'game', 'gaming', 'studio', 'play', 'esport', 'mobile',
  'pixel', 'quest', 'epic', 'level', 'arcade', 'puzzle',
  'rpg', 'mmo', 'fps', 'casual', 'hyper', 'idle'
];

// Known gaming domains
const GAMING_DOMAINS = [
  'stillfront', 'zynga', 'supercell', 'king', 'rovio', 'kabam',
  'scopely', 'playtika', 'netmarble', 'nexon', 'garena', 'mihoyo',
  'toplitz', 'carry1st', 'mpl', 'dream11', 'gametion', 'socialpoint',
  'voodoo', 'ketchapp', 'lion-studios', 'supersonic', 'ironhide'
];

// Vertical detection
function detectVertical(lead) {
  const company = (lead.lead_company || '').toLowerCase();
  const email = (lead.lead_email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  const campaign = (lead.campaign_name || '').toLowerCase();
  
  // Check for gaming
  if (campaign.includes('gaming') || campaign.includes('game')) return 'gaming';
  if (GAMING_DOMAINS.some(d => domain.includes(d))) return 'gaming';
  if (GAMING_KEYWORDS.some(kw => company.includes(kw))) return 'gaming';
  
  // Other verticals from campaign name
  if (campaign.includes('edu')) return 'education';
  if (campaign.includes('tech')) return 'tech';
  if (campaign.includes('ai')) return 'ai';
  if (campaign.includes('crypto')) return 'crypto';
  if (campaign.includes('app')) return 'apps';
  if (campaign.includes('lifestyle')) return 'lifestyle';
  
  return 'other';
}

// Re-hit email templates (fresh approaches)
const REHIT_TEMPLATES = {
  gaming: {
    subject: "ItssIMANNN gaming collab - quick idea",
    body: `Hi {{first_name}},

Hope all is well at {{company}}.

ItssIMANNN just hit 10.5M subs and his gaming integrations are crushing it. Whiteout Survival did 48M views and 100K installs from one video.

Quick question: is {{company}} planning any Q2 influencer campaigns? I have some fresh ideas that might work well for your titles.

No pressure - just wanted to reconnect.

Best,
Jan`
  },
  default: {
    subject: "Re: ItssIMANNN partnership",
    body: `Hi {{first_name}},

Hope things are going well at {{company}}.

I know we connected a while back about influencer partnerships. Just wanted to check in - ItssIMANNN's audience has grown significantly (now 10.5M+) and we're seeing great results with recent campaigns.

If timing is better now, I'd love to reconnect. If not, totally understand.

Best,
Jan`
  }
};

async function getRehitLeads() {
  // Get all leads from all_replies that are 60+ days old
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  const { data, error } = await supabase
    .from('all_replies')
    .select('*')
    .lt('replied_at', sixtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
  
  // Enhance with vertical detection
  return (data || []).map(lead => ({
    ...lead,
    vertical: detectVertical(lead),
    age_days: Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
  }));
}

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

function showSummary(leads, verticalFilter = null) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔁 RE-HIT SYSTEM - Eric\'s Framework                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('💡 Eric\'s Rule: Re-hit anyone not contacted in 60 days.');
  console.log('   Benchmark: 1 positive per 300 = HAMMER IT\n');
  
  // Filter by vertical if specified
  let filteredLeads = leads;
  if (verticalFilter) {
    filteredLeads = leads.filter(l => l.vertical === verticalFilter.toLowerCase());
    console.log(`📍 Filtered to: ${verticalFilter.toUpperCase()} vertical\n`);
  }
  
  // Group by vertical
  const byVertical = {};
  for (const lead of filteredLeads) {
    if (!byVertical[lead.vertical]) byVertical[lead.vertical] = [];
    byVertical[lead.vertical].push(lead);
  }
  
  console.log('📊 RE-HIT CANDIDATES BY VERTICAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const sortedVerticals = Object.entries(byVertical).sort((a, b) => b[1].length - a[1].length);
  
  for (const [vertical, vLeads] of sortedVerticals) {
    const icon = vertical === 'gaming' ? '🎮' : vertical === 'tech' ? '💻' : vertical === 'education' ? '📚' : vertical === 'ai' ? '🤖' : vertical === 'apps' ? '📱' : '🏢';
    const bar = '█'.repeat(Math.min(Math.ceil(vLeads.length / 2), 30));
    console.log(`  ${icon} ${vertical.padEnd(12)} ${bar} ${vLeads.length}`);
  }
  
  console.log(`\n  Total: ${filteredLeads.length} leads ready for re-hit`);
  
  // Age distribution
  console.log('\n📅 AGE DISTRIBUTION (days since last contact)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const ageBrackets = {
    '60-90 days': filteredLeads.filter(l => l.age_days >= 60 && l.age_days < 90),
    '90-120 days': filteredLeads.filter(l => l.age_days >= 90 && l.age_days < 120),
    '120-180 days': filteredLeads.filter(l => l.age_days >= 120 && l.age_days < 180),
    '180+ days': filteredLeads.filter(l => l.age_days >= 180)
  };
  
  for (const [bracket, bracketLeads] of Object.entries(ageBrackets)) {
    const bar = '█'.repeat(Math.min(Math.ceil(bracketLeads.length / 2), 30));
    console.log(`  ${bracket.padEnd(12)} ${bar} ${bracketLeads.length}`);
  }
  
  // Show top candidates
  console.log('\n🎯 TOP 15 RE-HIT CANDIDATES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Prioritize by: reply category (Interested > Meeting > Info), then vertical match, then age (newer first)
  const prioritized = filteredLeads
    .sort((a, b) => {
      const catPriority = { 'Interested': 3, 'Meeting Request': 2, 'Information Request': 1 };
      const aCat = catPriority[a.reply_category] || 0;
      const bCat = catPriority[b.reply_category] || 0;
      if (aCat !== bCat) return bCat - aCat;
      // Then by age (newer 60+ day leads first)
      return a.age_days - b.age_days;
    })
    .slice(0, 15);
  
  for (let i = 0; i < prioritized.length; i++) {
    const lead = prioritized[i];
    const firstName = extractFirstName(lead.lead_name);
    const company = extractCompany(lead);
    const verticalIcon = lead.vertical === 'gaming' ? '🎮' : lead.vertical === 'tech' ? '💻' : '🏢';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${verticalIcon} ${firstName} @ ${company}`);
    console.log(`      ${lead.reply_category} | ${lead.age_days} days | ${lead.lead_email}`);
  }
  
  // Eric's benchmarks reminder
  console.log('\n📈 ERIC\'S BENCHMARKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔥 1:100 positive = KILLER campaign');
  console.log('  ⚡ 1:200 positive = GREAT campaign');
  console.log('  🚀 1:300 positive = SCALE IT (just send more)');
  console.log('  ⚠️  Bounce >3% = danger, check domains');
  
  // Volume calculation
  if (filteredLeads.length >= 300) {
    const expectedPositives = Math.floor(filteredLeads.length / 300);
    console.log(`\n  📊 Your ${filteredLeads.length} leads = ~${expectedPositives}+ positives at 1:300 rate`);
  }
  
  console.log('\n💡 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  node rehit.js --export           Export to CSV for SmartLead');
  console.log('  node rehit.js --emails           Generate re-hit emails');
  console.log('  node rehit.js gaming --export    Export gaming leads only');
  console.log('  node rehit.js --campaigns        Group by original campaign\n');
}

function showCampaigns(leads) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 RE-HIT BY ORIGINAL CAMPAIGN                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  const byCampaign = {};
  for (const lead of leads) {
    const campaign = lead.campaign_name || 'Unknown';
    if (!byCampaign[campaign]) byCampaign[campaign] = [];
    byCampaign[campaign].push(lead);
  }
  
  const sorted = Object.entries(byCampaign).sort((a, b) => b[1].length - a[1].length);
  
  console.log('Campaign'.padEnd(45) + 'Leads'.padStart(8) + 'Avg Age'.padStart(10));
  console.log('━'.repeat(65));
  
  for (const [campaign, cLeads] of sorted) {
    const avgAge = Math.round(cLeads.reduce((sum, l) => sum + l.age_days, 0) / cLeads.length);
    const name = campaign.length > 42 ? campaign.substring(0, 42) + '...' : campaign;
    console.log(`${name.padEnd(45)} ${cLeads.length.toString().padStart(6)}  ${avgAge.toString().padStart(6)}d`);
  }
  
  console.log('━'.repeat(65));
  console.log(`Total: ${sorted.length} campaigns, ${leads.length} leads\n`);
}

function generateEmails(leads, verticalFilter = null) {
  let filteredLeads = leads;
  if (verticalFilter) {
    filteredLeads = leads.filter(l => l.vertical === verticalFilter.toLowerCase());
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📧 RE-HIT EMAILS                                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  const emails = filteredLeads.slice(0, 10).map(lead => {
    const template = REHIT_TEMPLATES[lead.vertical] || REHIT_TEMPLATES.default;
    const firstName = extractFirstName(lead.lead_name);
    const company = extractCompany(lead);
    
    return {
      to: lead.lead_email,
      subject: template.subject.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{company\}\}/g, company),
      body: template.body.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{company\}\}/g, company),
      vertical: lead.vertical,
      age_days: lead.age_days
    };
  });
  
  for (const email of emails) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`To: ${email.to} (${email.vertical}, ${email.age_days} days)`);
    console.log(`Subject: ${email.subject}\n`);
    console.log(email.body);
    console.log('');
  }
  
  console.log(`\nShowing ${emails.length} of ${filteredLeads.length} total emails.`);
  console.log('Run with --export to get all leads as CSV.\n');
}

function exportToCSV(leads, verticalFilter = null) {
  let filteredLeads = leads;
  if (verticalFilter) {
    filteredLeads = leads.filter(l => l.vertical === verticalFilter.toLowerCase());
  }
  
  const filename = verticalFilter 
    ? `rehit-${verticalFilter}-${new Date().toISOString().split('T')[0]}.csv`
    : `rehit-all-${new Date().toISOString().split('T')[0]}.csv`;
  
  const headers = ['email', 'first_name', 'last_name', 'company', 'vertical', 'original_campaign', 'days_since_contact', 'original_reply_category'];
  
  const rows = filteredLeads.map(lead => {
    const nameParts = (lead.lead_name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const company = extractCompany(lead);
    
    return [
      lead.lead_email,
      firstName,
      lastName,
      company,
      lead.vertical,
      lead.campaign_name || '',
      lead.age_days,
      lead.reply_category || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  
  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(filename, csv);
  
  console.log(`\n✅ Exported ${filteredLeads.length} leads to ${filename}`);
  console.log('\n📋 CSV columns:');
  console.log('   email, first_name, last_name, company, vertical, original_campaign, days_since_contact, original_reply_category');
  console.log('\n💡 Import to SmartLead and run a fresh re-hit campaign.\n');
}

// SmartLead-ready export with email bodies
function exportSmartLead(leads, verticalFilter = null) {
  let filteredLeads = leads;
  if (verticalFilter) {
    filteredLeads = leads.filter(l => l.vertical === verticalFilter.toLowerCase());
  }
  
  const filename = verticalFilter 
    ? `smartlead-rehit-${verticalFilter}-${new Date().toISOString().split('T')[0]}.csv`
    : `smartlead-rehit-all-${new Date().toISOString().split('T')[0]}.csv`;
  
  // SmartLead CSV format
  const headers = ['email', 'first_name', 'last_name', 'company_name', 'custom1', 'custom2', 'custom3'];
  
  const rows = filteredLeads.map(lead => {
    const template = REHIT_TEMPLATES[lead.vertical] || REHIT_TEMPLATES.default;
    const nameParts = (lead.lead_name || '').split(' ');
    const firstName = nameParts[0] || 'there';
    const lastName = nameParts.slice(1).join(' ') || '';
    const company = extractCompany(lead);
    
    // Generate personalized subject and body
    const subject = template.subject
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    const body = template.body
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company\}\}/g, company);
    
    // custom1 = subject, custom2 = body preview, custom3 = vertical
    return [
      lead.lead_email,
      firstName,
      lastName,
      company,
      subject,
      body.substring(0, 500), // SmartLead has field limits
      lead.vertical
    ].map(v => `"${String(v).replace(/"/g, '""').replace(/\n/g, '\\n')}"`).join(',');
  });
  
  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(filename, csv);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📧 SMARTLEAD-READY EXPORT                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`✅ Exported ${filteredLeads.length} leads to ${filename}`);
  console.log('\n📋 CSV columns (SmartLead format):');
  console.log('   email, first_name, last_name, company_name, custom1 (subject), custom2 (body), custom3 (vertical)');
  console.log('\n🚀 IMPORT INSTRUCTIONS:');
  console.log('   1. Go to SmartLead → Campaigns → Create New');
  console.log('   2. Import CSV');
  console.log('   3. Map custom1 to {{subject}} variable');
  console.log('   4. Map custom2 to {{body}} variable');
  console.log('   5. Create email template using {{custom1}} for subject');
  console.log('   6. Use {{custom2}} in body OR copy-paste from preview');
  console.log('\n💡 Pro tip: Create a "Re-Hit Campaign" template that uses these variables.\n');
  
  // Show sample
  if (filteredLeads.length > 0) {
    const sample = filteredLeads[0];
    const template = REHIT_TEMPLATES[sample.vertical] || REHIT_TEMPLATES.default;
    const firstName = extractFirstName(sample.lead_name);
    const company = extractCompany(sample);
    
    console.log('📧 SAMPLE EMAIL (first lead):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`To: ${sample.lead_email}`);
    console.log(`Subject: ${template.subject.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{company\}\}/g, company)}`);
    console.log('');
    console.log(template.body.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{company\}\}/g, company));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse flags
  const showCampaignsFlag = args.includes('--campaigns');
  const exportFlag = args.includes('--export');
  const smartleadFlag = args.includes('--smartlead');
  const emailsFlag = args.includes('--emails');
  const allFlag = args.includes('--all');
  
  // Get vertical filter (first non-flag argument)
  const verticalFilter = args.find(a => !a.startsWith('--'));
  
  console.log('[Supabase] Fetching re-hit candidates...');
  const leads = await getRehitLeads();
  
  if (leads.length === 0) {
    console.log('\n✅ No leads 60+ days old found. Pipeline is fresh.');
    return;
  }
  
  if (showCampaignsFlag) {
    showCampaigns(verticalFilter ? leads.filter(l => l.vertical === verticalFilter.toLowerCase()) : leads);
    return;
  }
  
  if (smartleadFlag) {
    exportSmartLead(leads, verticalFilter);
    return;
  }
  
  if (exportFlag) {
    exportToCSV(leads, verticalFilter);
    return;
  }
  
  if (emailsFlag) {
    generateEmails(leads, verticalFilter);
    return;
  }
  
  // Default: show summary
  showSummary(leads, allFlag ? null : verticalFilter);
}

main().catch(console.error);
