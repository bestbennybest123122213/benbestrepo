#!/usr/bin/env node
/**
 * Stale Lead Reactivation Campaign Generator
 * Creates targeted campaigns for cold leads
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🔄 STALE LEAD REACTIVATION                                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Add age to all leads
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / ONE_DAY);
});

// Get stale leads (>14 days, not booked)
const staleLeads = leads
  .filter(l => l.age_days > 14 && l.reply_category !== 'Booked')
  .sort((a, b) => a.age_days - b.age_days);

console.log(`📊 STALE LEADS OVERVIEW`);
console.log('─'.repeat(60));
console.log(`  Total Stale (>14 days): ${staleLeads.length}`);

// Segment by staleness
const moderate = staleLeads.filter(l => l.age_days >= 15 && l.age_days <= 30);
const cold = staleLeads.filter(l => l.age_days > 30 && l.age_days <= 60);
const frozen = staleLeads.filter(l => l.age_days > 60);

console.log(`\n  By Staleness:`);
console.log(`    Moderate (15-30d): ${moderate.length} leads`);
console.log(`    Cold (31-60d):     ${cold.length} leads`);
console.log(`    Frozen (60+d):     ${frozen.length} leads`);

// Segment by category
const meetingReqStale = staleLeads.filter(l => l.reply_category === 'Meeting Request');
const interestedStale = staleLeads.filter(l => l.reply_category === 'Interested');
const infoReqStale = staleLeads.filter(l => l.reply_category === 'Information Request');

console.log(`\n  By Category:`);
console.log(`    Meeting Requests:    ${meetingReqStale.length} (high priority!)`);
console.log(`    Interested:          ${interestedStale.length}`);
console.log(`    Information Request: ${infoReqStale.length}`);

// Email templates for different staleness levels
const templates = {
  moderate: (lead) => `Subject: Quick check-in - ${lead.lead_company}

Hi ${lead.lead_name.split(' ')[0]},

I wanted to follow up on our conversation from a few weeks ago. Are you still interested in exploring a partnership with Imann?

I know things get busy, so no pressure at all. If timing is better later in the quarter, just let me know and I'll circle back then.

Otherwise, I'd love to find a time to chat this week if you're available.

Best,
[SENDER]`,

  cold: (lead) => `Subject: Still on your radar? - ${lead.lead_company}

Hi ${lead.lead_name.split(' ')[0]},

It's been a little while since we last connected. I wanted to check if a collaboration with Imann is still something you're considering.

If priorities have shifted, totally understand. But if there's still interest, I'd be happy to jump on a quick call to discuss next steps.

Either way, hope you're doing well!

Cheers,
[SENDER]`,

  frozen: (lead) => `Subject: One last check - ${lead.lead_company}

Hi ${lead.lead_name.split(' ')[0]},

I'm doing a bit of inbox cleanup and wanted to reach out one more time before closing the loop on our previous conversation.

If a partnership with Imann isn't a fit right now, no worries at all. But if you'd still like to connect, I'm here.

Wishing you and the ${lead.lead_company} team all the best!

Best regards,
[SENDER]`
};

// Generate reactivation campaigns
console.log('\n\n📧 REACTIVATION CAMPAIGNS');
console.log('─'.repeat(60));

// Campaign 1: Moderate Meeting Requests (highest ROI)
const campaign1 = moderate.filter(l => l.reply_category === 'Meeting Request');
console.log(`\n🟢 CAMPAIGN 1: Moderate Meeting Requests (${campaign1.length} leads)`);
console.log(`   Why: Recently engaged, requested meeting, just need follow-up`);
console.log(`   Template: "Quick check-in"\n`);

campaign1.slice(0, 5).forEach((l, i) => {
  console.log(`   ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
});
if (campaign1.length > 5) console.log(`   ... and ${campaign1.length - 5} more`);

// Campaign 2: Cold Meeting Requests
const campaign2 = cold.filter(l => l.reply_category === 'Meeting Request');
console.log(`\n🟡 CAMPAIGN 2: Cold Meeting Requests (${campaign2.length} leads)`);
console.log(`   Why: Still showed intent, worth one more try`);
console.log(`   Template: "Still on your radar?"\n`);

campaign2.slice(0, 5).forEach((l, i) => {
  console.log(`   ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
});
if (campaign2.length > 5) console.log(`   ... and ${campaign2.length - 5} more`);

// Campaign 3: All Frozen Leads
console.log(`\n🔴 CAMPAIGN 3: Frozen Leads - Last Chance (${frozen.length} leads)`);
console.log(`   Why: Final touchpoint before removing from active pipeline`);
console.log(`   Template: "One last check"\n`);

frozen.slice(0, 5).forEach((l, i) => {
  console.log(`   ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
});
if (frozen.length > 5) console.log(`   ... and ${frozen.length - 5} more`);

// Generate email files
const generateEmails = (leadsArr, template, filename) => {
  let content = `# Reactivation Emails - ${filename}\nGenerated: ${new Date().toISOString()}\n\n`;
  
  leadsArr.forEach((lead, i) => {
    content += `## ${i + 1}. ${lead.lead_company}\n`;
    content += `**To:** ${lead.lead_email}\n`;
    content += `**Age:** ${lead.age_days} days\n`;
    content += `**Category:** ${lead.reply_category}\n\n`;
    content += `\`\`\`\n${template(lead)}\n\`\`\`\n\n---\n\n`;
  });
  
  fs.writeFileSync(filename, content);
  return leadsArr.length;
};

const count1 = generateEmails(campaign1, templates.moderate, './reactivation-moderate.md');
const count2 = generateEmails(campaign2, templates.cold, './reactivation-cold.md');
const count3 = generateEmails(frozen, templates.frozen, './reactivation-frozen.md');

console.log('\n\n✅ GENERATED FILES');
console.log('─'.repeat(60));
console.log(`  reactivation-moderate.md: ${count1} emails`);
console.log(`  reactivation-cold.md:     ${count2} emails`);
console.log(`  reactivation-frozen.md:   ${count3} emails`);

// ROI potential
const potential = (campaign1.length * 0.3 + campaign2.length * 0.15 + frozen.length * 0.05) * 500;
console.log(`\n💰 ESTIMATED ROI`);
console.log('─'.repeat(60));
console.log(`  If 30% moderate, 15% cold, 5% frozen convert:`);
console.log(`  ~$${potential.toLocaleString()} additional revenue potential`);

console.log('\n💡 TIP: Send moderate campaign first (highest ROI), wait 3-5 days, then cold.');
