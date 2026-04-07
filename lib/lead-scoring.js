/**
 * Lead Prioritization Scoring
 * Scores pending leads to help Jan focus on the best opportunities first
 */

const CATEGORY_SCORES = {
  'Booked': 100,
  'Meeting Request': 80,
  'Interested': 60,
  'Question': 40,
  'Positive': 30,
  'Out of Office': 5,
  'Not Interested': 0,
  'Do Not Contact': 0,
  'Unknown': 20
};

// Score decay - older waiting leads get priority boost
function getWaitingBonus(repliedAt) {
  if (!repliedAt) return 0;
  const hoursWaiting = (Date.now() - new Date(repliedAt).getTime()) / (1000 * 60 * 60);
  
  // Urgency tiers
  if (hoursWaiting > 72) return 30;  // 3+ days - critical
  if (hoursWaiting > 48) return 25;  // 2-3 days - high
  if (hoursWaiting > 24) return 20;  // 1-2 days - medium
  if (hoursWaiting > 12) return 10;  // 12-24h - normal
  if (hoursWaiting > 4) return 5;    // 4-12h - low
  return 0;                           // <4h - fresh
}

// Company signal bonus (if we have data)
function getCompanyBonus(lead) {
  let bonus = 0;
  
  // Has company name = slightly better lead
  if (lead.lead_company) bonus += 5;
  
  // Future: could add enrichment data here
  // - Company size
  // - Industry match
  // - VC-backed signals
  // - App download counts
  
  return bonus;
}

// Response time bonus - if they replied fast, they're engaged
function getEngagementBonus(responseTimeSeconds) {
  if (!responseTimeSeconds || responseTimeSeconds <= 0) return 0;
  
  const hours = responseTimeSeconds / 3600;
  if (hours < 1) return 15;   // Replied within 1h - very engaged
  if (hours < 4) return 10;   // Same day energy
  if (hours < 24) return 5;   // Next day
  return 0;
}

/**
 * Calculate priority score for a lead
 * Higher score = handle first
 */
function calculateScore(lead) {
  const category = lead.reply_category || 'Unknown';
  
  let score = CATEGORY_SCORES[category] ?? CATEGORY_SCORES['Unknown'];
  score += getWaitingBonus(lead.replied_at);
  score += getCompanyBonus(lead);
  score += getEngagementBonus(lead.response_time_seconds);
  
  return {
    score: Math.round(score),
    breakdown: {
      category: CATEGORY_SCORES[category] ?? CATEGORY_SCORES['Unknown'],
      waiting: getWaitingBonus(lead.replied_at),
      company: getCompanyBonus(lead),
      engagement: getEngagementBonus(lead.response_time_seconds)
    }
  };
}

/**
 * Score and sort an array of leads
 */
function scoreLeads(leads) {
  return leads
    .map(lead => ({
      ...lead,
      priority: calculateScore(lead)
    }))
    .sort((a, b) => b.priority.score - a.priority.score);
}

/**
 * Get priority tier label
 */
function getPriorityTier(score) {
  if (score >= 100) return { tier: 'CRITICAL', emoji: '🔴', color: '#ef4444' };
  if (score >= 80) return { tier: 'HIGH', emoji: '🟠', color: '#f97316' };
  if (score >= 60) return { tier: 'MEDIUM', emoji: '🟡', color: '#eab308' };
  if (score >= 40) return { tier: 'LOW', emoji: '🟢', color: '#22c55e' };
  return { tier: 'SKIP', emoji: '⚪', color: '#6b7280' };
}

module.exports = {
  calculateScore,
  scoreLeads,
  getPriorityTier,
  CATEGORY_SCORES
};
