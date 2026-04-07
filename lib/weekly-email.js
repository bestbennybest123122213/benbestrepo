/**
 * Weekly Performance Email Generator
 * 
 * Generates a weekly summary email with key metrics.
 * 
 * Usage:
 *   gex weekly-email         # Generate weekly summary
 *   gex weekly-email --send  # Format for sending
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getWeeklyStats() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  
  // This week's leads
  const { data: thisWeek } = await supabase
    .from('curated_leads')
    .select('*')
    .gte('created_at', weekAgo.toISOString());
  
  // Last week's leads (for comparison)
  const { data: lastWeek } = await supabase
    .from('curated_leads')
    .select('*')
    .gte('created_at', twoWeeksAgo.toISOString())
    .lt('created_at', weekAgo.toISOString());
  
  // All-time stats
  const { data: allTime } = await supabase
    .from('curated_leads')
    .select('*');
  
  const stats = {
    thisWeek: {
      total: thisWeek?.length || 0,
      booked: thisWeek?.filter(l => l.status === 'Booked').length || 0,
      positive: thisWeek?.filter(l => 
        ['Meeting Request', 'Booked', 'Interested'].includes(l.category)
      ).length || 0
    },
    lastWeek: {
      total: lastWeek?.length || 0,
      booked: lastWeek?.filter(l => l.status === 'Booked').length || 0,
      positive: lastWeek?.filter(l => 
        ['Meeting Request', 'Booked', 'Interested'].includes(l.category)
      ).length || 0
    },
    allTime: {
      total: allTime?.length || 0,
      booked: allTime?.filter(l => l.status === 'Booked').length || 0
    }
  };
  
  return stats;
}

function getTrend(current, previous) {
  if (previous === 0) return current > 0 ? '📈' : '➖';
  const change = ((current - previous) / previous * 100).toFixed(0);
  if (change > 10) return `📈 +${change}%`;
  if (change < -10) return `📉 ${change}%`;
  return '➖';
}

function formatWeeklyEmail(stats) {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date();
  
  const dateRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  
  let email = `📊 **Weekly Performance Report**\n`;
  email += `${dateRange}\n\n`;
  
  email += `**This Week:**\n`;
  email += `├ New Leads: ${stats.thisWeek.total} ${getTrend(stats.thisWeek.total, stats.lastWeek.total)}\n`;
  email += `├ Positive Replies: ${stats.thisWeek.positive} ${getTrend(stats.thisWeek.positive, stats.lastWeek.positive)}\n`;
  email += `└ Booked: ${stats.thisWeek.booked} ${getTrend(stats.thisWeek.booked, stats.lastWeek.booked)}\n\n`;
  
  email += `**All-Time:**\n`;
  email += `├ Total Leads: ${stats.allTime.total}\n`;
  email += `└ Total Booked: ${stats.allTime.booked}\n\n`;
  
  // Booking rate
  const bookingRate = stats.allTime.total > 0 
    ? (stats.allTime.booked / stats.allTime.total * 100).toFixed(1) 
    : 0;
  email += `**Booking Rate:** ${bookingRate}%\n\n`;
  
  // Key insight
  if (stats.thisWeek.booked > stats.lastWeek.booked) {
    email += `💡 *Great week! Booked ${stats.thisWeek.booked - stats.lastWeek.booked} more than last week.*\n`;
  } else if (stats.thisWeek.booked < stats.lastWeek.booked) {
    email += `⚠️ *Fewer bookings than last week. Focus on follow-ups.*\n`;
  } else {
    email += `💡 *Steady performance. Keep pushing on pending leads.*\n`;
  }
  
  return email;
}

function formatPlainText(stats) {
  const email = formatWeeklyEmail(stats);
  // Convert markdown to plain text
  return email
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '');
}

async function run(args = []) {
  const sendFormat = args.includes('--send') || args.includes('-s');
  
  console.log('\n[Generating weekly report...]\n');
  
  const stats = await getWeeklyStats();
  
  if (sendFormat) {
    console.log('━'.repeat(50));
    console.log('📧 WEEKLY EMAIL (copy below)');
    console.log('━'.repeat(50));
    console.log();
    console.log(formatPlainText(stats));
    console.log('━'.repeat(50));
  } else {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  📊 WEEKLY PERFORMANCE REPORT                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(formatWeeklyEmail(stats));
  }
  
  console.log('\n💡 Commands:');
  console.log('   gex weekly-email --send   Copy-paste format');
  console.log();
}

module.exports = { run, getWeeklyStats, formatWeeklyEmail };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
