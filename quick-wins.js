#!/usr/bin/env node
/**
 * Quick Wins Finder
 * 
 * Identifies the easiest leads to convert:
 * - Meeting requests from enterprise companies
 * - Fresh interested leads
 * - Follow-up ready leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function findQuickWins() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Score each lead for "quick win" potential
  const scored = leads.map(l => {
    const info = getCompanyInfo(l.lead_email);
    const age = getAge(l);
    
    let score = 0;
    let reasons = [];
    
    // Meeting requests are closest to conversion
    if (l.reply_category === 'Meeting Request') {
      score += 40;
      reasons.push('Meeting request');
    } else if (l.reply_category === 'Interested') {
      score += 30;
      reasons.push('Interested');
    }
    
    // Enterprise = high value
    if (info?.tier === 'enterprise') {
      score += 25;
      reasons.push('Enterprise');
    }
    
    // Fresh leads are easier
    if (age <= 3) {
      score += 25;
      reasons.push('Fresh (≤3d)');
    } else if (age <= 7) {
      score += 15;
      reasons.push('Recent (≤7d)');
    } else if (age > 14) {
      score -= 10;
      reasons.push('Stale');
    }
    
    // Has funding data suggests research was done
    if (info?.funding) {
      score += 5;
      reasons.push('Funded');
    }
    
    return {
      ...l,
      score,
      reasons,
      company: info?.name || l.lead_company,
      tier: info?.tier,
      age
    };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎯 QUICK WINS FINDER                                                    ║
║  Leads most likely to convert with minimal effort                        ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Top 15 quick wins
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 TOP 15 QUICK WINS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  scored.slice(0, 15).forEach((l, i) => {
    const scoreBar = '█'.repeat(Math.floor(l.score / 10)) + '░'.repeat(10 - Math.floor(l.score / 10));
    console.log(`  ${(i + 1).toString().padStart(2)}. ${scoreBar} ${l.score.toString().padStart(3)} pts`);
    console.log(`      ${l.lead_name || 'N/A'} @ ${l.company || 'N/A'}`);
    console.log(`      ${l.lead_email}`);
    console.log(`      ${l.reasons.join(' • ')} (${l.age}d old)`);
    console.log('');
  });

  // Breakdown by type
  const meetingQuickWins = scored.filter(l => l.reply_category === 'Meeting Request' && l.score >= 50);
  const enterpriseQuickWins = scored.filter(l => l.tier === 'enterprise' && l.score >= 40);
  const freshQuickWins = scored.filter(l => l.age <= 3);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 QUICK WIN BREAKDOWN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  📅 Meeting Requests (50+ pts):  ${meetingQuickWins.length}`);
  console.log(`  🏢 Enterprise (40+ pts):        ${enterpriseQuickWins.length}`);
  console.log(`  🔥 Fresh leads (≤3 days):       ${freshQuickWins.length}`);

  // Action plan
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SUGGESTED ACTION PLAN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const topWins = scored.slice(0, 5);
  topWins.forEach((l, i) => {
    const action = l.reply_category === 'Meeting Request' 
      ? 'Send calendar link' 
      : 'Send follow-up email';
    console.log(`  ${i + 1}. ${action}: ${l.lead_name || l.lead_email}`);
  });

  console.log(`\n  ⏱️  Estimated time: ${topWins.length * 3} minutes`);
  console.log(`  📈 Expected conversions: ${Math.ceil(topWins.length * 0.3)} (30% rate)`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');

  return scored.slice(0, 15);
}

module.exports = { findQuickWins };

if (require.main === module) {
  findQuickWins().catch(console.error);
}
