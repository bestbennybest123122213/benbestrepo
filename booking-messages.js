#!/usr/bin/env node
/**
 * Booking Messages Generator
 * Creates personalized messages for booking confirmations and reminders
 */

const { leads } = require('./enriched-leads.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📅 BOOKING MESSAGES GENERATOR                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Meeting Request leads that need booking
const meetingRequests = leads.filter(l => l.reply_category === 'Meeting Request');

console.log(`📊 ${meetingRequests.length} leads need booking messages\n`);

// Templates
const templates = {
  firstOutreach: (lead) => {
    const firstName = lead.lead_name.split(' ')[0];
    return {
      subject: `Let's schedule our call, ${firstName}!`,
      body: `Hi ${firstName},

Great to hear you'd like to connect! I'm excited to chat about how Imann can help ${lead.lead_company}.

Here are a few times that work for me:
• [Tuesday at 2 PM your time]
• [Wednesday at 10 AM your time]
• [Thursday afternoon]

Or feel free to grab any slot that works: [CALENDLY_LINK]

Looking forward to our conversation!

Best,
[YOUR_NAME]`
    };
  },
  
  followUp: (lead) => {
    const firstName = lead.lead_name.split(' ')[0];
    return {
      subject: `Quick follow-up - ${firstName}`,
      body: `Hi ${firstName},

Just wanted to bump this to the top of your inbox! I know things get busy.

Would any of these work for a quick chat?
• [TIME_1]
• [TIME_2]

Or here's my calendar: [CALENDLY_LINK]

No rush - let me know what works best!

Cheers,
[YOUR_NAME]`
    };
  },
  
  lastChance: (lead) => {
    const firstName = lead.lead_name.split(' ')[0];
    return {
      subject: `${firstName} - one more try?`,
      body: `Hi ${firstName},

I wanted to reach out one more time about scheduling our call. I know timing can be tricky!

If now isn't a good time, just let me know and I can follow up later in the quarter.

Otherwise, I'd love to connect: [CALENDLY_LINK]

Either way, hope all is well with ${lead.lead_company}!

Best,
[YOUR_NAME]`
    };
  },
  
  confirmation: (lead, date, time) => {
    const firstName = lead.lead_name.split(' ')[0];
    return {
      subject: `Confirmed: Our call on ${date}`,
      body: `Hi ${firstName},

This is a quick confirmation for our call:

📅 Date: ${date}
⏰ Time: ${time}
📞 Meeting link: [ZOOM/MEET_LINK]

Looking forward to learning more about ${lead.lead_company} and discussing how we might work together!

See you then,
[YOUR_NAME]`
    };
  },
  
  reminder: (lead, date, time) => {
    const firstName = lead.lead_name.split(' ')[0];
    return {
      subject: `Reminder: Our call tomorrow`,
      body: `Hi ${firstName},

Quick reminder about our call tomorrow:

📅 ${date} at ${time}
📞 [MEETING_LINK]

Let me know if anything has come up and you need to reschedule!

Talk soon,
[YOUR_NAME]`
    };
  }
};

// Generate messages for top leads
const now = Date.now();
const sorted = meetingRequests.map(l => ({
  ...l,
  age_days: Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24))
})).sort((a, b) => a.age_days - b.age_days);

// Group by urgency
const fresh = sorted.filter(l => l.age_days <= 7);
const warm = sorted.filter(l => l.age_days > 7 && l.age_days <= 21);
const stale = sorted.filter(l => l.age_days > 21);

console.log('📧 BOOKING MESSAGES BY URGENCY');
console.log('─'.repeat(65));

console.log(`\n🔥 FRESH LEADS (${fresh.length}) - First Outreach Template`);
fresh.slice(0, 3).forEach((l, i) => {
  const msg = templates.firstOutreach(l);
  console.log(`\n  ${i + 1}. ${l.lead_company} - ${l.lead_name}`);
  console.log(`     Subject: ${msg.subject}`);
});

console.log(`\n🟡 WARM LEADS (${warm.length}) - Follow-up Template`);
warm.slice(0, 3).forEach((l, i) => {
  const msg = templates.followUp(l);
  console.log(`\n  ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
  console.log(`     Subject: ${msg.subject}`);
});

console.log(`\n⚠️  STALE LEADS (${stale.length}) - Last Chance Template`);
stale.slice(0, 3).forEach((l, i) => {
  const msg = templates.lastChance(l);
  console.log(`\n  ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
  console.log(`     Subject: ${msg.subject}`);
});

// Full message example
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('📋 SAMPLE FULL MESSAGE');
console.log('═══════════════════════════════════════════════════════════════');

if (sorted.length > 0) {
  const sample = sorted[0];
  const msg = sample.age_days <= 7 
    ? templates.firstOutreach(sample)
    : sample.age_days <= 21 
      ? templates.followUp(sample)
      : templates.lastChance(sample);
  
  console.log(`\nTo: ${sample.lead_email}`);
  console.log(`Subject: ${msg.subject}\n`);
  console.log(msg.body);
}

// Summary
console.log('\n\n💡 USAGE TIP');
console.log('─'.repeat(65));
console.log('  For a specific lead: node booking-messages.js <company>');
console.log('  For confirmation: Add date/time when meeting is booked');
console.log('  For reminder: Send 24h before meeting\n');
