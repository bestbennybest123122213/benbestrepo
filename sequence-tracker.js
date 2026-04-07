#!/usr/bin/env node
/**
 * Email Sequence Tracker
 * 
 * Tracks where each lead is in the follow-up sequence and
 * suggests the next touch based on timing and response.
 * 
 * Standard sequence:
 * 1. Initial outreach (Day 0)
 * 2. First follow-up (Day 3)
 * 3. Second follow-up (Day 7)
 * 4. Third follow-up (Day 14)
 * 5. Last chance (Day 21)
 * 6. Re-activation (Day 30+)
 * 
 * Usage:
 *   node sequence-tracker.js            # Show sequence status
 *   node sequence-tracker.js due        # Show leads due for follow-up
 *   node sequence-tracker.js overdue    # Show overdue follow-ups
 *   node sequence-tracker.js calendar   # Show follow-ups by day
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'status';

// Sequence definition (days since reply)
const SEQUENCE = [
  { step: 1, name: 'Initial Response', day: 0, template: 'immediate' },
  { step: 2, name: 'First Follow-up', day: 3, template: 'reminder' },
  { step: 3, name: 'Second Follow-up', day: 7, template: 'value_add' },
  { step: 4, name: 'Third Follow-up', day: 14, template: 'case_study' },
  { step: 5, name: 'Last Chance', day: 21, template: 'last_chance' },
  { step: 6, name: 'Re-activation', day: 30, template: 'reactivation' }
];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  switch (VIEW) {
    case 'due':
      showDue(leads);
      break;
    case 'overdue':
      showOverdue(leads);
      break;
    case 'calendar':
      showCalendar(leads);
      break;
    default:
      showStatus(leads);
  }
}

function getSequenceStep(ageDays) {
  // Find which step they should be at based on age
  for (let i = SEQUENCE.length - 1; i >= 0; i--) {
    if (ageDays >= SEQUENCE[i].day) {
      return SEQUENCE[i];
    }
  }
  return SEQUENCE[0];
}

function getNextStep(ageDays) {
  for (const step of SEQUENCE) {
    if (ageDays < step.day) {
      return step;
    }
  }
  return null; // Past all steps
}

function showStatus(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📬 EMAIL SEQUENCE TRACKER                                               ║
║  Track follow-up progress for ${leads.length} unbooked leads                        ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Group by sequence step
  const byStep = {};
  SEQUENCE.forEach(s => byStep[s.step] = []);
  byStep['past'] = [];

  leads.forEach(lead => {
    const age = getAgeDays(lead.replied_at);
    const step = getSequenceStep(age);
    
    if (age > 30) {
      byStep['past'].push({ lead, age });
    } else {
      byStep[step.step].push({ lead, age });
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SEQUENCE DISTRIBUTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  SEQUENCE.forEach(s => {
    const count = byStep[s.step].length;
    const bar = '█'.repeat(Math.min(count, 30)) + '░'.repeat(Math.max(0, 30 - count));
    console.log(`  Step ${s.step}: ${s.name.padEnd(18)} ${bar} ${count}`);
  });

  const pastCount = byStep['past'].length;
  console.log(`  Past:  Re-activation needed   ${'█'.repeat(Math.min(pastCount, 30))}${'░'.repeat(Math.max(0, 30 - pastCount))} ${pastCount}`);
  console.log('');

  // Show what's due today
  const today = leads.filter(l => {
    const age = getAgeDays(l.replied_at);
    return SEQUENCE.some(s => age === s.day);
  });

  if (today.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📅 DUE TODAY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    today.slice(0, 10).forEach(l => {
      const age = getAgeDays(l.replied_at);
      const step = getSequenceStep(age);
      console.log(`  • ${l.lead_name} → ${step.name} (Day ${age})`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  node sequence-tracker.js due       # Show due follow-ups');
  console.log('  node sequence-tracker.js overdue   # Show overdue');
  console.log('  node sequence-tracker.js calendar  # Week view');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function showDue(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 FOLLOW-UPS DUE TODAY                                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const due = leads.filter(l => {
    const age = getAgeDays(l.replied_at);
    return SEQUENCE.some(s => age === s.day || (age > 0 && age === s.day + 1));
  }).map(l => {
    const age = getAgeDays(l.replied_at);
    const step = getSequenceStep(age);
    return { lead: l, age, step };
  });

  if (due.length === 0) {
    console.log('  ✅ No follow-ups due today!\n');
    return;
  }

  // Group by step
  const byStep = {};
  due.forEach(d => {
    if (!byStep[d.step.step]) byStep[d.step.step] = [];
    byStep[d.step.step].push(d);
  });

  Object.entries(byStep).forEach(([stepNum, items]) => {
    const step = SEQUENCE.find(s => s.step === parseInt(stepNum));
    console.log(`\n📬 ${step.name.toUpperCase()} (Day ${step.day}) - ${items.length} leads`);
    console.log('─'.repeat(60));
    
    items.slice(0, 10).forEach(({ lead, age }) => {
      console.log(`  ${lead.lead_name}`);
      console.log(`    📧 ${lead.lead_email}`);
      console.log(`    🏢 ${lead.lead_company || 'Unknown'} | ${lead.reply_category}`);
      console.log(`    📝 Template: ${step.template}`);
      console.log('');
    });
  });
}

function showOverdue(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚠️  OVERDUE FOLLOW-UPS                                                   ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const overdue = leads.filter(l => {
    const age = getAgeDays(l.replied_at);
    // Overdue = past a step trigger but not yet at the next
    return age > 3 && !SEQUENCE.some(s => age === s.day);
  }).map(l => {
    const age = getAgeDays(l.replied_at);
    const currentStep = getSequenceStep(age);
    const nextStep = getNextStep(age);
    const daysSinceStep = age - currentStep.day;
    return { lead: l, age, currentStep, nextStep, daysSinceStep };
  }).sort((a, b) => b.daysSinceStep - a.daysSinceStep);

  if (overdue.length === 0) {
    console.log('  ✅ No overdue follow-ups!\n');
    return;
  }

  console.log(`  Found ${overdue.length} overdue leads:\n`);

  overdue.slice(0, 15).forEach(({ lead, age, currentStep, daysSinceStep }) => {
    const urgency = daysSinceStep > 7 ? '🔴' : daysSinceStep > 3 ? '🟠' : '🟡';
    console.log(`  ${urgency} ${lead.lead_name} - ${daysSinceStep}d overdue`);
    console.log(`     Should have sent: ${currentStep.name} (Day ${currentStep.day})`);
    console.log(`     Current age: ${age} days`);
    console.log('');
  });
}

function showCalendar(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 FOLLOW-UP CALENDAR (Next 7 Days)                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    // Find leads that will hit a sequence trigger on this day
    const dueThisDay = leads.filter(l => {
      const replyDate = new Date(l.replied_at);
      const ageOnThisDay = Math.floor((date - replyDate) / (1000 * 60 * 60 * 24));
      return SEQUENCE.some(s => ageOnThisDay === s.day);
    });

    const emoji = i === 0 ? '📍' : '📅';
    console.log(`\n${emoji} ${dayName}`);
    console.log('─'.repeat(50));
    
    if (dueThisDay.length === 0) {
      console.log('  (no follow-ups scheduled)');
    } else {
      dueThisDay.slice(0, 5).forEach(l => {
        const replyDate = new Date(l.replied_at);
        const ageOnThisDay = Math.floor((date - replyDate) / (1000 * 60 * 60 * 24));
        const step = getSequenceStep(ageOnThisDay);
        console.log(`  • ${l.lead_name} → ${step.name}`);
      });
      if (dueThisDay.length > 5) {
        console.log(`  ... and ${dueThisDay.length - 5} more`);
      }
    }
  }
  console.log('');
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
