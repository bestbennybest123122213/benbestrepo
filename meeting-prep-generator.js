#!/usr/bin/env node
/**
 * Meeting Prep Generator
 * Creates comprehensive prep notes for upcoming meetings
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

// Get booked leads (these are confirmed meetings)
const bookedLeads = leads.filter(l => l.reply_category === 'Booked');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📋 MEETING PREP GENERATOR                                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`Found ${bookedLeads.length} booked meetings\n`);

// Industry-specific talking points
const industryTalkingPoints = {
  Gaming: [
    'How are you currently measuring influencer campaign ROI?',
    'What genres/content types have worked best for game promotion?',
    'Are you doing any live streaming integrations?',
    'How do you handle creator authenticity with sponsored content?',
    'What\'s your biggest UA challenge right now?'
  ],
  EdTech: [
    'How are students discovering your platform currently?',
    'Have you worked with educational content creators?',
    'What age groups are you primarily targeting?',
    'How do you measure brand awareness vs direct conversions?',
    'Any seasonal patterns in your marketing?'
  ],
  Travel: [
    'What\'s your peak season for marketing spend?',
    'How do you balance destination content vs platform features?',
    'Have you done destination-specific creator partnerships?',
    'What content formats drive the best booking conversions?',
    'Any challenges with creator content rights for travel?'
  ],
  Fintech: [
    'How do you handle compliance with influencer disclosures?',
    'What\'s the typical customer journey from awareness to signup?',
    'Have you found certain creator demographics convert better?',
    'How do you educate audiences on financial products through content?',
    'What metrics matter most - downloads, signups, or funded accounts?'
  ],
  Default: [
    'What marketing channels are performing best for you currently?',
    'How do you measure success for brand partnerships?',
    'What\'s your biggest marketing challenge right now?',
    'Have you worked with creators/influencers before?',
    'What would a successful partnership look like for you?'
  ]
};

// Generate prep notes for each booked meeting
bookedLeads.forEach((lead, i) => {
  const domain = lead.lead_email.split('@')[1];
  const industry = lead.company_info?.industry || 'Unknown';
  const tier = lead.tier || 'unknown';
  const talkingPoints = industryTalkingPoints[industry] || industryTalkingPoints.Default;
  
  console.log('─'.repeat(70));
  console.log(`\n📋 MEETING PREP #${i + 1}: ${lead.lead_company}`);
  console.log('─'.repeat(70));
  
  console.log(`\n👤 CONTACT INFO`);
  console.log(`   Name: ${lead.lead_name}`);
  console.log(`   Email: ${lead.lead_email}`);
  console.log(`   Company: ${lead.lead_company}`);
  console.log(`   Domain: ${domain}`);
  
  console.log(`\n🏢 COMPANY PROFILE`);
  console.log(`   Industry: ${industry}`);
  console.log(`   Size: ${lead.company_info?.size || 'Unknown'}`);
  console.log(`   Funding: ${lead.company_info?.funding || 'Unknown'}`);
  console.log(`   Tier: ${tier.toUpperCase()}`);
  
  console.log(`\n📊 ENGAGEMENT HISTORY`);
  console.log(`   Campaign: ${lead.campaign_name}`);
  console.log(`   First Contact: ${new Date(lead.our_sent_at).toLocaleDateString()}`);
  console.log(`   Replied: ${new Date(lead.replied_at).toLocaleDateString()}`);
  const responseTimeDays = lead.response_time_seconds ? (lead.response_time_seconds / 86400).toFixed(1) : 'N/A';
  console.log(`   Response Time: ${responseTimeDays} days`);
  
  console.log(`\n🔗 RESEARCH LINKS`);
  const encodedCompany = encodeURIComponent(lead.lead_company);
  console.log(`   LinkedIn: ${lead.linkedin_search}`);
  console.log(`   Crunchbase: https://www.crunchbase.com/textsearch?q=${encodedCompany}`);
  console.log(`   Google: https://www.google.com/search?q=${encodedCompany}+news`);
  
  console.log(`\n💬 SUGGESTED TALKING POINTS`);
  talkingPoints.forEach((point, j) => {
    console.log(`   ${j + 1}. ${point}`);
  });
  
  console.log(`\n📝 MEETING NOTES TEMPLATE`);
  console.log(`   ┌─────────────────────────────────────────────────────────`);
  console.log(`   │ Date: _______________`);
  console.log(`   │ Attendees: ${lead.lead_name}, _______________`);
  console.log(`   │`);
  console.log(`   │ Key Needs:`);
  console.log(`   │ 1. _________________________________`);
  console.log(`   │ 2. _________________________________`);
  console.log(`   │`);
  console.log(`   │ Budget Mentioned: $_______________`);
  console.log(`   │ Timeline: _______________`);
  console.log(`   │ Decision Makers: _______________`);
  console.log(`   │`);
  console.log(`   │ Next Steps:`);
  console.log(`   │ [ ] _________________________________`);
  console.log(`   │ [ ] _________________________________`);
  console.log(`   └─────────────────────────────────────────────────────────`);
  
  console.log('\n');
});

// Summary
console.log('─'.repeat(70));
console.log('\n📊 SUMMARY');
console.log('─'.repeat(70));
console.log(`\n  Total Booked Meetings: ${bookedLeads.length}`);

const byTier = {};
bookedLeads.forEach(l => {
  const t = l.tier || 'unknown';
  byTier[t] = (byTier[t] || 0) + 1;
});
console.log('\n  By Tier:');
Object.entries(byTier).forEach(([t, c]) => {
  console.log(`    ${t}: ${c}`);
});

// Save all prep notes to file
let prepMd = `# Meeting Prep Notes\nGenerated: ${new Date().toISOString()}\n\n`;
bookedLeads.forEach((lead, i) => {
  prepMd += `## ${i + 1}. ${lead.lead_company}\n\n`;
  prepMd += `**Contact:** ${lead.lead_name} <${lead.lead_email}>\n`;
  prepMd += `**Industry:** ${lead.company_info?.industry || 'Unknown'}\n`;
  prepMd += `**Tier:** ${lead.tier || 'unknown'}\n`;
  prepMd += `**LinkedIn:** ${lead.linkedin_search}\n\n`;
  prepMd += `### Talking Points\n`;
  const talkingPoints = industryTalkingPoints[lead.company_info?.industry] || industryTalkingPoints.Default;
  talkingPoints.forEach((p, j) => {
    prepMd += `${j + 1}. ${p}\n`;
  });
  prepMd += '\n---\n\n';
});

fs.writeFileSync('./meeting-prep-notes.md', prepMd);
console.log('\n✅ Full prep notes saved to meeting-prep-notes.md');
