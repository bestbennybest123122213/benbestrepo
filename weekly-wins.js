#!/usr/bin/env node
/**
 * Weekly Wins
 * 
 * Celebrates wins and tracks weekly achievements.
 * 
 * Usage:
 *   node weekly-wins.js           # This week's wins
 *   node weekly-wins.js last      # Last week's wins
 *   node weekly-wins.js month     # This month's wins
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const PERIOD = args[0] || 'week';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('created_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  const now = new Date();
  let startDate;
  let periodName;

  switch (PERIOD) {
    case 'last':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 14);
      const endLast = new Date(now);
      endLast.setDate(endLast.getDate() - 7);
      showWins(leads, startDate, endLast, 'Last Week');
      return;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      periodName = 'This Month';
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      periodName = 'This Week';
  }

  showWins(leads, startDate, now, periodName);
}

function showWins(leads, startDate, endDate, periodName) {
  const periodLeads = leads.filter(l => {
    const created = new Date(l.created_at);
    return created >= startDate && created <= endDate;
  });

  const booked = periodLeads.filter(l => l.reply_category === 'Booked');
  const meetings = periodLeads.filter(l => l.reply_category === 'Meeting Request');
  const total = periodLeads.length;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎉 WEEKLY WINS - ${periodName.toUpperCase().padEnd(40)}                  ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (booked.length === 0 && total === 0) {
    console.log('  No new activity this period.\n');
    return;
  }

  // Celebrate bookings
  if (booked.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎉 ${booked.length} NEW BOOKING${booked.length > 1 ? 'S' : ''}!`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    booked.forEach(l => {
      const date = new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      console.log(`  🎊 ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
      console.log(`     Booked on ${date}`);
    });
    console.log('');
  }

  // New leads
  if (total > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 PERIOD STATS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  📥 New leads:       ${total}`);
    console.log(`  ✅ Booked:          ${booked.length}`);
    console.log(`  🤝 Meeting requests: ${meetings.length}`);
    console.log(`  📈 Booking rate:    ${total > 0 ? ((booked.length / total) * 100).toFixed(1) : 0}%`);
    console.log('');
  }

  // Revenue
  const revenue = booked.length * 500;
  if (revenue > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 REVENUE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  💵 ${periodName}: $${revenue.toLocaleString()}`);
    console.log('');
  }

  // Motivational message
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (booked.length >= 5) {
    console.log('  🔥 CRUSHING IT! 5+ bookings - amazing work!');
  } else if (booked.length >= 3) {
    console.log('  🚀 Great progress! Keep the momentum going!');
  } else if (booked.length >= 1) {
    console.log('  ✨ Nice win! Every booking counts!');
  } else if (meetings.length >= 5) {
    console.log('  💪 Strong pipeline building! Now close those meetings!');
  } else {
    console.log('  📈 Keep pushing! Success is around the corner!');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
