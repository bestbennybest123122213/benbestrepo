#!/usr/bin/env node
/**
 * Weekly Performance Report
 * 
 * Generates a comprehensive weekly report with:
 * - Pipeline changes
 * - Conversion metrics
 * - Top performers
 * - Areas for improvement
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

async function generateWeeklyReport() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Get all leads
  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  // This week's leads
  const thisWeek = allLeads.filter(l => new Date(l.replied_at) >= weekAgo);
  const lastWeek = allLeads.filter(l => {
    const date = new Date(l.replied_at);
    return date >= twoWeeksAgo && date < weekAgo;
  });

  // Categorize
  const categories = {
    booked: allLeads.filter(l => l.reply_category === 'Booked'),
    meeting_request: allLeads.filter(l => l.reply_category === 'Meeting Request'),
    interested: allLeads.filter(l => l.reply_category === 'Interested'),
    info_request: allLeads.filter(l => l.reply_category === 'Information Request')
  };

  const thisWeekCats = {
    booked: thisWeek.filter(l => l.reply_category === 'Booked'),
    meeting_request: thisWeek.filter(l => l.reply_category === 'Meeting Request'),
    interested: thisWeek.filter(l => l.reply_category === 'Interested')
  };

  const lastWeekCats = {
    booked: lastWeek.filter(l => l.reply_category === 'Booked'),
    meeting_request: lastWeek.filter(l => l.reply_category === 'Meeting Request'),
    interested: lastWeek.filter(l => l.reply_category === 'Interested')
  };

  // Calculate changes
  const changes = {
    leads: thisWeek.length - lastWeek.length,
    booked: thisWeekCats.booked.length - lastWeekCats.booked.length,
    meetings: thisWeekCats.meeting_request.length - lastWeekCats.meeting_request.length
  };

  const formatChange = (n) => n > 0 ? `+${n} ↑` : n < 0 ? `${n} ↓` : '0 →';
  const formatPct = (n) => n > 0 ? `📈 +${n}` : n < 0 ? `📉 ${n}` : '→ 0';

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📊 WEEKLY PERFORMANCE REPORT                                        ║
║  Week of ${weekAgo.toLocaleDateString('en-GB')} - ${now.toLocaleDateString('en-GB')}                              
╚══════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════
                        PIPELINE SNAPSHOT
═══════════════════════════════════════════════════════════════════════

  Total Leads:        ${allLeads.length.toString().padStart(4)}
  ├─ Booked:          ${categories.booked.length.toString().padStart(4)}    (${formatChange(changes.booked)})
  ├─ Meeting Request: ${categories.meeting_request.length.toString().padStart(4)}    (${formatChange(changes.meetings)})
  ├─ Interested:      ${categories.interested.length.toString().padStart(4)}
  └─ Info Request:    ${categories.info_request.length.toString().padStart(4)}

═══════════════════════════════════════════════════════════════════════
                        WEEKLY COMPARISON
═══════════════════════════════════════════════════════════════════════

                      This Week    Last Week    Change
  ─────────────────────────────────────────────────────
  New Leads:          ${thisWeek.length.toString().padStart(8)}    ${lastWeek.length.toString().padStart(9)}    ${formatPct(changes.leads)}
  Booked:             ${thisWeekCats.booked.length.toString().padStart(8)}    ${lastWeekCats.booked.length.toString().padStart(9)}    ${formatPct(changes.booked)}
  Meeting Requests:   ${thisWeekCats.meeting_request.length.toString().padStart(8)}    ${lastWeekCats.meeting_request.length.toString().padStart(9)}    ${formatPct(changes.meetings)}
  Interested:         ${thisWeekCats.interested.length.toString().padStart(8)}    ${lastWeekCats.interested.length.toString().padStart(9)}    ${formatPct(thisWeekCats.interested.length - lastWeekCats.interested.length)}

═══════════════════════════════════════════════════════════════════════
                        CONVERSION METRICS
═══════════════════════════════════════════════════════════════════════

  Reply → Booking Rate:    ${((categories.booked.length / allLeads.length) * 100).toFixed(1)}%
  Meeting → Booking Rate:  ${((categories.booked.length / (categories.meeting_request.length + categories.booked.length)) * 100).toFixed(1)}%
  
  📊 Benchmark: Industry average is 2-3% reply rate, 40-50% meeting booking

═══════════════════════════════════════════════════════════════════════
                        ACTION ITEMS
═══════════════════════════════════════════════════════════════════════
`);

  // Pending meeting requests
  const pendingMeetings = categories.meeting_request.length;
  if (pendingMeetings > 0) {
    console.log(`  🚨 ${pendingMeetings} MEETING REQUESTS WAITING`);
    console.log('     Action: Book these meetings ASAP!');
    console.log('');
  }

  // Stale leads
  const stale = allLeads.filter(l => {
    if (!l.replied_at || l.reply_category === 'Booked') return false;
    const days = Math.floor((now.getTime() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 14;
  });
  
  if (stale.length > 0) {
    console.log(`  ⏰ ${stale.length} STALE LEADS (>14 days)`);
    console.log('     Action: Follow up or close out');
    console.log('');
  }

  // Low booking rate
  const bookingRate = (categories.booked.length / (categories.meeting_request.length + categories.booked.length)) * 100;
  if (bookingRate < 40) {
    console.log(`  📉 BOOKING RATE AT ${bookingRate.toFixed(1)}% (target: 40%+)`);
    console.log('     Action: Respond faster to meeting requests');
    console.log('');
  }

  console.log(`═══════════════════════════════════════════════════════════════════════
                        WINS THIS WEEK 🎉
═══════════════════════════════════════════════════════════════════════
`);

  if (thisWeekCats.booked.length > 0) {
    console.log(`  Booked ${thisWeekCats.booked.length} meetings:`);
    thisWeekCats.booked.forEach(l => {
      console.log(`    ✅ ${l.lead_name || 'N/A'} @ ${l.lead_company || 'N/A'}`);
    });
  } else {
    console.log('  No new bookings this week. Let\'s change that!');
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════

Report generated: ${now.toLocaleString('en-GB')}
Dashboard: http://localhost:3456

═══════════════════════════════════════════════════════════════════════
`);

  // Save summary
  const summary = {
    generated: now.toISOString(),
    period: {
      start: weekAgo.toISOString(),
      end: now.toISOString()
    },
    totals: {
      leads: allLeads.length,
      booked: categories.booked.length,
      meeting_request: categories.meeting_request.length,
      interested: categories.interested.length,
      stale: stale.length
    },
    thisWeek: {
      leads: thisWeek.length,
      booked: thisWeekCats.booked.length,
      meetings: thisWeekCats.meeting_request.length
    },
    changes,
    metrics: {
      bookingRate: bookingRate.toFixed(1) + '%'
    }
  };

  fs.writeFileSync('weekly-performance.json', JSON.stringify(summary, null, 2));
  console.log('Summary saved to weekly-performance.json\n');
}

async function main() {
  try {
    await generateWeeklyReport();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateWeeklyReport };

if (require.main === module) {
  main();
}
