#!/usr/bin/env node
/**
 * Email Template Library
 * 
 * Reusable email templates for common scenarios.
 * 
 * Usage:
 *   node email-templates.js                    # List all templates
 *   node email-templates.js show TEMPLATE      # Show specific template
 *   node email-templates.js generate TEMPLATE  # Generate with placeholders filled
 */

const args = process.argv.slice(2);
const ACTION = args[0] || 'list';
const TEMPLATE_NAME = args[1];

// Template library
const TEMPLATES = {
  // ===== INITIAL OUTREACH =====
  'cold-gaming': {
    category: 'Cold Outreach',
    name: 'Gaming Company',
    subject: 'ItssIMANNN x [COMPANY] — quick question',
    body: `Hi [FIRST_NAME],

I noticed [COMPANY] is doing great work in mobile gaming. Quick question: are you exploring YouTube influencer marketing?

ItssIMANNN (10M+ subs) just wrapped a campaign that drove 100K+ new app users. His story-driven format gets crazy engagement.

Worth a quick chat to see if there's a fit?`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  'cold-tech': {
    category: 'Cold Outreach',
    name: 'Tech/SaaS Company',
    subject: 'Quick thought on [COMPANY]\'s growth',
    body: `Hi [FIRST_NAME],

Saw [COMPANY] is making moves in [INDUSTRY]. Are you exploring influencer marketing for user acquisition?

We just helped an AI company drive 50K+ downloads through a single YouTube integration with ItssIMANNN (10M+ subs).

Would a quick call make sense to explore if something similar could work for [COMPANY]?`,
    placeholders: ['FIRST_NAME', 'COMPANY', 'INDUSTRY']
  },

  'cold-education': {
    category: 'Cold Outreach',
    name: 'Education/EdTech',
    subject: 'Reaching students through storytelling',
    body: `Hi [FIRST_NAME],

Quick question: is [COMPANY] looking to reach the 18-34 demo through authentic content?

ItssIMANNN (10M+ subs) creates story-driven content that resonates deeply with young audiences. His Gauth AI campaign drove 50K+ downloads.

Worth exploring?`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  // ===== FOLLOW-UPS =====
  'followup-interested': {
    category: 'Follow-up',
    name: 'After Interest',
    subject: 'Re: Quick follow-up',
    body: `Hi [FIRST_NAME],

Just following up on your interest in working with ItssIMANNN.

Here's a quick snapshot:
• 10M+ subscribers
• Up to 361M monthly views
• Story-driven moral skits (high engagement)
• Recent campaign: 48M views, 100K+ new users

Would a 15-minute call work this week? Happy to share examples relevant to [COMPANY].`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  'followup-meeting-request': {
    category: 'Follow-up',
    name: 'After Meeting Request',
    subject: 'Re: Let\'s find a time',
    body: `Hi [FIRST_NAME],

Here are a few options:

• [DAY_1] at [TIME_1]
• [DAY_2] at [TIME_2]
• [DAY_3] at [TIME_3]

Or grab any slot here: [CALENDAR_LINK]

Looking forward to connecting.`,
    placeholders: ['FIRST_NAME', 'DAY_1', 'TIME_1', 'DAY_2', 'TIME_2', 'DAY_3', 'TIME_3', 'CALENDAR_LINK']
  },

  'followup-no-response': {
    category: 'Follow-up',
    name: 'No Response (Bump)',
    subject: 'Re: Quick bump',
    body: `Hi [FIRST_NAME],

Just bumping this up in case it got buried.

Still interested in exploring a partnership with ItssIMANNN for [COMPANY]?

Happy to work around your schedule.`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  'followup-last-attempt': {
    category: 'Follow-up',
    name: 'Final Follow-up',
    subject: 'Re: Closing the loop',
    body: `Hi [FIRST_NAME],

Wanted to close the loop on this.

If you're still interested in working with ItssIMANNN, I have availability this week.

If timing isn't right, no worries — just let me know and I can follow up later.`,
    placeholders: ['FIRST_NAME']
  },

  // ===== MEETING RELATED =====
  'meeting-confirm': {
    category: 'Meeting',
    name: 'Confirmation',
    subject: 'Confirmed: Call on [DATE]',
    body: `Hi [FIRST_NAME],

Looking forward to our call on [DATE] at [TIME].

Quick agenda:
1. Learn about [COMPANY]'s goals
2. Share relevant ItssIMANNN case studies
3. Discuss potential partnership options

Talk soon.`,
    placeholders: ['FIRST_NAME', 'DATE', 'TIME', 'COMPANY']
  },

  'meeting-reschedule': {
    category: 'Meeting',
    name: 'Reschedule Request',
    subject: 'Re: Need to reschedule',
    body: `Hi [FIRST_NAME],

I need to reschedule our call originally set for [ORIGINAL_DATE].

Would any of these work instead?
• [NEW_DAY_1] at [NEW_TIME_1]
• [NEW_DAY_2] at [NEW_TIME_2]

Apologies for any inconvenience.`,
    placeholders: ['FIRST_NAME', 'ORIGINAL_DATE', 'NEW_DAY_1', 'NEW_TIME_1', 'NEW_DAY_2', 'NEW_TIME_2']
  },

  'meeting-followup': {
    category: 'Meeting',
    name: 'Post-Meeting Follow-up',
    subject: 'Re: Great chatting — next steps',
    body: `Hi [FIRST_NAME],

Great connecting earlier. As discussed:

[KEY_POINTS]

Next steps:
• I'll send over [DELIVERABLE]
• Let me know if you have any questions

Talk soon.`,
    placeholders: ['FIRST_NAME', 'KEY_POINTS', 'DELIVERABLE']
  },

  // ===== PROPOSALS =====
  'proposal-send': {
    category: 'Proposal',
    name: 'Sending Proposal',
    subject: 'ItssIMANNN x [COMPANY] — Proposal',
    body: `Hi [FIRST_NAME],

As discussed, here's the proposal for [COMPANY] x ItssIMANNN:

[PROPOSAL_DETAILS]

Investment: $[AMOUNT]
Timeline: [TIMELINE]

Happy to hop on a call to discuss any questions.`,
    placeholders: ['FIRST_NAME', 'COMPANY', 'PROPOSAL_DETAILS', 'AMOUNT', 'TIMELINE']
  },

  'proposal-followup': {
    category: 'Proposal',
    name: 'Proposal Follow-up',
    subject: 'Re: Thoughts on the proposal?',
    body: `Hi [FIRST_NAME],

Just checking in on the proposal I sent over.

Any questions or feedback? Happy to adjust based on [COMPANY]'s needs.`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  // ===== REACTIVATION =====
  'reactivate-cold': {
    category: 'Reactivation',
    name: 'Cold Lead Revival',
    subject: 'Quick update from ItssIMANNN team',
    body: `Hi [FIRST_NAME],

It's been a while since we connected. Wanted to share a quick update:

ItssIMANNN just wrapped a campaign that drove [RESULT]. Thought it might be relevant for [COMPANY].

Is influencer marketing on your radar for [QUARTER]?`,
    placeholders: ['FIRST_NAME', 'RESULT', 'COMPANY', 'QUARTER']
  },

  'reactivate-gentle': {
    category: 'Reactivation',
    name: 'Gentle Check-in',
    subject: 'Still on your radar?',
    body: `Hi [FIRST_NAME],

Just a quick check-in. Is working with ItssIMANNN still something [COMPANY] is considering?

If timing has changed, no pressure — happy to reconnect whenever it makes sense.`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  },

  // ===== OBJECTION HANDLING =====
  'objection-budget': {
    category: 'Objection Handling',
    name: 'Budget Concerns',
    subject: 'Re: Making it work',
    body: `Hi [FIRST_NAME],

Totally understand budget constraints.

We've structured deals in different ways before — payment splits, smaller initial tests, performance components.

Our Whiteout Survival campaign started with a single integration and ended up driving 100K+ users at under $0.50 each.

Worth exploring a smaller test to prove ROI?`,
    placeholders: ['FIRST_NAME']
  },

  'objection-timing': {
    category: 'Objection Handling',
    name: 'Timing Issues',
    subject: 'Re: When would be better?',
    body: `Hi [FIRST_NAME],

No problem on timing. When would be a better time to reconnect?

I can set a reminder and reach out then. Just want to make sure I follow up when it makes sense for [COMPANY].`,
    placeholders: ['FIRST_NAME', 'COMPANY']
  }
};

function listTemplates() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📧 EMAIL TEMPLATE LIBRARY                                                ║
║  ${Object.keys(TEMPLATES).length} templates available
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  const categories = {};
  Object.entries(TEMPLATES).forEach(([key, template]) => {
    if (!categories[template.category]) categories[template.category] = [];
    categories[template.category].push({ key, ...template });
  });

  Object.entries(categories).forEach(([category, templates]) => {
    console.log(`📂 ${category}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    templates.forEach(t => {
      console.log(`   ${t.key.padEnd(25)} ${t.name}`);
    });
    console.log('');
  });

  console.log(`
Usage:
  gex templates show cold-gaming     Show template
  gex templates generate cold-gaming Generate with placeholders
`);
}

function showTemplate(name) {
  const template = TEMPLATES[name];
  if (!template) {
    console.log(`Template not found: ${name}`);
    console.log(`Run "gex templates" to see available templates.`);
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📧 ${template.name.toUpperCase().padEnd(65)}║
║  Category: ${template.category.padEnd(59)}║
╚═══════════════════════════════════════════════════════════════════════════╝

SUBJECT: ${template.subject}

${template.body}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Placeholders: ${template.placeholders.join(', ')}
`);
}

// Main router
switch (ACTION) {
  case 'list':
    listTemplates();
    break;
  case 'show':
    showTemplate(TEMPLATE_NAME);
    break;
  case 'generate':
    showTemplate(TEMPLATE_NAME);
    console.log('💡 Copy the template and replace [PLACEHOLDERS] with actual values.');
    break;
  default:
    listTemplates();
}
