#!/usr/bin/env node
/**
 * Quick Pitch Generator
 * Generate customized pitches for specific verticals/companies
 * 
 * Usage:
 *   node quick-pitch.js                    # List verticals
 *   node quick-pitch.js gaming             # Gaming vertical pitch
 *   node quick-pitch.js gaming "Riot Games" # Custom pitch for company
 *   node quick-pitch.js edtech "Duolingo"  # EdTech pitch
 */

const fs = require('fs');
const path = require('path');

// ItssIMANNN stats for pitches
const CREATOR_STATS = {
  name: 'ItssIMANNN',
  subscribers: '10.5M',
  monthlyViews: '150-361M',
  avgViews: '8-15M per video',
  engagement: '8.2%',
  audience: {
    age: '18-34 (72%)',
    gender: '55% Male, 45% Female',
    geo: '65% US, 12% UK, 8% Canada',
    interests: 'Entertainment, Gaming, Lifestyle, Tech'
  },
  content: 'Story-driven moral skits with high emotional engagement'
};

// Vertical-specific pitches
const VERTICALS = {
  gaming: {
    name: 'Gaming',
    emoji: '🎮',
    hook: 'Mobile games thrive with story-driven content',
    whyItWorks: [
      'Our audience spends 4+ hours daily on mobile entertainment',
      'Story integrations feel authentic — not like ads',
      'Previous gaming campaigns averaged 380% ROI',
      '100K+ verified installs from Whiteout Survival campaign'
    ],
    caseStudy: 'Whiteout Survival: 48M views, 100K+ installs, 380% ROI',
    packages: [
      { name: 'Story Integration', price: '$15-20K', desc: '60-90s organic integration' },
      { name: 'Dedicated Video', price: '$30-40K', desc: 'Full gameplay feature' },
      { name: 'Series Deal', price: '$60-80K', desc: '3 videos over 6 weeks' }
    ],
    objectionHandlers: {
      'Too expensive': 'Our CPM of $3-4 is below industry average of $8-12 for this demographic',
      'Audience fit': '72% are 18-34 with high gaming affinity — exactly your target',
      'ROI concerns': 'We can structure a performance bonus tied to install targets'
    }
  },
  
  edtech: {
    name: 'EdTech / Education',
    emoji: '📚',
    hook: 'Gen Z trusts creators over traditional education marketing',
    whyItWorks: [
      'Young audience actively seeking self-improvement content',
      'Story format makes learning apps feel relatable',
      'Gauth AI campaign drove 50K+ downloads with 290% ROI',
      'High-intent audience — they watch for value, not just entertainment'
    ],
    caseStudy: 'Gauth AI: 15M views, 50K+ downloads, app store ranking jumped to #12',
    packages: [
      { name: 'Story Integration', price: '$15-25K', desc: 'Character uses app to solve problem' },
      { name: 'Tutorial Moment', price: '$20-30K', desc: 'Educational demonstration' },
      { name: 'Campaign Series', price: '$50-70K', desc: '3 integrations + dedicated' }
    ],
    objectionHandlers: {
      'Audience too young': 'Actually 28% are 25-34 — prime age for professional development apps',
      'Not educational enough': 'Story format has 3x higher retention than traditional edu content',
      'Need direct response': 'We can include trackable links and promo codes'
    }
  },
  
  fintech: {
    name: 'FinTech / Finance',
    emoji: '💰',
    hook: 'Financial literacy content performs incredibly well with Gen Z',
    whyItWorks: [
      'Young adults actively seeking money management solutions',
      'Trust-based audience — they follow for advice, not just entertainment',
      'Story format makes finance approachable, not intimidating',
      'High-income potential audience as they enter workforce'
    ],
    caseStudy: 'Financial apps see 2-3x conversion rates vs traditional influencer campaigns',
    packages: [
      { name: 'Story Integration', price: '$20-30K', desc: 'Financial lesson moment' },
      { name: 'Testimonial Style', price: '$25-35K', desc: 'Personal finance story' },
      { name: 'Educational Series', price: '$60-80K', desc: '3-part financial journey' }
    ],
    objectionHandlers: {
      'Compliance concerns': 'We have experience with FTC guidelines and can include required disclosures',
      'Audience sophistication': 'Our demo is college-educated with growing disposable income',
      'Need older audience': 'Parents also watch — 15% of viewers are 35-54'
    }
  },
  
  ecommerce: {
    name: 'E-Commerce / DTC',
    emoji: '🛍️',
    hook: 'Product placement in stories creates authentic desire',
    whyItWorks: [
      'Visual storytelling showcases products naturally',
      'Audience actively shops based on creator recommendations',
      'Promo codes drive trackable conversions',
      'Multiple touchpoints in single video (wear, use, recommend)'
    ],
    caseStudy: 'Fashion/lifestyle integrations see 15-20% promo code usage rates',
    packages: [
      { name: 'Product Feature', price: '$12-18K', desc: 'Organic product showcase' },
      { name: 'Haul/Unboxing', price: '$18-25K', desc: 'Dedicated product segment' },
      { name: 'Brand Partnership', price: '$40-60K', desc: 'Ongoing ambassador deal' }
    ],
    objectionHandlers: {
      'Need immediate sales': 'Promo codes give you exact ROAS tracking',
      'Niche product': 'Story context makes any product feel relatable',
      'Competition': 'Exclusivity clauses available for premium partnerships'
    }
  },
  
  tech: {
    name: 'Tech / AI / SaaS',
    emoji: '🤖',
    hook: 'Tech-curious audience eager to try new tools',
    whyItWorks: [
      'Audience skews tech-savvy and early-adopter',
      'AI and productivity tools fit naturally into story content',
      'Allison AI campaign drove 28K+ signups with 210% ROI',
      'Demo-style integrations show real value'
    ],
    caseStudy: 'Allison AI: 12M views, 28K signups, 2.3% conversion rate',
    packages: [
      { name: 'Story Integration', price: '$15-25K', desc: 'Character uses tech to solve problem' },
      { name: 'Demo Feature', price: '$25-35K', desc: 'In-depth functionality showcase' },
      { name: 'Launch Campaign', price: '$50-70K', desc: 'Multi-video launch support' }
    ],
    objectionHandlers: {
      'B2B focus': 'Individual users drive word-of-mouth to business adoption',
      'Complex product': 'Story format simplifies — show the benefit, not the feature',
      'Need quality leads': 'Our signup-to-paid conversion tracks above industry average'
    }
  }
};

