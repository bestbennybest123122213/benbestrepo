#!/usr/bin/env node
/**
 * Lead Scorecard
 * 
 * Generate a detailed scorecard for any lead:
 * - Profile summary
 * - Scoring breakdown
 * - Recommended actions
 * - Similar leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function generateScorecard(email) {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  // Find the lead
  const { data: lead, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (error || !lead) {
    console.log(`\n❌ Lead not found: ${email}\n`);
    return;
  }

  const info = getCompanyInfo(email);
  const now = Date.now();
  const age = lead.replied_at 
    ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Calculate scores
  let totalScore = 0;
  const scores = [];

  // Category score
  if (lead.reply_category === 'Meeting Request') {
    scores.push({ name: 'Meeting Request', score: 40, max: 40 });
    totalScore += 40;
  } else if (lead.reply_category === 'Interested') {
    scores.push({ name: 'Interested', score: 30, max: 40 });
    totalScore += 30;
  } else {
    scores.push({ name: 'Info Request', score: 20, max: 40 });
    totalScore += 20;
  }

  // Tier score
  if (info?.tier === 'enterprise') {
    scores.push({ name: 'Enterprise Company', score: 30, max: 30 });
    totalScore += 30;
  } else if (info?.tier === 'mid-market') {
    scores.push({ name: 'Mid-Market', score: 20, max: 30 });
    totalScore += 20;
  } else {
    scores.push({ name: 'SMB', score: 10, max: 30 });
    totalScore += 10;
  }

  // Freshness score
  if (age <= 3) {
    scores.push({ name: 'Fresh (0-3 days)', score: 20, max: 20 });
    totalScore += 20;
  } else if (age <= 7) {
    scores.push({ name: 'Recent (4-7 days)', score: 15, max: 20 });
    totalScore += 15;
  } else if (age <= 14) {
    scores.push({ name: 'Aging (8-14 days)', score: 10, max: 20 });
    totalScore += 10;
  } else {
    scores.push({ name: 'Stale (15+ days)', score: 0, max: 20 });
  }

  // Funding score
  if (info?.funding) {
    scores.push({ name: 'Has Funding Data', score: 10, max: 10 });
    totalScore += 10;
  }

  const maxScore = 100;
  const grade = totalScore >= 80 ? 'A' : totalScore >= 60 ? 'B' : totalScore >= 40 ? 'C' : 'D';

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📋 LEAD SCORECARD                                                       ║
╚══════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Name:        ${lead.lead_name || 'N/A'}
  Email:       ${lead.lead_email}
  Company:     ${info?.name || lead.lead_company || 'N/A'}
  Tier:        ${info?.tier || 'Unknown'}
  Category:    ${lead.reply_category}
  Age:         ${age} days
  ${info?.funding ? `Funding:     ${info.funding}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SCORE: ${totalScore}/${maxScore} (Grade: ${grade})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  scores.forEach(s => {
    const filled = Math.floor((s.score / s.max) * 20);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    console.log(`  ${s.name.padEnd(22)} ${bar} ${s.score}/${s.max}`);
  });

  // Recommended action
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RECOMMENDED ACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  if (lead.reply_category === 'Booked') {
    console.log('  ✅ Already booked! Prepare for the meeting.');
    console.log(`     Run: node gex.js prep ${email}`);
  } else if (lead.reply_category === 'Meeting Request') {
    console.log('  📅 Send calendar link immediately!');
    console.log('     This lead wants to meet - don\'t let them wait.');
    console.log(`     Run: node gex.js calendar`);
  } else if (age > 14) {
    console.log('  ⚠️  This lead is going stale. Send a reactivation email.');
    console.log(`     Run: node email-templates.js reactivation`);
  } else {
    console.log('  📧 Send a follow-up email to move this forward.');
    console.log(`     Run: node email-templates.js first_followup`);
  }

  // Get similar leads
  const { data: allLeads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .neq('lead_email', email);

  if (allLeads) {
    const similar = allLeads
      .filter(l => {
        const lInfo = getCompanyInfo(l.lead_email);
        return lInfo?.tier === info?.tier || l.reply_category === lead.reply_category;
      })
      .slice(0, 3);

    if (similar.length > 0) {
      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 SIMILAR LEADS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
      similar.forEach(l => {
        const lInfo = getCompanyInfo(l.lead_email);
        console.log(`  • ${l.lead_name || 'N/A'} @ ${lInfo?.name || 'N/A'} (${l.reply_category})`);
      });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.log('Usage: node lead-scorecard.js <email>');
    console.log('Example: node lead-scorecard.js nick.depalo@unity.com');
    return;
  }

  await generateScorecard(email);
}

module.exports = { generateScorecard };

if (require.main === module) {
  main().catch(console.error);
}
