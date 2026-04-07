#!/usr/bin/env node
/**
 * Reactivation Campaign Generator
 * 
 * Generates emails for cold leads (15+ days) 
 * with special "win-back" messaging
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');
const fs = require('fs');

const REACTIVATION_TEMPLATES = {
  checking_in: {
    subject: "Still interested?",
    body: (lead) => `Hi ${lead.firstName},

I wanted to check in - I know things get busy and our previous conversation may have slipped through the cracks.

Is ${lead.company || 'working together'} still on your radar? If so, I'd love to pick up where we left off.

If the timing isn't right, no worries at all - just let me know and I'll close your file.

Best,
Imann`
  },
  
  new_value: {
    subject: "Quick update + new case study",
    body: (lead) => `Hi ${lead.firstName},

Wanted to share a quick update - we just wrapped up a campaign with a company similar to ${lead.company || 'yours'} and got some impressive results:

• [X% increase in metric]
• [Y new customers/users]
• [Z% ROI]

Would love to explore if we could achieve something similar for you. Worth a quick chat?

Best,
Imann`
  },
  
  last_chance: {
    subject: "Closing your file",
    body: (lead) => `Hi ${lead.firstName},

I've reached out a few times without hearing back, so I'm going to close your file to keep my CRM tidy.

If you'd like to reconnect in the future, feel free to reach out anytime. I'll be here!

Wishing you all the best with ${lead.company || 'everything'}.

Best,
Imann`
  }
};

async function generateReactivationCampaign() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: true }); // Oldest first

  if (error) throw new Error(error.message);

  const now = Date.now();
  
  // Filter to cold leads (15+ days)
  const coldLeads = leads.filter(l => {
    if (!l.replied_at) return false;
    const days = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days >= 15;
  }).map(l => {
    const info = getCompanyInfo(l.lead_email);
    const firstName = l.lead_name 
      ? l.lead_name.split(' ')[0]
      : l.lead_email.split('@')[0].split('.')[0];
    const days = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      ...l,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      company: info?.name || l.lead_company,
      tier: info?.tier,
      days
    };
  });

  // Sort by priority (enterprise first, then by age)
  coldLeads.sort((a, b) => {
    if (a.tier === 'enterprise' && b.tier !== 'enterprise') return -1;
    if (b.tier === 'enterprise' && a.tier !== 'enterprise') return 1;
    return a.days - b.days;
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🔄 REACTIVATION CAMPAIGN GENERATOR                                  ║
║  Win back cold leads with targeted messaging                         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  console.log(`📊 Found ${coldLeads.length} cold leads (15+ days)\n`);

  // Generate campaign segments
  const segments = {
    mild: coldLeads.filter(l => l.days >= 15 && l.days < 30),
    moderate: coldLeads.filter(l => l.days >= 30 && l.days < 60),
    severe: coldLeads.filter(l => l.days >= 60)
  };

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    CAMPAIGN SEGMENTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  console.log(`  🟡 Mild (15-30 days):     ${segments.mild.length} leads → "Checking in" template`);
  console.log(`  🟠 Moderate (30-60 days): ${segments.moderate.length} leads → "New value" template`);
  console.log(`  🔴 Severe (60+ days):     ${segments.severe.length} leads → "Last chance" template`);
  console.log('');

  // Generate sample emails
  const output = [];

  // Process top 5 from each segment
  const processSegment = (segment, template, templateName) => {
    console.log(`\n═══════════════════════════════════════════════════════════════════════`);
    console.log(`  ${templateName.toUpperCase()} EMAILS (${template.subject})`);
    console.log(`═══════════════════════════════════════════════════════════════════════\n`);

    segment.slice(0, 5).forEach((lead, i) => {
      const body = template.body(lead);
      output.push({
        to: lead.lead_email,
        subject: template.subject,
        body,
        segment: templateName,
        days: lead.days
      });

      console.log(`  ${i + 1}. ${lead.lead_email}`);
      console.log(`     ${lead.firstName} @ ${lead.company || 'N/A'} (${lead.days} days)`);
    });
  };

  processSegment(segments.mild, REACTIVATION_TEMPLATES.checking_in, 'mild');
  processSegment(segments.moderate, REACTIVATION_TEMPLATES.new_value, 'moderate');
  processSegment(segments.severe, REACTIVATION_TEMPLATES.last_chance, 'severe');

  // Save campaign
  const campaign = {
    generated: new Date().toISOString(),
    totals: {
      mild: segments.mild.length,
      moderate: segments.moderate.length,
      severe: segments.severe.length
    },
    emails: output
  };

  fs.writeFileSync('reactivation-campaign.json', JSON.stringify(campaign, null, 2));
  
  // Save email drafts
  const drafts = output.map(e => `
TO: ${e.to}
SUBJECT: ${e.subject}
SEGMENT: ${e.segment} (${e.days} days)
---
${e.body}
===`).join('\n');
  
  fs.writeFileSync('reactivation-emails.txt', drafts);

  console.log(`\n\n═══════════════════════════════════════════════════════════════════════`);
  console.log(`  📧 Generated ${output.length} email drafts`);
  console.log(`  📁 Saved to: reactivation-emails.txt`);
  console.log(`  📊 Campaign data: reactivation-campaign.json`);
  console.log(`═══════════════════════════════════════════════════════════════════════\n`);
}

async function main() {
  try {
    await generateReactivationCampaign();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateReactivationCampaign, REACTIVATION_TEMPLATES };

if (require.main === module) {
  main();
}
