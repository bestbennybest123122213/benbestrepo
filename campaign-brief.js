#!/usr/bin/env node
/**
 * Campaign Brief Generator
 * Generate professional campaign briefs for confirmed deals
 * 
 * Usage:
 *   node campaign-brief.js "Company" gaming integration 25000 "2025-03-15"
 *   node campaign-brief.js --interactive
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Content package details
const PACKAGES = {
  integration: {
    name: 'Story Integration',
    duration: '60-90 seconds',
    description: 'Organic product/brand integration within story content',
    deliverables: [
      'Product naturally woven into narrative',
      'Verbal mention + on-screen appearance',
      'CTA with link in description',
      '2 weeks pinned comment',
      '3 Instagram story cross-posts'
    ],
    timeline: {
      conceptApproval: 3,
      scriptApproval: 5,
      production: 7,
      clientReview: 2,
      publish: 1
    }
  },
  dedicated: {
    name: 'Dedicated Video',
    duration: '8-15 minutes',
    description: 'Full video featuring product/brand as central element',
    deliverables: [
      'Full-length dedicated content',
      'Multiple product touchpoints',
      'Detailed feature demonstration',
      'Strong CTA with custom link',
      '4 weeks pinned comment',
      '5 Instagram story cross-posts',
      '1 TikTok cross-post'
    ],
    timeline: {
      conceptApproval: 5,
      scriptApproval: 7,
      production: 14,
      clientReview: 3,
      publish: 1
    }
  },
  series: {
    name: 'Content Series',
    duration: '3 videos over 6 weeks',
    description: 'Multi-video campaign with narrative arc',
    deliverables: [
      '3 videos with connected storyline',
      'Progressive product integration',
      'Building audience anticipation',
      'Custom hashtag campaign',
      '6 weeks pinned comments',
      '10 Instagram story cross-posts',
      '3 TikTok cross-posts'
    ],
    timeline: {
      conceptApproval: 7,
      scriptApproval: 10,
      production: 28,
      clientReview: 5,
      publish: 3
    }
  }
};

// Generate brief
function generateBrief(company, vertical, packageType, budget, publishDate) {
  const pkg = PACKAGES[packageType];
  if (!pkg) {
    console.log(`❌ Package "${packageType}" not found`);
    console.log('Available:', Object.keys(PACKAGES).join(', '));
    return null;
  }
  
  const pubDate = new Date(publishDate);
  const totalDays = Object.values(pkg.timeline).reduce((a, b) => a + b, 0);
  
  // Calculate milestone dates
  const milestones = {};
  let currentDate = new Date(pubDate);
  currentDate.setDate(currentDate.getDate() - totalDays);
  const kickoff = new Date(currentDate);
  
  Object.entries(pkg.timeline).forEach(([milestone, days]) => {
    currentDate.setDate(currentDate.getDate() + days);
    milestones[milestone] = new Date(currentDate).toISOString().split('T')[0];
  });
  
  const brief = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CAMPAIGN BRIEF                                      ║
║                      BY INFLUENCE COMPANY LLC                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
 CAMPAIGN OVERVIEW
═══════════════════════════════════════════════════════════════════════════════

  Client:           ${company}
  Vertical:         ${vertical.charAt(0).toUpperCase() + vertical.slice(1)}
  Package:          ${pkg.name}
  Budget:           $${budget.toLocaleString()}
  Content Duration: ${pkg.duration}
  Publish Date:     ${publishDate}
  
  Creator:          ItssIMANNN
  Platform:         YouTube (Primary), Instagram, TikTok (Cross-posts)

═══════════════════════════════════════════════════════════════════════════════
 CONTENT DESCRIPTION
═══════════════════════════════════════════════════════════════════════════════

  ${pkg.description}

═══════════════════════════════════════════════════════════════════════════════
 DELIVERABLES
═══════════════════════════════════════════════════════════════════════════════

${pkg.deliverables.map((d, i) => `  ${i + 1}. ${d}`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
 PROJECT TIMELINE
═══════════════════════════════════════════════════════════════════════════════

  Campaign Kickoff:        ${kickoff.toISOString().split('T')[0]}
  
  ┌─────────────────────────┬────────────────┬──────────────────┐
  │ Milestone               │ Due Date       │ Responsible      │
  ├─────────────────────────┼────────────────┼──────────────────┤
  │ Concept Approval        │ ${milestones.conceptApproval}     │ Client           │
  │ Script Approval         │ ${milestones.scriptApproval}     │ Client           │
  │ Production Complete     │ ${milestones.production}     │ Creator          │
  │ Client Review/Feedback  │ ${milestones.clientReview}     │ Client           │
  │ Publish                 │ ${milestones.publish}     │ Creator          │
  └─────────────────────────┴────────────────┴──────────────────┘
  
  Total Production Time: ${totalDays} days

═══════════════════════════════════════════════════════════════════════════════
 CONTENT REQUIREMENTS FROM CLIENT
═══════════════════════════════════════════════════════════════════════════════

  Please provide the following:
  
  □ Brand guidelines / style guide
  □ Key messaging points (max 3)
  □ Required disclosures / legal copy
  □ Tracking link(s) for CTA
  □ Promo code (if applicable)
  □ Product assets / screenshots / B-roll (if needed)
  □ Approval contacts and response time commitment

═══════════════════════════════════════════════════════════════════════════════
 USAGE RIGHTS
═══════════════════════════════════════════════════════════════════════════════

  • Content remains on creator's channel indefinitely
  • Client receives 30-day organic usage rights for social reposts
  • Whitelisting/paid amplification available at additional cost
  • No exclusivity unless separately negotiated

═══════════════════════════════════════════════════════════════════════════════
 PERFORMANCE EXPECTATIONS
═══════════════════════════════════════════════════════════════════════════════

  Based on historical data for ${pkg.name} campaigns:
  
  • Expected Views: 8-15M (within 30 days)
  • Expected CTR: 3.5-4.5%
  • Expected Engagement: 8%+
  
  Note: These are estimates based on past performance. Actual results may vary.

═══════════════════════════════════════════════════════════════════════════════
 PAYMENT TERMS
═══════════════════════════════════════════════════════════════════════════════

  Total Budget:        $${budget.toLocaleString()}
  
  Payment Schedule:
  • 50% upon contract signing ($${(budget * 0.5).toLocaleString()})
  • 50% upon content delivery ($${(budget * 0.5).toLocaleString()})
  
  Payment Method: Wire transfer / ACH

═══════════════════════════════════════════════════════════════════════════════
 CONTACTS
═══════════════════════════════════════════════════════════════════════════════

  BY Influence Company:
  • Campaign Manager: [Name]
  • Email: [Email]
  • Response Time: Within 24 hours
  
  Client (${company}):
  • Primary Contact: [To be filled]
  • Email: [To be filled]
  • Approval Authority: [To be filled]

═══════════════════════════════════════════════════════════════════════════════

  Document Generated: ${new Date().toISOString().split('T')[0]}
  Reference: BRIEF-${company.toUpperCase().replace(/\s+/g, '').slice(0, 6)}-${Date.now().toString().slice(-6)}

═══════════════════════════════════════════════════════════════════════════════
`;

  return brief;
}

// CLI
const args = process.argv.slice(2);

console.log('\n📋 Campaign Brief Generator\n');

if (args.length < 5 && !args.includes('--interactive')) {
  console.log('Usage:');
  console.log('  node campaign-brief.js "Company" vertical package budget "publish-date"');
  console.log('  node campaign-brief.js "Stillfront" gaming integration 25000 "2025-03-15"');
  console.log('');
  console.log('Packages: integration, dedicated, series');
  console.log('');
} else if (args.includes('--interactive')) {
  console.log('Interactive mode not yet implemented. Use command-line arguments.');
} else {
  const [company, vertical, packageType, budget, publishDate] = args;
  const brief = generateBrief(company, vertical, packageType, parseInt(budget), publishDate);
  
  if (brief) {
    console.log(brief);
    
    // Save to file
    const filename = `brief-${company.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt`;
    const outPath = path.join(__dirname, 'briefs', filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, brief);
    console.log(`\n💾 Saved to: ${outPath}`);
  }
}
