#!/usr/bin/env node
/**
 * Deal Closer Kit
 * Generate complete closing package for any lead
 * 
 * Usage:
 *   node deal-closer.js "Company Name" vertical
 *   node deal-closer.js "Stillfront" gaming
 *   node deal-closer.js "Duolingo" edtech
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Package pricing
const PACKAGES = {
  integration: { name: 'Story Integration', minPrice: 15000, maxPrice: 25000 },
  dedicated: { name: 'Dedicated Video', minPrice: 30000, maxPrice: 45000 },
  series: { name: 'Content Series (3 videos)', minPrice: 60000, maxPrice: 80000 }
};

// Case studies by vertical
const CASE_STUDIES = {
  gaming: {
    name: 'Whiteout Survival',
    views: '48M+',
    conversions: '100K+ installs',
    roi: '380%',
    client: 'Century Games'
  },
  edtech: {
    name: 'Gauth AI',
    views: '15M+',
    conversions: '50K+ downloads',
    roi: '290%',
    client: 'Gauth Education'
  },
  tech: {
    name: 'Allison AI',
    views: '12M+',
    conversions: '28K+ signups',
    roi: '210%',
    client: 'Allison Technologies'
  },
  ecommerce: {
    name: 'Valeo Games',
    views: '22M+',
    conversions: '45K+ installs',
    roi: '245%',
    client: 'Valeo Entertainment'
  },
  fintech: {
    name: 'FinTech Composite',
    views: '10M+ avg',
    conversions: '20K+ signups avg',
    roi: '200%+',
    client: 'Various'
  }
};

// Objection handlers
const OBJECTIONS = {
  price: {
    objection: "The price is too high",
    response: "Our CPM of $3-4 is actually below the industry average of $8-12 for this demographic. Plus, we can structure a performance bonus tied to your KPIs — if we don't deliver results, you pay less."
  },
  audience: {
    objection: "Not sure if the audience is right for us",
    response: "72% of our audience is 18-34, with 65% US-based. This is exactly the demographic that drives mobile engagement. Our previous gaming campaigns achieved 380% ROI specifically because of this audience match."
  },
  roi: {
    objection: "How do we know we'll see ROI?",
    response: "We're confident enough to offer performance bonuses. But look at our track record: Whiteout Survival saw 100K+ verified installs from a single video. Gauth AI jumped to #12 in the App Store. We have the receipts."
  },
  timing: {
    objection: "The timing isn't right",
    response: "I understand timing is crucial. Here's what I'd suggest: let's lock in the rate now and schedule production for whenever works best for your launch calendar. Rates are going up 15% in Q2."
  },
  competitor: {
    objection: "We're talking to other creators too",
    response: "That makes sense — you should explore options. What I'd ask you to consider: ItssIMANNN's story-driven format creates emotional connection, not just views. Our completion rate is 2x industry average. And we have proven gaming/tech results."
  }
};

// Follow-up sequence
const FOLLOWUP_SEQUENCE = [
  {
    day: 0,
    subject: "Partnership details as discussed",
    body: "Attaching the proposal we discussed. Happy to answer any questions."
  },
  {
    day: 3,
    subject: "Quick follow-up on ItssIMANNN partnership",
    body: "Wanted to check if you had a chance to review the proposal. Any questions I can help with?"
  },
  {
    day: 7,
    subject: "Re: Partnership timeline",
    body: "Hi [Name], circling back on this. If the timing isn't right now, I'd love to know when would be better. We're booking Q2 slots now."
  },
  {
    day: 14,
    subject: "Last check-in on ItssIMANNN collab",
    body: "Hi [Name], final follow-up on this. If it's not a fit right now, no worries at all — just let me know and I'll reach out next quarter instead."
  }
];

function generateDealCloserKit(company, vertical) {
  const caseStudy = CASE_STUDIES[vertical] || CASE_STUDIES.gaming;
  
  const kit = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🎯 DEAL CLOSER KIT                                         ║
║                    ${company.padEnd(50)}    ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
 📋 DEAL SUMMARY
═══════════════════════════════════════════════════════════════════════════════

  Company:    ${company}
  Vertical:   ${vertical.charAt(0).toUpperCase() + vertical.slice(1)}
  Generated:  ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════════════════
 💰 RECOMMENDED PACKAGES
═══════════════════════════════════════════════════════════════════════════════

${Object.entries(PACKAGES).map(([key, pkg]) => `
  ${pkg.name}
  ├─ Price Range: $${pkg.minPrice.toLocaleString()} - $${pkg.maxPrice.toLocaleString()}
  ├─ Commission (30%): $${(pkg.minPrice * 0.3).toLocaleString()} - $${(pkg.maxPrice * 0.3).toLocaleString()}
  └─ Best for: ${key === 'integration' ? 'Testing the waters, first partnership' : key === 'dedicated' ? 'Product launches, major campaigns' : 'Ongoing relationship, maximum impact'}
`).join('')}

  💡 RECOMMENDATION: Start with Story Integration ($15-20K) to prove results,
     then upsell to Series Deal for $60-80K.

═══════════════════════════════════════════════════════════════════════════════
 📊 RELEVANT CASE STUDY
═══════════════════════════════════════════════════════════════════════════════

  Campaign:    ${caseStudy.name}
  Client:      ${caseStudy.client}
  Views:       ${caseStudy.views}
  Conversions: ${caseStudy.conversions}
  ROI:         ${caseStudy.roi}

  Key Takeaway: "${caseStudy.name} proves that ${vertical} brands can achieve
  exceptional results with ItssIMANNN's story-driven content."

  📎 Full case study: gex casestudy ${vertical === 'gaming' ? 'whiteout' : vertical === 'edtech' ? 'gauth' : 'allison'}

═══════════════════════════════════════════════════════════════════════════════
 🛡️ OBJECTION HANDLERS
═══════════════════════════════════════════════════════════════════════════════
${Object.entries(OBJECTIONS).map(([key, obj]) => `
  ❓ "${obj.objection}"
  ✅ ${obj.response}
`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
 📧 FOLLOW-UP SEQUENCE
═══════════════════════════════════════════════════════════════════════════════
${FOLLOWUP_SEQUENCE.map(f => `
  Day ${f.day}: "${f.subject}"
  ${f.body}
`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
 ✅ PRE-CALL CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

  Before your next call with ${company}:
  
  □ Research their recent product launches
  □ Check their current social media presence
  □ Prepare 2-3 content concept ideas
  □ Know their competitors' influencer partnerships
  □ Have pricing ready with flexibility ranges
  □ Prepare case study link to share screen

═══════════════════════════════════════════════════════════════════════════════
 🎬 CONTENT CONCEPT IDEAS FOR ${company.toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════

  Concept 1: "The Discovery"
  Character discovers ${company}'s product while solving a problem in the story.
  Natural, authentic feel. Product is the solution, not the focus.

  Concept 2: "The Comparison"  
  Character compares options, ${company} clearly wins. 
  Shows features without being salesy.

  Concept 3: "The Journey"
  Multi-part story where ${company} product is a key plot element.
  Builds anticipation and repeat exposure.

═══════════════════════════════════════════════════════════════════════════════
 📞 CLOSING SCRIPT
═══════════════════════════════════════════════════════════════════════════════

  "So [Name], based on what you've shared, I think Story Integration at 
  $[PRICE] is the perfect way to test this. We'll get you [VIEWS]M views, 
  [ENGAGEMENT]% engagement, and a direct link to track conversions.

  If it works — and I'm confident it will based on ${caseStudy.name}'s results — 
  we can talk about a longer-term series deal.

  Can we lock in a production slot for [DATE]? I've got one opening in the 
  next 2 weeks, then we're booked out until [FUTURE DATE]."

═══════════════════════════════════════════════════════════════════════════════
  🎯 Generated by Deal Closer Kit | BY Influence Company
═══════════════════════════════════════════════════════════════════════════════
`;

  return kit;
}

// CLI
const args = process.argv.slice(2);
const company = args[0];
const vertical = args[1] || 'gaming';

console.log('\n🎯 Deal Closer Kit Generator\n');

if (!company) {
  console.log('Usage: node deal-closer.js "Company Name" vertical\n');
  console.log('Example: node deal-closer.js "Stillfront" gaming');
  console.log('         node deal-closer.js "Duolingo" edtech\n');
  console.log('Verticals: gaming, edtech, tech, ecommerce, fintech\n');
} else {
  const kit = generateDealCloserKit(company, vertical);
  console.log(kit);
  
  // Save to file
  const filename = `closer-${company.toLowerCase().replace(/\s+/g, '-')}.txt`;
  const outPath = path.join(__dirname, 'closer-kits', filename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, kit);
  console.log(`\n💾 Saved to: ${outPath}`);
}
