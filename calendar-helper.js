#!/usr/bin/env node
/**
 * Calendar Helper
 * 
 * Generates available time slots for meeting requests
 * and creates booking messages ready to send
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

// Default availability (customize as needed)
const AVAILABILITY = {
  timezone: 'Europe/Warsaw',
  slots: [
    { day: 'Monday', times: ['10:00', '14:00', '16:00'] },
    { day: 'Tuesday', times: ['10:00', '14:00', '16:00'] },
    { day: 'Wednesday', times: ['10:00', '14:00', '16:00'] },
    { day: 'Thursday', times: ['10:00', '14:00', '16:00'] },
    { day: 'Friday', times: ['10:00', '14:00'] }
  ],
  duration: '30 minutes',
  calendlyLink: '[YOUR_CALENDLY_LINK]'
};

function getNextAvailableSlots(count = 3) {
  const slots = [];
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Start from tomorrow
  let currentDate = new Date(now);
  currentDate.setDate(currentDate.getDate() + 1);
  
  while (slots.length < count) {
    const dayName = dayNames[currentDate.getDay()];
    const dayAvailability = AVAILABILITY.slots.find(s => s.day === dayName);
    
    if (dayAvailability) {
      const dateStr = currentDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      
      for (const time of dayAvailability.times) {
        if (slots.length >= count) break;
        slots.push(`${dateStr} at ${time} (${AVAILABILITY.timezone})`);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Safety: don't go more than 14 days out
    if (currentDate - now > 14 * 24 * 60 * 60 * 1000) break;
  }
  
  return slots;
}

function generateBookingMessage(lead, slots) {
  const firstName = lead.firstName || lead.lead_name?.split(' ')[0] || 'there';
  
  return `Hi ${firstName},

Thanks for your interest! I'd love to find a time that works for you.

Here are a few slots that work on my end:
${slots.map((s, i) => `• ${s}`).join('\n')}

Or feel free to grab any time that works: ${AVAILABILITY.calendlyLink}

Looking forward to connecting!

Best,
Imann`;
}

async function generateBookingMessages() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  // Get meeting requests
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📅 CALENDAR HELPER                                                  ║
║  Quick booking messages for meeting requests                         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  console.log(`📊 Found ${leads.length} meeting requests\n`);

  const slots = getNextAvailableSlots(3);
  
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    AVAILABLE SLOTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  slots.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`\n  Calendly: ${AVAILABILITY.calendlyLink}`);

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('                    BOOKING MESSAGES');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const messages = [];
  
  // Generate for top 10 meeting requests
  for (const lead of leads.slice(0, 10)) {
    const info = getCompanyInfo(lead.lead_email);
    const message = generateBookingMessage({
      ...lead,
      firstName: lead.lead_name?.split(' ')[0]
    }, slots);
    
    messages.push({
      to: lead.lead_email,
      name: lead.lead_name,
      company: info?.name || lead.lead_company,
      message
    });

    const now = Date.now();
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    console.log(`─────────────────────────────────────────────────────────────────────`);
    console.log(`TO: ${lead.lead_email}`);
    console.log(`NAME: ${lead.lead_name || 'N/A'} @ ${info?.name || lead.lead_company || 'N/A'}`);
    console.log(`AGE: ${age} days`);
    console.log(`─────────────────────────────────────────────────────────────────────`);
    console.log(message);
    console.log('');
  }

  // Save to file
  const fs = require('fs');
  const output = messages.map(m => `
TO: ${m.to}
NAME: ${m.name} @ ${m.company}
---
${m.message}
===`).join('\n');
  
  fs.writeFileSync('booking-messages.txt', output);

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  ✅ Generated ${messages.length} booking messages`);
  console.log(`  📁 Saved to: booking-messages.txt`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Summary
  console.log('💡 TIP: Replace [YOUR_CALENDLY_LINK] with your actual booking link\n');
}

async function main() {
  try {
    await generateBookingMessages();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateBookingMessages, getNextAvailableSlots, AVAILABILITY };

if (require.main === module) {
  main();
}
