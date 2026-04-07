#!/usr/bin/env node
/**
 * Enrich unknown tier leads with company data
 * Uses domain analysis and known company databases
 */

const fs = require('fs');

// Known company data (manually curated high-value targets)
const KNOWN_COMPANIES = {
  'circlesecurity.ai': { tier: 'startup', industry: 'Security', size: '11-50', funding: 'Seed' },
  'threedy.ai': { tier: 'startup', industry: 'AI/3D', size: '11-50', funding: 'Series A' },
  'poki.com': { tier: 'midmarket', industry: 'Gaming', size: '51-200', funding: 'Private' },
  'preply.com': { tier: 'enterprise', industry: 'EdTech', size: '500+', funding: '$120M+' },
  'owlcat.games': { tier: 'midmarket', industry: 'Gaming', size: '100-200', funding: 'Private' },
  'virtus.gg': { tier: 'startup', industry: 'Esports', size: '11-50', funding: 'Seed' },
  'rainbet.com': { tier: 'startup', industry: 'Crypto/Gaming', size: '11-50', funding: 'Private' },
  'drink-trip.com': { tier: 'startup', industry: 'Travel', size: '1-10', funding: 'Pre-seed' },
  'carry1st.com': { tier: 'midmarket', industry: 'Gaming/Africa', size: '50-100', funding: '$55M' },
  'gyandhan.com': { tier: 'startup', industry: 'Fintech/EdTech', size: '50-100', funding: '$8M' },
  'livekindred.com': { tier: 'startup', industry: 'Consumer', size: '11-50', funding: 'Seed' },
  'roamless.com': { tier: 'startup', industry: 'Travel/Telecom', size: '11-50', funding: 'Seed' },
  'typology.com': { tier: 'midmarket', industry: 'Beauty/DTC', size: '100-200', funding: '$15M' },
  'omio.com': { tier: 'enterprise', industry: 'Travel', size: '500+', funding: '$550M+' },
  'piercegroup.com': { tier: 'midmarket', industry: 'Retail', size: '200-500', funding: 'Private' },
  'worldcoin.org': { tier: 'enterprise', industry: 'Crypto/AI', size: '200+', funding: '$250M+' },
  'buildwithunstoppable.com': { tier: 'midmarket', industry: 'Web3', size: '50-100', funding: '$50M' },
  'altvr.com': { tier: 'startup', industry: 'VR', size: '11-50', funding: 'Acquired' },
  'robosoft.in': { tier: 'midmarket', industry: 'Software Dev', size: '200-500', funding: 'Private' },
  'byjus.com': { tier: 'enterprise', industry: 'EdTech', size: '5000+', funding: '$5.5B' },
  'roblox.com': { tier: 'enterprise', industry: 'Gaming', size: '2000+', funding: 'Public' },
  'discord.com': { tier: 'enterprise', industry: 'Gaming/Social', size: '1000+', funding: '$1B+' },
  'supercell.com': { tier: 'enterprise', industry: 'Gaming', size: '300+', funding: 'Private' },
  'king.com': { tier: 'enterprise', industry: 'Gaming', size: '2000+', funding: 'Public (ATVI)' },
  'rovio.com': { tier: 'enterprise', industry: 'Gaming', size: '500+', funding: 'Public' },
  'zynga.com': { tier: 'enterprise', industry: 'Gaming', size: '2000+', funding: 'Public (TTWO)' },
};

// Industry detection from domain/company name
function detectIndustry(domain, companyName) {
  const d = (domain + ' ' + companyName).toLowerCase();
  
  if (d.includes('game') || d.includes('play') || d.includes('studio')) return 'Gaming';
  if (d.includes('ai') || d.includes('ml') || d.includes('intelligence')) return 'AI';
  if (d.includes('crypto') || d.includes('web3') || d.includes('coin') || d.includes('chain')) return 'Crypto/Web3';
  if (d.includes('health') || d.includes('med') || d.includes('care')) return 'Health';
  if (d.includes('finance') || d.includes('bank') || d.includes('pay') || d.includes('money')) return 'Fintech';
  if (d.includes('edu') || d.includes('learn') || d.includes('school') || d.includes('course')) return 'EdTech';
  if (d.includes('travel') || d.includes('trip') || d.includes('tour')) return 'Travel';
  if (d.includes('shop') || d.includes('store') || d.includes('retail') || d.includes('commerce')) return 'E-commerce';
  if (d.includes('social') || d.includes('chat') || d.includes('community')) return 'Social';
  if (d.includes('security') || d.includes('cyber') || d.includes('protect')) return 'Security';
  
  return 'Unknown';
}

