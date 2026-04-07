#!/usr/bin/env node
/**
 * Proposal Generator
 * Generate customized rate cards and pitch decks
 * 
 * Usage:
 *   node proposal.js                           # List available templates
 *   node proposal.js imann                     # Show ItssIMANNN rate card
 *   node proposal.js generate "Company" imann integration 25000
 *   node proposal.js pitch "Company" gaming    # Generate pitch for gaming company
 */

const fs = require('fs');
const path = require('path');

const PROPOSALS_DIR = path.join(__dirname, 'proposals');

// Creator stats
const CREATORS = {
  imann: {
    name: 'ItssIMANNN',
    subscribers: '10.5M',
    monthlyViews: '150-361M',
    engagement: '8.2%',
    audience: '18-34, 65% US',
    content: 'Story-driven moral skits',
    rateCard: 'itssimannn-rate-card.md'
  },
  alementary: {
    name: 'Alementary (Alasdair)',
    subscribers: '500K',
    monthlyViews: '5-10M',
    engagement: '6.5%',
    audience: '25-44, tech enthusiasts',
    content: 'Tech reviews, tutorials',
    rateCard: 'alementary-rate-card.md'
  }
};

// Package templates
const PACKAGES = {
  integration: {
    name: 'Story Integration',
    priceRange: '$15,000 - $25,000',
    description: 'Product naturally woven into content',
    includes: [
      '60-90 second organic integration',
      'Product appears in 3+ scenes',
      'Call-to-action with link',
      '2 weeks pinned comment'
    ]
  },
  dedicated: {
    name: 'Dedicated Video',
    priceRange: '$30,000 - $45,000',
    description: 'Full video centered on your brand',
    includes: [
      '8-12 minute dedicated video',
      'Full creative control with approval',
      'Custom thumbnail',
      '30-day pinned comment',
      'Instagram Story mention'
    ]
  },
  series: {
    name: 'Series Sponsorship',
    priceRange: '$50,000 - $75,000',
    description: '3 videos over 4-6 weeks',
    includes: [
      '3 story integrations',
      'Consistent brand messaging',
      'Cross-promotion on Instagram',
      'Dedicated reporting'
    ]
  }
};

// Vertical-specific pitches
const VERTICAL_PITCHES = {
  gaming: {
    hook: 'Gaming is in ItssIMANNN\'s DNA. His Whiteout Survival campaign drove 100K+ installs.',
    caseStudy: 'Whiteout Survival: 48M views, 100K+ new users, Top 10 iOS for 3 days',
    angle: 'His audience loves mobile games - especially narrative-driven ones that match his content style.'
  },
  edtech: {
    hook: 'Education meets entertainment. ItssIMANNN makes learning feel natural.',
    caseStudy: 'Gauth AI: 15M+ views, 50K+ downloads, viral on TikTok',
    angle: 'His moral skit format is perfect for educational messaging - lessons wrapped in stories.'
  },
  consumer: {
    hook: 'ItssIMANNN\'s audience trusts his recommendations. 73% report buying products he promotes.',
    caseStudy: 'Multiple consumer brand partnerships with strong conversion rates',
    angle: 'His authentic style means products feel like genuine recommendations, not ads.'
  },
  tech: {
    hook: 'For tech-focused campaigns, Alementary delivers engaged, decision-maker audiences.',
    caseStudy: 'Tech reviews that drive real consideration and purchase intent',
    angle: 'Detailed, thoughtful content that tech buyers trust for purchasing decisions.'
  }
};

