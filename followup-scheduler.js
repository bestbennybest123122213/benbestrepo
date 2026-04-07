#!/usr/bin/env node
/**
 * Follow-up Scheduler
 * 
 * Tracks follow-up sequences and generates appropriate messages
 * based on lead stage and timing.
 * 
 * Usage:
 *   node followup-scheduler.js                  # Show due follow-ups
 *   node followup-scheduler.js schedule EMAIL   # Schedule follow-up for lead
 *   node followup-scheduler.js due              # Show what's due today
 *   node followup-scheduler.js week             # Show this week's schedule
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const ACTION = args[0] || 'due';
const TARGET = args[1];

const DATA_FILE = './data/followup-schedule.json';

// Follow-up sequence templates
const SEQUENCES = {
  // After initial interest
  interested: [
    { day: 0, template: 'initial_response', subject: 'Re: Great to hear from you' },
    { day: 3, template: 'case_study', subject: 'Re: Quick case study for you' },
    { day: 7, template: 'check_in', subject: 'Re: Still interested?' },
    { day: 14, template: 'last_attempt', subject: 'Re: One last check' }
  ],
  // After meeting request
  meeting_request: [
    { day: 0, template: 'book_call', subject: 'Re: Let\'s find a time' },
    { day: 2, template: 'bump', subject: 'Re: Following up on scheduling' },
    { day: 5, template: 'reschedule', subject: 'Re: Still want to connect?' },
    { day: 10, template: 'last_chance', subject: 'Re: Closing the loop' }
  ],
  // Cold reactivation
  reactivation: [
    { day: 0, template: 'reactivate', subject: 'Quick update from ItssIMANNN' },
    { day: 7, template: 'value_add', subject: 'Thought you\'d find this interesting' },
    { day: 14, template: 'final', subject: 'Last note from me' }
  ]
};

// Message templates
const TEMPLATES = {
  initial_response: (lead) => `Hi ${lead.firstName},

Thanks for your interest.

ItssIMANNN has 10M+ subscribers doing story-driven content with up to 361M monthly views. Our Whiteout Survival campaign hit 48M views and drove 100K+ new users.

Would a 15-minute call work to discuss? I can share examples relevant to ${lead.company || 'your brand'}.`,

  case_study: (lead) => `Hi ${lead.firstName},

Wanted to share a quick case study.

Our Whiteout Survival campaign with ItssIMANNN drove:
• 48M video views
• 100K+ new app users
• Top trending on YouTube

Would love to discuss how we could do something similar for ${lead.company || 'you'}. Free for a quick call this week?`,

  check_in: (lead) => `Hi ${lead.firstName},

Just checking in — is a partnership with ItssIMANNN still on your radar?

Happy to answer any questions or hop on a quick call when you're ready.`,

  last_attempt: (lead) => `Hi ${lead.firstName},

Circling back one more time. If timing isn't right, no worries — just let me know and I'll follow up later.

Otherwise, I'm around this week if you want to chat.`,

  book_call: (lead) => `Hi ${lead.firstName},

Here are a few options:

• Tomorrow at [TIME]
• [DAY] at [TIME]
• Or grab a slot: [CALENDAR_LINK]

Let me know what works.`,

  bump: (lead) => `Hi ${lead.firstName},

Just bumping this — any of those times work for you?

Happy to suggest alternatives if needed.`,

  reschedule: (lead) => `Hi ${lead.firstName},

Still interested in chatting about ItssIMANNN?

If timing has changed, just let me know and I can reach out later.`,

  last_chance: (lead) => `Hi ${lead.firstName},

One last check — want to close the loop on this.

If you're still interested, I have availability this week. If not, no worries.`,

  reactivate: (lead) => `Hi ${lead.firstName},

Wanted to share a quick update — ItssIMANNN just wrapped a campaign that hit 48M views.

If you're still thinking about influencer marketing for ${lead.company || 'your brand'}, happy to chat.`,

  value_add: (lead) => `Hi ${lead.firstName},

Thought you'd find this interesting — our recent gaming campaign drove 100K+ new users for a mobile app.

Let me know if you want to discuss something similar for ${lead.company || 'your team'}.`,

  final: (lead) => `Hi ${lead.firstName},

Last note from me for now. If timing ever makes sense in the future, feel free to reach out.

Take care.`
};

// Load/save schedule data
function loadSchedule() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { scheduled: [], completed: [] };
}

function saveSchedule(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get due follow-ups
async function getDueFollowups(client, range = 'today') {
  const schedule = loadSchedule();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  
  let endDate;
  if (range === 'today') {
    endDate = today;
  } else if (range === 'week') {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    endDate = weekEnd.toISOString().slice(0, 10);
  }
  
  const due = schedule.scheduled.filter(s => {
    if (s.completed) return false;
    if (range === 'today') return s.dueDate === today;
    return s.dueDate <= endDate;
  });
  
  return due;
}

// Auto-generate schedule from pending leads
async function autoSchedule(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  const schedule = loadSchedule();
  const existingEmails = new Set(schedule.scheduled.map(s => s.email));
  
  let added = 0;
  const now = Date.now();
  
  for (const lead of (leads || [])) {
    if (existingEmails.has(lead.lead_email)) continue;
    
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Determine sequence based on category
    const sequenceType = lead.reply_category === 'Meeting Request' ? 'meeting_request' : 'interested';
    const sequence = SEQUENCES[sequenceType];
    
    // Find appropriate step based on age
    let step = 0;
    for (let i = 0; i < sequence.length; i++) {
      if (age >= sequence[i].day) step = i;
    }
    
    // Calculate next follow-up date
    const nextStep = Math.min(step + 1, sequence.length - 1);
    const daysUntilNext = Math.max(0, sequence[nextStep].day - age);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysUntilNext);
    
    schedule.scheduled.push({
      email: lead.lead_email,
      name: lead.lead_name,
      company: lead.lead_company,
      category: lead.reply_category,
      sequenceType,
      currentStep: step,
      nextStep,
      dueDate: dueDate.toISOString().slice(0, 10),
      template: sequence[nextStep].template,
      subject: sequence[nextStep].subject,
      addedAt: new Date().toISOString()
    });
    
    added++;
    existingEmails.add(lead.lead_email);
  }
  
  if (added > 0) {
    saveSchedule(schedule);
  }
  
  return added;
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  // Auto-sync new leads to schedule
  const added = await autoSchedule(client);
  
  if (ACTION === 'due' || ACTION === 'today') {
    const due = await getDueFollowups(client, 'today');
    
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📅 FOLLOW-UPS DUE TODAY                                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
    
    if (due.length === 0) {
      console.log('   No follow-ups due today. ✅\n');
      if (added > 0) console.log(`   (Added ${added} new leads to schedule)`);
      return;
    }
    
    due.forEach((item, i) => {
      const firstName = item.name?.split(' ')[0] || 'there';
      const template = TEMPLATES[item.template];
      const message = template ? template({ firstName, company: item.company }) : '';
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📧 ${i + 1}. ${item.name || item.email}`);
      console.log(`   Company: ${item.company || 'Unknown'}`);
      console.log(`   Step: ${item.nextStep + 1} of sequence`);
      console.log(`   Subject: ${item.subject}`);
      console.log('');
      console.log(`   TO: ${item.email}`);
      console.log('');
      console.log(message.split('\n').map(l => '   ' + l).join('\n'));
      console.log('');
    });
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📊 Summary: ${due.length} follow-ups due today`);
    if (added > 0) console.log(`   Added ${added} new leads to schedule`);
    
  } else if (ACTION === 'week') {
    const due = await getDueFollowups(client, 'week');
    
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📅 THIS WEEK'S FOLLOW-UP SCHEDULE                                        ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
    
    // Group by date
    const byDate = {};
    due.forEach(item => {
      if (!byDate[item.dueDate]) byDate[item.dueDate] = [];
      byDate[item.dueDate].push(item);
    });
    
    const sortedDates = Object.keys(byDate).sort();
    
    sortedDates.forEach(date => {
      const items = byDate[date];
      const dateLabel = new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      
      console.log(`📆 ${dateLabel} (${items.length} follow-ups)`);
      items.forEach(item => {
        console.log(`   • ${item.name || item.email} @ ${item.company || 'Unknown'}`);
      });
      console.log('');
    });
    
    console.log(`Total: ${due.length} follow-ups this week`);
    
  } else if (ACTION === 'schedule' && TARGET) {
    // Manual scheduling (future feature)
    console.log('Manual scheduling not yet implemented.');
    console.log('Leads are auto-scheduled when they appear in the pipeline.');
    
  } else {
    console.log(`
Usage:
  gex followups           Show follow-ups due today
  gex followups week      Show this week's schedule
  gex followups today     Same as default
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
