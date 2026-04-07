#!/usr/bin/env node
/**
 * Generate email drafts for priority leads
 * Focus: Enterprise + Meeting Request leads that need follow-up
 */

const fs = require('fs');
const path = require('path');

const { leads } = require('./enriched-leads.json');

// Get current date
const now = Date.now();

// Add age to each lead
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
});

// Priority 1: Enterprise Meeting Requests
const p1 = leads.filter(l => 
  l.reply_category === 'Meeting Request' && 
  l.tier === 'enterprise'
);

// Priority 2: All Meeting Requests
const p2 = leads.filter(l => 
  l.reply_category === 'Meeting Request' && 
  l.tier !== 'enterprise'
);

// Priority 3: Interested (needs nurturing)
const p3 = leads.filter(l => 
  l.reply_category === 'Interested'
);

// Priority 4: Information Request
const p4 = leads.filter(l => 
  l.reply_category === 'Information Request'
);

// Email templates
const templates = {
  meetingRequest: (lead) => `Subject: Re: Quick follow-up - meeting with ${lead.lead_name.split(' ')[0]}

Hi ${lead.lead_name.split(' ')[0]},

I noticed you requested a meeting with Imann - wanted to make sure this didn't slip through the cracks!

I'd love to find a time that works for you. Would any of these work?
- Tomorrow between 2-5 PM (your time)
- Later this week, I'm flexible

If you prefer, here's my Calendly: [CALENDLY_LINK]

Looking forward to chatting!

Best,
[SENDER_NAME]

---
Company: ${lead.lead_company}
Email: ${lead.lead_email}
Age: ${lead.age_days} days since reply
Tier: ${lead.tier}
Campaign: ${lead.campaign_name}`,

  interested: (lead) => `Subject: Re: Next steps with ${lead.lead_company}

Hi ${lead.lead_name.split(' ')[0]},

Great to hear you're interested! I'd love to share more about how we've helped similar companies.

Would a quick 15-minute call work? I can walk you through some case studies and answer any questions.

Here are a few times that work for me:
- [TIME_SLOT_1]
- [TIME_SLOT_2]
- [TIME_SLOT_3]

Or feel free to grab time on my calendar: [CALENDLY_LINK]

Cheers,
[SENDER_NAME]

---
Company: ${lead.lead_company}
Email: ${lead.lead_email}
Age: ${lead.age_days} days since reply
Tier: ${lead.tier}
Campaign: ${lead.campaign_name}`,

  infoRequest: (lead) => `Subject: Re: Information for ${lead.lead_company}

Hi ${lead.lead_name.split(' ')[0]},

Thanks for reaching out! Here's the information you requested:

[CUSTOMIZE_WITH_RELEVANT_INFO]

Would you like to hop on a quick call to discuss further? I'm happy to walk through anything in more detail.

Let me know what works best!

Best,
[SENDER_NAME]

---
Company: ${lead.lead_company}
Email: ${lead.lead_email}
Age: ${lead.age_days} days since reply
Tier: ${lead.tier}
Campaign: ${lead.campaign_name}`,

  coldReactivation: (lead) => `Subject: Still interested in chatting?

Hi ${lead.lead_name.split(' ')[0]},

I wanted to follow up on our previous conversation - are you still interested in exploring a potential collaboration?

I know things can get busy, so no pressure at all. Just wanted to make sure I didn't leave you hanging!

If timing is better later, just let me know and I'll circle back then.

Best,
[SENDER_NAME]

---
Company: ${lead.lead_company}
Email: ${lead.lead_email}
Age: ${lead.age_days} days since reply
Last interaction: ${lead.replied_at}`
};

// Generate drafts
let output = `# Priority Email Drafts
Generated: ${new Date().toISOString()}

## Summary
- P1 (Enterprise Meeting Requests): ${p1.length}
- P2 (Other Meeting Requests): ${p2.length}  
- P3 (Interested): ${p3.length}
- P4 (Information Request): ${p4.length}

---

# 🔥 P1: ENTERPRISE MEETING REQUESTS (DO FIRST!)

`;

p1.sort((a, b) => a.age_days - b.age_days).forEach((lead, i) => {
  output += `## ${i + 1}. ${lead.lead_company} - ${lead.lead_name}
**Age:** ${lead.age_days} days | **Email:** ${lead.lead_email}

\`\`\`
${templates.meetingRequest(lead)}
\`\`\`

---

`;
});

output += `
# ⚡ P2: OTHER MEETING REQUESTS

`;

p2.sort((a, b) => a.age_days - b.age_days).slice(0, 20).forEach((lead, i) => {
  output += `## ${i + 1}. ${lead.lead_company} - ${lead.lead_name}
**Age:** ${lead.age_days} days | **Tier:** ${lead.tier} | **Email:** ${lead.lead_email}

\`\`\`
${templates.meetingRequest(lead)}
\`\`\`

---

`;
});

output += `
# 💡 P3: INTERESTED (Need Nurturing)

`;

p3.sort((a, b) => a.age_days - b.age_days).slice(0, 10).forEach((lead, i) => {
  output += `## ${i + 1}. ${lead.lead_company} - ${lead.lead_name}
**Age:** ${lead.age_days} days | **Tier:** ${lead.tier}

\`\`\`
${templates.interested(lead)}
\`\`\`

---

`;
});

output += `
# ℹ️ P4: INFORMATION REQUESTS

`;

p4.sort((a, b) => a.age_days - b.age_days).slice(0, 10).forEach((lead, i) => {
  output += `## ${i + 1}. ${lead.lead_company} - ${lead.lead_name}
**Age:** ${lead.age_days} days | **Tier:** ${lead.tier}

\`\`\`
${templates.infoRequest(lead)}
\`\`\`

---

`;
});

// Write to file
fs.writeFileSync('./priority-email-drafts.md', output);
console.log('✅ Generated priority-email-drafts.md');
console.log(`   - P1 (Enterprise): ${p1.length} drafts`);
console.log(`   - P2 (Meeting Req): ${Math.min(20, p2.length)} drafts`);
console.log(`   - P3 (Interested): ${Math.min(10, p3.length)} drafts`);
console.log(`   - P4 (Info Req): ${Math.min(10, p4.length)} drafts`);

// Also save as JSON for programmatic use
const draftsJson = {
  generated: new Date().toISOString(),
  p1_enterprise: p1.map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    age_days: l.age_days,
    tier: l.tier,
    draft: templates.meetingRequest(l)
  })),
  p2_meeting_requests: p2.slice(0, 20).map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    age_days: l.age_days,
    tier: l.tier,
    draft: templates.meetingRequest(l)
  })),
  p3_interested: p3.slice(0, 10).map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    age_days: l.age_days,
    tier: l.tier,
    draft: templates.interested(l)
  })),
  p4_info_request: p4.slice(0, 10).map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    email: l.lead_email,
    age_days: l.age_days,
    tier: l.tier,
    draft: templates.infoRequest(l)
  }))
};

fs.writeFileSync('./priority-drafts.json', JSON.stringify(draftsJson, null, 2));
console.log('✅ Generated priority-drafts.json');