function generateProposal(company, creator, packageType, price) {
  const creatorInfo = CREATORS[creator] || CREATORS.imann;
  const pkg = PACKAGES[packageType] || PACKAGES.integration;
  
  const proposal = `
# Partnership Proposal: ${company} × ${creatorInfo.name}

## Executive Summary

We propose a ${pkg.name.toLowerCase()} partnership between **${company}** and **${creatorInfo.name}** to drive awareness and conversions among ${creatorInfo.audience} audience.

---

## Creator Profile

| Metric | Value |
|--------|-------|
| Channel | ${creatorInfo.name} |
| Subscribers | ${creatorInfo.subscribers} |
| Monthly Views | ${creatorInfo.monthlyViews} |
| Engagement Rate | ${creatorInfo.engagement} |
| Content Type | ${creatorInfo.content} |

---

## Proposed Package: ${pkg.name}

**Investment:** ${price ? '$' + parseInt(price).toLocaleString() : pkg.priceRange}

${pkg.description}

### Deliverables:
${pkg.includes.map(i => `- ${i}`).join('\n')}

---

## Why This Works for ${company}

${creatorInfo.name}'s audience of ${creatorInfo.audience} aligns perfectly with ${company}'s target market. His ${creatorInfo.content} format creates authentic, memorable brand moments that drive real results.

---

## Timeline

- **Week 1:** Creative briefing and concept development
- **Week 2:** Script approval and production
- **Week 3:** Video delivery and launch
- **Week 4+:** Performance monitoring and reporting

---

## Investment & Terms

**Total Investment:** ${price ? '$' + parseInt(price).toLocaleString() : pkg.priceRange}

**Payment Terms:**
- 50% upon contract signing
- 50% upon video delivery

---

## Next Steps

1. Schedule a call to discuss creative direction
2. Review and sign partnership agreement
3. Begin production

---

*Proposal prepared by BY Influence Company LLC*
*Valid for 14 days*
`;

  return proposal;
}

function generatePitch(company, vertical) {
  const pitch = VERTICAL_PITCHES[vertical] || VERTICAL_PITCHES.consumer;
  
  return `
# Quick Pitch: ${company}

## The Hook
${pitch.hook}

## Proof Point
${pitch.caseStudy}

## Why ${company}
${pitch.angle}

## Recommended Package
For ${company}, we recommend starting with a **Story Integration** ($15-25K) to test performance, with option to scale to a Series Sponsorship if results are strong.

## Call to Action
"Would you be open to a 15-minute call this week to explore if there's a fit? I can share more case studies relevant to [their vertical]."
`;
}

function showTemplates() {
  console.log('\n📋 PROPOSAL TEMPLATES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('Creators:');
  for (const [key, creator] of Object.entries(CREATORS)) {
    console.log(`  ${key.padEnd(12)} ${creator.name} (${creator.subscribers} subs)`);
  }
  
  console.log('\nPackages:');
  for (const [key, pkg] of Object.entries(PACKAGES)) {
    console.log(`  ${key.padEnd(12)} ${pkg.name} (${pkg.priceRange})`);
  }
  
  console.log('\nVerticals:');
  for (const key of Object.keys(VERTICAL_PITCHES)) {
    console.log(`  ${key}`);
  }
  
  console.log('\nUsage:');
  console.log('  node proposal.js imann                           # Show rate card');
  console.log('  node proposal.js generate "Company" imann integration 25000');
  console.log('  node proposal.js pitch "Company" gaming\n');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'list') {
  showTemplates();
} else if (command === 'imann' || command === 'itssimannn') {
  const rateCardPath = path.join(PROPOSALS_DIR, 'itssimannn-rate-card.md');
  if (fs.existsSync(rateCardPath)) {
    console.log(fs.readFileSync(rateCardPath, 'utf8'));
  } else {
    console.log('Rate card not found. Creating proposals directory...');
  }
} else if (command === 'generate') {
  const [, company, creator, packageType, price] = args;
  if (!company) {
    console.log('Usage: node proposal.js generate "Company" [creator] [package] [price]');
  } else {
    const proposal = generateProposal(company, creator, packageType, price);
    console.log(proposal);
    
    // Save to file
    const filename = `proposal-${company.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
    const filepath = path.join(PROPOSALS_DIR, filename);
    if (!fs.existsSync(PROPOSALS_DIR)) {
      fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
    }
    fs.writeFileSync(filepath, proposal);
    console.log(`\n✅ Saved to ${filepath}`);
  }
} else if (command === 'pitch') {
  const [, company, vertical] = args;
  if (!company) {
    console.log('Usage: node proposal.js pitch "Company" [vertical]');
  } else {
    console.log(generatePitch(company, vertical || 'consumer'));
  }
} else {
  console.log(`Unknown command: ${command}`);
  showTemplates();
}
