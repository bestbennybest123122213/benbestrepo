#!/usr/bin/env node
/**
 * Lead Enricher
 * 
 * Enriches leads with missing company data using domain extraction
 * and basic company research. Fixes the "Unknown Company" problem.
 * 
 * Usage:
 *   node lead-enricher.js              # Show leads needing enrichment
 *   node lead-enricher.js enrich       # Auto-enrich from email domains
 *   node lead-enricher.js fix <id>     # Manually fix specific lead
 *   node lead-enricher.js bulk         # Batch update all fixable leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0] || 'show';
const TARGET = args[1];

// Known company mappings (domain -> company name)
const KNOWN_COMPANIES = {
  'unity.com': { name: 'Unity', size: 'enterprise' },
  'unity3d.com': { name: 'Unity', size: 'enterprise' },
  'navercorp.com': { name: 'Naver Corporation', size: 'enterprise' },
  'paradoxinteractive.com': { name: 'Paradox Interactive', size: 'enterprise' },
  'replit.com': { name: 'Replit', size: 'enterprise' },
  'udemy.com': { name: 'Udemy', size: 'enterprise' },
  'stillfront.com': { name: 'Stillfront Group', size: 'enterprise' },
  'outfit7.com': { name: 'Outfit7', size: 'enterprise' },
  'virtus.pro': { name: 'Virtus.pro', size: 'midmarket' },
  'circlesecurity.ai': { name: 'Circle Security', size: 'startup' },
  'threedy.io': { name: 'Threedy', size: 'startup' },
  'livekindred.com': { name: 'Livekindred', size: 'startup' },
  'owlcat.games': { name: 'Owlcat Games', size: 'midmarket' },
  'solsten.io': { name: 'Solsten', size: 'startup' },
  'studystream.io': { name: 'Studystream', size: 'startup' },
  'gyandhan.com': { name: 'GyanDhan', size: 'startup' },
  'carry1st.com': { name: 'Carry1st', size: 'startup' },
  // Add more as discovered
};

// Words to strip from auto-generated company names
const STRIP_WORDS = ['inc', 'llc', 'ltd', 'corp', 'corporation', 'co', 'company', 'group', 'io', 'ai', 'com'];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  switch (ACTION) {
    case 'enrich':
      await enrichLeads(client);
      break;
    case 'fix':
      if (!TARGET) {
        console.error('❌ Please provide lead ID: node lead-enricher.js fix <id>');
        process.exit(1);
      }
      await fixLead(client, TARGET);
      break;
    case 'bulk':
      await bulkUpdate(client);
      break;
    default:
      await showMissingData(client);
  }
}

async function showMissingData(client) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 LEAD ENRICHMENT - Data Quality Check                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  const missing = {
    company: leads.filter(l => !l.lead_company || l.lead_company === 'Unknown'),
    size: leads.filter(l => !l.company_size),
    both: leads.filter(l => (!l.lead_company || l.lead_company === 'Unknown') && !l.company_size)
  };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 DATA QUALITY SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Total leads:           ${leads.length}`);
  console.log(`  ❌ Missing company:    ${missing.company.length}`);
  console.log(`  ❌ Missing size:       ${missing.size.length}`);
  console.log(`  ⚠️  Missing both:       ${missing.both.length}`);
  console.log('');

  // Show fixable leads (can extract from email)
  const fixable = missing.company.filter(l => {
    const domain = extractDomain(l.lead_email);
    return domain && !isPersonalEmail(domain);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ AUTO-FIXABLE (can extract from email domain)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  fixable.slice(0, 15).forEach(l => {
    const domain = extractDomain(l.lead_email);
    const suggested = suggestCompanyName(domain);
    console.log(`  ${l.lead_name}`);
    console.log(`    📧 ${l.lead_email}`);
    console.log(`    💡 Suggested: ${suggested.name} (${suggested.size || 'unknown size'})`);
    console.log('');
  });

  if (fixable.length > 15) {
    console.log(`  ... and ${fixable.length - 15} more\n`);
  }

  // Show unfixable (personal emails)
  const unfixable = missing.company.filter(l => {
    const domain = extractDomain(l.lead_email);
    return !domain || isPersonalEmail(domain);
  });

  if (unfixable.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  NEEDS MANUAL RESEARCH (personal emails)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    unfixable.slice(0, 10).forEach(l => {
      console.log(`  ${l.lead_name} <${l.lead_email}>`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Commands:');
  console.log('    node lead-enricher.js enrich     # Preview enrichment');
  console.log('    node lead-enricher.js bulk       # Apply all fixes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function enrichLeads(client) {
  console.log('🔍 Analyzing leads for enrichment...\n');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .or('lead_company.is.null,lead_company.eq.Unknown');

  let enrichable = 0;
  const updates = [];

  for (const lead of leads) {
    const domain = extractDomain(lead.lead_email);
    if (!domain || isPersonalEmail(domain)) continue;

    const suggested = suggestCompanyName(domain);
    updates.push({
      id: lead.id,
      name: lead.lead_name,
      email: lead.lead_email,
      currentCompany: lead.lead_company,
      suggestedCompany: suggested.name,
      suggestedSize: suggested.size
    });
    enrichable++;
  }

  console.log(`Found ${enrichable} leads that can be enriched:\n`);

  updates.slice(0, 20).forEach(u => {
    console.log(`  ${u.name}`);
    console.log(`    ${u.email}`);
    console.log(`    ${u.currentCompany || 'null'} → ${u.suggestedCompany} (${u.suggestedSize || '?'})`);
    console.log('');
  });

  if (updates.length > 20) {
    console.log(`  ... and ${updates.length - 20} more\n`);
  }

  console.log('Run `node lead-enricher.js bulk` to apply these changes.');
}

async function bulkUpdate(client) {
  console.log('🔄 Applying bulk enrichment...\n');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .or('lead_company.is.null,lead_company.eq.Unknown');

  let updated = 0;
  let failed = 0;

  for (const lead of leads) {
    const domain = extractDomain(lead.lead_email);
    if (!domain || isPersonalEmail(domain)) continue;

    const suggested = suggestCompanyName(domain);
    
    const updateData = {
      lead_company: suggested.name
    };
    
    // Note: company_size column may not exist in all schemas
    // Uncomment if your schema has it:
    // if (suggested.size) {
    //   updateData.company_size = suggested.size;
    // }

    const { error } = await client
      .from('positive_replies')
      .update(updateData)
      .eq('id', lead.id);

    if (error) {
      console.log(`  ❌ Failed: ${lead.lead_name} - ${error.message}`);
      failed++;
    } else {
      console.log(`  ✅ Updated: ${lead.lead_name} → ${suggested.name}`);
      updated++;
    }
  }

  console.log(`\n📊 Results: ${updated} updated, ${failed} failed`);
}

async function fixLead(client, leadId) {
  const { data: lead } = await client
    .from('positive_replies')
    .select('*')
    .eq('id', leadId)
    .single();

  if (!lead) {
    console.error(`❌ Lead not found: ${leadId}`);
    process.exit(1);
  }

  const domain = extractDomain(lead.lead_email);
  const suggested = suggestCompanyName(domain);

  console.log(`\nLead: ${lead.lead_name}`);
  console.log(`Email: ${lead.lead_email}`);
  console.log(`Current: ${lead.lead_company || 'null'}`);
  console.log(`Suggested: ${suggested.name} (${suggested.size || 'unknown'})\n`);

  // In a real scenario, you'd prompt for confirmation
  // For now, just show what would happen
  console.log('To apply, run: node lead-enricher.js bulk');
}

function extractDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function isPersonalEmail(domain) {
  const personal = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
                    'icloud.com', 'me.com', 'aol.com', 'protonmail.com',
                    'mail.com', 'live.com', 'msn.com'];
  return personal.includes(domain);
}

function suggestCompanyName(domain) {
  if (!domain) return { name: 'Unknown', size: null };
  
  // Check known mappings first
  if (KNOWN_COMPANIES[domain]) {
    return KNOWN_COMPANIES[domain];
  }

  // Extract company name from domain
  const parts = domain.split('.');
  let name = parts[0];
  
  // Clean up
  name = name.replace(/[-_]/g, ' ');
  
  // Remove common suffixes
  STRIP_WORDS.forEach(word => {
    name = name.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  });
  
  // Title case
  name = name.trim().split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Guess size based on TLD and domain length
  let size = null;
  if (domain.endsWith('.io') || domain.endsWith('.ai') || domain.endsWith('.co')) {
    size = 'startup';
  } else if (domain.endsWith('.com') && name.length > 8) {
    size = 'midmarket';
  }

  return { name: name || domain, size };
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
