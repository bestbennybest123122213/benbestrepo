#!/usr/bin/env node
/**
 * Campaign Diagnosis Tool
 * 
 * Analyzes campaign performance to identify:
 * - Underperforming campaigns (why they're not converting)
 * - Top performers (what to scale)
 * - Patterns by vertical, source, timing
 * 
 * Answers Eric's question: "Why didn't [X] leads convert?"
 * 
 * Usage:
 *   node campaign-diagnosis.js              # Full diagnosis
 *   node campaign-diagnosis.js --failing    # Only underperformers
 *   node campaign-diagnosis.js --winners    # Only top performers
 *   node campaign-diagnosis.js --vertical   # Group by vertical
 *   node campaign-diagnosis.js --recommend  # Action recommendations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Vertical detection from campaign name
function detectVertical(campaignName) {
  const name = (campaignName || '').toLowerCase();
  
  if (name.includes('gaming') || name.includes('game')) return 'Gaming';
  if (name.includes('crypto')) return 'Crypto';
  if (name.includes('ai')) return 'AI';
  if (name.includes('edu')) return 'Education';
  if (name.includes('app')) return 'Apps';
  if (name.includes('lifestyle')) return 'Lifestyle';
  if (name.includes('tech')) return 'Tech';
  if (name.includes('vid')) return 'Video/Media';
  if (name.includes('reac')) return 'Reactivation';
  if (name.includes('broad')) return 'Broad';
  
  return 'Other';
}

// Source detection
function detectSource(campaignName) {
  const name = (campaignName || '').toLowerCase();
  
  if (name.includes('crunchbase') || name.includes('cb')) return 'Crunchbase';
  if (name.includes('ycombinator') || name.includes('yc')) return 'YCombinator';
  if (name.includes('google')) return 'Google';
  if (name.includes('reac')) return 'Reactivation';
  if (name.includes('exa')) return 'Exa';
  
  return 'Manual/Other';
}

// Performance classification
function classifyPerformance(bookingRate, leadCount) {
  if (leadCount < 5) return { status: 'insufficient_data', color: '⚪', label: 'Too Few Leads' };
  if (bookingRate >= 25) return { status: 'excellent', color: '🟢', label: 'SCALE IT' };
  if (bookingRate >= 15) return { status: 'good', color: '🟡', label: 'Good - Optimize' };
  if (bookingRate >= 5) return { status: 'weak', color: '🟠', label: 'Weak - Review' };
  return { status: 'failing', color: '🔴', label: 'FAILING - Kill/Fix' };
}

// Diagnosis reasons
function diagnose(campaign) {
  const reasons = [];
  const recommendations = [];
  
  const bookingRate = campaign.booked / campaign.leads * 100;
  const vertical = detectVertical(campaign.name);
  const source = detectSource(campaign.name);
  
  // Sample size issues
  if (campaign.leads < 5) {
    reasons.push('Sample too small (<5 leads) for reliable conclusions');
    recommendations.push('Add more leads before judging');
  }
  
  // Zero booking analysis
  if (campaign.booked === 0 && campaign.leads >= 5) {
    reasons.push('Zero bookings despite sufficient volume');
    
    // Vertical-specific insights
    if (vertical === 'Crypto') {
      reasons.push('Crypto vertical historically underperforms (regulatory, budget cycles)');
      recommendations.push('Consider pausing crypto outreach or narrowing to funded projects');
    }
    if (vertical === 'Lifestyle') {
      reasons.push('Lifestyle brands often have smaller budgets, longer sales cycles');
      recommendations.push('Test higher-touch approach or larger lifestyle brands only');
    }
    if (vertical === 'AI') {
      reasons.push('AI space crowded - may need differentiated pitch');
      recommendations.push('Focus on AI companies with proven revenue, not just funding');
    }
    
    // Generic zero-booking recommendations
    if (recommendations.length === 0) {
      recommendations.push('Review email copy for this segment');
      recommendations.push('Check if leads are decision-makers');
      recommendations.push('Consider killing campaign if no improvement in 30 days');
    }
  }
  
  // Low conversion analysis
  if (bookingRate > 0 && bookingRate < 10 && campaign.leads >= 10) {
    reasons.push('Low conversion despite volume');
    recommendations.push('A/B test subject lines');
    recommendations.push('Check lead quality (company size, role)');
  }
  
  // High performers
  if (bookingRate >= 25 && campaign.leads >= 5) {
    reasons.push('Strong performer - this is working');
    recommendations.push('SCALE: Add more leads to this campaign');
    recommendations.push('Clone this approach for similar verticals');
  }
  
  // Reactivation insight
  if (source === 'Reactivation' && bookingRate >= 20) {
    reasons.push('Reactivation campaigns outperforming cold outreach');
    recommendations.push('Prioritize reactivation over new cold lists');
  }
  
  return { reasons, recommendations, vertical, source };
}

async function getCampaignData() {
  // Get from all_replies grouped by campaign
  const { data, error } = await supabase
    .from('all_replies')
    .select('campaign_name, lead_email, reply_category');
  
  if (error) {
    console.error('Error:', error.message);
    return [];
  }
  
  // Get curated_leads for booking status
  const { data: curatedData } = await supabase
    .from('curated_leads')
    .select('email, status');
  
  // Build set of booked emails
  const bookedEmails = new Set(
    (curatedData || [])
      .filter(row => row.status === 'Booked')
      .map(row => row.email)
  );
  
  // Group by campaign, track positive replies and bookings
  const campaigns = {};
  const positiveCategories = ['Interested', 'Meeting Request', 'Information Request'];
  
  for (const row of (data || [])) {
    const name = row.campaign_name || 'Unknown';
    if (!campaigns[name]) {
      campaigns[name] = { name, leads: 0, booked: 0 };
    }
    
    // Only count positive replies
    if (positiveCategories.includes(row.reply_category)) {
      campaigns[name].leads++;
      // Check if this lead actually booked
      if (bookedEmails.has(row.lead_email)) {
        campaigns[name].booked++;
      }
    }
  }
  
  return Object.values(campaigns).filter(c => c.leads > 0);
}

function showDiagnosis(campaigns, filter = null) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔬 CAMPAIGN DIAGNOSIS                                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  // Sort by booking rate (failing first if filter is failing)
  let sorted = campaigns
    .map(c => ({
      ...c,
      bookingRate: c.leads > 0 ? (c.booked / c.leads * 100) : 0,
      ...classifyPerformance(c.leads > 0 ? (c.booked / c.leads * 100) : 0, c.leads),
      ...diagnose(c)
    }))
    .sort((a, b) => {
      // Sort by status priority, then by lead count
      const statusOrder = { failing: 0, weak: 1, good: 2, excellent: 3, insufficient_data: 4 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return b.leads - a.leads;
    });
  
  // Apply filters
  if (filter === 'failing') {
    sorted = sorted.filter(c => c.status === 'failing' || c.status === 'weak');
  } else if (filter === 'winners') {
    sorted = sorted.filter(c => c.status === 'excellent' || c.status === 'good');
  }
  
  // Summary stats
  const failing = campaigns.filter(c => c.leads >= 5 && (c.booked / c.leads * 100) < 5).length;
  const winning = campaigns.filter(c => c.leads >= 5 && (c.booked / c.leads * 100) >= 20).length;
  
  console.log('📊 OVERVIEW');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Campaigns: ${campaigns.length}`);
  console.log(`  🔴 Failing (<5% booking): ${failing}`);
  console.log(`  🟢 Winning (>20% booking): ${winning}`);
  console.log('');
  
  // Detailed diagnosis for each
  console.log('🔬 CAMPAIGN-BY-CAMPAIGN DIAGNOSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  for (const campaign of sorted) {
    const name = campaign.name.length > 40 ? campaign.name.substring(0, 40) + '...' : campaign.name;
    
    console.log(`${campaign.color} ${name}`);
    console.log(`   ${campaign.leads} leads | ${campaign.booked} booked | ${campaign.bookingRate.toFixed(1)}% | ${campaign.label}`);
    console.log(`   Vertical: ${campaign.vertical} | Source: ${campaign.source}`);
    
    if (campaign.reasons.length > 0) {
      console.log('   📋 Diagnosis:');
      campaign.reasons.forEach(r => console.log(`      • ${r}`));
    }
    
    if (campaign.recommendations.length > 0) {
      console.log('   💡 Recommendations:');
      campaign.recommendations.forEach(r => console.log(`      → ${r}`));
    }
    
    console.log('');
  }
}

function showVerticalAnalysis(campaigns) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 VERTICAL PERFORMANCE ANALYSIS                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  // Group by vertical
  const verticals = {};
  for (const c of campaigns) {
    const v = detectVertical(c.name);
    if (!verticals[v]) {
      verticals[v] = { leads: 0, booked: 0, campaigns: 0 };
    }
    verticals[v].leads += c.leads;
    verticals[v].booked += c.booked;
    verticals[v].campaigns++;
  }
  
  // Sort by booking rate
  const sorted = Object.entries(verticals)
    .map(([name, stats]) => ({
      name,
      ...stats,
      bookingRate: stats.leads > 0 ? (stats.booked / stats.leads * 100) : 0
    }))
    .sort((a, b) => b.bookingRate - a.bookingRate);
  
  console.log('Vertical'.padEnd(15) + 'Leads'.padStart(8) + 'Booked'.padStart(8) + 'Rate'.padStart(8) + '  Verdict');
  console.log('━'.repeat(55));
  
  for (const v of sorted) {
    const verdict = v.bookingRate >= 20 ? '🟢 SCALE' : v.bookingRate >= 10 ? '🟡 OK' : v.bookingRate > 0 ? '🟠 WEAK' : '🔴 KILL';
    console.log(
      `${v.name.padEnd(15)}${v.leads.toString().padStart(8)}${v.booked.toString().padStart(8)}${v.bookingRate.toFixed(1).padStart(7)}%  ${verdict}`
    );
  }
  
  console.log('━'.repeat(55));
  
  // Key insights
  console.log('\n💡 KEY INSIGHTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const topVertical = sorted.find(v => v.leads >= 5 && v.bookingRate > 0);
  const worstVertical = [...sorted].reverse().find(v => v.leads >= 5);
  
  if (topVertical) {
    console.log(`  🏆 Best: ${topVertical.name} (${topVertical.bookingRate.toFixed(1)}% booking)`);
    console.log(`     → Double down on ${topVertical.name} leads`);
  }
  
  if (worstVertical && worstVertical.bookingRate < 5) {
    console.log(`  ⚠️ Worst: ${worstVertical.name} (${worstVertical.bookingRate.toFixed(1)}% booking)`);
    console.log(`     → Consider pausing ${worstVertical.name} campaigns`);
  }
  
  const reactivation = sorted.find(v => v.name === 'Reactivation');
  if (reactivation && reactivation.bookingRate > 20) {
    console.log(`  🔄 Reactivation outperforming cold (${reactivation.bookingRate.toFixed(1)}%)`);
    console.log(`     → Prioritize re-hitting old leads over new lists`);
  }
  
  console.log('');
}

function showRecommendations(campaigns) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  💡 ACTION RECOMMENDATIONS                                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  const actions = {
    scale: [],
    optimize: [],
    review: [],
    kill: []
  };
  
  for (const c of campaigns) {
    const bookingRate = c.leads > 0 ? (c.booked / c.leads * 100) : 0;
    const vertical = detectVertical(c.name);
    
    if (c.leads < 5) continue; // Skip insufficient data
    
    if (bookingRate >= 20) {
      actions.scale.push({ name: c.name, rate: bookingRate, vertical, leads: c.leads });
    } else if (bookingRate >= 10) {
      actions.optimize.push({ name: c.name, rate: bookingRate, vertical, leads: c.leads });
    } else if (bookingRate >= 5) {
      actions.review.push({ name: c.name, rate: bookingRate, vertical, leads: c.leads });
    } else {
      actions.kill.push({ name: c.name, rate: bookingRate, vertical, leads: c.leads });
    }
  }
  
  console.log('🚀 SCALE THESE (>20% booking)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (actions.scale.length === 0) {
    console.log('  No campaigns at scale-ready performance yet');
  } else {
    actions.scale.forEach(c => {
      console.log(`  ✅ ${c.name.substring(0, 35)}`);
      console.log(`     ${c.rate.toFixed(1)}% booking | ${c.vertical} | Add more ${c.vertical} leads`);
    });
  }
  
  console.log('\n🟡 OPTIMIZE THESE (10-20% booking)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (actions.optimize.length === 0) {
    console.log('  No campaigns in optimization range');
  } else {
    actions.optimize.forEach(c => {
      console.log(`  📝 ${c.name.substring(0, 35)}`);
      console.log(`     ${c.rate.toFixed(1)}% | A/B test subject lines, tighten targeting`);
    });
  }
  
  console.log('\n🟠 REVIEW THESE (5-10% booking)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (actions.review.length === 0) {
    console.log('  No campaigns need review');
  } else {
    actions.review.forEach(c => {
      console.log(`  ⚠️ ${c.name.substring(0, 35)}`);
      console.log(`     ${c.rate.toFixed(1)}% | Review lead quality, consider pausing`);
    });
  }
  
  console.log('\n🔴 KILL OR FIX THESE (<5% booking)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (actions.kill.length === 0) {
    console.log('  No failing campaigns');
  } else {
    actions.kill.forEach(c => {
      console.log(`  ❌ ${c.name.substring(0, 35)}`);
      console.log(`     ${c.rate.toFixed(1)}% (${c.leads} leads) | ${c.vertical}`);
      console.log(`     → Pause campaign, analyze why ${c.vertical} isn't converting`);
    });
  }
  
  // Bottom line
  console.log('\n📌 BOTTOM LINE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Scale: ${actions.scale.length} campaigns | Optimize: ${actions.optimize.length}`);
  console.log(`  Review: ${actions.review.length} | Kill: ${actions.kill.length}`);
  
  if (actions.kill.length > actions.scale.length) {
    console.log('\n  ⚠️ More campaigns failing than scaling. Focus on:');
    console.log('     1. Kill underperformers to free up domain reputation');
    console.log('     2. Double down on what works (reactivation, specific verticals)');
    console.log('     3. Per Eric: Volume > Copy - add leads to winning campaigns');
  }
  
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  
  const showFailing = args.includes('--failing');
  const showWinners = args.includes('--winners');
  const showVertical = args.includes('--vertical');
  const showRecommend = args.includes('--recommend');
  
  console.log('[Supabase] Loading campaign data...');
  const campaigns = await getCampaignData();
  
  if (campaigns.length === 0) {
    console.log('\n⚠️ No campaign data found.');
    return;
  }
  
  if (showVertical) {
    showVerticalAnalysis(campaigns);
    return;
  }
  
  if (showRecommend) {
    showRecommendations(campaigns);
    return;
  }
  
  const filter = showFailing ? 'failing' : showWinners ? 'winners' : null;
  showDiagnosis(campaigns, filter);
}

main().catch(console.error);
