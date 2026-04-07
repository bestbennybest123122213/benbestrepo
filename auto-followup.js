#!/usr/bin/env node
/**
 * Auto Follow-up Scheduler
 * 
 * Identifies leads that need follow-ups based on timing rules
 * and generates a queue of actions with specific times.
 * 
 * Rules:
 * - Hot leads (0-24h): Respond immediately
 * - Day 3: First follow-up
 * - Day 7: Second follow-up with value add
 * - Day 14: Case study share
 * - Day 21: Last chance
 * - Day 30+: Re-activation sequence
 * 
 * Usage:
 *   node auto-followup.js             # Show today's queue
 *   node auto-followup.js tomorrow    # Tomorrow's queue
 *   node auto-followup.js week        # Full week view
 *   node auto-followup.js export      # Export as CSV
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const VIEW = args[0] || 'today';

const SEQUENCE_DAYS = [0, 3, 7, 14, 21, 30];
const TEMPLATES = {
  0: { name: 'Immediate Response', priority: 'critical', time: '5min' },
  3: { name: 'First Follow-up', priority: 'high', time: '3min' },
  7: { name: 'Value Add', priority: 'medium', time: '5min' },
  14: { name: 'Case Study', priority: 'medium', time: '5min' },
  21: { name: 'Last Chance', priority: 'low', time: '3min' },
  30: { name: 'Re-activation', priority: 'low', time: '5min' }
};

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
    case 'tomorrow':
      showQueue(leads, 1);
      break;
    case 'week':
      showWeek(leads);
      break;
    case 'export':
      exportCSV(leads);
      break;
    default:
      showQueue(leads, 0);
  }
}

function showQueue(leads, daysFromNow = 0) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysFromNow);
  const dateStr = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 FOLLOW-UP QUEUE - ${dateStr.padEnd(40)}║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Find leads due on target date
  const queue = [];
  leads.forEach(lead => {
    const replyDate = new Date(lead.replied_at);
    const ageOnTarget = Math.floor((targetDate - replyDate) / (1000 * 60 * 60 * 24));
    
    // Check if this lead hits a sequence trigger
    if (SEQUENCE_DAYS.includes(ageOnTarget)) {
      const template = TEMPLATES[ageOnTarget];
      queue.push({
        lead,
        day: ageOnTarget,
        template: template.name,
        priority: template.priority,
        time: template.time
      });
    }
  });

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  if (queue.length === 0) {
    console.log('  ✅ No follow-ups scheduled for this day!\n');
    return;
  }

  // Group by priority
  const byPriority = { critical: [], high: [], medium: [], low: [] };
  queue.forEach(q => byPriority[q.priority].push(q));

  const totalTime = queue.reduce((sum, q) => sum + parseInt(q.time), 0);

  console.log(`  📊 ${queue.length} follow-ups | ⏱️  Est. time: ${totalTime} minutes\n`);

  Object.entries(byPriority).forEach(([priority, items]) => {
    if (items.length === 0) return;

    const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[priority];
    const label = priority.toUpperCase();

    console.log(`${emoji} ${label} (${items.length})`);
    console.log('─'.repeat(60));

    items.forEach(({ lead, template, time }) => {
      console.log(`  □ ${lead.lead_name}`);
      console.log(`    📧 ${lead.lead_email}`);
      console.log(`    📝 ${template} | ⏱️ ${time}`);
    });
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Generate emails: node gex.js batch --due');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function showWeek(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 FOLLOW-UP CALENDAR - Next 7 Days                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // Count leads due this day
    let count = 0;
    let criticalCount = 0;

    leads.forEach(lead => {
      const replyDate = new Date(lead.replied_at);
      const ageOnDate = Math.floor((date - replyDate) / (1000 * 60 * 60 * 24));
      
      if (SEQUENCE_DAYS.includes(ageOnDate)) {
        count++;
        if (ageOnDate <= 3) criticalCount++;
      }
    });

    const bar = '█'.repeat(Math.min(count, 20)) + '░'.repeat(Math.max(0, 20 - count));
    const marker = i === 0 ? '📍' : '  ';
    const critical = criticalCount > 0 ? ` (🔴${criticalCount})` : '';

    console.log(`  ${marker} ${dayName.padEnd(15)} ${bar} ${count}${critical}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Today\'s queue: node auto-followup.js');
  console.log('  Tomorrow:      node auto-followup.js tomorrow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function exportCSV(leads) {
  const today = new Date();
  const rows = ['Date,Name,Email,Company,Template,Priority'];

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    leads.forEach(lead => {
      const replyDate = new Date(lead.replied_at);
      const ageOnDate = Math.floor((date - replyDate) / (1000 * 60 * 60 * 24));
      
      if (SEQUENCE_DAYS.includes(ageOnDate)) {
        const template = TEMPLATES[ageOnDate];
        rows.push(`${dateStr},"${lead.lead_name}","${lead.lead_email}","${lead.lead_company || ''}","${template.name}","${template.priority}"`);
      }
    });
  }

  const filename = 'followup-schedule.csv';
  fs.writeFileSync(filename, rows.join('\n'));
  console.log(`✅ Exported ${rows.length - 1} follow-ups to ${filename}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
