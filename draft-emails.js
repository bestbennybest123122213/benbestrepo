#!/usr/bin/env node
/**
 * Email Draft Generator
 * 
 * Generates personalized email drafts for priority leads
 * Ready to copy-paste into SmartLead or email client
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');
const fs = require('fs');

// Email templates by category
const TEMPLATES = {
  meeting_request: {
    subject: "Re: Let's connect",
    body: (lead) => `Hi ${lead.firstName},

Thanks for your interest in connecting! I'd love to find a time that works for you.

Here are a few slots that work on my end:
- [Day 1] at [Time 1]
- [Day 2] at [Time 2]
- [Day 3] at [Time 3]

Or feel free to grab a time directly: [CALENDLY_LINK]

Looking forward to it!

Best,
Imann`
  },
  
  interested: {
    subject: "Quick question about {company}",
    body: (lead) => `Hi ${lead.firstName},

Great to hear from you! I'd love to learn more about what ${lead.company || 'your team'} is working on and see if there's a fit.

Are you available for a quick 15-minute call this week? I can share how we've helped similar ${lead.industry || 'companies'} achieve [specific result].

What does your calendar look like?

Best,
Imann`
  },
  
  info_request: {
    subject: "Re: More info on our services",
    body: (lead) => `Hi ${lead.firstName},

Happy to share more details! Here's a quick overview:

**What we do:**
- Connect brands with authentic creators/influencers
- Full-service campaign management
- Data-driven matching and ROI tracking

**For ${lead.company || 'companies like yours'}:**
We typically help with [user acquisition / brand awareness / content creation] through creator partnerships.

Would it help to hop on a quick call so I can tailor this to your specific needs?

Best,
Imann`
  },
  
  stale_follow_up: {
    subject: "Quick follow-up",
    body: (lead) => `Hi ${lead.firstName},

Just wanted to bump this up in your inbox - I know things get busy!

Still interested in exploring how we can help ${lead.company || 'your team'}? Happy to adjust to whatever timeline works for you.

If now isn't the right time, just let me know - no hard feelings!

Best,
Imann`
  }
};

function getTemplate(lead) {
  if (lead.age > 14) return TEMPLATES.stale_follow_up;
  
  switch (lead.reply_category) {
    case 'Meeting Request': return TEMPLATES.meeting_request;
    case 'Interested': return TEMPLATES.interested;
    case 'Information Request': return TEMPLATES.info_request;
    default: return TEMPLATES.interested;
  }
}

async function generateDrafts(limit = 10) {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  const now = Date.now();
  
  // Enrich and score leads
  const enrichedLeads = leads.map(lead => {
    const info = getCompanyInfo(lead.lead_email);
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    const firstName = lead.lead_name 
      ? lead.lead_name.split(' ')[0]
      : lead.lead_email.split('@')[0].split('.')[0];
    
    return {
      ...lead,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      company: info?.name || lead.lead_company,
      industry: info?.industry,
      tier: info?.tier,
      age
    };
  });

  // Prioritize: Meeting requests first, then by age
  const prioritized = enrichedLeads
    .filter(l => l.reply_category === 'Meeting Request' || l.age <= 14)
    .sort((a, b) => {
      if (a.reply_category === 'Meeting Request' && b.reply_category !== 'Meeting Request') return -1;
      if (b.reply_category === 'Meeting Request' && a.reply_category !== 'Meeting Request') return 1;
      return a.age - b.age;
    })
    .slice(0, limit);

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📧 EMAIL DRAFT GENERATOR                                            ║
║  Ready-to-send emails for priority leads                             ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  const drafts = [];

  for (let i = 0; i < prioritized.length; i++) {
    const lead = prioritized[i];
    const template = getTemplate(lead);
    
    const subject = template.subject
      .replace('{company}', lead.company || 'your company')
      .replace('{name}', lead.firstName);
    
    const body = template.body(lead);
    
    const draft = {
      to: lead.lead_email,
      subject,
      body,
      lead: {
        name: lead.lead_name,
        company: lead.company,
        category: lead.reply_category,
        age: lead.age + ' days'
      }
    };
    
    drafts.push(draft);
    
    console.log('═'.repeat(70));
    console.log(`📧 DRAFT ${i + 1}/${prioritized.length}`);
    console.log('═'.repeat(70));
    console.log(`TO: ${draft.to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`STATUS: ${lead.reply_category} | ${lead.age} days old`);
    console.log('─'.repeat(70));
    console.log(body);
    console.log('');
  }

  // Save to file
  const output = drafts.map(d => `
TO: ${d.to}
SUBJECT: ${d.subject}
---
${d.body}
===
`).join('\n');

  fs.writeFileSync('email-drafts.txt', output);
  console.log('═'.repeat(70));
  console.log(`✅ ${drafts.length} drafts saved to email-drafts.txt`);
  console.log('═'.repeat(70));

  return drafts;
}

async function main() {
  const limit = parseInt(process.argv[2]) || 10;
  
  try {
    await generateDrafts(limit);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateDrafts, TEMPLATES };

if (require.main === module) {
  main();
}
