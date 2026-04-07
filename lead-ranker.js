#!/usr/bin/env node
/**
 * Lead Ranker - AI-powered lead prioritization
 * 
 * Scores leads based on:
 * - Company tier (enterprise > midmarket > startup)
 * - Reply category (booked > meeting > interested > info)
 * - Freshness (newer = higher)
 * - Industry fit (gaming/tech = higher)
 * - Funding status
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo, COMPANY_DATA } = require('./lead-enrichment');

// Scoring weights
const WEIGHTS = {
  tier: {
    enterprise: 50,
    midmarket: 30,
    startup: 15,
    unknown: 10
  },
  category: {
    'Booked': 100, // Already won
    'Meeting Request': 80,
    'Interested': 50,
    'Information Request': 30
  },
  industry: {
    'Gaming': 25,
    'Gaming/Technology': 25,
    'Gaming Media': 20,
    'EdTech': 15,
    'FinTech': 15,
    'Technology': 15,
    'Developer Tools': 15,
    'default': 5
  },
  freshness: {
    // days -> points
    0: 50, 1: 45, 2: 40, 3: 35, 7: 25, 14: 15, 30: 5, 60: -10
  }
};

function calculateScore(lead) {
  const companyInfo = getCompanyInfo(lead.lead_email);
  let score = 0;
  const breakdown = {};

  // 1. Company tier
  const tier = companyInfo?.tier || 'unknown';
  const tierScore = WEIGHTS.tier[tier] || WEIGHTS.tier.unknown;
  score += tierScore;
  breakdown.tier = { value: tier, points: tierScore };

  // 2. Reply category
  const category = lead.reply_category || 'Information Request';
  const categoryScore = WEIGHTS.category[category] || 20;
  score += categoryScore;
  breakdown.category = { value: category, points: categoryScore };

  // 3. Industry fit
  const industry = companyInfo?.industry || 'default';
  const industryScore = WEIGHTS.industry[industry] || WEIGHTS.industry.default;
  score += industryScore;
  breakdown.industry = { value: industry, points: industryScore };

  // 4. Freshness
  const age = lead.replied_at 
    ? Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  
  let freshnessScore = 0;
  if (age <= 0) freshnessScore = WEIGHTS.freshness[0];
  else if (age <= 1) freshnessScore = WEIGHTS.freshness[1];
  else if (age <= 2) freshnessScore = WEIGHTS.freshness[2];
  else if (age <= 3) freshnessScore = WEIGHTS.freshness[3];
  else if (age <= 7) freshnessScore = WEIGHTS.freshness[7];
  else if (age <= 14) freshnessScore = WEIGHTS.freshness[14];
  else if (age <= 30) freshnessScore = WEIGHTS.freshness[30];
  else freshnessScore = WEIGHTS.freshness[60];
  
  score += freshnessScore;
  breakdown.freshness = { value: age + ' days', points: freshnessScore };

  // 5. Funding bonus
  if (companyInfo?.funding) {
    const fundingMatch = companyInfo.funding.match(/\$(\d+)/);
    if (fundingMatch) {
      const millions = parseInt(fundingMatch[1]);
      const fundingBonus = Math.min(25, Math.floor(millions / 20));
      score += fundingBonus;
      breakdown.funding = { value: companyInfo.funding, points: fundingBonus };
    } else if (companyInfo.funding === 'Public') {
      score += 20;
      breakdown.funding = { value: 'Public', points: 20 };
    }
  }

  return { score, breakdown, companyInfo };
}

async function rankLeads() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log('🎯 Ranking all leads...\n');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Score all leads
  const rankedLeads = leads.map(lead => {
    const { score, breakdown, companyInfo } = calculateScore(lead);
    return {
      ...lead,
      score,
      breakdown,
      companyInfo
    };
  }).sort((a, b) => b.score - a.score);

  // Output top 20
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🏆 TOP 20 LEADS BY SCORE');
  console.log('════════════════════════════════════════════════════════════════\n');

  for (let i = 0; i < Math.min(20, rankedLeads.length); i++) {
    const lead = rankedLeads[i];
    const rank = (i + 1).toString().padStart(2, ' ');
    const emoji = i < 3 ? ['🥇', '🥈', '🥉'][i] : '  ';
    
    console.log(`${emoji} #${rank} | Score: ${lead.score.toString().padStart(3)} | ${lead.lead_name || 'N/A'}`);
    console.log(`       ${lead.companyInfo?.name || lead.lead_company || 'Unknown'} (${lead.companyInfo?.tier || 'unknown'})`);
    console.log(`       📧 ${lead.lead_email}`);
    console.log(`       📊 ${lead.reply_category} | ⏰ ${lead.breakdown.freshness.value}`);
    
    if (lead.companyInfo?.funding) {
      console.log(`       💰 ${lead.companyInfo.funding}`);
    }
    console.log('');
  }

  // Score distribution
  console.log('════════════════════════════════════════════════════════════════');
  console.log('📊 SCORE DISTRIBUTION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const tiers = {
    hot: rankedLeads.filter(l => l.score >= 150),
    warm: rankedLeads.filter(l => l.score >= 100 && l.score < 150),
    cool: rankedLeads.filter(l => l.score >= 50 && l.score < 100),
    cold: rankedLeads.filter(l => l.score < 50)
  };

  console.log(`  🔥 HOT (150+):   ${tiers.hot.length} leads - respond TODAY`);
  console.log(`  🌡️  WARM (100-149): ${tiers.warm.length} leads - respond within 48h`);
  console.log(`  ❄️  COOL (50-99):  ${tiers.cool.length} leads - batch follow-up`);
  console.log(`  🧊 COLD (<50):   ${tiers.cold.length} leads - low priority`);
  console.log('');

  // Quick action list
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🎯 IMMEDIATE ACTIONS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const hotUnbooked = tiers.hot.filter(l => l.reply_category !== 'Booked');
  if (hotUnbooked.length > 0) {
    console.log('Contact these HOT leads now:\n');
    for (const lead of hotUnbooked.slice(0, 5)) {
      console.log(`  node smart-meeting-prep.js ${lead.lead_email}`);
    }
  }

  console.log('\n');

  // Save ranked data
  const fs = require('fs');
  fs.writeFileSync('ranked-leads.json', JSON.stringify({
    generated: new Date().toISOString(),
    totalLeads: rankedLeads.length,
    distribution: {
      hot: tiers.hot.length,
      warm: tiers.warm.length,
      cool: tiers.cool.length,
      cold: tiers.cold.length
    },
    leads: rankedLeads
  }, null, 2));
  console.log('Saved to ranked-leads.json\n');

  return rankedLeads;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🎯 LEAD RANKER - AI-Powered Prioritization                         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  try {
    await rankLeads();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { calculateScore, rankLeads, WEIGHTS };

if (require.main === module) {
  main();
}