// Generate pitch
function generatePitch(verticalKey, companyName = null) {
  const v = VERTICALS[verticalKey];
  if (!v) {
    console.log(`❌ Vertical "${verticalKey}" not found`);
    console.log('Available:', Object.keys(VERTICALS).join(', '));
    return null;
  }
  
  const company = companyName || `[Your Company]`;
  
  const pitch = `
${v.emoji} PITCH FOR ${company.toUpperCase()} (${v.name})
${'═'.repeat(60)}

📌 THE HOOK
${v.hook}

👤 ABOUT ITSSIMANNN
• ${CREATOR_STATS.subscribers} subscribers
• ${CREATOR_STATS.monthlyViews} monthly views
• ${CREATOR_STATS.engagement} engagement rate
• Audience: ${CREATOR_STATS.audience.age}, ${CREATOR_STATS.audience.geo}
• Content: ${CREATOR_STATS.content}

✅ WHY ${v.name.toUpperCase()} WORKS WITH US
${v.whyItWorks.map(w => `  • ${w}`).join('\n')}

📊 CASE STUDY
${v.caseStudy}

💰 PACKAGES FOR ${company.toUpperCase()}

${v.packages.map(p => `  ${p.name.padEnd(20)} ${p.price.padEnd(15)} ${p.desc}`).join('\n')}

🛡️ OBJECTION HANDLERS
${Object.entries(v.objectionHandlers).map(([obj, response]) => 
  `  "${obj}"\n  → ${response}`
).join('\n\n')}

📧 NEXT STEPS
1. 15-min discovery call to understand ${company}'s goals
2. Custom proposal with content concepts
3. Timeline and deliverables agreement

${'─'.repeat(60)}
BY Influence Company | Influencer Marketing That Converts
`;
  
  return pitch;
}

// CLI
const args = process.argv.slice(2);
const vertical = args[0];
const company = args[1];

console.log('\n🎯 Quick Pitch Generator\n');

if (!vertical) {
  console.log('Available Verticals:\n');
  Object.entries(VERTICALS).forEach(([key, v]) => {
    console.log(`  ${v.emoji} ${key.padEnd(12)} → ${v.name}`);
  });
  console.log('\nUsage:');
  console.log('  node quick-pitch.js gaming');
  console.log('  node quick-pitch.js gaming "Riot Games"');
  console.log('  node quick-pitch.js edtech "Duolingo"\n');
} else {
  const pitch = generatePitch(vertical, company);
  if (pitch) {
    console.log(pitch);
    
    // Save to file
    const filename = company 
      ? `pitch-${vertical}-${company.toLowerCase().replace(/\s+/g, '-')}.txt`
      : `pitch-${vertical}.txt`;
    const outPath = path.join(__dirname, 'pitches', filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pitch);
    console.log(`\n💾 Saved to: ${outPath}`);
  }
}
