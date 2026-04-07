#!/usr/bin/env node
/**
 * Competitive Intelligence Dashboard
 * Tracks competitor activity and market positioning
 */

const fs = require('fs');

// Known competitors in the influencer marketing / creator economy space
const COMPETITORS = [
  {
    name: 'Grin',
    domain: 'grin.co',
    focus: 'E-commerce influencer marketing',
    funding: '$110M+',
    tier: 'Enterprise'
  },
  {
    name: 'CreatorIQ',
    domain: 'creatoriq.com',
    focus: 'Enterprise creator management',
    funding: '$40M+',
    tier: 'Enterprise'
  },
  {
    name: 'Aspire',
    domain: 'aspire.io',
    focus: 'Influencer marketing platform',
    funding: '$100M+',
    tier: 'Mid-Market'
  },
  {
    name: 'Upfluence',
    domain: 'upfluence.com',
    focus: 'Influencer discovery & analytics',
    funding: '$3.6M',
    tier: 'SMB/Mid'
  },
  {
    name: 'Traackr',
    domain: 'traackr.com',
    focus: 'Data-driven influencer marketing',
    funding: '$27M',
    tier: 'Enterprise'
  },
  {
    name: 'Klear',
    domain: 'klear.com',
    focus: 'Influencer analytics & CRM',
    funding: 'Acquired by Meltwater',
    tier: 'Enterprise'
  },
  {
    name: 'Tagger',
    domain: 'taggermedia.com',
    focus: 'Influencer marketing intelligence',
    funding: 'Acquired by Sprout Social',
    tier: 'Enterprise'
  },
  {
    name: 'Impact.com',
    domain: 'impact.com',
    focus: 'Partnership automation',
    funding: '$150M+',
    tier: 'Enterprise'
  },
  {
    name: 'Captiv8',
    domain: 'captiv8.io',
    focus: 'AI influencer marketing',
    funding: '$27M',
    tier: 'Mid-Market'
  },
  {
    name: 'HypeAuditor',
    domain: 'hypeauditor.com',
    focus: 'Influencer analytics & fraud detection',
    funding: '$5M',
    tier: 'SMB/Mid'
  }
];

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🎯 COMPETITIVE INTELLIGENCE                                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Display competitor landscape
console.log('📊 COMPETITOR LANDSCAPE');
console.log('─'.repeat(70));
console.log('  Name              Domain                 Focus                          Tier');
console.log('─'.repeat(70));

COMPETITORS.forEach(c => {
  console.log(`  ${c.name.padEnd(16)} ${c.domain.padEnd(22)} ${c.focus.substring(0, 30).padEnd(30)} ${c.tier}`);
});

// Market positioning
console.log('\n\n🎯 MARKET POSITIONING');
console.log('─'.repeat(70));

const byTier = {
  Enterprise: COMPETITORS.filter(c => c.tier.includes('Enterprise')),
  'Mid-Market': COMPETITORS.filter(c => c.tier.includes('Mid')),
  SMB: COMPETITORS.filter(c => c.tier.includes('SMB'))
};

console.log(`\n  Enterprise Focus (${byTier.Enterprise.length}):`);
byTier.Enterprise.forEach(c => console.log(`    - ${c.name}: ${c.focus}`));

console.log(`\n  Mid-Market Focus (${byTier['Mid-Market'].length}):`);
byTier['Mid-Market'].forEach(c => console.log(`    - ${c.name}: ${c.focus}`));

// Differentiation opportunities
console.log('\n\n💡 DIFFERENTIATION OPPORTUNITIES');
console.log('─'.repeat(70));
console.log(`
  Most competitors focus on:
  ✓ E-commerce / DTC brands
  ✓ Discovery and analytics
  ✓ Enterprise customers

  Potential differentiators for Imann:
  → Gaming & entertainment focus (underserved)
  → YouTube-specific expertise
  → Performance-based pricing
  → B2C consumer brands
  → Smaller/mid-market budgets
`);

// Research links
console.log('🔗 RESEARCH LINKS');
console.log('─'.repeat(70));
console.log(`
  Competitor Reviews:
  - G2: https://www.g2.com/categories/influencer-marketing
  - Capterra: https://www.capterra.com/influencer-marketing-software/
  - TrustRadius: https://www.trustradius.com/influencer-marketing

  Industry Reports:
  - Influencer Marketing Hub: https://influencermarketinghub.com/
  - Business of Apps: https://www.businessofapps.com/marketplace/influencer-marketing/
  - Statista: https://www.statista.com/topics/2496/influence-marketing/
`);

// Competitor monitoring suggestions
console.log('📡 MONITORING SUGGESTIONS');
console.log('─'.repeat(70));
console.log(`
  Track these signals:
  1. New feature announcements (Twitter, LinkedIn, blogs)
  2. Pricing changes
  3. Case studies and customer wins
  4. Job postings (indicates growth areas)
  5. Funding news
  6. Industry conference presence

  Key newsletters/sources:
  - Tubefilter (YouTube creator news)
  - Social Media Today
  - Marketing Brew
  - Creator Economy Newsletter
`);

// Save competitive data
const competitiveData = {
  generated: new Date().toISOString(),
  competitors: COMPETITORS,
  marketSize: {
    global: '$21.1B (2024)',
    growth: '32% CAGR',
    source: 'Influencer Marketing Hub'
  },
  keyTrends: [
    'AI-powered creator discovery',
    'Focus on ROI measurement',
    'Long-term creator partnerships > one-offs',
    'Micro-influencer growth',
    'Short-form video dominance'
  ]
};

fs.writeFileSync('./competitive-intel.json', JSON.stringify(competitiveData, null, 2));
console.log('\n✅ Saved competitive data to competitive-intel.json');
