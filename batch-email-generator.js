#!/usr/bin/env node
/**
 * Batch Email Generator
 * 
 * Generates a batch of personalized follow-up emails based on
 * lead status, sequence position, and category.
 * 
 * Usage:
 *   node batch-email-generator.js                # Generate for top 10 priority leads
 *   node batch-email-generator.js 20             # Generate for top 20
 *   node batch-email-generator.js --due          # Generate for sequence-due leads
 *   node batch-email-generator.js --hot          # Generate for hot leads only
 *   node batch-email-generator.js --stale        # Generate for stale leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => !a.startsWith('--'))) || 10;
const MODE = args.includes('--due') ? 'due' 
           : args.includes('--hot') ? 'hot'
           : args.includes('--stale') ? 'stale'
           : 'priority';

const OUTPUT_FILE = path.join(__dirname, 'batch-emails.txt');
const OUTPUT_JSON = path.join(__dirname, 'batch-emails.json');

// Email templates by scenario
const TEMPLATES = {
  hot_meeting: {
    subject: "Let's find a time this week - {firstName}",
    body: `Hi {firstName},

Thanks for getting back to me! I'd love to find a time to chat.

Here's my calendar: [CALENDAR_LINK]

Or just let me know what works for you - I'm flexible.

Looking forward to connecting!

Best,
Jan`
  },
  
  hot_interested: {
    subject: "Quick follow-up on your interest - {company}",
    body: `Hi {firstName},

Great to hear you're interested! I'd love to share more about what we're doing.

Quick question - what's the best way to connect? Would a 15-minute call work, or would you prefer I send over some info first?

Either way, happy to make it easy for you.

Best,
Jan`
  },
  
  followup_day3: {
    subject: "Following up - {firstName}",
    body: `Hi {firstName},

Just wanted to follow up on my last message. I know things get busy!

Would love to find a time to chat about how we might help {company}. Even a quick 15-minute call would be great.

What does your availability look like?

Best,
Jan`
  },
  
  followup_day7: {
    subject: "Quick check-in - {company}",
    body: `Hi {firstName},

I wanted to share something that might be relevant - we recently worked with a company similar to {company} and saw some great results.

Would you be open to a quick call to see if there's a fit? I promise to keep it brief.

Best,
Jan`
  },
  
  followup_day14: {
    subject: "Case study you might find interesting",
    body: `Hi {firstName},

I thought you might find this interesting - we recently helped Whiteout Survival achieve some impressive results with short-form content.

Given what {company} is doing, I think there could be a similar opportunity.

Would you be open to exploring this? Happy to share more details.

Best,
Jan`
  },
  
  last_chance: {
    subject: "One last thing - {firstName}",
    body: `Hi {firstName},

I don't want to keep filling your inbox, so this will be my last reach-out for now.

If you ever want to explore how short-form content could work for {company}, I'm just an email away.

Wishing you all the best!

Jan`
  },
  
  reactivation: {
    subject: "Been a while - thought of {company}",
    body: `Hi {firstName},

It's been a bit since we last connected. I recently came across some work that made me think of {company}.

Not sure if timing is better now, but wanted to reach out in case you're still exploring options for content creation.

No pressure either way - just wanted to say hi.

Best,
Jan`
  }
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  console.log(`\n🔄 Generating batch emails (mode: ${MODE}, limit: ${LIMIT})...\n`);

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  // Filter and sort based on mode
  let selectedLeads;
  switch (MODE) {
    case 'hot':
      selectedLeads = leads.filter(l => getAgeDays(l.replied_at) <= 3);
      break;
    case 'stale':
      selectedLeads = leads.filter(l => getAgeDays(l.replied_at) > 15)
        .sort((a, b) => getAgeDays(a.replied_at) - getAgeDays(b.replied_at));
      break;
    case 'due':
      const dueDays = [3, 7, 14, 21, 30];
      selectedLeads = leads.filter(l => dueDays.includes(getAgeDays(l.replied_at)));
      break;
    default:
      // Priority: score by recency, category, and value
      selectedLeads = leads.map(l => ({
        ...l,
        score: calculateScore(l)
      })).sort((a, b) => b.score - a.score);
  }

  selectedLeads = selectedLeads.slice(0, LIMIT);

  if (selectedLeads.length === 0) {
    console.log('  ✅ No leads match the criteria.\n');
    return;
  }

  // Generate emails
  const emails = [];
  const textOutput = [];

  textOutput.push('═'.repeat(70));
  textOutput.push(`BATCH EMAILS - Generated ${new Date().toLocaleString()}`);
  textOutput.push(`Mode: ${MODE} | Count: ${selectedLeads.length}`);
  textOutput.push('═'.repeat(70));
  textOutput.push('');

  for (const lead of selectedLeads) {
    const email = generateEmail(lead);
    emails.push(email);

    textOutput.push('─'.repeat(70));
    textOutput.push(`TO: ${lead.lead_email}`);
    textOutput.push(`NAME: ${lead.lead_name}`);
    textOutput.push(`COMPANY: ${lead.lead_company || 'Unknown'}`);
    textOutput.push(`STATUS: ${lead.reply_category} | AGE: ${getAgeDays(lead.replied_at)} days`);
    textOutput.push('─'.repeat(70));
    textOutput.push('');
    textOutput.push(`SUBJECT: ${email.subject}`);
    textOutput.push('');
    textOutput.push(email.body);
    textOutput.push('');
  }

  // Save outputs
  fs.writeFileSync(OUTPUT_FILE, textOutput.join('\n'));
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(emails, null, 2));

  console.log(`✅ Generated ${emails.length} emails`);
  console.log(`📄 Text output: ${OUTPUT_FILE}`);
  console.log(`📊 JSON output: ${OUTPUT_JSON}`);
  console.log('');

  // Show summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 PREVIEW (first 5)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  emails.slice(0, 5).forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.to}`);
    console.log(`     Subject: ${e.subject}`);
    console.log(`     Template: ${e.template}`);
    console.log('');
  });
}

function generateEmail(lead) {
  const age = getAgeDays(lead.replied_at);
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || 'your company';
  
  // Select template based on status
  let templateKey;
  if (age <= 3) {
    templateKey = lead.reply_category === 'Meeting Request' ? 'hot_meeting' : 'hot_interested';
  } else if (age <= 5) {
    templateKey = 'followup_day3';
  } else if (age <= 10) {
    templateKey = 'followup_day7';
  } else if (age <= 18) {
    templateKey = 'followup_day14';
  } else if (age <= 25) {
    templateKey = 'last_chance';
  } else {
    templateKey = 'reactivation';
  }

  const template = TEMPLATES[templateKey];
  
  const subject = template.subject
    .replace('{firstName}', firstName)
    .replace('{company}', company);
    
  const body = template.body
    .replace(/{firstName}/g, firstName)
    .replace(/{company}/g, company);

  return {
    to: lead.lead_email,
    name: lead.lead_name,
    company: lead.lead_company,
    category: lead.reply_category,
    age,
    template: templateKey,
    subject,
    body
  };
}

function calculateScore(lead) {
  let score = 0;
  const age = getAgeDays(lead.replied_at);
  
  // Recency (max 50)
  if (age <= 3) score += 50;
  else if (age <= 7) score += 35;
  else if (age <= 14) score += 20;
  else if (age <= 21) score += 10;
  
  // Category (max 30)
  if (lead.reply_category === 'Meeting Request') score += 30;
  else if (lead.reply_category === 'Interested') score += 20;
  
  // Company size (max 20)
  if (lead.company_size === 'enterprise') score += 20;
  else if (lead.company_size === 'midmarket') score += 10;
  
  return score;
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
