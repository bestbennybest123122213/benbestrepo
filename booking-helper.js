#!/usr/bin/env node
/**
 * Booking Helper
 * 
 * Helps convert meeting requests to booked calls.
 * Generates calendar-ready follow-ups for leads who requested meetings.
 * 
 * Usage:
 *   node booking-helper.js              # Show unbooked meeting requests
 *   node booking-helper.js --send       # Generate send-ready emails
 *   node booking-helper.js --cal        # Include calendar link format
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const SEND_READY = args.includes('--send');
const INCLUDE_CAL = args.includes('--cal');

// Calendar booking options
const CALENDAR = {
  // Placeholder - Jan should replace with his actual Calendly/Cal.com link
  link: '[YOUR_CALENDAR_LINK]',
  timezone: 'Europe/Warsaw',
  duration: '15 min'
};

// Time slot suggestions
function getTimeSlots() {
  const now = new Date();
  const slots = [];
  const usedDates = new Set();
  let daysAdded = 0;
  let offset = 1;
  
  // Generate 3 options over next few days (skip weekends)
  while (daysAdded < 3 && offset < 14) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    offset++;
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dateKey = date.toDateString();
    if (usedDates.has(dateKey)) continue;
    usedDates.add(dateKey);
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    
    // Vary the times
    const times = ['2:00 PM', '3:00 PM', '4:00 PM'];
    slots.push(`${dayName} ${dateStr} at ${times[daysAdded]} CET`);
    daysAdded++;
  }
  
  return slots;
}

async function getUnbookedMeetingRequests(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false });

  const now = Date.now();
  return (leads || []).map(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return { ...lead, age_days: age };
  });
}

function generateBookingEmail(lead, slots) {
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const age = lead.age_days;
  
  // Different templates based on age
  if (age <= 3) {
    return {
      subject: `Re: Let's find a time`,
      body: `Hi ${firstName},

Great to hear from you. Here are a few options:

• ${slots[0]}
• ${slots[1]}
• ${slots[2]}

${INCLUDE_CAL ? `Or grab any slot that works: ${CALENDAR.link}\n` : ''}
Let me know what works best.`,
      urgency: '🔴 HOT'
    };
  } else if (age <= 7) {
    return {
      subject: `Re: Following up on scheduling`,
      body: `Hi ${firstName},

Just following up on finding a time to chat.

Would any of these work?
• ${slots[0]}
• ${slots[1]}
• ${slots[2]}

${INCLUDE_CAL ? `Or book directly here: ${CALENDAR.link}\n` : ''}
Looking forward to connecting.`,
      urgency: '🟡 WARM'
    };
  } else if (age <= 14) {
    return {
      subject: `Re: Still want to connect?`,
      body: `Hi ${firstName},

Wanted to circle back — are you still interested in chatting?

I have availability this week if timing works better now:
• ${slots[0]}
• ${slots[1]}

${INCLUDE_CAL ? `Or book here: ${CALENDAR.link}\n` : ''}
Just let me know.`,
      urgency: '🟡 COOLING'
    };
  } else {
    return {
      subject: `Re: One last check`,
      body: `Hi ${firstName},

Wanted to check in one more time about connecting.

If you're still interested, I'm available:
• ${slots[0]}
• ${slots[1]}

If timing has changed, no worries — just let me know and I can follow up later.`,
      urgency: '⚪ STALE'
    };
  }
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  const leads = await getUnbookedMeetingRequests(client);
  const slots = getTimeSlots();

  if (leads.length === 0) {
    console.log('No unbooked meeting requests found. All caught up.');
    return;
  }

  // Summary view
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📅 BOOKING HELPER - ${leads.length} Meeting Requests Need Booking              ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  // Group by urgency
  const hot = leads.filter(l => l.age_days <= 3);
  const warm = leads.filter(l => l.age_days > 3 && l.age_days <= 7);
  const cooling = leads.filter(l => l.age_days > 7 && l.age_days <= 14);
  const stale = leads.filter(l => l.age_days > 14);

  console.log(`📊 BREAKDOWN`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   🔴 Hot (0-3 days):     ${hot.length} → Book immediately`);
  console.log(`   🟡 Warm (4-7 days):    ${warm.length} → Follow up today`);
  console.log(`   🟡 Cooling (8-14d):    ${cooling.length} → Re-engage`);
  console.log(`   ⚪ Stale (15+ days):   ${stale.length} → Last attempt`);
  console.log('');

  if (SEND_READY) {
    // Show all with ready-to-send emails
    const prioritized = [...hot, ...warm, ...cooling.slice(0, 5)]; // Limit stale
    
    console.log(`📧 READY-TO-SEND EMAILS (Top ${prioritized.length})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    prioritized.forEach((lead, i) => {
      const email = generateBookingEmail(lead, slots);
      
      console.log(`
${email.urgency} #${i + 1} | ${lead.lead_name || 'Unknown'} @ ${lead.lead_company || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TO: ${lead.lead_email}
SUBJECT: ${email.subject}
AGE: ${lead.age_days} days

${email.body}
`);
    });
  } else {
    // Just show list
    console.log(`📋 LEADS NEEDING BOOKING`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    [...hot, ...warm].forEach((lead, i) => {
      const urgency = lead.age_days <= 3 ? '🔴' : '🟡';
      console.log(`   ${urgency} ${lead.lead_name || lead.lead_email} @ ${lead.lead_company || 'Unknown'}`);
      console.log(`      ${lead.lead_email} | ${lead.age_days}d old`);
    });
    
    if (cooling.length + stale.length > 0) {
      console.log(`\n   ... plus ${cooling.length + stale.length} older leads`);
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Use --send to see ready-to-send emails
💡 Use --cal to include calendar link in emails
💡 Available time slots: ${slots.join(', ')}
`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
