#!/usr/bin/env node
/**
 * Case Studies Manager
 * View available case studies and get templates for new ones.
 */

const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, '../../drafts');

const CASE_STUDIES = [
  {
    name: 'Whiteout Survival',
    file: 'CASE-STUDY-WHITEOUT-SURVIVAL.md',
    linkedin: 'LINKEDIN-POST-WHITEOUT.md',
    stats: { views: '48M+', users: '100K+', vertical: 'Gaming' }
  },
  {
    name: 'Gauth AI',
    file: 'CASE-STUDY-GAUTH-AI.md',
    linkedin: null,
    stats: { views: '15M+', downloads: '50K+', vertical: 'Education' }
  },
  {
    name: 'Valeo',
    file: 'CASE-STUDY-VALEO.md',
    linkedin: null,
    stats: { value: '$30,906', vertical: 'Tech' }
  },
  {
    name: 'Allison AI',
    file: 'CASE-STUDY-ALLISON-AI.md',
    linkedin: null,
    stats: { value: '$24,045', vertical: 'AI' }
  }
];

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (subcommand === 'template') {
    console.log('\n📝 CASE STUDY TEMPLATE');
    console.log('═'.repeat(50));
    console.log(`
# Case Study: [Brand] x ItssIMANNN

## [Headline with key result]

---

### The Challenge

[What problem did the brand face? 2-3 sentences]

### The Solution

[How did working with ItssIMANNN solve it? 2-3 sentences]

### The Approach

- [Key element 1]
- [Key element 2]
- [Key element 3]

### The Results

| Metric | Result |
|--------|--------|
| Views | **[X]M+** |
| [Key Metric] | **[Number]** |
| [Key Metric] | **[Number]** |

### Why It Worked

1. **[Reason]** - [Explanation]
2. **[Reason]** - [Explanation]
3. **[Reason]** - [Explanation]

### Key Takeaways

- [Insight 1]
- [Insight 2]
- [Insight 3]

---

## Ready to See Similar Results?

[CTA]

**Contact:** jan@byinfluence.co
`);
    return;
  }

  if (subcommand === 'list' || !subcommand) {
    console.log('\n📊 AVAILABLE CASE STUDIES');
    console.log('═'.repeat(50));
    
    CASE_STUDIES.forEach((cs, i) => {
      console.log(`\n${i + 1}. ${cs.name}`);
      console.log(`   Vertical: ${cs.stats.vertical}`);
      console.log(`   Key stats: ${Object.entries(cs.stats).filter(([k]) => k !== 'vertical').map(([k,v]) => `${v} ${k}`).join(', ')}`);
      console.log(`   File: drafts/${cs.file}`);
      if (cs.linkedin) {
        console.log(`   LinkedIn ready: drafts/${cs.linkedin}`);
      }
    });

    console.log('\n💡 Commands:');
    console.log('  gex casestudies template    - Get blank template');
    console.log('  gex casestudies linkedin    - LinkedIn post guidelines');
    console.log('');
    console.log('Use case studies in:');
    console.log('  - Cold emails (proof of results)');
    console.log('  - LinkedIn posts (inbound generation)');
    console.log('  - Proposals (close deals faster)');
    return;
  }

  if (subcommand === 'linkedin') {
    console.log('\n📱 LINKEDIN CASE STUDY FORMAT');
    console.log('═'.repeat(50));
    console.log(`
[Big number]. [Big number]. [Timeframe or context].

Here's what happened when [brand] partnered with a [X]M subscriber creator:

The challenge: [One sentence]

The approach: [One sentence]

The results:
→ [Metric 1]
→ [Metric 2]
→ [Metric 3]

Why it worked:

1. [Reason]
2. [Reason]
3. [Reason]

[Hot take or insight about the industry]

[Soft CTA - DM me for details]

---

POSTING TIPS:
• No links in main post (add in first comment)
• Post Tuesday-Thursday, 8-10 AM
• Use lots of line breaks
• End with question to drive engagement
`);
    return;
  }
}

main().catch(console.error);
