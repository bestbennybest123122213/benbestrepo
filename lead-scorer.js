#!/usr/bin/env node
/**
 * Lead Quality Scorer
 * 
 * Analyzes leads and assigns quality scores based on multiple factors.
 * Helps prioritize which leads are worth pursuing.
 * 
 * Scoring factors:
 * - Company size (enterprise vs startup)
 * - Response category (meeting request vs info request)
 * - Recency (how fresh)
 * - Engagement signals
 * - Industry/vertical fit
 * 
 * Usage:
 *   node lead-scorer.js              # Show all scored leads
 *   node lead-scorer.js top          # Top 20 by score
 *   node lead-scorer.js qualify      # Show A/B/C/D grades
 *   node lead-scorer.js unqualified  # Leads to deprioritize
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const VIEW = args[0] || 'top';

// Scoring weights
const WEIGHTS = {
  // Company Size (max 30)
  enterprise: 30,
  midmarket: 20,
  smb: 10,
  startup: 5,
  unknown: 0,
  
  // Response Category (max 25)
  'Booked': 25,
  'Meeting Request': 20,
  'Interested': 15,
  'Information Request': 10,
  
  // Recency (max 25)
  hot: 25,      // 0-3 days
  warm: 20,     // 4-7 days
  cool: 10,     // 8-14 days
  stale: 5,     // 15-30 days
  cold: 0,      // 30+ days
  
  // Funding (max 20)
  bigFunding: 20,    // >$100M
  mediumFunding: 15, // $10M-$100M
  smallFunding: 10,  // $1M-$10M
  noFunding: 0
};

// Grade thresholds
const GRADES = {
  A: 70, // Hot prospects
  B: 50, // Good prospects
  C: 30, // Average
  D: 15, // Low priority
  F: 0   // Deprioritize
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  // Score all leads
  const scoredLeads = leads.map(lead => ({
    ...lead,
    ...calculateScore(lead)
  })).sort((a, b) => b.score - a.score);

  switch (VIEW) {
    case 'top':
      showTop(scoredLeads);
      break;
    case 'qualify':
      showByGrade(scoredLeads);
      break;
    case 'unqualified':
      showUnqualified(scoredLeads);
      break;
    default:
      showTop(scoredLeads);
  }
}

function calculateScore(lead) {
  let score = 0;
  const breakdown = {};

  // Company size score
  const size = lead.company_size || 'unknown';
  const sizeScore = WEIGHTS[size] || 0;
  score += sizeScore;
  breakdown.size = sizeScore;

  // Category score
  const category = lead.reply_category || 'Information Request';
  const categoryScore = WEIGHTS[category] || 0;
  score += categoryScore;
  breakdown.category = categoryScore;

  // Recency score
  const age = getAgeDays(lead.replied_at);
  let recencyScore = 0;
  if (age <= 3) recencyScore = WEIGHTS.hot;
  else if (age <= 7) recencyScore = WEIGHTS.warm;
  else if (age <= 14) recencyScore = WEIGHTS.cool;
  else if (age <= 30) recencyScore = WEIGHTS.stale;
  else recencyScore = WEIGHTS.cold;
  score += recencyScore;
  breakdown.recency = recencyScore;

  // Funding score
  const funding = lead.funding_amount || 0;
  let fundingScore = 0;
  if (funding > 100000000) fundingScore = WEIGHTS.bigFunding;
  else if (funding > 10000000) fundingScore = WEIGHTS.mediumFunding;
  else if (funding > 1000000) fundingScore = WEIGHTS.smallFunding;
  score += fundingScore;
  breakdown.funding = fundingScore;

  // Determine grade
  let grade = 'F';
  if (score >= GRADES.A) grade = 'A';
  else if (score >= GRADES.B) grade = 'B';
  else if (score >= GRADES.C) grade = 'C';
  else if (score >= GRADES.D) grade = 'D';

  return { score, grade, breakdown };
}

function showTop(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎯 LEAD QUALITY SCORER                                                  ║
║  Top ${Math.min(20, leads.length)} leads by quality score                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  # | Name                    | Company              | Score | Grade');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  leads.slice(0, 20).forEach((l, i) => {
    const rank = (i + 1).toString().padStart(2);
    const name = (l.lead_name || 'Unknown').slice(0, 22).padEnd(22);
    const company = (l.lead_company || 'Unknown').slice(0, 18).padEnd(18);
    const gradeEmoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '⚫' }[l.grade];
    console.log(`  ${rank} | ${name} | ${company} | ${l.score.toString().padStart(5)} | ${gradeEmoji} ${l.grade}`);
  });

  console.log('');

  // Summary stats
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  leads.forEach(l => grades[l.grade]++);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 GRADE DISTRIBUTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  🟢 A (70+): ${grades.A} leads - Hot prospects`);
  console.log(`  🟡 B (50+): ${grades.B} leads - Good prospects`);
  console.log(`  🟠 C (30+): ${grades.C} leads - Average`);
  console.log(`  🔴 D (15+): ${grades.D} leads - Low priority`);
  console.log(`  ⚫ F (<15): ${grades.F} leads - Deprioritize`);
  console.log('');
}

function showByGrade(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 LEADS BY QUALITY GRADE                                               ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const byGrade = { A: [], B: [], C: [], D: [], F: [] };
  leads.forEach(l => byGrade[l.grade].push(l));

  Object.entries(byGrade).forEach(([grade, gradeLeads]) => {
    const emoji = { A: '🟢', B: '🟡', C: '🟠', D: '🔴', F: '⚫' }[grade];
    const desc = { A: 'Hot Prospects', B: 'Good Prospects', C: 'Average', D: 'Low Priority', F: 'Deprioritize' }[grade];
    
    console.log(`\n${emoji} GRADE ${grade} - ${desc} (${gradeLeads.length} leads)`);
    console.log('─'.repeat(60));
    
    if (gradeLeads.length === 0) {
      console.log('  (none)');
    } else {
      gradeLeads.slice(0, 5).forEach(l => {
        const age = getAgeDays(l.replied_at);
        console.log(`  ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
        console.log(`    ${l.reply_category} | ${age}d | Score: ${l.score}`);
      });
      if (gradeLeads.length > 5) {
        console.log(`  ... and ${gradeLeads.length - 5} more`);
      }
    }
  });
  console.log('');
}

function showUnqualified(leads) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚫ UNQUALIFIED LEADS (Grade D/F)                                        ║
║  Consider deprioritizing these                                           ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const unqualified = leads.filter(l => l.grade === 'D' || l.grade === 'F');
  
  if (unqualified.length === 0) {
    console.log('  ✅ No unqualified leads!\n');
    return;
  }

  console.log(`  Found ${unqualified.length} leads to potentially deprioritize:\n`);

  unqualified.slice(0, 15).forEach(l => {
    const age = getAgeDays(l.replied_at);
    console.log(`  ⚫ ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
    console.log(`     ${l.reply_category} | ${age}d old | Score: ${l.score}`);
    console.log(`     Reason: ${getDeprioritizeReason(l)}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 Consider archiving these or moving to a low-priority sequence');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function getDeprioritizeReason(lead) {
  const reasons = [];
  const age = getAgeDays(lead.replied_at);
  
  if (age > 30) reasons.push('Very old lead');
  if (!lead.company_size) reasons.push('Unknown company size');
  if (lead.reply_category === 'Information Request') reasons.push('Only info request');
  if (!lead.lead_company) reasons.push('Unknown company');
  
  return reasons.length > 0 ? reasons.join(', ') : 'Low overall score';
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