// Load leads
const { leads } = require('./enriched-leads.json');

// Find unknown tier leads
const unknownLeads = leads.filter(l => l.tier === 'unknown' || !l.tier);

console.log(`Found ${unknownLeads.length} leads with unknown tier`);
console.log('\n=== ENRICHMENT RESULTS ===\n');

let enriched = 0;
let stillUnknown = 0;

const enrichedData = unknownLeads.map(lead => {
  const domain = lead.lead_email.split('@')[1];
  const baseDomain = domain.replace('www.', '');
  
  // Check known companies
  if (KNOWN_COMPANIES[baseDomain]) {
    enriched++;
    const info = KNOWN_COMPANIES[baseDomain];
    return {
      ...lead,
      enriched_tier: info.tier,
      enriched_industry: info.industry,
      enriched_size: info.size,
      enriched_funding: info.funding,
      enrichment_source: 'known_db'
    };
  }
  
  // Detect industry from domain
  const industry = detectIndustry(baseDomain, lead.lead_company || '');
  if (industry !== 'Unknown') {
    enriched++;
    return {
      ...lead,
      enriched_tier: 'estimated',
      enriched_industry: industry,
      enrichment_source: 'domain_analysis'
    };
  }
  
  stillUnknown++;
  return {
    ...lead,
    enriched_tier: 'unknown',
    enrichment_source: 'none'
  };
});

// Sort by potential value (meeting requests first, then by detected industry)
const priorityOrder = { 'Meeting Request': 1, 'Interested': 2, 'Information Request': 3, 'Booked': 4 };
enrichedData.sort((a, b) => {
  const catA = priorityOrder[a.reply_category] || 5;
  const catB = priorityOrder[b.reply_category] || 5;
  if (catA !== catB) return catA - catB;
  
  // Then by tier
  const tierOrder = { enterprise: 1, midmarket: 2, startup: 3, estimated: 4, unknown: 5 };
  return (tierOrder[a.enriched_tier] || 5) - (tierOrder[b.enriched_tier] || 5);
});

// Output
console.log(`Enriched: ${enriched}/${unknownLeads.length}`);
console.log(`Still unknown: ${stillUnknown}`);
console.log('\n=== TOP ENRICHED LEADS ===\n');

enrichedData.filter(l => l.enrichment_source !== 'none').slice(0, 20).forEach((l, i) => {
  const age = Math.floor((Date.now() - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
  console.log(`${i + 1}. ${(l.lead_company || 'Unknown').substring(0, 20).padEnd(20)} | ${l.reply_category.padEnd(18)} | ${age}d | ${l.enriched_tier || 'unknown'} | ${l.enriched_industry || 'Unknown'}`);
});

// Save enriched data
fs.writeFileSync('./enriched-unknown-leads.json', JSON.stringify(enrichedData, null, 2));
console.log('\n✅ Saved to enriched-unknown-leads.json');

// Generate recommendations
console.log('\n=== RECOMMENDATIONS ===\n');

const meetingReqUnknown = enrichedData.filter(l => 
  l.reply_category === 'Meeting Request' && 
  l.enrichment_source === 'none'
);

console.log(`⚠️  ${meetingReqUnknown.length} Meeting Requests still need manual research:`);
meetingReqUnknown.slice(0, 10).forEach(l => {
  const domain = l.lead_email.split('@')[1];
  console.log(`   - ${l.lead_company} (${domain})`);
});
