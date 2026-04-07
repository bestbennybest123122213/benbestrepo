#!/usr/bin/env node
/**
 * Campaign Performance Analyzer
 * 
 * Analyzes performance across different campaigns/sources to identify
 * what's working and what needs optimization.
 * 
 * Usage:
 *   node campaign-analyzer.js           # Show all campaigns
 *   node campaign-analyzer.js top       # Show top performers
 *   node campaign-analyzer.js worst     # Show underperformers
 *   node campaign-analyzer.js compare   # Side-by-side comparison
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'all';

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

  const campaigns = analyzeCampaigns(leads);

  switch (VIEW) {
    case 'top':
      showTop(campaigns);
      break;
    case 'worst':
      showWorst(campaigns);
      break;
    case 'compare':
      showComparison(campaigns);
      break;
    default:
      showAll(campaigns);
  }
}

function analyzeCampaigns(leads) {
  const campaigns = {};

  leads.forEach(lead => {
    const source = lead.campaign_name || lead.source || extractSource(lead) || 'Unknown';
    
    if (!campaigns[source]) {
      campaigns[source] = {
        name: source,
        total: 0,
        booked: 0,
        meetings: 0,
        interested: 0,
        ages: [],
        enterprise: 0
      };
    }

    const c = campaigns[source];
    c.total++;
    
    if (lead.reply_category === 'Booked') c.booked++;
    else if (lead.reply_category === 'Meeting Request') c.meetings++;
    else if (lead.reply_category === 'Interested') c.interested++;
    
    if (lead.company_size === 'enterprise') c.enterprise++;
    
    const age = getAgeDays(lead.replied_at);
    if (age < 999) c.ages.push(age);
  });

  // Calculate metrics for each campaign
  return Object.values(campaigns).map(c => {
    const bookingRate = c.total > 0 ? c.booked / c.total : 0;
    const meetingRate = c.total > 0 ? (c.meetings + c.booked) / c.total : 0;
    const avgAge = c.ages.length > 0 ? c.ages.reduce((a, b) => a + b, 0) / c.ages.length : 0;
    const enterpriseRate = c.total > 0 ? c.enterprise / c.total : 0;
    
    // Score: weighted combination of metrics
    const score = (bookingRate * 40) + (meetingRate * 30) + (enterpriseRate * 20) + 
                  (c.total >= 10 ? 10 : c.total); // Volume bonus
    
    return {
      ...c,
      bookingRate,
      meetingRate,
      avgAge,
      enterpriseRate,
      score
    };
  }).sort((a, b) => b.score - a.score);
}

function extractSource(lead) {
  // Try to extract source from email domain or other fields
  const email = lead.lead_email || '';
  const domain = email.split('@')[1];
  
  // Could add logic here to categorize by domain patterns
  return null;
}

function showAll(campaigns) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 CAMPAIGN PERFORMANCE ANALYZER                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Campaign                      | Leads | Booked | Rate  | Score');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  campaigns.slice(0, 20).forEach((c, i) => {
    const rank = i < 3 ? ['🥇', '🥈', '🥉'][i] : '  ';
    const name = c.name.slice(0, 28).padEnd(28);
    const rate = `${(c.bookingRate * 100).toFixed(0)}%`;
    console.log(`  ${rank} ${name} | ${c.total.toString().padStart(5)} | ${c.booked.toString().padStart(6)} | ${rate.padStart(5)} | ${c.score.toFixed(1)}`);
  });

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total: ${campaigns.length} campaigns | ${campaigns.reduce((s, c) => s + c.total, 0)} leads`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function showTop(campaigns) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🏆 TOP PERFORMING CAMPAIGNS                                             ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Filter to campaigns with at least 5 leads
  const qualified = campaigns.filter(c => c.total >= 5);
  
  if (qualified.length === 0) {
    console.log('  Not enough data (need campaigns with 5+ leads)\n');
    return;
  }

  qualified.slice(0, 5).forEach((c, i) => {
    const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
    console.log(`  ${medal} ${c.name}`);
    console.log(`     📊 ${c.total} leads → ${c.booked} booked (${(c.bookingRate * 100).toFixed(0)}%)`);
    console.log(`     🤝 ${c.meetings} meetings | 💼 ${c.enterprise} enterprise`);
    console.log(`     📈 Score: ${c.score.toFixed(1)}`);
    console.log('');
  });

  // Insights
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 INSIGHTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const topCampaign = qualified[0];
  if (topCampaign) {
    console.log(`  • "${topCampaign.name}" has the best conversion`);
    console.log(`  • Consider scaling similar campaigns`);
  }
  console.log('');
}

function showWorst(campaigns) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚠️  UNDERPERFORMING CAMPAIGNS                                           ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Filter to campaigns with at least 5 leads and low booking rate
  const qualified = campaigns
    .filter(c => c.total >= 5)
    .sort((a, b) => a.bookingRate - b.bookingRate);
  
  if (qualified.length === 0) {
    console.log('  Not enough data\n');
    return;
  }

  qualified.slice(0, 5).forEach((c, i) => {
    console.log(`  ⚠️ ${c.name}`);
    console.log(`     📊 ${c.total} leads → ${c.booked} booked (${(c.bookingRate * 100).toFixed(0)}%)`);
    console.log(`     📉 Avg age: ${c.avgAge.toFixed(0)} days`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  • Review targeting for low-performing campaigns');
  console.log('  • Test different messaging or value props');
  console.log('  • Consider pausing campaigns with <5% booking rate');
  console.log('');
}

function showComparison(campaigns) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 CAMPAIGN COMPARISON                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const qualified = campaigns.filter(c => c.total >= 3).slice(0, 8);
  
  if (qualified.length < 2) {
    console.log('  Need at least 2 campaigns with 3+ leads to compare\n');
    return;
  }

  // Comparison table
  console.log('  Metric          | ' + qualified.map(c => c.name.slice(0, 10).padEnd(10)).join(' | '));
  console.log('  ────────────────┼' + '────────────┼'.repeat(qualified.length - 1) + '────────────');
  console.log('  Total Leads     | ' + qualified.map(c => c.total.toString().padEnd(10)).join(' | '));
  console.log('  Booked          | ' + qualified.map(c => c.booked.toString().padEnd(10)).join(' | '));
  console.log('  Booking Rate    | ' + qualified.map(c => `${(c.bookingRate * 100).toFixed(0)}%`.padEnd(10)).join(' | '));
  console.log('  Meetings        | ' + qualified.map(c => c.meetings.toString().padEnd(10)).join(' | '));
  console.log('  Enterprise      | ' + qualified.map(c => c.enterprise.toString().padEnd(10)).join(' | '));
  console.log('  Avg Age         | ' + qualified.map(c => `${c.avgAge.toFixed(0)}d`.padEnd(10)).join(' | '));
  console.log('  Score           | ' + qualified.map(c => c.score.toFixed(1).padEnd(10)).join(' | '));
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
