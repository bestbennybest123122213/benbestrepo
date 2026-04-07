/**
 * Lead Source Analyzer
 * 
 * Analyzes which lead sources convert best.
 * Helps identify where to focus lead generation efforts.
 * 
 * Usage:
 *   gex source              # Source performance overview
 *   gex source --detail     # Detailed breakdown
 *   gex source --recommend  # AI recommendations
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Known source patterns
const SOURCE_PATTERNS = {
  'Google': ['google', 'gmail', 'youtube'],
  'Crunchbase': ['crunchbase'],
  'LinkedIn': ['linkedin'],
  'Inbound': ['inbound', 'referral', 'organic'],
  'Apollo': ['apollo'],
  'Manual': ['manual', 'research'],
  'Clay': ['clay'],
  'Other': []
};

function categorizeSource(lead) {
  const sourceFields = [
    lead.source,
    lead.campaign_name,
    lead.notes
  ].filter(Boolean).join(' ').toLowerCase();
  
  for (const [source, patterns] of Object.entries(SOURCE_PATTERNS)) {
    if (source === 'Other') continue;
    for (const pattern of patterns) {
      if (sourceFields.includes(pattern)) {
        return source;
      }
    }
  }
  
  return 'Other';
}

async function analyzeLeadSources() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return null;
  }
  
  // Group by source
  const sourceStats = {};
  
  leads.forEach(lead => {
    const source = categorizeSource(lead);
    
    if (!sourceStats[source]) {
      sourceStats[source] = {
        total: 0,
        booked: 0,
        interested: 0,
        meetingRequest: 0,
        revenue: 0
      };
    }
    
    sourceStats[source].total++;
    
    if (lead.booking_status === 'Booked') {
      sourceStats[source].booked++;
    }
    
    if (lead.lead_category === 'Interested') {
      sourceStats[source].interested++;
    }
    
    if (lead.lead_category === 'Meeting Request') {
      sourceStats[source].meetingRequest++;
    }
    
    // Estimate revenue (average deal size)
    if (lead.booking_status === 'Booked') {
      sourceStats[source].revenue += 25000; // Average deal
    }
  });
  
  // Calculate rates
  return Object.entries(sourceStats).map(([source, stats]) => ({
    source,
    total: stats.total,
    booked: stats.booked,
    bookingRate: stats.total > 0 ? (stats.booked / stats.total * 100).toFixed(1) : 0,
    interested: stats.interested,
    meetingRequest: stats.meetingRequest,
    positiveRate: stats.total > 0 
      ? ((stats.interested + stats.meetingRequest) / stats.total * 100).toFixed(1) 
      : 0,
    revenue: stats.revenue,
    costPerBooking: 'N/A' // Would need cost data
  })).sort((a, b) => parseFloat(b.bookingRate) - parseFloat(a.bookingRate));
}

function formatOverview(sources) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 LEAD SOURCE PERFORMANCE                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('Source          │ Leads │ Booked │ Rate  │ Revenue');
  console.log('─'.repeat(60));
  
  sources.forEach(s => {
    const name = s.source.padEnd(15);
    const leads = String(s.total).padStart(5);
    const booked = String(s.booked).padStart(6);
    const rate = (s.bookingRate + '%').padStart(6);
    const revenue = ('$' + s.revenue.toLocaleString()).padStart(10);
    
    // Color coding
    let emoji = '⬜';
    if (parseFloat(s.bookingRate) >= 30) emoji = '🟢';
    else if (parseFloat(s.bookingRate) >= 15) emoji = '🟡';
    else if (parseFloat(s.bookingRate) > 0) emoji = '🟠';
    else if (s.total > 0) emoji = '🔴';
    
    console.log(`${emoji} ${name}│${leads} │${booked} │${rate} │${revenue}`);
  });
  
  // Summary
  const totalLeads = sources.reduce((sum, s) => sum + s.total, 0);
  const totalBooked = sources.reduce((sum, s) => sum + s.booked, 0);
  const totalRevenue = sources.reduce((sum, s) => sum + s.revenue, 0);
  const avgRate = totalLeads > 0 ? (totalBooked / totalLeads * 100).toFixed(1) : 0;
  
  console.log('─'.repeat(60));
  console.log(`   TOTAL         │${String(totalLeads).padStart(5)} │${String(totalBooked).padStart(6)} │${(avgRate + '%').padStart(6)} │${('$' + totalRevenue.toLocaleString()).padStart(10)}`);
}

function formatRecommendations(sources) {
  console.log('\n📈 RECOMMENDATIONS');
  console.log('─'.repeat(40));
  
  const sorted = [...sources].sort((a, b) => parseFloat(b.bookingRate) - parseFloat(a.bookingRate));
  
  const best = sorted.filter(s => parseFloat(s.bookingRate) >= 20 && s.total >= 5);
  const worst = sorted.filter(s => parseFloat(s.bookingRate) < 10 && s.total >= 10);
  
  if (best.length > 0) {
    console.log('\n🚀 SCALE THESE (high conversion):');
    best.forEach(s => {
      console.log(`   • ${s.source}: ${s.bookingRate}% booking rate (${s.booked}/${s.total})`);
    });
  }
  
  if (worst.length > 0) {
    console.log('\n⚠️ REVIEW THESE (low conversion):');
    worst.forEach(s => {
      console.log(`   • ${s.source}: ${s.bookingRate}% booking rate (${s.booked}/${s.total})`);
    });
  }
  
  // Inbound vs outbound
  const inbound = sources.find(s => s.source === 'Inbound');
  if (inbound && parseFloat(inbound.bookingRate) > 50) {
    console.log('\n💡 KEY INSIGHT:');
    console.log(`   Inbound leads convert at ${inbound.bookingRate}%`);
    console.log('   Investing in content/referrals = higher ROI');
  }
}

async function run(args = []) {
  const detail = args.includes('--detail') || args.includes('-d');
  const recommend = args.includes('--recommend') || args.includes('-r');
  
  const sources = await analyzeLeadSources();
  
  if (!sources) {
    console.log('\n❌ Failed to analyze lead sources');
    return;
  }
  
  formatOverview(sources);
  
  if (recommend) {
    formatRecommendations(sources);
  }
  
  console.log('\n💡 Commands:');
  console.log('   gex source --recommend   Show recommendations');
  console.log('   gex inbound              Inbound vs outbound deep dive');
  console.log();
}

module.exports = { run, analyzeLeadSources };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
