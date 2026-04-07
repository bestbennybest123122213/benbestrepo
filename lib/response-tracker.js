/**
 * Response Time Tracker
 * 
 * Tracks how fast Jan responds to leads and correlates with booking rate.
 * 
 * Usage:
 *   gex response            # Response time overview
 *   gex response --today    # Today's responses
 *   gex response --slow     # Flag slow responses
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Response time benchmarks (hours)
const BENCHMARKS = {
  excellent: 1,    // < 1 hour
  good: 4,         // 1-4 hours
  acceptable: 24,  // 4-24 hours
  slow: 48         // > 24 hours
};

async function getResponseStats() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .not('response_time_hours', 'is', null)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  // Calculate stats
  const stats = {
    total: leads.length,
    excellent: 0,
    good: 0,
    acceptable: 0,
    slow: 0,
    avgResponseTime: 0,
    bookedBySpeed: {
      fast: { total: 0, booked: 0 },
      slow: { total: 0, booked: 0 }
    }
  };
  
  let totalTime = 0;
  
  leads.forEach(lead => {
    const hours = lead.response_time_hours || 0;
    totalTime += hours;
    
    if (hours < BENCHMARKS.excellent) {
      stats.excellent++;
    } else if (hours < BENCHMARKS.good) {
      stats.good++;
    } else if (hours < BENCHMARKS.acceptable) {
      stats.acceptable++;
    } else {
      stats.slow++;
    }
    
    // Booking correlation
    const isFast = hours < 4;
    const isBooked = lead.booking_status === 'Booked';
    
    if (isFast) {
      stats.bookedBySpeed.fast.total++;
      if (isBooked) stats.bookedBySpeed.fast.booked++;
    } else {
      stats.bookedBySpeed.slow.total++;
      if (isBooked) stats.bookedBySpeed.slow.booked++;
    }
  });
  
  stats.avgResponseTime = stats.total > 0 
    ? (totalTime / stats.total).toFixed(1) 
    : 0;
  
  return stats;
}

function formatOverview(stats) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ⏱️  RESPONSE TIME TRACKER                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (stats.total === 0) {
    console.log('📊 No response time data available yet.\n');
    console.log('💡 Response times are tracked when leads are processed.');
    return;
  }
  
  console.log(`📊 OVERVIEW (${stats.total} leads with response data)`);
  console.log('─'.repeat(40));
  console.log(`   ⚡ Excellent (<1h): ${stats.excellent} (${(stats.excellent/stats.total*100).toFixed(0)}%)`);
  console.log(`   ✅ Good (1-4h): ${stats.good} (${(stats.good/stats.total*100).toFixed(0)}%)`);
  console.log(`   ⏳ Acceptable (4-24h): ${stats.acceptable} (${(stats.acceptable/stats.total*100).toFixed(0)}%)`);
  console.log(`   🐌 Slow (>24h): ${stats.slow} (${(stats.slow/stats.total*100).toFixed(0)}%)`);
  console.log(`\n   📈 Average: ${stats.avgResponseTime} hours`);
  
  // Booking correlation
  const fastBookRate = stats.bookedBySpeed.fast.total > 0
    ? (stats.bookedBySpeed.fast.booked / stats.bookedBySpeed.fast.total * 100).toFixed(0)
    : 0;
  const slowBookRate = stats.bookedBySpeed.slow.total > 0
    ? (stats.bookedBySpeed.slow.booked / stats.bookedBySpeed.slow.total * 100).toFixed(0)
    : 0;
  
  console.log('\n💡 SPEED vs BOOKING RATE');
  console.log('─'.repeat(40));
  console.log(`   ⚡ Fast responses (<4h): ${fastBookRate}% booking rate`);
  console.log(`   🐌 Slow responses (>4h): ${slowBookRate}% booking rate`);
  
  if (parseFloat(fastBookRate) > parseFloat(slowBookRate)) {
    const diff = parseFloat(fastBookRate) - parseFloat(slowBookRate);
    console.log(`\n   📈 Fast responses convert ${diff.toFixed(0)}% better!`);
  }
  
  // Recommendations
  console.log('\n🎯 RECOMMENDATIONS');
  console.log('─'.repeat(40));
  
  if (stats.slow > stats.total * 0.2) {
    console.log('   ⚠️ Too many slow responses - set up mobile alerts');
  }
  
  if (parseFloat(stats.avgResponseTime) > 8) {
    console.log('   ⚠️ Average response time too high - aim for <4 hours');
  }
  
  console.log('   • Use `gex reply` for quick templated responses');
  console.log('   • Log responses with `gex engage log email <lead>`');
}

async function run(args = []) {
  const today = args.includes('--today') || args.includes('-t');
  const slowOnly = args.includes('--slow') || args.includes('-s');
  
  const stats = await getResponseStats();
  
  if (!stats) {
    console.log('\n❌ Failed to get response stats');
    return;
  }
  
  formatOverview(stats);
  
  console.log('\n💡 Commands:');
  console.log('   gex reply       Generate quick replies');
  console.log('   gex engage      Track engagement');
  console.log();
}

module.exports = { run, getResponseStats };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
