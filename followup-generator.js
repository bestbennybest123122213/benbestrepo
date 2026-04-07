#!/usr/bin/env node
/**
 * Follow-up Generator
 * 
 * Generates personalized follow-up emails based on lead context.
 * 
 * Usage:
 *   node followup-generator.js <email>           # Generate follow-up
 *   node followup-generator.js <email> --type X  # Specific type
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const EMAIL = args[0];
const TYPE = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'auto';

const TEMPLATES = {
  initial: `Hi {firstName},

Thanks for getting back! I'd love to chat more about what we're doing.

Would you have 15 minutes this week or next? Here's my calendar: [CALENDAR_LINK]

Looking forward to it!

Best,
Jan`,

  reminder: `Hi {firstName},

Just wanted to follow up on my previous message. I know things get busy!

Still interested in connecting? Happy to work around your schedule.

Best,
Jan`,

  value_add: `Hi {firstName},

I came across something that made me think of {company} - we recently helped a similar company achieve some impressive results with short-form content.

Would you be open to a quick call to explore if there's a fit?

Best,
Jan`,

  case_study: `Hi {firstName},

I wanted to share a quick win - we recently worked with Whiteout Survival and saw some great results.

Given what {company} is building, I think there could be a similar opportunity.

Would love to share more details if you're interested. What does your availability look like?

Best,
Jan`,

  last_chance: `Hi {firstName},

I've reached out a few times and don't want to keep filling your inbox.

This will be my last message for now, but if you ever want to explore content creation for {company}, I'm just an email away.

Wishing you all the best!

Jan`,

  reactivation: `Hi {firstName},

It's been a while since we last connected! I recently came across {company} again and thought I'd reach out.

Not sure if timing is better now, but we've been seeing some great results with similar companies.

Would you be open to reconnecting?

Best,
Jan`
};

async function main() {
  if (!EMAIL) {
    showHelp();
    return;
  }

  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: lead } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', EMAIL)
    .single();

  if (!lead) {
    console.error(`❌ Lead not found: ${EMAIL}`);
    process.exit(1);
  }

  const age = getAgeDays(lead.replied_at);
  const templateType = TYPE === 'auto' ? selectTemplate(age, lead.reply_category) : TYPE;
  const template = TEMPLATES[templateType] || TEMPLATES.reminder;

  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || 'your company';

  const email = template
    .replace(/{firstName}/g, firstName)
    .replace(/{company}/g, company);

  const subjects = {
    initial: `Let's connect - ${firstName}`,
    reminder: `Following up - ${firstName}`,
    value_add: `Quick idea for ${company}`,
    case_study: `Case study you might like`,
    last_chance: `One last thing - ${firstName}`,
    reactivation: `Thought of ${company}`
  };

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 FOLLOW-UP EMAIL                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

👤 ${lead.lead_name}
📧 ${lead.lead_email}
🏢 ${lead.lead_company || 'Unknown'}
📊 ${lead.reply_category} | ${age} days ago
📝 Template: ${templateType}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBJECT: ${subjects[templateType] || `Following up - ${firstName}`}

${email}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 FOLLOW-UP GENERATOR                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝

  Usage:
    node followup-generator.js <email>              # Auto-select template
    node followup-generator.js <email> --type X     # Specific template

  Templates:
    initial      - First response
    reminder     - Gentle follow-up
    value_add    - Share relevant insight
    case_study   - Share success story
    last_chance  - Final outreach
    reactivation - Re-engage cold lead

  Example:
    node followup-generator.js nick.depalo@unity.com --type case_study
`);
}

function selectTemplate(age, category) {
  if (age <= 3) return 'initial';
  if (age <= 7) return 'reminder';
  if (age <= 14) return 'value_add';
  if (age <= 21) return 'case_study';
  if (age <= 30) return 'last_chance';
  return 'reactivation';
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
