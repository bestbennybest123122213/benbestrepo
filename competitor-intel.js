#!/usr/bin/env node
/**
 * Competitor Intel Tool
 * 
 * Tracks competitors in the influencer marketing space
 * and helps identify opportunities
 */

require('dotenv').config();

// Known competitors in influencer marketing
const COMPETITORS = {
  'grin.co': {
    name: 'GRIN',
    type: 'Platform',
    focus: 'E-commerce influencer marketing',
    pricing: '$10k-25k/month',
    strengths: ['Shopify integration', 'Creator payments', 'ROI tracking'],
    weaknesses: ['Expensive', 'Complex setup', 'E-commerce focused']
  },
  'aspireiq.com': {
    name: 'AspireIQ',
    type: 'Platform',
    focus: 'Community-driven influencer marketing',
    pricing: '$15k-50k/month',
    strengths: ['Large creator network', 'Campaign management', 'Analytics'],
    weaknesses: ['High cost', 'Enterprise only', 'Long contracts']
  },
  'upfluence.com': {
    name: 'Upfluence',
    type: 'Platform',
    focus: 'Full-stack influencer marketing',
    pricing: '$5k-20k/month',
    strengths: ['Chrome extension', 'CRM features', 'E-commerce focus'],
    weaknesses: ['Data accuracy issues', 'UI complexity']
  },
  'traackr.com': {
    name: 'Traackr',
    type: 'Platform',
    focus: 'Enterprise influencer management',
    pricing: '$20k-100k/year',
    strengths: ['Enterprise features', 'Global coverage', 'Compliance'],
    weaknesses: ['Very expensive', 'Overkill for SMBs']
  },
  'creatoriq.com': {
    name: 'CreatorIQ',
    type: 'Platform',
    focus: 'Enterprise creator management',
    pricing: '$30k+/month',
    strengths: ['Data depth', 'Enterprise scale', 'Fraud detection'],
    weaknesses: ['Extremely expensive', 'Long implementation']
  },
  'modash.io': {
    name: 'Modash',
    type: 'Discovery',
    focus: 'Influencer discovery & analytics',
    pricing: '$99-999/month',
    strengths: ['Affordable', 'Good data', 'Easy to use'],
    weaknesses: ['Discovery only', 'No campaign management']
  },
  'heepsy.com': {
    name: 'Heepsy',
    type: 'Discovery',
    focus: 'Influencer search',
    pricing: '$49-269/month',
    strengths: ['Affordable', 'Easy search', 'Quick start'],
    weaknesses: ['Limited features', 'Smaller database']
  }
};

function analyzeCompetitorLandscape() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🎯 COMPETITOR INTELLIGENCE                                          ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // By type
  const platforms = Object.values(COMPETITORS).filter(c => c.type === 'Platform');
  const discovery = Object.values(COMPETITORS).filter(c => c.type === 'Discovery');

  console.log('📊 MARKET LANDSCAPE');
  console.log('────────────────────────────────────────');
  console.log('  Full-stack platforms: ' + platforms.length);
  console.log('  Discovery tools:      ' + discovery.length);
  console.log('');

  // Detailed breakdown
  console.log('🏢 ENTERPRISE PLATFORMS');
  console.log('════════════════════════════════════════');
  
  for (const comp of platforms) {
    console.log('');
    console.log('  ' + comp.name);
    console.log('  ' + '─'.repeat(40));
    console.log('    Focus:    ' + comp.focus);
    console.log('    Pricing:  ' + comp.pricing);
    console.log('    ✅ Strengths:');
    comp.strengths.forEach(s => console.log('       • ' + s));
    console.log('    ❌ Weaknesses:');
    comp.weaknesses.forEach(w => console.log('       • ' + w));
  }

  console.log('\n\n🔍 DISCOVERY TOOLS');
  console.log('════════════════════════════════════════');
  
  for (const comp of discovery) {
    console.log('');
    console.log('  ' + comp.name);
    console.log('  ' + '─'.repeat(40));
    console.log('    Focus:    ' + comp.focus);
    console.log('    Pricing:  ' + comp.pricing);
    console.log('    ✅ Strengths: ' + comp.strengths.join(', '));
    console.log('    ❌ Weaknesses: ' + comp.weaknesses.join(', '));
  }

  // Competitive positioning
  console.log('\n\n💡 COMPETITIVE POSITIONING');
  console.log('════════════════════════════════════════');
  console.log('');
  console.log('  Our advantages vs competitors:');
  console.log('  ────────────────────────────────────────');
  console.log('    ✅ More affordable than enterprise platforms');
  console.log('    ✅ Full-service (not just software)');
  console.log('    ✅ Gaming/B2C specialty');
  console.log('    ✅ Faster time-to-launch');
  console.log('    ✅ Performance-based pricing options');
  console.log('');
  console.log('  Key differentiators:');
  console.log('  ────────────────────────────────────────');
  console.log('    🎮 Gaming industry expertise');
  console.log('    🤝 White-glove service');
  console.log('    📊 Data-driven matching');
  console.log('    💰 Flexible pricing');
  console.log('');

  // Battle cards
  console.log('\n\n🃏 QUICK BATTLE CARDS');
  console.log('════════════════════════════════════════');
  
  console.log('\n  vs GRIN:');
  console.log('    "GRIN is great for e-commerce, but we specialize in');
  console.log('     gaming and B2C apps. Plus, we handle execution, not');
  console.log('     just software."');
  
  console.log('\n  vs AspireIQ:');
  console.log('    "AspireIQ is powerful but starts at $15k/month and');
  console.log('     requires significant internal resources. We provide');
  console.log('     full-service for a fraction of the cost."');
  
  console.log('\n  vs CreatorIQ:');
  console.log('    "CreatorIQ is built for Fortune 500 companies with');
  console.log('     $30k+ budgets. We deliver similar results for companies');
  console.log('     at any stage."');
  
  console.log('\n  vs Agencies:');
  console.log('    "Traditional agencies charge 20-30% of spend plus');
  console.log('     retainers. We offer transparent pricing and focus');
  console.log('     specifically on your vertical."');

  console.log('\n');
}

function checkLeadForCompetitor(email) {
  const domain = email.split('@')[1];
  if (COMPETITORS[domain]) {
    return COMPETITORS[domain];
  }
  return null;
}

async function main() {
  analyzeCompetitorLandscape();
  
  // Save for reference
  const fs = require('fs');
  fs.writeFileSync('competitor-data.json', JSON.stringify(COMPETITORS, null, 2));
  console.log('Data saved to competitor-data.json\n');
}

module.exports = { COMPETITORS, checkLeadForCompetitor };

if (require.main === module) {
  main();
}
