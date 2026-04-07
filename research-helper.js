#!/usr/bin/env node
/**
 * Lead Research Helper
 * Generates research templates and links for unknown companies
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

// Find leads that need research (unknown tier, high priority categories)
const needsResearch = leads
  .filter(l => 
    (l.tier === 'unknown' || !l.tier) && 
    ['Meeting Request', 'Interested'].includes(l.reply_category)
  )
  .map(l => {
    const domain = l.lead_email.split('@')[1];
    const age = Math.floor((Date.now() - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
    return {
      company: l.lead_company,
      domain,
      name: l.lead_name,
      email: l.lead_email,
      category: l.reply_category,
      age_days: age
    };
  })
  .sort((a, b) => a.age_days - b.age_days);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🔍 LEAD RESEARCH HELPER                                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`Found ${needsResearch.length} leads that need research\n`);

// Generate research links for each
const researchOutput = needsResearch.map(lead => {
  const encodedCompany = encodeURIComponent(lead.company);
  const encodedDomain = encodeURIComponent(lead.domain);
  const encodedName = encodeURIComponent(`${lead.name} ${lead.company}`);
  
  return {
    ...lead,
    links: {
      crunchbase: `https://www.crunchbase.com/textsearch?q=${encodedCompany}`,
      linkedin_company: `https://www.linkedin.com/company/${lead.domain.replace('.com', '').replace('.io', '').replace('.ai', '')}`,
      linkedin_person: `https://www.linkedin.com/search/results/people/?keywords=${encodedName}`,
      google: `https://www.google.com/search?q=${encodedCompany}+company+funding+employees`,
      pitchbook: `https://pitchbook.com/profiles/search?q=${encodedCompany}`,
      twitter: `https://twitter.com/search?q=${encodedCompany}`,
      glassdoor: `https://www.glassdoor.com/Search/results.htm?keyword=${encodedCompany}`
    }
  };
});

// Output top 20 with research links
console.log('📋 TOP 20 COMPANIES NEEDING RESEARCH');
console.log('─'.repeat(70));

researchOutput.slice(0, 20).forEach((lead, i) => {
  console.log(`\n${i + 1}. ${lead.company} (${lead.domain})`);
  console.log(`   Contact: ${lead.name} <${lead.email}>`);
  console.log(`   Status: ${lead.category} | Age: ${lead.age_days} days`);
  console.log(`   Research Links:`);
  console.log(`   • Crunchbase: ${lead.links.crunchbase.substring(0, 60)}...`);
  console.log(`   • LinkedIn: ${lead.links.linkedin_company}`);
  console.log(`   • Google: "${lead.company} company funding employees"`);
});

// Save full research list
const researchMd = `# Lead Research List
Generated: ${new Date().toISOString()}

## Summary
- ${needsResearch.length} leads need research
- Priority: Meeting Requests and Interested leads with unknown tier

---

${researchOutput.map((lead, i) => `
## ${i + 1}. ${lead.company}

**Domain:** ${lead.domain}
**Contact:** ${lead.name} <${lead.email}>
**Status:** ${lead.category} | **Age:** ${lead.age_days} days

### Research Links
- [Crunchbase Search](${lead.links.crunchbase})
- [LinkedIn Company](${lead.links.linkedin_company})
- [LinkedIn Person](${lead.links.linkedin_person})
- [Google Search](${lead.links.google})
- [Twitter](${lead.links.twitter})

### Research Template
\`\`\`
Company: ${lead.company}
Domain: ${lead.domain}
Industry: [?]
Size: [?]
Funding: [?]
Tier: [startup/midmarket/enterprise]
ICP Fit: [?]
Notes: [?]
\`\`\`
`).join('\n---\n')}`;

fs.writeFileSync('./research-list.md', researchMd);
console.log('\n\n✅ Full research list saved to research-list.md');

// Save JSON for automation
fs.writeFileSync('./research-queue.json', JSON.stringify(researchOutput, null, 2));
console.log('✅ Research queue saved to research-queue.json');

// Summary
console.log('\n📊 RESEARCH PRIORITY');
console.log('─'.repeat(70));
const byAge = {
  urgent: researchOutput.filter(l => l.age_days <= 7).length,
  soon: researchOutput.filter(l => l.age_days > 7 && l.age_days <= 14).length,
  standard: researchOutput.filter(l => l.age_days > 14 && l.age_days <= 30).length,
  backlog: researchOutput.filter(l => l.age_days > 30).length
};
console.log(`  🔴 Urgent (0-7d):   ${byAge.urgent} leads`);
console.log(`  🟠 Soon (8-14d):    ${byAge.soon} leads`);
console.log(`  🟡 Standard (15-30d): ${byAge.standard} leads`);
console.log(`  ⚪ Backlog (30+d):  ${byAge.backlog} leads`);
