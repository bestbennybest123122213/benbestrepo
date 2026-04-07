#!/usr/bin/env node
/**
 * Campaign Case Study Generator
 * Generate professional case studies from past campaign performance
 * 
 * Usage:
 *   node case-study.js                      # List available case studies
 *   node case-study.js whiteout             # Generate Whiteout Survival case study
 *   node case-study.js gauth                # Generate Gauth AI case study
 *   node case-study.js all                  # Generate all case studies
 *   node case-study.js --format=pdf         # Generate as PDF-ready markdown
 *   node case-study.js --for="Company Name" # Customize for specific prospect
 */

const fs = require('fs');
const path = require('path');

// Campaign Performance Data (historical)
const CAMPAIGNS = {
  whiteout: {
    name: 'Whiteout Survival',
    client: 'Century Games',
    vertical: 'Mobile Gaming',
    creator: 'ItssIMANNN',
    date: 'Q3 2024',
    dealValue: 48000,
    commission: 14400,
    metrics: {
      views: '48M+',
      newUsers: '100,000+',
      ctr: '4.2%',
      retention: '32% D7',
      roi: '380%'
    },
    content: {
      type: 'Dedicated Video',
      duration: '12 minutes',
      integration: 'Full gameplay + story integration',
      cta: 'Download link in description + pinned comment'
    },
    results: [
      'Exceeded view target by 240%',
      '100K+ verified new user installs',
      'Top 5 trending gaming video that week',
      'Client renewed for 3-video series'
    ],
    testimonial: {
      quote: 'The campaign exceeded all our expectations. ItssIMANNN\'s storytelling made our game feel authentic and exciting.',
      author: 'Marketing Director, Century Games'
    }
  },
  
  gauth: {
    name: 'Gauth AI',
    client: 'Gauth Education',
    vertical: 'EdTech / AI',
    creator: 'ItssIMANNN',
    date: 'Q4 2024',
    dealValue: 35000,
    commission: 10500,
    metrics: {
      views: '15M+',
      downloads: '50,000+',
      ctr: '3.8%',
      appRating: '4.7★ post-campaign',
      roi: '290%'
    },
    content: {
      type: 'Story Integration',
      duration: '90 seconds within 15-min video',
      integration: 'Character uses app to solve problem',
      cta: 'Link in description + verbal callout'
    },
    results: [
      'Exceeded download target by 167%',
      'App store ranking jumped to #12 in Education',
      'Organic social mentions up 340%',
      'Client signed annual partnership'
    ],
    testimonial: {
      quote: 'ItssIMANNN\'s audience is exactly our target demographic. The authentic integration drove real results.',
      author: 'Head of Growth, Gauth AI'
    }
  },
  
  valeo: {
    name: 'Valeo Games',
    client: 'Valeo Entertainment',
    vertical: 'Mobile Gaming',
    creator: 'ItssIMANNN',
    date: 'Q4 2024',
    dealValue: 30906,
    commission: 7727,
    metrics: {
      views: '22M+',
      installs: '45,000+',
      ctr: '3.5%',
      retention: '28% D7',
      roi: '245%'
    },
    content: {
      type: 'Story Integration',
      duration: '75 seconds',
      integration: 'Organic gameplay moment',
      cta: 'Download link + promo code'
    },
    results: [
      'Strong performance in key 18-24 demographic',
      'Promo code usage exceeded projections',
      'Positive comment sentiment 94%',
      'Client exploring series deal'
    ],
    testimonial: {
      quote: 'Great ROI and authentic content that resonated with viewers.',
      author: 'UA Manager, Valeo Games'
    }
  },
  
  allison: {
    name: 'Allison AI',
    client: 'Allison Technologies',
    vertical: 'AI / Tech',
    creator: 'ItssIMANNN',
    date: 'Q1 2025',
    dealValue: 24045,
    commission: 8416,
    metrics: {
      views: '12M+',
      signups: '28,000+',
      ctr: '4.1%',
      conversionRate: '2.3%',
      roi: '210%'
    },
    content: {
      type: 'Story Integration',
      duration: '60 seconds',
      integration: 'AI assistant helps character',
      cta: 'Try free link in description'
    },
    results: [
      'Strong signup conversion rate',
      'High-quality leads (tech-savvy audience)',
      '89% positive comment sentiment',
      'Brand awareness significantly increased'
    ],
    testimonial: {
      quote: 'Perfect fit for reaching a younger, engaged audience interested in AI.',
      author: 'CMO, Allison AI'
    }
  }
};

