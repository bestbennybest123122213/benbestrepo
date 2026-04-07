/**
 * Intent Signal Detection
 * Based on Eric Nowoslawski's framework from 239+ videos
 * 
 * Detects buying signals that indicate a lead is more likely to convert:
 * - Hiring signals (marketing roles, influencer/creator roles)
 * - Funding signals (Series A-C, seed, etc.)
 * - Competitor activity (launched creator campaigns)
 * - LinkedIn engagement (posts about growth, audience, Gen Z)
 * - Tech stack signals (marketing automation, analytics)
 */

// Vertical scoring based on BY Influence proven results
const VERTICAL_SCORES = {
  'gaming': 15,           // Highest converting vertical
  'mobile_games': 15,
  'mobile_gaming': 15,
  'education': 12,        // EdTech strong vertical
  'edtech': 12,
  'learning': 12,
  'tech': 10,             // Consumer tech
  'consumer_tech': 10,
  'apps': 10,
  'saas': 8,
  'dtc': 8,               // Direct to consumer
  'ecommerce': 6,
  'consumer': 6,
  'finance': 4,
  'fintech': 4,
  'other': 0
};

// Company size scoring (based on campaign budget capacity)
const SIZE_SCORES = {
  'enterprise': 15,       // $100M+ rev - can afford $50K campaigns
  'mid_market': 12,       // $10M-100M - can afford $25K campaigns
  'growth': 8,            // $1M-10M - can afford $15K campaigns
  'startup': 5,           // <$1M - limited budget
  'unknown': 3
};

// Funding signal scoring
const FUNDING_SCORES = {
  'series_c': 15,         // Large budget unlocked
  'series_b': 12,
  'series_a': 10,
  'seed': 5,
  'pre_seed': 3,
  'bootstrapped': 2,
  'unknown': 0
};

// Hiring signal keywords (from job titles/descriptions)
const HIRING_SIGNALS = {
  high: [
    'influencer marketing',
    'creator marketing',
    'youtube marketing',
    'brand partnerships',
    'creator partnerships',
    'influencer partnerships'
  ],
  medium: [
    'social media marketing',
    'content marketing',
    'growth marketing',
    'brand marketing',
    'digital marketing manager'
  ],
  low: [
    'marketing manager',
    'marketing coordinator',
    'social media manager',
    'content creator'
  ]
};

// LinkedIn post keywords that indicate buying intent
const LINKEDIN_KEYWORDS = {
  high: [
    'influencer marketing',
    'creator economy',
    'youtube creators',
    'gen z audience',
    'brand awareness',
    'creator partnerships'
  ],
  medium: [
    'growth challenges',
    'audience engagement',
    'content strategy',
    'brand building',
    'marketing budget'
  ],
  low: [
    'marketing',
    'social media',
    'content',
    'audience'
  ]
};

/**
 * Detect vertical from company data
 */
function detectVertical(company) {
  const text = [
    company.industry || '',
    company.description || '',
    company.name || ''
  ].join(' ').toLowerCase();
  
  if (text.match(/game|gaming|mobile game|app store|play store/)) return 'gaming';
  if (text.match(/education|learning|edtech|course|tutoring|school/)) return 'education';
  if (text.match(/software|saas|platform|api|developer/)) return 'saas';
  if (text.match(/tech|technology|app|startup/)) return 'tech';
  if (text.match(/ecommerce|e-commerce|shop|store|retail|dtc|direct to consumer/)) return 'dtc';
  if (text.match(/finance|fintech|banking|payment|crypto/)) return 'fintech';
  
  return 'other';
}

/**
 * Detect company size from employee count or revenue
 */
function detectSize(company) {
  const employees = company.employee_count || company.employees || 0;
  const revenue = company.revenue || company.annual_revenue || 0;
  
  // Revenue-based (preferred)
  if (revenue >= 100000000) return 'enterprise';
  if (revenue >= 10000000) return 'mid_market';
  if (revenue >= 1000000) return 'growth';
  if (revenue > 0) return 'startup';
  
  // Employee-based fallback
  if (employees >= 500) return 'enterprise';
  if (employees >= 100) return 'mid_market';
  if (employees >= 20) return 'growth';
  if (employees > 0) return 'startup';
  
  return 'unknown';
}

/**
 * Detect funding stage
 */
function detectFunding(company) {
  const funding = (company.funding_stage || company.latest_funding || '').toLowerCase();
  
  if (funding.includes('series c') || funding.includes('series d')) return 'series_c';
  if (funding.includes('series b')) return 'series_b';
  if (funding.includes('series a')) return 'series_a';
  if (funding.includes('seed')) return 'seed';
  if (funding.includes('pre-seed') || funding.includes('angel')) return 'pre_seed';
  if (funding.includes('bootstrap')) return 'bootstrapped';
  
  return 'unknown';
}

