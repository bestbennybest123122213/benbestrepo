#!/usr/bin/env node
/**
 * Critical Lead Triage System
 * 
 * Systematically prioritize and rescue leads in "critical" status (30-60 days old).
 * These leads are about to become unrecoverable and need immediate attention.
 * Different from rescue.js which handles scheduling leads.
 * 
 * Triage Categories:
 *   🚨 Save Now (score 80+, < 7 days to loss)
 *   ⚠️  High Priority (score 60+, < 14 days to loss)
 *   🔶 Worth Trying (score 40+)
 *   ❌ Let Go (score < 40, > 55 days old)
 * 
 * Scoring Factors:
 *   - Company vertical (Gaming/Tech = high, Unknown = low)
 *   - Original interest level (Meeting Request > Interested > Info Request)
 *   - Company size hints (from email domain)
 *   - Days until unrecoverable (60 - current_age)
 * 
 * Usage:
 *   node triage.js                    # Show triage dashboard
 *   node triage.js --save             # Only "Save Now" leads
 *   node triage.js draft <email>      # Generate last-chance email for lead
 *   node triage.js batch              # Generate all triage emails
 *   node triage.js impact             # Show potential revenue if saved
 *   node triage.js list               # List all critical leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ACTION = args[0] || 'dashboard';
const TARGET = args[1];

// =============================================================================
// LEAD SCORING SYSTEM
// =============================================================================

// High-value verticals (based on past campaign success)
const VERTICALS = {
  gaming: { score: 30, keywords: ['game', 'gaming', 'mobile game', 'studio', 'esports', 'play'] },
  tech: { score: 25, keywords: ['tech', 'software', 'app', 'ai', 'saas', 'platform', 'digital'] },
  education: { score: 20, keywords: ['edu', 'learn', 'course', 'academy', 'tutoring', 'school'] },
  ecommerce: { score: 15, keywords: ['shop', 'store', 'commerce', 'retail', 'brand', 'consumer'] },
  finance: { score: 20, keywords: ['finance', 'fintech', 'bank', 'invest', 'crypto', 'trading'] },
  health: { score: 15, keywords: ['health', 'wellness', 'fitness', 'medical', 'pharma'] },
  entertainment: { score: 20, keywords: ['entertainment', 'media', 'streaming', 'content', 'video'] }
};

// Interest level scoring based on reply_category
const INTEREST_LEVELS = {
  'Meeting Requested': 40,
  'meeting_requested': 40,
  'Meeting Request': 40,
  'Interested': 30,
  'interested': 30,
  'Very Interested': 35,
  'Info Request': 20,
  'info_request': 20,
  'Information Request': 20,
  'Scheduling': 25,
  'scheduling': 25,
  'Positive': 20,
  'positive': 20
};

// Company size hints from email domains
const ENTERPRISE_DOMAINS = [
  'google.com', 'microsoft.com', 'apple.com', 'amazon.com', 'meta.com', 'facebook.com',
  'netflix.com', 'spotify.com', 'adobe.com', 'salesforce.com', 'oracle.com', 'ibm.com',
  'intel.com', 'nvidia.com', 'activision.com', 'ea.com', 'ubisoft.com', 'riotgames.com',
  'epicgames.com', 'unity.com', 'unity3d.com', 'disney.com', 'warner.com', 'sony.com',
  'samsung.com', 'lg.com', 'cisco.com', 'vmware.com', 'dell.com', 'hp.com', 'hpe.com'
];

const MID_MARKET_INDICATORS = ['inc', 'corp', 'llc', 'ltd', 'co.', 'group', 'global', 'world'];

// Triage category definitions
const TRIAGE_CATEGORIES = {
  saveNow: {
    emoji: '🚨',
    label: 'Save Now',
    color: 'red',
    minScore: 80,
    maxDaysToLoss: 7,
    description: 'Critical - act today'
  },
  highPriority: {
    emoji: '⚠️',
    label: 'High Priority',
    color: 'orange',
    minScore: 60,
    maxDaysToLoss: 14,
    description: 'Act within 48 hours'
  },
  worthTrying: {
    emoji: '🔶',
    label: 'Worth Trying',
    color: 'yellow',
    minScore: 40,
    maxDaysToLoss: 30,
    description: 'Send if time permits'
  },
  letGo: {
    emoji: '❌',
    label: 'Let Go',
    color: 'gray',
    minScore: 0,
    maxDaysToLoss: 5, // Less than 5 days means > 55 days old
    description: 'Too late or low value'
  }
};

// Email templates for triage
const TRIAGE_TEMPLATES = {
  lastChance: {
    name: 'Last Chance',
    subject: 'Re: Circling back one more time',
    body: `Hi [FIRST_NAME],

I wanted to reach out one more time before I close the loop on this.

We've had some amazing results recently with campaigns similar to what we discussed — our last gaming campaign drove 48M views and 100K+ new users.

If influencer marketing is still something [COMPANY] is exploring, I'd love to make this happen. My calendar is open for a quick 15-minute chat.

If the timing isn't right, no worries at all — just let me know and I won't follow up again.

Best,
Jan`
  },
  valueReminder: {
    name: 'Value Reminder',
    subject: 'Re: Quick update on what we\'ve done recently',
    body: `Hi [FIRST_NAME],

Quick update — since we last spoke, we've closed some exciting campaigns:

• Whiteout Survival: 48M views, 100K+ new users
• Gauth AI: 15M+ views, strong Gen-Z engagement
• Multiple gaming studios seeing 3-5x ROAS

Given [COMPANY]'s position in the market, I think there's a real opportunity here.

Worth 15 minutes to explore? I can share specific case studies relevant to your vertical.

Best,
Jan`
  },
  directAsk: {
    name: 'Direct Ask',
    subject: 'Re: Is this still on your radar?',
    body: `Hi [FIRST_NAME],

Quick question — is influencer marketing still on [COMPANY]'s radar for this quarter?

If yes: I'm ready to move fast. We have capacity right now and can get a campaign live within 2-3 weeks.

If timing has changed: Totally understand. Just let me know and I'll reach back at a better time.

Either way, appreciate you letting me know.

Best,
Jan`
  }
};

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

function detectVertical(lead) {
  const searchText = [
    lead.lead_company || '',
    lead.lead_email || '',
    lead.campaign_name || '',
    lead.reply_text || ''
  ].join(' ').toLowerCase();

  for (const [vertical, config] of Object.entries(VERTICALS)) {
    if (config.keywords.some(kw => searchText.includes(kw))) {
      return { vertical, score: config.score };
    }
  }
  return { vertical: 'unknown', score: 5 };
}

function getInterestScore(replyCategory) {
  return INTEREST_LEVELS[replyCategory] || 10;
}

function getCompanySizeScore(email) {
  if (!email) return 5;
  
  const domain = email.split('@')[1]?.toLowerCase() || '';
  
  // Enterprise check
  if (ENTERPRISE_DOMAINS.some(ed => domain === ed || domain.endsWith('.' + ed))) {
    return 25;
  }
  
  // Mid-market indicators
  if (MID_MARKET_INDICATORS.some(ind => domain.includes(ind))) {
    return 15;
  }
  
  // Custom/company domain (not gmail, etc.)
  const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
  if (!genericDomains.includes(domain)) {
    return 10; // Has company domain
  }
  
  return 5; // Generic domain
}

function getDaysToLoss(daysOld) {
  // Leads become unrecoverable at 60 days
  return Math.max(0, 60 - daysOld);
}

function getUrgencyScore(daysToLoss) {
  // More points for less time remaining
  if (daysToLoss <= 5) return 25;   // Critical urgency
  if (daysToLoss <= 7) return 20;   // Very urgent
  if (daysToLoss <= 14) return 15;  // Urgent
  if (daysToLoss <= 21) return 10;  // Moderate
  return 5;                          // Some time left
}

function calculateLeadScore(lead) {
  const { vertical, score: verticalScore } = detectVertical(lead);
  const interestScore = getInterestScore(lead.reply_category);
  const companySizeScore = getCompanySizeScore(lead.lead_email);
  const daysToLoss = getDaysToLoss(lead.days_old || 0);
  const urgencyScore = getUrgencyScore(daysToLoss);
  
  // Total score (max ~100)
  const totalScore = verticalScore + interestScore + companySizeScore + urgencyScore;
  
  return {
    totalScore,
    breakdown: {
      vertical: { name: vertical, score: verticalScore },
      interest: { category: lead.reply_category, score: interestScore },
      companySize: { score: companySizeScore },
      urgency: { daysToLoss, score: urgencyScore }
    }
  };
}

function getTriageCategory(score, daysToLoss) {
  // Check in priority order
  if (score >= 80 && daysToLoss <= 7) {
    return { key: 'saveNow', ...TRIAGE_CATEGORIES.saveNow };
  }
  if (score >= 60 && daysToLoss <= 14) {
    return { key: 'highPriority', ...TRIAGE_CATEGORIES.highPriority };
  }
  if (score >= 40) {
    return { key: 'worthTrying', ...TRIAGE_CATEGORIES.worthTrying };
  }
  // Let go: low score or too old
  return { key: 'letGo', ...TRIAGE_CATEGORIES.letGo };
}

function categorizeLeads(leads) {
  const categories = {
    saveNow: [],
    highPriority: [],
    worthTrying: [],
    letGo: []
  };

  leads.forEach(lead => {
    const daysOld = lead.days_old || 0;
    const daysToLoss = getDaysToLoss(daysOld);
    const scoring = calculateLeadScore(lead);
    const category = getTriageCategory(scoring.totalScore, daysToLoss);
    
    categories[category.key].push({
      ...lead,
      daysOld,
      daysToLoss,
      score: scoring.totalScore,
      scoring,
      category
    });
  });

  // Sort each category by score (descending)
  for (const key of Object.keys(categories)) {
    categories[key].sort((a, b) => b.score - a.score);
  }

  return categories;
}

// =============================================================================
// DASHBOARD DISPLAY
// =============================================================================

// Calculate days since a date
function daysSince(dateStr) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

// Filter leads to critical range (30-60 days old)
function filterCriticalLeads(leads) {
  return leads
    .map(lead => ({
      ...lead,
      days_old: daysSince(lead.replied_at)
    }))
    .filter(lead => lead.days_old >= 30 && lead.days_old <= 60);
}

async function showDashboard(saveNowOnly = false) {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get all positive replies and filter by age
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);
  
  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching leads:', error.message);
    process.exit(1);
  }

  // Filter to critical range (30-60 days)
  const leads = filterCriticalLeads(allLeads || []);

  if (error) {
    console.error('❌ Error fetching leads:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('\n✅ No critical leads (30-60 days old)! Pipeline is healthy.\n');
    return;
  }

  const categories = categorizeLeads(leads);
  const totalLeads = leads.length;
  const saveNowCount = categories.saveNow.length;
  const highPriorityCount = categories.highPriority.length;
  const actionableCount = saveNowCount + highPriorityCount;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🚨 CRITICAL LEAD TRIAGE DASHBOARD                                       ║
║  ${totalLeads} leads in critical zone (30-60 days old) | ${actionableCount} need immediate action
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Summary bar
  const saveNowBar = '█'.repeat(Math.min(categories.saveNow.length, 20));
  const highBar = '█'.repeat(Math.min(categories.highPriority.length, 20));
  const worthBar = '█'.repeat(Math.min(categories.worthTrying.length, 20));
  const letGoBar = '█'.repeat(Math.min(categories.letGo.length, 20));

  console.log('  TRIAGE DISTRIBUTION');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  🚨 Save Now       ${String(categories.saveNow.length).padStart(3)} │ ${saveNowBar}`);
  console.log(`  ⚠️  High Priority  ${String(categories.highPriority.length).padStart(3)} │ ${highBar}`);
  console.log(`  🔶 Worth Trying   ${String(categories.worthTrying.length).padStart(3)} │ ${worthBar}`);
  console.log(`  ❌ Let Go         ${String(categories.letGo.length).padStart(3)} │ ${letGoBar}`);
  console.log('');

  // Revenue impact calculation
  const avgDealValue = 20000;
  const conversionRates = {
    saveNow: 0.35,      // 35% if we act now
    highPriority: 0.25, // 25%
    worthTrying: 0.15,  // 15%
    letGo: 0.05         // 5%
  };

  const potentialRevenue = 
    categories.saveNow.length * avgDealValue * conversionRates.saveNow +
    categories.highPriority.length * avgDealValue * conversionRates.highPriority +
    categories.worthTrying.length * avgDealValue * conversionRates.worthTrying;

  const lostIfIgnored =
    categories.saveNow.length * avgDealValue * conversionRates.saveNow +
    categories.highPriority.length * avgDealValue * conversionRates.highPriority;

  console.log('  💰 REVENUE IMPACT');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  Potential if saved:    $${potentialRevenue.toLocaleString()}`);
  console.log(`  Lost if ignored:       $${lostIfIgnored.toLocaleString()}`);
  console.log(`  (Based on $${avgDealValue.toLocaleString()} avg deal, tiered conversion rates)`);
  console.log('');

  // Show categories based on filter
  const categoriesToShow = saveNowOnly 
    ? ['saveNow'] 
    : ['saveNow', 'highPriority', 'worthTrying'];

  categoriesToShow.forEach(catKey => {
    const catLeads = categories[catKey];
    if (catLeads.length === 0) return;

    const catDef = TRIAGE_CATEGORIES[catKey];

    console.log(`  ${catDef.emoji} ${catDef.label.toUpperCase()} (${catLeads.length} leads) — ${catDef.description}`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    catLeads.slice(0, 8).forEach(lead => {
      const company = lead.lead_company || 'Unknown Company';
      const daysLabel = `${lead.daysOld}d old, ${lead.daysToLoss}d left`;
      const scoreLabel = `Score: ${lead.score}`;
      const verticalLabel = lead.scoring.breakdown.vertical.name;
      
      console.log(`    ■ ${(lead.lead_name || 'Unknown').substring(0, 18).padEnd(18)} ${company.substring(0, 20).padEnd(20)} ${scoreLabel.padEnd(12)} ${verticalLabel}`);
      console.log(`      📧 ${lead.lead_email.padEnd(35)} ${daysLabel}`);
    });

    if (catLeads.length > 8) {
      console.log(`      ... and ${catLeads.length - 8} more`);
    }
    console.log('');
  });

  // Top 3 Score Breakdown (for transparency)
  console.log('  📊 TOP 3 SCORE BREAKDOWN');
  console.log('  ─────────────────────────────────────────────────────────────────');
  const topLeads = [...categories.saveNow, ...categories.highPriority].slice(0, 3);
  topLeads.forEach((lead, i) => {
    const b = lead.scoring.breakdown;
    console.log(`  ${i + 1}. ${lead.lead_name || 'Unknown'}`);
    console.log(`     Vertical: ${b.vertical.name} (+${b.vertical.score}) | Interest: ${b.interest.category || 'N/A'} (+${b.interest.score})`);
    console.log(`     Company Size: +${b.companySize.score} | Urgency: ${b.urgency.daysToLoss}d left (+${b.urgency.score}) = ${lead.score} pts`);
  });
  console.log('');

  // Quick actions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  QUICK ACTIONS');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  gex triage --save            Show only "Save Now" leads');
  console.log('  gex triage draft <email>     Generate last-chance email');
  console.log('  gex triage batch             Generate all triage emails');
  console.log('  gex triage impact            Detailed revenue impact analysis');
  console.log('  gex triage list              List all critical leads with scores');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// =============================================================================
// EMAIL GENERATION
// =============================================================================

function selectTemplate(lead) {
  const daysToLoss = lead.daysToLoss || getDaysToLoss(lead.days_old || 0);
  
  // Last chance for very urgent
  if (daysToLoss <= 7) {
    return TRIAGE_TEMPLATES.lastChance;
  }
  
  // Value reminder for gaming/tech verticals
  const vertical = detectVertical(lead).vertical;
  if (['gaming', 'tech', 'entertainment'].includes(vertical)) {
    return TRIAGE_TEMPLATES.valueReminder;
  }
  
  // Direct ask for others
  return TRIAGE_TEMPLATES.directAsk;
}

async function generateDraft(emailOrName) {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get leads in critical range
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

  // Search for lead
  let query = client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString());

  if (emailOrName.includes('@')) {
    query = query.ilike('lead_email', `%${emailOrName}%`);
  } else {
    query = query.ilike('lead_name', `%${emailOrName}%`);
  }

  const { data: allLeads, error } = await query.limit(20);
  
  // Filter to critical range
  const leads = filterCriticalLeads(allLeads || []).slice(0, 5);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log(`\n❌ No critical lead found matching: ${emailOrName}`);
    console.log('   Run "gex triage list" to see all critical leads.\n');
    return;
  }

  if (leads.length > 1) {
    console.log(`\n📋 Multiple leads found. Which one?\n`);
    leads.forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.lead_name} — ${lead.lead_email}`);
    });
    console.log(`\n💡 Use the exact email: gex triage draft ${leads[0].lead_email}\n`);
    return;
  }

  const lead = leads[0];
  const daysOld = lead.days_old || 0;
  const daysToLoss = getDaysToLoss(daysOld);
  const scoring = calculateLeadScore(lead);
  const category = getTriageCategory(scoring.totalScore, daysToLoss);
  const template = selectTemplate({ ...lead, daysToLoss });

  // Fill in placeholders
  const firstName = (lead.lead_name || 'there').split(' ')[0];
  const company = lead.lead_company || 'your company';
  
  let body = template.body
    .replace(/\[FIRST_NAME\]/g, firstName)
    .replace(/\[COMPANY\]/g, company);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 TRIAGE EMAIL for ${(lead.lead_name || 'Unknown').substring(0, 40).padEnd(40)} ║
╚══════════════════════════════════════════════════════════════════════════╝

  Lead:     ${lead.lead_name}
  Email:    ${lead.lead_email}
  Company:  ${lead.lead_company || 'Unknown'}
  Age:      ${daysOld} days old (${daysToLoss} days until loss)
  Score:    ${scoring.totalScore}/100 → ${category.emoji} ${category.label}
  Template: ${template.name}

  SCORE BREAKDOWN:
  ─────────────────────────────────────────────────────────────────────────
  Vertical:      ${scoring.breakdown.vertical.name} (+${scoring.breakdown.vertical.score})
  Interest:      ${lead.reply_category || 'Unknown'} (+${scoring.breakdown.interest.score})
  Company Size:  +${scoring.breakdown.companySize.score}
  Urgency:       ${daysToLoss} days left (+${scoring.breakdown.urgency.score})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TO: ${lead.lead_email}
SUBJECT: ${template.subject}

${body}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Copy this email and send it!
   After sending, mark as contacted: gex qm ${lead.lead_email}
`);

  // Save draft
  const draftsDir = path.join(__dirname, 'data', 'triage-drafts');
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }
  
  const draftFile = path.join(draftsDir, `${lead.lead_email.replace('@', '_at_')}.txt`);
  const draftContent = `TO: ${lead.lead_email}
SUBJECT: ${template.subject}

${body}

---
Generated: ${new Date().toISOString()}
Lead: ${lead.lead_name}
Company: ${company}
Score: ${scoring.totalScore}/100
Category: ${category.label} (${daysOld} days old, ${daysToLoss} days to loss)
Template: ${template.name}
`;

  fs.writeFileSync(draftFile, draftContent);
  console.log(`  📁 Draft saved to: ${draftFile}\n`);
}

async function generateBatch() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });

  // Filter to critical range
  const leads = filterCriticalLeads(allLeads || []);

  if (error || !leads || leads.length === 0) {
    console.log('\n✅ No critical leads to generate emails for.\n');
    return;
  }

  const categories = categorizeLeads(leads);
  const draftsDir = path.join(__dirname, 'data', 'triage-drafts');
  
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  let generated = 0;
  const summary = [];

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 BATCH TRIAGE EMAIL GENERATOR                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Only generate for actionable categories (not "Let Go")
  const actionableCategories = ['saveNow', 'highPriority', 'worthTrying'];

  for (const catKey of actionableCategories) {
    const catLeads = categories[catKey];
    if (catLeads.length === 0) continue;

    const catDef = TRIAGE_CATEGORIES[catKey];
    console.log(`\n  ${catDef.emoji} ${catDef.label} (${catLeads.length} emails)`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    for (const lead of catLeads) {
      const firstName = (lead.lead_name || 'there').split(' ')[0];
      const company = lead.lead_company || 'your company';
      const template = selectTemplate(lead);
      
      let body = template.body
        .replace(/\[FIRST_NAME\]/g, firstName)
        .replace(/\[COMPANY\]/g, company);

      const draftFile = path.join(draftsDir, `${lead.lead_email.replace('@', '_at_')}.txt`);
      const draftContent = `TO: ${lead.lead_email}
SUBJECT: ${template.subject}

${body}

---
Generated: ${new Date().toISOString()}
Lead: ${lead.lead_name}
Company: ${company}
Score: ${lead.score}/100
Category: ${catDef.label} (${lead.daysOld} days old, ${lead.daysToLoss} days to loss)
Template: ${template.name}
`;

      fs.writeFileSync(draftFile, draftContent);
      console.log(`    ✅ ${(lead.lead_name || 'Unknown').padEnd(25)} Score: ${lead.score} | ${template.name}`);
      generated++;

      summary.push({
        email: lead.lead_email,
        name: lead.lead_name,
        company: company,
        score: lead.score,
        category: catKey,
        daysOld: lead.daysOld,
        daysToLoss: lead.daysToLoss,
        template: template.name,
        file: draftFile
      });
    }
  }

  // Save summary
  const summaryFile = path.join(draftsDir, '_triage-batch-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    total: generated,
    by_category: {
      saveNow: categories.saveNow.length,
      highPriority: categories.highPriority.length,
      worthTrying: categories.worthTrying.length,
      letGo: categories.letGo.length
    },
    drafts: summary
  }, null, 2));

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Generated ${generated} triage emails
  ❌ Skipped ${categories.letGo.length} "Let Go" leads
  📁 Saved to: ${draftsDir}
  📋 Summary: ${summaryFile}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// =============================================================================
// IMPACT ANALYSIS
// =============================================================================

async function showImpact() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString());

  // Filter to critical range
  const leads = filterCriticalLeads(allLeads || []);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('\n✅ No critical leads to analyze.\n');
    return;
  }

  const categories = categorizeLeads(leads);
  
  // Revenue calculations
  const avgDealValues = {
    gaming: 35000,
    tech: 25000,
    education: 20000,
    entertainment: 30000,
    finance: 25000,
    ecommerce: 18000,
    health: 20000,
    unknown: 15000
  };

  const conversionRates = {
    saveNow: 0.35,
    highPriority: 0.25,
    worthTrying: 0.15,
    letGo: 0.05
  };

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  💰 REVENUE IMPACT ANALYSIS                                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  let totalPotential = 0;
  let totalIfSaved = 0;
  let totalLost = 0;

  console.log('  BY TRIAGE CATEGORY');
  console.log('  ─────────────────────────────────────────────────────────────────');

  for (const [catKey, catLeads] of Object.entries(categories)) {
    const catDef = TRIAGE_CATEGORIES[catKey];
    const convRate = conversionRates[catKey];

    // Calculate value by vertical
    let categoryValue = 0;
    catLeads.forEach(lead => {
      const vertical = lead.scoring.breakdown.vertical.name;
      const dealValue = avgDealValues[vertical] || avgDealValues.unknown;
      categoryValue += dealValue * convRate;
    });

    totalPotential += categoryValue;
    if (catKey !== 'letGo') {
      totalIfSaved += categoryValue;
    } else {
      totalLost += categoryValue;
    }

    const valueStr = `$${Math.round(categoryValue).toLocaleString()}`;
    console.log(`  ${catDef.emoji} ${catDef.label.padEnd(15)} ${String(catLeads.length).padStart(3)} leads × ${(convRate * 100).toFixed(0)}% conv = ${valueStr.padStart(12)}`);
  }

  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  Total Recoverable Value:    $${Math.round(totalIfSaved).toLocaleString()}`);
  console.log(`  Lost if All Expire:         $${Math.round(totalPotential).toLocaleString()}`);
  console.log('');

  // By vertical breakdown
  console.log('  BY VERTICAL (Actionable Leads Only)');
  console.log('  ─────────────────────────────────────────────────────────────────');

  const byVertical = {};
  [...categories.saveNow, ...categories.highPriority, ...categories.worthTrying].forEach(lead => {
    const vertical = lead.scoring.breakdown.vertical.name;
    if (!byVertical[vertical]) {
      byVertical[vertical] = { count: 0, value: 0 };
    }
    byVertical[vertical].count++;
    byVertical[vertical].value += avgDealValues[vertical] || avgDealValues.unknown;
  });

  const sortedVerticals = Object.entries(byVertical)
    .sort(([,a], [,b]) => b.value - a.value);

  sortedVerticals.forEach(([vertical, data]) => {
    const avgConv = 0.25; // Blended average
    const expectedValue = data.value * avgConv;
    console.log(`  ${vertical.padEnd(15)} ${String(data.count).padStart(3)} leads   ~$${Math.round(expectedValue).toLocaleString()}`);
  });

  console.log('');

  // Time sensitivity
  console.log('  ⏰ TIME SENSITIVITY');
  console.log('  ─────────────────────────────────────────────────────────────────');
  
  const urgentLeads = categories.saveNow.length;
  const urgentValue = categories.saveNow.reduce((sum, lead) => {
    const vertical = lead.scoring.breakdown.vertical.name;
    return sum + (avgDealValues[vertical] || avgDealValues.unknown) * 0.35;
  }, 0);

  console.log(`  🚨 ${urgentLeads} leads will be lost within 7 days`);
  console.log(`     Potential value at risk: $${Math.round(urgentValue).toLocaleString()}`);
  console.log(`     Action: Send emails TODAY`);
  console.log('');

  // Recommendations
  console.log('  📋 RECOMMENDATIONS');
  console.log('  ─────────────────────────────────────────────────────────────────');
  
  if (categories.saveNow.length > 0) {
    console.log(`  1. Send ${categories.saveNow.length} "Save Now" emails immediately`);
    console.log(`     Run: gex triage batch`);
  }
  if (categories.highPriority.length > 0) {
    console.log(`  2. Schedule ${categories.highPriority.length} "High Priority" for tomorrow`);
  }
  if (categories.letGo.length > 0) {
    console.log(`  3. Archive ${categories.letGo.length} "Let Go" leads to focus on winners`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  💡 Focus on "Save Now" first — highest ROI for your time
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// =============================================================================
// LIST ALL CRITICAL LEADS
// =============================================================================

async function listLeads() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', thirtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });

  // Filter to critical range
  const leads = filterCriticalLeads(allLeads || []);

  if (error || !leads || leads.length === 0) {
    console.log('\n✅ No critical leads!\n');
    return;
  }

  const categories = categorizeLeads(leads);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📋 ALL CRITICAL LEADS (${leads.length} total)                                       ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  for (const [catKey, catLeads] of Object.entries(categories)) {
    if (catLeads.length === 0) continue;

    const catDef = TRIAGE_CATEGORIES[catKey];
    console.log(`\n  ${catDef.emoji} ${catDef.label.toUpperCase()} (${catLeads.length})`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    catLeads.forEach(lead => {
      const name = (lead.lead_name || 'Unknown').substring(0, 20).padEnd(20);
      const email = lead.lead_email.substring(0, 30).padEnd(30);
      const score = `${lead.score}pts`.padStart(6);
      const age = `${lead.daysOld}d`.padStart(4);
      const left = `${lead.daysToLoss}d left`.padStart(8);
      console.log(`    ${score} │ ${name} │ ${email} │ ${age} │ ${left}`);
    });
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generate email: gex triage draft <email>
  Batch generate: gex triage batch
  Revenue impact: gex triage impact
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// =============================================================================
// HELP
// =============================================================================

function showHelp() {
  console.log(`
  🚨 CRITICAL LEAD TRIAGE SYSTEM

  Prioritize and rescue leads in "critical" status (30-60 days old).
  Uses AI-powered scoring to determine which leads to save first.

  COMMANDS:
    gex triage              Show triage dashboard with scored leads
    gex triage --save       Only show "Save Now" leads
    gex triage draft <email> Generate last-chance email for lead
    gex triage batch        Generate all triage emails (skip "Let Go")
    gex triage impact       Detailed revenue impact analysis
    gex triage list         List all critical leads with scores

  TRIAGE CATEGORIES:
    🚨 Save Now       Score 80+, < 7 days to loss — Act today
    ⚠️  High Priority  Score 60+, < 14 days to loss — Act within 48h
    🔶 Worth Trying   Score 40+ — Send if time permits
    ❌ Let Go         Score < 40 or > 55 days old — Focus elsewhere

  SCORING FACTORS:
    • Company vertical (Gaming/Tech = +30, Unknown = +5)
    • Interest level (Meeting Request = +40, Info Request = +20)
    • Company size (Enterprise = +25, SMB = +10)
    • Urgency (< 7 days left = +25, > 21 days = +5)

  EMAIL TEMPLATES:
    • Last Chance — "Circling back one more time..."
    • Value Reminder — "Quick update on results..."
    • Direct Ask — "Is this still on your radar?"
`);
}

// =============================================================================
// MAIN ROUTER
// =============================================================================

async function main() {
  const isSaveOnly = args.includes('--save') || args.includes('-s');
  const action = ACTION.replace(/^--/, '');

  switch (action) {
    case 'dashboard':
    case 'save':
      await showDashboard(isSaveOnly || action === 'save');
      break;
    case 'draft':
      if (!TARGET) {
        console.log('\n❌ Please specify an email or name:');
        console.log('   gex triage draft john@company.com\n');
        process.exit(1);
      }
      await generateDraft(TARGET);
      break;
    case 'batch':
      await generateBatch();
      break;
    case 'impact':
      await showImpact();
      break;
    case 'list':
      await listLeads();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      // Check if they passed an email directly
      if (action.includes('@')) {
        await generateDraft(action);
      } else {
        await showDashboard(isSaveOnly);
      }
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