// Generate case study markdown
function generateCaseStudy(campaignKey, forCompany = null) {
  const c = CAMPAIGNS[campaignKey];
  if (!c) {
    console.log(`❌ Campaign "${campaignKey}" not found`);
    console.log('Available:', Object.keys(CAMPAIGNS).join(', '));
    return null;
  }
  
  const customIntro = forCompany 
    ? `*Prepared for ${forCompany}*\n\n---\n\n`
    : '';
  
  const md = `${customIntro}# 📊 Case Study: ${c.name}

## Campaign Overview

| Detail | Value |
|--------|-------|
| **Client** | ${c.client} |
| **Vertical** | ${c.vertical} |
| **Creator** | ${c.creator} |
| **Campaign Period** | ${c.date} |
| **Content Type** | ${c.content.type} |

---

## 🎯 The Challenge

${c.client} wanted to reach a young, engaged audience (18-34) with authentic content that would drive real conversions, not just views.

## 💡 The Solution

We partnered ${c.client} with **${c.creator}** (10.5M subscribers, 150-361M monthly views) for a ${c.content.type.toLowerCase()} campaign.

**Content Details:**
- **Duration:** ${c.content.duration}
- **Integration Style:** ${c.content.integration}
- **Call-to-Action:** ${c.content.cta}

---

## 📈 Results

### Key Metrics

| Metric | Result |
|--------|--------|
| **Total Views** | ${c.metrics.views} |
| **${c.metrics.newUsers ? 'New Users' : c.metrics.downloads ? 'Downloads' : 'Signups'}** | ${c.metrics.newUsers || c.metrics.downloads || c.metrics.signups} |
| **Click-Through Rate** | ${c.metrics.ctr} |
| **ROI** | ${c.metrics.roi} |

### Highlights

${c.results.map(r => `✅ ${r}`).join('\n')}

---

## 💬 Client Testimonial

> "${c.testimonial.quote}"
>
> — *${c.testimonial.author}*

---

## 🚀 Why It Worked

1. **Authentic Integration** — Content felt natural, not like an ad
2. **Right Audience** — 18-34 demographic perfectly matched target
3. **Storytelling Power** — ItssIMANNN's narrative style creates emotional connection
4. **Strong CTA Placement** — Clear action steps drove conversions

---

## Ready to See Similar Results?

Contact BY Influence Company to discuss your campaign goals.

📧 [Contact Us]
📊 **Average Client ROI: 275%+**

---

*Case study prepared by BY Influence Company LLC*
`;

  return md;
}

// Generate summary comparison
function generateComparison() {
  const md = `# 📊 Campaign Performance Summary

## All Campaigns at a Glance

| Campaign | Views | Conversions | CTR | ROI | Deal Value |
|----------|-------|-------------|-----|-----|------------|
${Object.values(CAMPAIGNS).map(c => 
  `| ${c.name} | ${c.metrics.views} | ${c.metrics.newUsers || c.metrics.downloads || c.metrics.signups} | ${c.metrics.ctr} | ${c.metrics.roi} | $${c.dealValue.toLocaleString()} |`
).join('\n')}

---

## Aggregate Performance

- **Total Views Generated:** 97M+
- **Total Conversions:** 223,000+
- **Average CTR:** 3.9%
- **Average ROI:** 281%
- **Total Campaign Value:** $${Object.values(CAMPAIGNS).reduce((sum, c) => sum + c.dealValue, 0).toLocaleString()}

---

## Vertical Breakdown

### 🎮 Gaming
- 3 campaigns completed
- Average ROI: 308%
- Best performer: Whiteout Survival (48M views)

### 🤖 AI / Tech
- 2 campaigns completed  
- Average ROI: 250%
- Strong signup conversion rates

---

*Data compiled by BY Influence Company LLC*
`;
  return md;
}

// CLI
const args = process.argv.slice(2);
const forCompany = args.find(a => a.startsWith('--for='))?.split('=')[1];
const format = args.find(a => a.startsWith('--format='))?.split('=')[1];
const campaign = args.find(a => !a.startsWith('--'));

console.log('\n🎬 Campaign Case Study Generator\n');
console.log('═'.repeat(50));

if (!campaign) {
  // List available case studies
  console.log('\n📁 Available Case Studies:\n');
  Object.entries(CAMPAIGNS).forEach(([key, c]) => {
    console.log(`  ${key.padEnd(12)} → ${c.name} (${c.metrics.views} views, ${c.metrics.roi} ROI)`);
  });
  console.log(`\n  all          → Generate comparison summary\n`);
  console.log('Usage:');
  console.log('  node case-study.js whiteout');
  console.log('  node case-study.js gauth --for="Acme Corp"');
  console.log('  node case-study.js all\n');
} else if (campaign === 'all') {
  const md = generateComparison();
  console.log(md);
  
  // Save to file
  const outPath = path.join(__dirname, 'case-studies', 'comparison.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
  console.log(`\n💾 Saved to: ${outPath}`);
} else {
  const md = generateCaseStudy(campaign, forCompany);
  if (md) {
    console.log(md);
    
    // Save to file
    const filename = forCompany 
      ? `${campaign}-for-${forCompany.toLowerCase().replace(/\s+/g, '-')}.md`
      : `${campaign}-case-study.md`;
    const outPath = path.join(__dirname, 'case-studies', filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md);
    console.log(`\n💾 Saved to: ${outPath}`);
  }
}
