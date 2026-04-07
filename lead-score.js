#!/usr/bin/env node
/**
 * Lead Scoring Model
 * Auto-rank leads by close probability
 * 
 * Factors:
 * - Category (Interested > Meeting Request > Info Request)
 * - Response time (faster = higher score)
 * - Company tier (funded/enterprise = higher)
 * - Vertical match (gaming/edtech = proven verticals)
 * - Age (newer = higher)
 * 
 * Usage:
 *   node lead-score.js              # Score all active leads
 *   node lead-score.js top 10       # Top 10 by score
 *   node lead-score.js analyze      # Scoring breakdown
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Scoring weights
const CATEGORY_SCORES = {
  'Interested': 40,
  'Meeting Request': 35,
  'Information Request': 25,
  'Demo Request': 30,
  'Pricing Request': 28
};

// Vertical scores based on actual campaign performance data (Feb 2026)
// Education: 67% positive, Apps: 45%, Crypto: 40%, Gaming: 22%, AI/Tech: 14%
const VERTICAL_SCORES = {
  'edtech': 20,      // 66.7% positive rate - highest performer
  'education': 20,   // alias
  'apps': 15,        // 45% positive rate
  'crypto': 12,      // 40% positive rate
  'gaming': 8,       // 22% positive rate (lower than expected)
  'tech': 5,         // 14% positive rate - lowest
  'consumer': 10,
  'finance': 8,
  'other': 6
};

// Keywords that indicate high-value companies
const HIGH_VALUE_KEYWORDS = [
  'studios', 'games', 'gaming', 'ai', 'tech', 'app', 
  'mobile', 'entertainment', 'media', 'digital'
];

const FUNDED_INDICATORS = [
  'series', 'venture', 'capital', 'funded', 'raised',
  'unicorn', 'ipo', 'nasdaq', 'nyse'
];

function detectVertical(email, company) {
  const text = `${email} ${company}`.toLowerCase();
  
  // Check highest-value verticals first (based on conversion data)
  if (text.match(/edu|learn|school|course|tutor|study|academy|university/)) return 'edtech';
  if (text.match(/crypto|blockchain|web3|nft|defi|token/)) return 'crypto';
  if (text.match(/app|mobile|ios|android|download/)) return 'apps';
  if (text.match(/game|gaming|studio|play|mobile game/)) return 'gaming';
  if (text.match(/ai|tech|software|saas|digital/)) return 'tech';
  if (text.match(/brand|consumer|retail|shop|store/)) return 'consumer';
  if (text.match(/bank|finance|invest|trading/)) return 'finance';
  
  return 'other';
}

function calculateLeadScore(lead) {
  let score = 0;
  const breakdown = {};
  
  // 1. Category score (0-40)
  const categoryScore = CATEGORY_SCORES[lead.reply_category] || 15;
  score += categoryScore;
  breakdown.category = categoryScore;
  
  // 2. Vertical match (0-15)
  const vertical = detectVertical(lead.lead_email || '', lead.lead_company || '');
  const verticalScore = VERTICAL_SCORES[vertical] || 5;
  score += verticalScore;
  breakdown.vertical = verticalScore;
  breakdown.detectedVertical = vertical;
  
  // 3. Age factor (0-20, newer = higher)
  const ageInDays = Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24));
  let ageScore;
  if (ageInDays <= 2) ageScore = 20;
  else if (ageInDays <= 7) ageScore = 15;
  else if (ageInDays <= 14) ageScore = 10;
  else if (ageInDays <= 30) ageScore = 5;
  else ageScore = 0;
  score += ageScore;
  breakdown.age = ageScore;
  breakdown.ageInDays = ageInDays;
  
  // 4. Company quality signals (0-15)
  const companyText = `${lead.lead_company || ''} ${lead.lead_email || ''}`.toLowerCase();
  let companyScore = 0;
  
  // Known company domain bonus
  const domain = (lead.lead_email || '').split('@')[1] || '';
  if (domain && !domain.match(/gmail|yahoo|hotmail|outlook/)) {
    companyScore += 5; // Business email
  }
  
  // High-value keywords
  for (const keyword of HIGH_VALUE_KEYWORDS) {
    if (companyText.includes(keyword)) {
      companyScore += 2;
      break;
    }
  }
  
  // Funded company indicators
  for (const indicator of FUNDED_INDICATORS) {
    if (companyText.includes(indicator)) {
      companyScore += 5;
      break;
    }
  }
  
  companyScore = Math.min(companyScore, 15);
  score += companyScore;
  breakdown.company = companyScore;
  
  // 5. Response behavior (0-10)
  const responseTime = lead.response_time_seconds || 0;
  let responseScore;
  if (responseTime > 0 && responseTime < 3600) responseScore = 10; // Within 1 hour
  else if (responseTime < 86400) responseScore = 7; // Within 1 day
  else responseScore = 3;
  score += responseScore;
  breakdown.response = responseScore;
  
  return {
    ...lead,
    score,
    breakdown,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D'
  };
}

async function getActiveLeads() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data, error } = await supabase
    .from('all_replies')
    .select('*')
    .in('reply_category', ['Interested', 'Meeting Request', 'Information Request', 'Demo Request', 'Pricing Request'])
    .gt('replied_at', thirtyDaysAgo.toISOString())
    .order('replied_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
  
  return data || [];
}

async function scoreLeads(limit = 20) {
  const leads = await getActiveLeads();
  const scored = leads.map(calculateLeadScore).sort((a, b) => b.score - a.score);
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🎯 LEAD SCORING                                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 TOP LEADS BY SCORE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const topLeads = scored.slice(0, limit);
  
  for (let i = 0; i < topLeads.length; i++) {
    const lead = topLeads[i];
    const name = lead.lead_name || 'Unknown';
    const company = lead.lead_company || extractCompany(lead.lead_email);
    const gradeEmoji = lead.grade === 'A' ? '🟢' : lead.grade === 'B' ? '🟡' : lead.grade === 'C' ? '🟠' : '🔴';
    
    console.log(`  ${(i + 1).toString().padStart(2)}. ${gradeEmoji} ${name} @ ${company}`);
    console.log(`      Score: ${lead.score}/100 | ${lead.reply_category} | ${lead.breakdown.ageInDays}d old | ${lead.breakdown.detectedVertical}`);
  }
  
  // Grade distribution
  const grades = { A: 0, B: 0, C: 0, D: 0 };
  for (const lead of scored) {
    grades[lead.grade]++;
  }
  
  console.log('\n📈 GRADE DISTRIBUTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  🟢 A (80-100): ${grades.A} leads - Hot, contact immediately`);
  console.log(`  🟡 B (60-79):  ${grades.B} leads - Warm, prioritize this week`);
  console.log(`  🟠 C (40-59):  ${grades.C} leads - Cool, follow up if time`);
  console.log(`  🔴 D (0-39):   ${grades.D} leads - Cold, reactivation needed`);
  console.log('');
  
  return scored;
}

function extractCompany(email) {
  if (!email) return 'Unknown';
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';
  const company = domain.split('.')[0];
  return company.charAt(0).toUpperCase() + company.slice(1);
}

async function analyzeScoring() {
  const leads = await getActiveLeads();
  const scored = leads.map(calculateLeadScore);
  
  console.log('\n📊 SCORING ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // By category
  const byCategory = {};
  for (const lead of scored) {
    const cat = lead.reply_category;
    if (!byCategory[cat]) byCategory[cat] = { count: 0, totalScore: 0 };
    byCategory[cat].count++;
    byCategory[cat].totalScore += lead.score;
  }
  
  console.log('  BY CATEGORY:');
  for (const [cat, data] of Object.entries(byCategory)) {
    const avgScore = (data.totalScore / data.count).toFixed(1);
    console.log(`    ${cat.padEnd(20)} ${data.count} leads | avg score: ${avgScore}`);
  }
  
  // By vertical
  const byVertical = {};
  for (const lead of scored) {
    const vert = lead.breakdown.detectedVertical;
    if (!byVertical[vert]) byVertical[vert] = { count: 0, totalScore: 0 };
    byVertical[vert].count++;
    byVertical[vert].totalScore += lead.score;
  }
  
  console.log('\n  BY VERTICAL:');
  for (const [vert, data] of Object.entries(byVertical)) {
    const avgScore = (data.totalScore / data.count).toFixed(1);
    console.log(`    ${vert.padEnd(12)} ${data.count} leads | avg score: ${avgScore}`);
  }
  
  // Top opportunities
  const aGrade = scored.filter(l => l.grade === 'A');
  console.log(`\n  🔥 ${aGrade.length} A-grade leads need immediate attention`);
  console.log('');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'list') {
  scoreLeads(20);
} else if (command === 'top') {
  const limit = parseInt(args[1]) || 10;
  scoreLeads(limit);
} else if (command === 'analyze') {
  analyzeScoring();
} else if (command === 'all') {
  scoreLeads(100);
} else {
  console.log(`Unknown command: ${command}`);
  console.log('Commands: list, top <n>, analyze, all');
}
