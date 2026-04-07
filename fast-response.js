#!/usr/bin/env node
/**
 * Fast Response Generator
 * 
 * Generates immediate follow-up responses for hot leads.
 * Designed to dramatically improve response time (target: <1 hour).
 * 
 * Usage:
 *   node fast-response.js              # Show leads needing fast response
 *   node fast-response.js draft <id>   # Generate draft for specific lead
 *   node fast-response.js all          # Generate drafts for all hot leads
 *   node fast-response.js --today      # Only leads from today
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0] || 'list';
const TODAY_ONLY = args.includes('--today');

// Response templates by category
const TEMPLATES = {
  'Meeting Request': {
    subject: 'Let\'s find a time - {name}',
    body: `Hi {firstName},

Thanks for getting back! I'd love to set up a quick call.

Here's my calendar link: [CALENDAR_LINK]

Or if you prefer, just let me know what times work for you this week or next.

Looking forward to connecting!

Best,
{sender}`
  },
  
  'Interested': {
    subject: 'Quick follow-up - {company}',
    body: `Hi {firstName},

Great to hear you're interested! I'd love to share more about what we're doing.

Would a quick 15-20 minute call work? I can walk you through:
• Recent results (like the Whiteout Survival case study)
• How we'd approach {company}
• Answer any questions

What does your availability look like this week?

Best,
{sender}`
  },
  
  'Information Request': {
    subject: 'Info you requested - {name}',
    body: `Hi {firstName},

Thanks for reaching out! Happy to share more details.

[ANSWER THEIR SPECIFIC QUESTION]

Would it help to hop on a quick call? I can explain our approach and share some case studies that might be relevant for {company}.

Let me know what works!

Best,
{sender}`
  },
  
  'Booked': {
    subject: 'Confirmed: Our call this week',
    body: `Hi {firstName},

Looking forward to our call! 

I'll have some relevant examples ready to share, specifically thinking about what might work for {company}.

Talk soon!

Best,
{sender}`
  }
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get hot leads (0-3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let query = client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .gte('replied_at', TODAY_ONLY ? todayStart.toISOString() : threeDaysAgo)
    .order('replied_at', { ascending: false });

  const { data: leads, error } = await query;

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (ACTION === 'list') {
    showLeads(leads);
  } else if (ACTION === 'draft') {
    const leadId = args[1];
    if (!leadId) {
      console.error('❌ Please provide a lead ID: node fast-response.js draft <id>');
      process.exit(1);
    }
    await generateDraft(client, leadId);
  } else if (ACTION === 'all') {
    await generateAllDrafts(leads);
  } else {
    showLeads(leads);
  }
}

function showLeads(leads) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║  ⚡ FAST RESPONSE - Leads Needing Immediate Action                 ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  if (leads.length === 0) {
    console.log('  ✅ No hot leads requiring immediate response!\n');
    return;
  }

  console.log(`  Found ${leads.length} leads needing fast response:\n`);

  leads.forEach((lead, i) => {
    const age = getAge(lead.replied_at);
    const urgency = age.hours < 1 ? '🔴 NOW' 
                  : age.hours < 4 ? '🟠 URGENT'
                  : age.hours < 12 ? '🟡 TODAY'
                  : '🟢 SOON';

    console.log(`  ${i + 1}. ${urgency} ${lead.lead_name}`);
    console.log(`     📧 ${lead.lead_email}`);
    console.log(`     🏢 ${lead.lead_company || 'Unknown'}`);
    console.log(`     📊 ${lead.reply_category} • ${formatAge(age)}`);
    console.log(`     ID: ${lead.id}`);
    console.log('');
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generate drafts:
    node fast-response.js draft <id>   # Single lead
    node fast-response.js all          # All hot leads
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function generateDraft(client, leadId) {
  const { data: lead, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    console.error('❌ Lead not found:', leadId);
    process.exit(1);
  }

  console.log(generateEmailDraft(lead));
}

async function generateAllDrafts(leads) {
  if (leads.length === 0) {
    console.log('✅ No hot leads to generate drafts for.');
    return;
  }

  console.log(`\n📧 Generating ${leads.length} fast response drafts...\n`);
  console.log('═'.repeat(70));

  for (const lead of leads) {
    console.log(generateEmailDraft(lead));
    console.log('═'.repeat(70));
  }
}

function generateEmailDraft(lead) {
  const template = TEMPLATES[lead.reply_category] || TEMPLATES['Interested'];
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || 'your team';

  const subject = template.subject
    .replace('{name}', lead.lead_name || firstName)
    .replace('{company}', company)
    .replace('{firstName}', firstName);

  const body = template.body
    .replace(/{firstName}/g, firstName)
    .replace(/{name}/g, lead.lead_name || firstName)
    .replace(/{company}/g, company)
    .replace(/{sender}/g, 'Jan');

  const age = getAge(lead.replied_at);
  const urgency = age.hours < 1 ? '🔴 RESPOND NOW' 
                : age.hours < 4 ? '🟠 URGENT'
                : age.hours < 12 ? '🟡 TODAY'
                : '🟢 SOON';

  return `
${urgency} | ${lead.lead_name} @ ${lead.lead_company || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${lead.lead_email}
Category: ${lead.reply_category}
Age: ${formatAge(age)}

📬 SUBJECT: ${subject}

${body}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

function getAge(dateStr) {
  if (!dateStr) return { hours: 999, days: 999 };
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const hours = diffMs / (1000 * 60 * 60);
  const days = hours / 24;
  return { hours, days };
}

function formatAge(age) {
  if (age.hours < 1) return `${Math.round(age.hours * 60)} minutes ago`;
  if (age.hours < 24) return `${Math.round(age.hours)} hours ago`;
  return `${Math.round(age.days)} days ago`;
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
