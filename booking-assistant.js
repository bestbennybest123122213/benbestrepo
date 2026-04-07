#!/usr/bin/env node
/**
 * Booking Assistant
 * 
 * Helps quickly confirm meetings, send reminders, and track scheduling.
 * 
 * Usage:
 *   node booking-assistant.js                      # Show pending bookings
 *   node booking-assistant.js confirm <email>      # Generate confirmation email
 *   node booking-assistant.js reminder <email>     # Generate reminder email
 *   node booking-assistant.js pending              # List all pending
 *   node booking-assistant.js today                # Today's meetings
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0] || 'pending';
const TARGET = args[1];

const CALENDAR_LINK = process.env.CALENDAR_LINK || 'https://calendly.com/your-calendar';

// Email templates
const TEMPLATES = {
  confirm: {
    subject: 'Confirmed: Our call {date}',
    body: `Hi {firstName},

Great - looking forward to our call{datePhrase}!

I'll send a calendar invite shortly. Here's what we'll cover:
• Quick intro and your current approach
• How we've helped similar companies (e.g., Whiteout Survival case study)
• Whether there's a fit for working together

If anything changes or you need to reschedule, just reply here.

Talk soon!

Best,
{sender}`
  },
  
  reminder: {
    subject: 'Quick reminder: Our call tomorrow',
    body: `Hi {firstName},

Just a friendly reminder about our call tomorrow!

If you need to reschedule, no worries - just let me know or use this link: ${CALENDAR_LINK}

Looking forward to it!

Best,
{sender}`
  },
  
  followupNoShow: {
    subject: 'Missed you earlier - let\'s reschedule',
    body: `Hi {firstName},

I think we might have gotten our wires crossed on timing! No worries at all.

Would any of these work for a quick reschedule?
• [Suggest 2-3 specific times]

Or grab a slot directly: ${CALENDAR_LINK}

Best,
{sender}`
  },
  
  thankYou: {
    subject: 'Great chatting - next steps',
    body: `Hi {firstName},

Thanks for taking the time to chat today! Really enjoyed learning about what you're building at {company}.

As discussed, here are the next steps:
• [Insert specific action items]

Let me know if you have any questions in the meantime.

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

  switch (ACTION) {
    case 'confirm':
      if (!TARGET) {
        console.error('❌ Please provide an email: node booking-assistant.js confirm <email>');
        process.exit(1);
      }
      await generateEmail(client, TARGET, 'confirm');
      break;
      
    case 'reminder':
      if (!TARGET) {
        console.error('❌ Please provide an email: node booking-assistant.js reminder <email>');
        process.exit(1);
      }
      await generateEmail(client, TARGET, 'reminder');
      break;
      
    case 'noshow':
      if (!TARGET) {
        console.error('❌ Please provide an email: node booking-assistant.js noshow <email>');
        process.exit(1);
      }
      await generateEmail(client, TARGET, 'followupNoShow');
      break;
      
    case 'thanks':
      if (!TARGET) {
        console.error('❌ Please provide an email: node booking-assistant.js thanks <email>');
        process.exit(1);
      }
      await generateEmail(client, TARGET, 'thankYou');
      break;
      
    case 'today':
      await showToday(client);
      break;
      
    case 'pending':
    default:
      await showPending(client);
  }
}

async function showPending(client) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 BOOKING ASSISTANT                                                    ║
║  Manage meeting confirmations and reminders                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Get meeting requests
  const { data: meetings } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .order('replied_at', { ascending: false });

  const pending = meetings || [];
  const byAge = {
    hot: pending.filter(m => getAgeDays(m.replied_at) <= 3),
    warm: pending.filter(m => getAgeDays(m.replied_at) > 3 && getAgeDays(m.replied_at) <= 7),
    cooling: pending.filter(m => getAgeDays(m.replied_at) > 7)
  };

  console.log(`  📊 ${pending.length} meeting requests pending\n`);

  if (byAge.hot.length > 0) {
    console.log('  🔥 HOT (0-3 days) - Confirm NOW');
    console.log('  ─────────────────────────────────────────');
    byAge.hot.forEach(m => {
      console.log(`    ${m.lead_name} <${m.lead_email}>`);
      console.log(`    └─ ${m.lead_company || 'Unknown'} | ${getAgeDays(m.replied_at)}d ago`);
    });
    console.log('');
  }

  if (byAge.warm.length > 0) {
    console.log('  🌡️ WARM (4-7 days) - Follow up');
    console.log('  ─────────────────────────────────────────');
    byAge.warm.slice(0, 5).forEach(m => {
      console.log(`    ${m.lead_name} <${m.lead_email}>`);
    });
    if (byAge.warm.length > 5) console.log(`    ... and ${byAge.warm.length - 5} more`);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Commands:');
  console.log('    node booking-assistant.js confirm <email>   # Confirmation');
  console.log('    node booking-assistant.js reminder <email>  # Reminder');
  console.log('    node booking-assistant.js noshow <email>    # No-show follow-up');
  console.log('    node booking-assistant.js thanks <email>    # Post-meeting');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function showToday(client) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 TODAY'S MEETINGS                                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // This would integrate with calendar API in production
  // For now, show recently booked leads as likely today's meetings
  
  const { data: booked } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Booked')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('  📌 Recently Booked (check calendar for exact times)\n');
  
  (booked || []).slice(0, 5).forEach(m => {
    console.log(`    ✅ ${m.lead_name} @ ${m.lead_company || 'Unknown'}`);
    console.log(`       ${m.lead_email}`);
    console.log('');
  });

  console.log('  💡 Tip: After each meeting, run:');
  console.log('     node booking-assistant.js thanks <email>');
}

async function generateEmail(client, email, templateType) {
  // Find the lead
  const { data: lead } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (!lead) {
    console.error(`❌ Lead not found: ${email}`);
    process.exit(1);
  }

  const template = TEMPLATES[templateType];
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || 'your company';
  
  // Smart date phrase
  const today = new Date();
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
  const datePhrase = templateType === 'confirm' ? ` this ${dayOfWeek}` : '';

  const subject = template.subject
    .replace('{date}', dayOfWeek)
    .replace('{firstName}', firstName)
    .replace('{company}', company);

  const body = template.body
    .replace(/{firstName}/g, firstName)
    .replace(/{company}/g, company)
    .replace('{datePhrase}', datePhrase)
    .replace(/{sender}/g, 'Jan');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 ${templateType.toUpperCase()} EMAIL                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

To: ${lead.lead_email}
Name: ${lead.lead_name}
Company: ${lead.lead_company || 'Unknown'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBJECT: ${subject}

${body}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
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
