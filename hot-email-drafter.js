#!/usr/bin/env node
/**
 * Hot Lead Email Drafter
 * 
 * Generates ready-to-send follow-up emails for leads needing attention.
 * Outputs to clipboard or file for quick action.
 * 
 * Usage:
 *   node hot-email-drafter.js           # Draft emails for hot leads
 *   node hot-email-drafter.js --count=5 # Limit to 5 drafts
 *   node hot-email-drafter.js --file    # Save to hot-drafts.md
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const COUNT = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1]) || 10;
const TO_FILE = args.includes('--file');

// Email templates by category
const TEMPLATES = {
  'Meeting Request': {
    subject: 'Re: Following up on booking a call',
    body: (lead) => `Hi ${lead.lead_name?.split(' ')[0] || 'there'},

Thanks for your interest in chatting! I wanted to follow up to find a time that works.

Would any of these work for a quick 15-minute call?
• [Option 1]
• [Option 2]
• [Option 3]

Or feel free to grab a slot here: [CALENDAR_LINK]

Looking forward to connecting!`
  },
  
  'Interested': {
    subject: 'Re: Quick follow-up',
    body: (lead) => `Hi ${lead.lead_name?.split(' ')[0] || 'there'},

I noticed you expressed interest — I'd love to learn more about what ${lead.lead_company ? lead.lead_company + ' is' : "you're"} working on and see if there's a fit.

Would you be open to a quick 15-minute call this week? I can share some relevant case studies that might be helpful.

Let me know what works best!`
  },
  
  'Information Request': {
    subject: 'Re: Information you requested',
    body: (lead) => `Hi ${lead.lead_name?.split(' ')[0] || 'there'},

Thanks for reaching out! I wanted to follow up and make sure you got what you needed.

Happy to hop on a quick call if you'd prefer to discuss in more detail — sometimes it's easier than going back and forth over email.

Would [DATE] work for a brief chat?`
  },
  
  'Demo Request': {
    subject: 'Re: Your demo request',
    body: (lead) => `Hi ${lead.lead_name?.split(' ')[0] || 'there'},

I'd love to show you how we can help ${lead.lead_company || 'your team'}!

I have a few slots open this week for a personalized demo:
• [Option 1]
• [Option 2]

The demo takes about 20 minutes and I can customize it based on your specific needs. Sound good?`
  }
};

async function generateDrafts() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  // Get hot leads (0-7 days old, not booked)
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (error || !leads) {
    console.error('Error fetching leads:', error?.message);
    process.exit(1);
  }

  const now = Date.now();
  
  // Filter to hot leads (0-7 days) and score them
  const hotLeads = leads
    .map(lead => {
      const age = lead.replied_at 
        ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return { ...lead, age_days: age };
    })
    .filter(l => l.age_days <= 7)
    .sort((a, b) => a.age_days - b.age_days)
    .slice(0, COUNT);

  if (hotLeads.length === 0) {
    console.log('No hot leads (0-7 days) need follow-up emails.');
    process.exit(0);
  }

  // Generate drafts
  let output = `# 📧 Hot Lead Email Drafts
Generated: ${new Date().toISOString()}
Total: ${hotLeads.length} emails

---

`;

  hotLeads.forEach((lead, i) => {
    const template = TEMPLATES[lead.reply_category] || TEMPLATES['Interested'];
    const firstName = lead.lead_name?.split(' ')[0] || 'there';
    
    output += `## ${i + 1}. ${lead.lead_name || lead.lead_email}
**Company:** ${lead.lead_company || 'Unknown'}
**Category:** ${lead.reply_category}
**Age:** ${lead.age_days} day${lead.age_days !== 1 ? 's' : ''}
**Campaign:** ${lead.campaign_name || 'N/A'}

### To: ${lead.lead_email}
### Subject: ${template.subject}

${template.body(lead)}

---

`;
  });

  // Output
  if (TO_FILE) {
    const filepath = './hot-drafts.md';
    fs.writeFileSync(filepath, output);
    console.log(`✅ Saved ${hotLeads.length} email drafts to ${filepath}`);
  } else {
    console.log(output);
  }

  // Summary
  console.log('\n📊 SUMMARY');
  console.log('━'.repeat(50));
  console.log(`Generated ${hotLeads.length} email drafts`);
  console.log(`Categories: ${[...new Set(hotLeads.map(l => l.reply_category))].join(', ')}`);
  
  if (!TO_FILE) {
    console.log('\n💡 Tip: Use --file to save to hot-drafts.md');
  }
}

generateDrafts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