/**
 * Detect hiring signals from job postings
 */
function detectHiringSignal(jobs) {
  if (!jobs || !jobs.length) return { score: 0, signals: [] };
  
  const signals = [];
  let score = 0;
  
  for (const job of jobs) {
    const title = (job.title || '').toLowerCase();
    const desc = (job.description || '').toLowerCase();
    const text = `${title} ${desc}`;
    
    for (const keyword of HIRING_SIGNALS.high) {
      if (text.includes(keyword)) {
        signals.push({ type: 'hiring_high', keyword, job: job.title });
        score += 15;
      }
    }
    for (const keyword of HIRING_SIGNALS.medium) {
      if (text.includes(keyword) && !signals.find(s => s.job === job.title)) {
        signals.push({ type: 'hiring_medium', keyword, job: job.title });
        score += 8;
      }
    }
    for (const keyword of HIRING_SIGNALS.low) {
      if (text.includes(keyword) && !signals.find(s => s.job === job.title)) {
        signals.push({ type: 'hiring_low', keyword, job: job.title });
        score += 3;
      }
    }
  }
  
  return { score: Math.min(score, 25), signals };
}

/**
 * Detect LinkedIn engagement signals
 */
function detectLinkedInSignals(posts) {
  if (!posts || !posts.length) return { score: 0, signals: [] };
  
  const signals = [];
  let score = 0;
  
  for (const post of posts) {
    const text = (post.text || post.content || '').toLowerCase();
    
    for (const keyword of LINKEDIN_KEYWORDS.high) {
      if (text.includes(keyword)) {
        signals.push({ type: 'linkedin_high', keyword, snippet: text.slice(0, 100) });
        score += 10;
      }
    }
    for (const keyword of LINKEDIN_KEYWORDS.medium) {
      if (text.includes(keyword)) {
        signals.push({ type: 'linkedin_medium', keyword });
        score += 5;
      }
    }
  }
  
  return { score: Math.min(score, 20), signals };
}

/**
 * Calculate full intent score for a company/lead
 */
function calculateIntentScore(data) {
  const vertical = detectVertical(data.company || data);
  const size = detectSize(data.company || data);
  const funding = detectFunding(data.company || data);
  const hiring = detectHiringSignal(data.jobs || []);
  const linkedin = detectLinkedInSignals(data.linkedin_posts || []);
  
  const scores = {
    vertical: VERTICAL_SCORES[vertical] || 0,
    size: SIZE_SCORES[size] || 0,
    funding: FUNDING_SCORES[funding] || 0,
    hiring: hiring.score,
    linkedin: linkedin.score
  };
  
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  
  return {
    score: totalScore,
    tier: getIntentTier(totalScore),
    breakdown: scores,
    signals: {
      vertical,
      size,
      funding,
      hiring: hiring.signals,
      linkedin: linkedin.signals
    }
  };
}

/**
 * Get intent tier based on score
 */
function getIntentTier(score) {
  if (score >= 50) return { tier: 'HOT', emoji: '🔥', color: '#ef4444', priority: 1 };
  if (score >= 35) return { tier: 'WARM', emoji: '🟠', color: '#f97316', priority: 2 };
  if (score >= 20) return { tier: 'COOL', emoji: '🟡', color: '#eab308', priority: 3 };
  return { tier: 'COLD', emoji: '⚪', color: '#6b7280', priority: 4 };
}

/**
 * Score and rank a list of leads/companies
 */
function rankByIntent(leads) {
  return leads
    .map(lead => ({
      ...lead,
      intent: calculateIntentScore(lead)
    }))
    .sort((a, b) => b.intent.score - a.intent.score);
}

/**
 * Find leads matching specific intent criteria
 */
function findHighIntentLeads(leads, criteria = {}) {
  const results = [];
  
  for (const lead of leads) {
    const intent = calculateIntentScore(lead);
    
    // Check criteria
    let matches = true;
    if (criteria.minScore && intent.score < criteria.minScore) matches = false;
    if (criteria.vertical && intent.signals.vertical !== criteria.vertical) matches = false;
    if (criteria.hasHiringSignal && intent.signals.hiring.length === 0) matches = false;
    if (criteria.hasFunding && intent.signals.funding === 'unknown') matches = false;
    
    if (matches) {
      results.push({ ...lead, intent });
    }
  }
  
  return results.sort((a, b) => b.intent.score - a.intent.score);
}

module.exports = {
  calculateIntentScore,
  detectVertical,
  detectSize,
  detectFunding,
  detectHiringSignal,
  detectLinkedInSignals,
  getIntentTier,
  rankByIntent,
  findHighIntentLeads,
  VERTICAL_SCORES,
  SIZE_SCORES,
  FUNDING_SCORES
};
