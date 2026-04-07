/**
 * Campaign Health Monitor
 * 
 * Monitors campaign performance and alerts when metrics drop.
 * 
 * Usage:
 *   gex health              # Quick health check
 *   gex health --detail     # Detailed breakdown
 *   gex health --alerts     # Only show alerts
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Eric's benchmarks
const BENCHMARKS = {
  replyRate: { good: 3, great: 5, killer: 10 },
  positiveRate: { good: 0.3, great: 0.5, killer: 1 },
  bounceRate: { max: 3 }, // Above 3% is bad
  bookingRate: { good: 20, great: 30, killer: 40 }
};

async function getCampaignHealth() {
  // Get recent campaign stats from curated_leads
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  const now = Date.now();
  const periods = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '14d': 14 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  
  const stats = {};
  
  for (const [period, ms] of Object.entries(periods)) {
    const periodLeads = leads.filter(l => 
      now - new Date(l.created_at).getTime() < ms
    );
    
    const total = periodLeads.length;
    const positive = periodLeads.filter(l => 
      ['Interested', 'Meeting Request', 'Booked'].includes(l.lead_category)
    ).length;
    const booked = periodLeads.filter(l => l.booking_status === 'Booked').length;
    
    stats[period] = {
      total,
      positive,
      booked,
      positiveRate: total > 0 ? (positive / total * 100).toFixed(1) : 0,
      bookingRate: positive > 0 ? (booked / positive * 100).toFixed(1) : 0
    };
  }
  
  return stats;
}

function getHealthScore(stats) {
  // Score 0-100 based on benchmarks
  let score = 50; // Base score
  
  const recent = stats['7d'];
  
  // Positive rate scoring
  const posRate = parseFloat(recent.positiveRate);
  if (posRate >= 5) score += 20;
  else if (posRate >= 3) score += 10;
  else if (posRate < 1) score -= 20;
  
  // Booking rate scoring
  const bookRate = parseFloat(recent.bookingRate);
  if (bookRate >= 30) score += 20;
  else if (bookRate >= 20) score += 10;
  else if (bookRate < 10) score -= 20;
  
  // Volume scoring
  if (recent.total >= 50) score += 10;
  else if (recent.total < 10) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function getHealthEmoji(score) {
  if (score >= 80) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '🟠';
  return '🔴';
}

function formatHealthCheck(stats) {
  const score = getHealthScore(stats);
  const emoji = getHealthEmoji(score);
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏥 CAMPAIGN HEALTH CHECK                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`${emoji} Health Score: ${score}/100\n`);
  
  console.log('Period   │ Leads │ Positive │ Booked │ Pos Rate │ Book Rate');
  console.log('─'.repeat(60));
  
  for (const [period, data] of Object.entries(stats)) {
    const leads = String(data.total).padStart(5);
    const positive = String(data.positive).padStart(8);
    const booked = String(data.booked).padStart(6);
    const posRate = (data.positiveRate + '%').padStart(8);
    const bookRate = (data.bookingRate + '%').padStart(9);
    
    console.log(`${period.padEnd(8)} │${leads} │${positive} │${booked} │${posRate} │${bookRate}`);
  }
  
  // Trend analysis
  console.log('\n📈 TRENDS');
  console.log('─'.repeat(40));
  
  const s7 = parseFloat(stats['7d'].positiveRate);
  const s14 = parseFloat(stats['14d'].positiveRate);
  const s30 = parseFloat(stats['30d'].positiveRate);
  
  if (s7 > s14) {
    console.log('   ✅ Positive rate improving (7d > 14d)');
  } else if (s7 < s14 * 0.8) {
    console.log('   ⚠️ Positive rate declining (7d < 14d)');
  } else {
    console.log('   ➖ Positive rate stable');
  }
  
  // Alerts
  const alerts = [];
  
  if (s7 < 1) alerts.push('🔴 Positive rate below 1% - check email copy');
  if (parseFloat(stats['7d'].bookingRate) < 10) alerts.push('🔴 Booking rate below 10% - improve follow-ups');
  if (stats['7d'].total < 10) alerts.push('🟠 Low volume - scale outreach');
  
  if (alerts.length > 0) {
    console.log('\n⚠️ ALERTS');
    console.log('─'.repeat(40));
    alerts.forEach(a => console.log(`   ${a}`));
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('─'.repeat(40));
  
  if (score >= 80) {
    console.log('   🚀 Campaigns healthy - focus on scaling');
  } else if (score >= 60) {
    console.log('   📈 Room for improvement - test new copy');
  } else if (score >= 40) {
    console.log('   ⚠️ Campaigns struggling - review targeting');
  } else {
    console.log('   🔴 Urgent attention needed - pause and diagnose');
  }
}

async function run(args = []) {
  const detail = args.includes('--detail') || args.includes('-d');
  const alertsOnly = args.includes('--alerts') || args.includes('-a');
  
  const stats = await getCampaignHealth();
  
  if (!stats) {
    console.log('\n❌ Failed to check campaign health');
    return;
  }
  
  formatHealthCheck(stats);
  
  console.log('\n💡 Commands:');
  console.log('   gex health --detail   Detailed breakdown');
  console.log('   gex source            Lead source analysis');
  console.log();
}

module.exports = { run, getCampaignHealth };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
