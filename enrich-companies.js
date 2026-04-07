#!/usr/bin/env node
/**
 * Simple company enrichment from email domains
 * Extracts company name from domain when obvious
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// Known company mappings (add more as we discover them)
const KNOWN_COMPANIES = {
  'wallapop.com': 'Wallapop',
  'naturalcycles.com': 'Natural Cycles',
  'gyandhan.com': 'GyanDhan',
  'pulsetto.tech': 'Pulsetto',
  'bumble.com': 'Bumble',
  'tinder.com': 'Tinder',
  'spotify.com': 'Spotify',
  'netflix.com': 'Netflix',
  // Add more as needed
};

function extractCompanyName(domain) {
  if (!domain) return null;
  
  // Check known mappings first
  if (KNOWN_COMPANIES[domain]) return KNOWN_COMPANIES[domain];
  
  // Skip generic email providers
  const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'protonmail.com'];
  if (genericDomains.includes(domain)) return null;
  
  // Extract name from domain (remove TLD, capitalize)
  const parts = domain.split('.');
  if (parts.length < 2) return null;
  
  let name = parts[0];
  
  // Skip if too short or looks like abbreviation
  if (name.length < 3) return null;
  
  // Capitalize first letter of each word
  name = name
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  
  return name;
}

async function enrichCompanies() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  // Get leads without company data
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('id, lead_email, lead_company')
    .is('lead_company', null)
    .limit(500);

  if (error) throw new Error(error.message);
  
  console.log(`Found ${leads.length} leads without company data`);

  let updated = 0;
  let skipped = 0;

  for (const lead of leads) {
    const domain = lead.lead_email?.split('@')[1];
    const company = extractCompanyName(domain);
    
    if (company) {
      const { error: updateErr } = await client
        .from('positive_replies')
        .update({ lead_company: company })
        .eq('id', lead.id);
      
      if (updateErr) {
        console.log(`  Error updating ${lead.id}:`, updateErr.message);
      } else {
        updated++;
        console.log(`  ✓ ${domain} → ${company}`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`\nDone: ${updated} enriched, ${skipped} skipped (generic email or too short)`);
}

enrichCompanies().catch(console.error);
