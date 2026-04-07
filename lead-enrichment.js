#!/usr/bin/env node
/**
 * Lead Enrichment Tool
 * 
 * Adds context to leads automatically:
 * - Detect company vertical
 * - Estimate company size from domain
 * - Score lead quality
 * - Generate insights
 * 
 * Usage:
 *   node lead-enrichment.js                    # Enrich all pending leads
 *   node lead-enrichment.js --lead=EMAIL       # Enrich specific lead
 *   node lead-enrichment.js --top=10           # Enrich top 10 leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const LEAD_FILTER = args.find(a => a.startsWith('--lead='))?.split('=')[1];
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1]) || 20;

// Known company databases for enrichment
const KNOWN_COMPANIES = {
  // Gaming
  'stillfront': { vertical: 'Gaming', size: 'Enterprise', revenue: '$500M+', employees: '1000+' },
  'paradox': { vertical: 'Gaming', size: 'Large', revenue: '$100M+', employees: '500+' },
  'unity': { vertical: 'Gaming/Tech', size: 'Enterprise', revenue: '$1B+', employees: '5000+' },
  'dream11': { vertical: 'Gaming', size: 'Large', revenue: '$100M+', employees: '1000+' },
  'supercell': { vertical: 'Gaming', size: 'Enterprise', revenue: '$1B+', employees: '500+' },
  'zynga': { vertical: 'Gaming', size: 'Enterprise', revenue: '$1B+', employees: '2000+' },
  'riot': { vertical: 'Gaming', size: 'Enterprise', revenue: '$1B+', employees: '3000+' },
  'epic': { vertical: 'Gaming', size: 'Enterprise', revenue: '$5B+', employees: '3000+' },
  'naver': { vertical: 'Tech', size: 'Enterprise', revenue: '$5B+', employees: '5000+' },
  
  // Tech
  'omio': { vertical: 'Travel Tech', size: 'Large', revenue: '$100M+', employees: '500+' },
  'typology': { vertical: 'DTC/Beauty', size: 'Medium', revenue: '$50M+', employees: '200+' },
  
  // Education
  'unstop': { vertical: 'Education', size: 'Medium', revenue: '$10M+', employees: '200+' },
};

// Vertical detection patterns
const VERTICAL_PATTERNS = {
  'Gaming': ['game', 'gaming', 'studio', 'play', 'esport', 'mobile game', 'casino', 'bet'],
  'Tech/AI': ['ai', 'artificial', 'ml', 'machine', 'software', 'saas', 'cloud', 'data', 'analytics'],
  'Education': ['edu', 'learn', 'school', 'course', 'academy', 'training', 'tutor', 'university'],
  'Finance': ['bank', 'finance', 'fintech', 'insurance', 'invest', 'trading', 'crypto'],
  'E-commerce': ['shop', 'store', 'retail', 'commerce', 'marketplace', 'fashion'],
  'Health': ['health', 'medical', 'pharma', 'fitness', 'wellness', 'bio'],
  'Travel': ['travel', 'hotel', 'flight', 'booking', 'tour', 'vacation'],
  'Media': ['media', 'news', 'entertainment', 'content', 'streaming', 'music'],
};

// Company size estimation from email domain patterns
const SIZE_PATTERNS = {
  enterprise: ['corp', 'inc', 'global', 'international', 'group'],
  large: ['co', 'ltd', 'limited'],
  startup: ['io', 'app', 'ai', 'tech'],
};

function detectVertical(company, email) {
  const text = `${company || ''} ${email || ''}`.toLowerCase();
  
  // Check known companies first
  for (const [key, data] of Object.entries(KNOWN_COMPANIES)) {
    if (text.includes(key)) {
      return { vertical: data.vertical, source: 'known_company', confidence: 'high' };
    }
  }
  
  // Pattern matching
  for (const [vertical, patterns] of Object.entries(VERTICAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        return { vertical, source: 'pattern_match', confidence: 'medium' };
      }
    }
  }
  
  return { vertical: 'Other', source: 'default', confidence: 'low' };
}

function estimateCompanySize(company, email) {
  const text = `${company || ''} ${email || ''}`.toLowerCase();
  
  // Check known companies
  for (const [key, data] of Object.entries(KNOWN_COMPANIES)) {
    if (text.includes(key)) {
      return { size: data.size, employees: data.employees, revenue: data.revenue, source: 'known' };
    }
  }
  
  // Domain-based estimation
  const domain = email?.split('@')[1] || '';
  
  if (domain.endsWith('.edu') || domain.endsWith('.gov')) {
    return { size: 'Institution', employees: 'Varies', revenue: 'N/A', source: 'domain' };
  }
  
  // Check TLD patterns
  if (domain.endsWith('.io') || domain.endsWith('.ai') || domain.endsWith('.co')) {
    return { size: 'Startup/SMB', employees: '10-200', revenue: '$1M-50M', source: 'domain_pattern' };
  }
  
  if (domain.includes('global') || domain.includes('international')) {
    return { size: 'Enterprise', employees: '1000+', revenue: '$100M+', source: 'domain_pattern' };
  }
  
  return { size: 'Unknown', employees: 'Unknown', revenue: 'Unknown', source: 'none' };
}

function scoreLeadQuality(lead, enrichment) {
  let score = 50; // Base score
  
  // Category score
  const categoryScores = {
    'Meeting Request': 30,
    'Demo Request': 25,
    'Interested': 20,
    'Information Request': 15,
    'Booked': 40
  };
  score += categoryScores[lead.reply_category] || 0;
  
  // Vertical score (gaming is best fit)
  const verticalScores = {
    'Gaming': 20,
    'Tech/AI': 15,
    'Education': 15,
    'E-commerce': 10,
    'Media': 10
  };
  score += verticalScores[enrichment.vertical?.vertical] || 0;
  
  // Size score
  const sizeScores = {
    'Enterprise': 15,
    'Large': 10,
    'Medium': 5,
    'Startup/SMB': 3
  };
  score += sizeScores[enrichment.size?.size] || 0;
  
  // Age penalty
  const age = lead.age_days || 0;
  if (age > 14) score -= 20;
  else if (age > 7) score -= 10;
  else if (age > 3) score -= 5;
  
  // Has company name bonus
  if (lead.lead_company) score += 5;
  
  return Math.min(100, Math.max(0, score));
}

async function enrichLeads() {
  const client = initSupabase();
  if (!client) {
    console.log('Database not available');
    return;
  }

  const now = Date.now();

  // Build query
  let query = client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (LEAD_FILTER) {
    query = query.ilike('lead_email', `%${LEAD_FILTER}%`);
  }

  const { data: leads, error } = await query;

  if (error || !leads) {
    console.error('Error fetching leads:', error?.message);
    return;
  }

  // Add age and limit
  const processed = leads
    .map(lead => {
      const age = lead.replied_at 
        ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return { ...lead, age_days: age };
    })
    .slice(0, TOP_N);

  if (processed.length === 0) {
    console.log('No leads to enrich');
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  🔍 LEAD ENRICHMENT REPORT                                                ║
║  Enriching ${processed.length} leads
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  const enrichedLeads = [];

  processed.forEach((lead, i) => {
    const vertical = detectVertical(lead.lead_company, lead.lead_email);
    const size = estimateCompanySize(lead.lead_company, lead.lead_email);
    const enrichment = { vertical, size };
    const qualityScore = scoreLeadQuality(lead, enrichment);

    enrichedLeads.push({
      ...lead,
      enrichment: {
        vertical: vertical.vertical,
        verticalConfidence: vertical.confidence,
        companySize: size.size,
        employees: size.employees,
        qualityScore
      }
    });

    const scoreEmoji = qualityScore >= 80 ? '🔥' : qualityScore >= 60 ? '🟢' : qualityScore >= 40 ? '🟡' : '⚪';

    console.log(`${scoreEmoji} ${i + 1}. ${lead.lead_name || lead.lead_email}`);
    console.log(`   Company:    ${lead.lead_company || 'Unknown'}`);
    console.log(`   Vertical:   ${vertical.vertical} (${vertical.confidence})`);
    console.log(`   Size:       ${size.size} | ${size.employees} employees`);
    console.log(`   Category:   ${lead.reply_category} | ${lead.age_days}d old`);
    console.log(`   Score:      ${qualityScore}/100`);
    console.log('');
  });

  // Summary stats
  const avgScore = Math.round(enrichedLeads.reduce((sum, l) => sum + l.enrichment.qualityScore, 0) / enrichedLeads.length);
  const highQuality = enrichedLeads.filter(l => l.enrichment.qualityScore >= 70).length;
  
  const verticalCounts = {};
  enrichedLeads.forEach(l => {
    verticalCounts[l.enrichment.vertical] = (verticalCounts[l.enrichment.vertical] || 0) + 1;
  });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`   Leads enriched:    ${enrichedLeads.length}`);
  console.log(`   Average score:     ${avgScore}/100`);
  console.log(`   High quality (70+): ${highQuality}`);
  console.log(`\n   By Vertical:`);
  Object.entries(verticalCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([v, c]) => {
      console.log(`      ${v}: ${c}`);
    });
  console.log(`\n💡 Focus on 🔥 and 🟢 leads first.`);
}

// Function to get company info from email (for use by other modules)
function getCompanyInfo(email) {
  if (!email) return null;
  
  const domain = email.split('@')[1]?.toLowerCase() || '';
  const baseDomain = domain.replace(/^(mail\.|www\.)/, '').split('.')[0];
  
  // Check known companies first
  for (const [key, data] of Object.entries(KNOWN_COMPANIES)) {
    if (domain.includes(key) || baseDomain === key) {
      // Map size to tier
      const sizeToTier = {
        'Enterprise': 'enterprise',
        'Large': 'midmarket',
        'Medium': 'midmarket',
        'Startup': 'startup'
      };
      return {
        ...data,
        tier: sizeToTier[data.size] || 'unknown',
        industry: data.vertical
      };
    }
  }
  
  // Detect vertical and size for unknown companies
  const vertical = detectVertical(null, email);
  const size = estimateCompanySize(null, email);
  
  const sizeToTier = {
    'Enterprise': 'enterprise',
    'Large': 'midmarket',
    'Medium': 'midmarket',
    'Startup': 'startup',
    'Unknown': 'unknown'
  };
  
  return {
    vertical: vertical.vertical,
    size: size.size,
    tier: sizeToTier[size.size] || 'unknown',
    industry: vertical.vertical
  };
}

// Export for use by other modules
const COMPANY_DATA = KNOWN_COMPANIES;

module.exports = {
  getCompanyInfo,
  COMPANY_DATA,
  detectVertical,
  estimateCompanySize,
  scoreLeadQuality
};

// Only run CLI if called directly
if (require.main === module) {
  enrichLeads().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
