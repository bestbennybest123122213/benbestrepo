/**
 * Auto-Reply Drafter - Generates draft responses for SmartLead replies
 * DRAFT MODE ONLY - Does not send anything
 * 
 * Features:
 * - Intent Classification (10 categories)
 * - Sentiment Scoring (1-10 scale)
 * - Draft Confidence Scoring
 * - Objection Library integration
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
const {
  enrichLead,
  getOrCreateThread,
  addMessageToThread,
  checkForDuplicate,
  calculateUrgency,
  detectIndustry
} = require('./lead-intelligence');

// Initialize Anthropic client
const anthropic = new Anthropic();

// Load objection templates
const OBJECTION_TEMPLATES_PATH = path.join(__dirname, 'objection-templates.json');
let OBJECTION_TEMPLATES = {};
try {
  OBJECTION_TEMPLATES = JSON.parse(fs.readFileSync(OBJECTION_TEMPLATES_PATH, 'utf8'));
} catch (err) {
  console.warn('Warning: Could not load objection-templates.json:', err.message);
}

// Load edit tracking
const EDIT_TRACKING_PATH = path.join(__dirname, 'edit-tracking.json');
let EDIT_TRACKING = { edits: [], stats: { total_edits: 0, by_intent: {}, common_corrections: [], average_edit_distance: 0 }, last_updated: null };
try {
  EDIT_TRACKING = JSON.parse(fs.readFileSync(EDIT_TRACKING_PATH, 'utf8'));
} catch (err) {
  // Will be created on first edit
}

// Load deal velocity tracking
const DEAL_VELOCITY_PATH = path.join(__dirname, 'deal-velocity.json');
let DEAL_VELOCITY = { deals: {}, stage_averages: {}, acceleration_tactics: {}, last_updated: null };
try {
  DEAL_VELOCITY = JSON.parse(fs.readFileSync(DEAL_VELOCITY_PATH, 'utf8'));
} catch (err) {
  // Will be created on first use
}

// Load trigger events (cold lead watch list)
const TRIGGER_EVENTS_PATH = path.join(__dirname, 'trigger-events.json');
let TRIGGER_EVENTS = { watched_companies: [], triggered_events: [], reactivation_templates: {}, last_updated: null };
try {
  TRIGGER_EVENTS = JSON.parse(fs.readFileSync(TRIGGER_EVENTS_PATH, 'utf8'));
} catch (err) {
  // Will be created on first use
}

// ============================================
// FEATURE 5: DECISION MAKER VS GATEKEEPER DETECTION
// ============================================

const DECISION_MAKER_TITLES = [
  'ceo', 'cmo', 'cfo', 'coo', 'cto', 'cro', 'cpo',
  'chief', 'president', 'founder', 'co-founder', 'cofounder',
  'owner', 'partner', 'principal',
  'vp', 'vice president', 'svp', 'evp',
  'director', 'head of', 'global head'
];

const GATEKEEPER_TITLES = [
  'manager', 'coordinator', 'assistant', 'associate',
  'specialist', 'executive', 'analyst', 'administrator',
  'representative', 'intern', 'junior'
];

const GATEKEEPER_LANGUAGE = [
  "i'll check with",
  "let me run this by",
  "i need to ask",
  "talk to my",
  "check with my team",
  "discuss with my",
  "get back to you after",
  "need approval from",
  "share this with",
  "forward this to",
  "loop in my",
  "bring this to my"
];

const DECISION_MAKER_LANGUAGE = [
  "i decide",
  "my budget",
  "i'm looking for",
  "i want to",
  "my decision",
  "i can approve",
  "i have authority",
  "my team handles",
  "i oversee",
  "i run",
  "we're looking",
  "i'm interested in working"
];

/**
 * Detect if contact is decision maker or gatekeeper
 * Returns contact_type, confidence, and signals found
 */
function detectContactType(replyBody, signature = '') {
  const body = (replyBody + ' ' + signature).toLowerCase();
  let dmScore = 0;
  let gkScore = 0;
  const signals = [];
  
  // Check title keywords in signature
  for (const title of DECISION_MAKER_TITLES) {
    if (body.includes(title)) {
      dmScore += 3;
      signals.push({ type: 'title', value: title, indicates: 'decision_maker' });
    }
  }
  
  for (const title of GATEKEEPER_TITLES) {
    // Only count if not also a decision maker title
    const hasHigherTitle = DECISION_MAKER_TITLES.some(dt => body.includes(dt));
    if (body.includes(title) && !hasHigherTitle) {
      gkScore += 2;
      signals.push({ type: 'title', value: title, indicates: 'gatekeeper' });
    }
  }
  
  // Check language patterns
  for (const pattern of GATEKEEPER_LANGUAGE) {
    if (body.includes(pattern)) {
      gkScore += 2;
      signals.push({ type: 'language', value: pattern, indicates: 'gatekeeper' });
    }
  }
  
  for (const pattern of DECISION_MAKER_LANGUAGE) {
    if (body.includes(pattern)) {
      dmScore += 2;
      signals.push({ type: 'language', value: pattern, indicates: 'decision_maker' });
    }
  }
  
  // Calculate result
  let contact_type = 'unknown';
  let confidence = 1;
  
  if (dmScore > gkScore && dmScore >= 2) {
    contact_type = 'decision_maker';
    confidence = Math.min(10, 3 + dmScore);
  } else if (gkScore > dmScore && gkScore >= 2) {
    contact_type = 'gatekeeper';
    confidence = Math.min(10, 3 + gkScore);
  } else if (dmScore === 0 && gkScore === 0) {
    contact_type = 'unknown';
    confidence = 1;
  } else {
    contact_type = 'unknown';
    confidence = 3;
  }
  
  return {
    contact_type,
    confidence,
    signals,
    dm_score: dmScore,
    gk_score: gkScore
  };
}

/**
 * Get gatekeeper-specific draft additions
 */
function getGatekeeperTactic(firstName, company) {
  const tactics = [
    `\n\nBy the way, is there someone on the marketing or partnerships team I should loop in on this conversation?`,
    `\n\nWould it help if I put together a quick overview you could share with your team?`,
    `\n\nHappy to include whoever makes the final call on partnerships - just let me know who that would be.`,
    `\n\nIf there's a decision maker who handles creator partnerships, feel free to CC them or point me their way.`
  ];
  return tactics[Math.floor(Math.random() * tactics.length)];
}

// ============================================
// FEATURE 8: DEAL VELOCITY TRACKING
// ============================================

const DEAL_STAGES = ['first_contact', 'first_reply', 'qualified', 'proposal_sent', 'negotiation', 'closed'];

/**
 * Update deal stage for a lead
 */
function updateDealStage(leadEmail, stage, timestamp = null) {
  const ts = timestamp || new Date().toISOString();
  
  if (!DEAL_VELOCITY.deals[leadEmail]) {
    DEAL_VELOCITY.deals[leadEmail] = {
      stages: {},
      current_stage: null,
      created_at: ts
    };
  }
  
  const deal = DEAL_VELOCITY.deals[leadEmail];
  
  // Only update if this is a new stage or progression
  const stageIndex = DEAL_STAGES.indexOf(stage);
  const currentIndex = deal.current_stage ? DEAL_STAGES.indexOf(deal.current_stage) : -1;
  
  if (stageIndex > currentIndex) {
    deal.stages[stage] = ts;
    deal.current_stage = stage;
    DEAL_VELOCITY.last_updated = ts;
    
    // Recalculate averages
    recalculateStageAverages();
    
    // Save
    saveDealVelocity();
    
    return { updated: true, previousStage: deal.current_stage, newStage: stage };
  }
  
  return { updated: false, currentStage: deal.current_stage };
}

/**
 * Recalculate average time per stage transition
 */
function recalculateStageAverages() {
  const transitions = {
    first_contact_to_first_reply: [],
    first_reply_to_qualified: [],
    qualified_to_proposal_sent: [],
    proposal_sent_to_negotiation: [],
    negotiation_to_closed: []
  };
  
  for (const deal of Object.values(DEAL_VELOCITY.deals)) {
    const stages = deal.stages;
    
    // Calculate time between each stage pair
    for (let i = 0; i < DEAL_STAGES.length - 1; i++) {
      const fromStage = DEAL_STAGES[i];
      const toStage = DEAL_STAGES[i + 1];
      const key = `${fromStage}_to_${toStage}`;
      
      if (stages[fromStage] && stages[toStage]) {
        const from = new Date(stages[fromStage]).getTime();
        const to = new Date(stages[toStage]).getTime();
        const hours = (to - from) / (1000 * 60 * 60);
        if (hours > 0 && hours < 8760) { // Less than a year
          transitions[key].push(hours);
        }
      }
    }
  }
  
  // Calculate averages
  for (const [key, times] of Object.entries(transitions)) {
    if (times.length > 0) {
      DEAL_VELOCITY.stage_averages[key] = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }
}

/**
 * Check velocity status for a specific deal
 */
function checkDealVelocity(leadEmail) {
  const deal = DEAL_VELOCITY.deals[leadEmail];
  if (!deal || !deal.current_stage) {
    return { velocity_status: 'unknown', stalled_at: null, acceleration_tactic: null };
  }
  
  const currentStage = deal.current_stage;
  const stageTimestamp = deal.stages[currentStage];
  const hoursSinceStage = (Date.now() - new Date(stageTimestamp).getTime()) / (1000 * 60 * 60);
  
  // Find the next transition's average
  const currentIndex = DEAL_STAGES.indexOf(currentStage);
  if (currentIndex >= DEAL_STAGES.length - 1) {
    return { velocity_status: 'closed', stalled_at: null, acceleration_tactic: null };
  }
  
  const nextStage = DEAL_STAGES[currentIndex + 1];
  const transitionKey = `${currentStage}_to_${nextStage}`;
  const avgHours = DEAL_VELOCITY.stage_averages[transitionKey];
  
  if (!avgHours) {
    // No average yet, use defaults (24h, 72h, 168h based on stage)
    const defaultHours = [24, 72, 168, 168, 336][currentIndex] || 72;
    return {
      velocity_status: hoursSinceStage > defaultHours * 2 ? 'stalled' : 
                       hoursSinceStage > defaultHours ? 'slowing' : 'on_track',
      hours_in_stage: Math.round(hoursSinceStage),
      avg_hours: defaultHours,
      stalled_at: currentStage,
      acceleration_tactic: hoursSinceStage > defaultHours ? 
        DEAL_VELOCITY.acceleration_tactics[transitionKey] : null
    };
  }
  
  // Compare to average
  let velocity_status = 'on_track';
  let acceleration_tactic = null;
  
  if (hoursSinceStage > avgHours * 2) {
    velocity_status = 'stalled';
    acceleration_tactic = DEAL_VELOCITY.acceleration_tactics[transitionKey];
  } else if (hoursSinceStage > avgHours * 1.5) {
    velocity_status = 'slowing';
    acceleration_tactic = DEAL_VELOCITY.acceleration_tactics[transitionKey];
  }
  
  return {
    velocity_status,
    hours_in_stage: Math.round(hoursSinceStage),
    avg_hours: Math.round(avgHours),
    stalled_at: velocity_status !== 'on_track' ? currentStage : null,
    acceleration_tactic
  };
}

/**
 * Get all stalled deals
 */
function getStalledDeals() {
  const stalled = [];
  
  for (const [email, deal] of Object.entries(DEAL_VELOCITY.deals)) {
    const velocity = checkDealVelocity(email);
    if (velocity.velocity_status === 'stalled' || velocity.velocity_status === 'slowing') {
      stalled.push({
        email,
        ...velocity,
        current_stage: deal.current_stage,
        stages: deal.stages
      });
    }
  }
  
  return stalled.sort((a, b) => b.hours_in_stage - a.hours_in_stage);
}

function saveDealVelocity() {
  try {
    fs.writeFileSync(DEAL_VELOCITY_PATH, JSON.stringify(DEAL_VELOCITY, null, 2));
  } catch (err) {
    console.error('Error saving deal velocity:', err.message);
  }
}

// ============================================
// FEATURE 9: TRIGGER EVENT MONITORING
// ============================================

/**
 * Add company to watch list
 */
function watchCompanyAdd(companyName, email, reason) {
  const existing = TRIGGER_EVENTS.watched_companies.find(
    c => c.company.toLowerCase() === companyName.toLowerCase()
  );
  
  if (existing) {
    existing.last_contact = new Date().toISOString();
    existing.reason = reason || existing.reason;
    existing.email = email || existing.email;
  } else {
    TRIGGER_EVENTS.watched_companies.push({
      company: companyName,
      email: email,
      reason: reason,
      last_contact: new Date().toISOString(),
      added_at: new Date().toISOString(),
      triggered: false
    });
  }
  
  TRIGGER_EVENTS.last_updated = new Date().toISOString();
  saveTriggerEvents();
  
  return { added: true, company: companyName };
}

/**
 * List watched companies
 */
function watchCompanyList() {
  return TRIGGER_EVENTS.watched_companies.map(c => ({
    company: c.company,
    email: c.email,
    reason: c.reason,
    days_cold: Math.round((Date.now() - new Date(c.last_contact).getTime()) / (1000 * 60 * 60 * 24)),
    triggered: c.triggered
  }));
}

/**
 * Fire a trigger event for a company
 */
function watchCompanyTrigger(companyName, eventDescription) {
  const company = TRIGGER_EVENTS.watched_companies.find(
    c => c.company.toLowerCase() === companyName.toLowerCase()
  );
  
  if (!company) {
    return { success: false, error: 'Company not in watch list' };
  }
  
  // Mark as triggered
  company.triggered = true;
  company.trigger_event = eventDescription;
  company.trigger_date = new Date().toISOString();
  
  // Generate reactivation draft
  const draft = generateReactivationDraft(company, eventDescription);
  
  // Log the trigger event
  TRIGGER_EVENTS.triggered_events.push({
    company: companyName,
    email: company.email,
    event: eventDescription,
    triggered_at: new Date().toISOString(),
    draft_generated: true
  });
  
  TRIGGER_EVENTS.last_updated = new Date().toISOString();
  saveTriggerEvents();
  
  return {
    success: true,
    company: companyName,
    email: company.email,
    event: eventDescription,
    draft
  };
}

/**
 * Generate reactivation draft based on trigger event
 */
function generateReactivationDraft(company, eventDescription) {
  const event = eventDescription.toLowerCase();
  let templateKey = 'default';
  
  // Detect event type
  if (event.includes('funding') || event.includes('raised') || event.includes('series') || event.includes('investment')) {
    templateKey = 'funding';
  } else if (event.includes('hire') || event.includes('new cmo') || event.includes('new head') || event.includes('joined')) {
    templateKey = 'new_hire';
  } else if (event.includes('launch') || event.includes('released') || event.includes('new product') || event.includes('announced')) {
    templateKey = 'product_launch';
  } else if (event.includes('expand') || event.includes('growth') || event.includes('new market') || event.includes('new office')) {
    templateKey = 'expansion';
  } else if (event.includes('partner') || event.includes('collaboration') || event.includes('deal with')) {
    templateKey = 'partnership';
  }
  
  let template = TRIGGER_EVENTS.reactivation_templates[templateKey] || TRIGGER_EVENTS.reactivation_templates.default;
  
  // Extract potential role from event (for new_hire template)
  let role = 'marketing leader';
  const roleMatch = event.match(/new (cmo|cfo|head of marketing|vp of|director of|marketing lead)/i);
  if (roleMatch) {
    role = roleMatch[1];
  }
  
  // Personalize template
  const firstName = company.email ? company.email.split('@')[0].split('.')[0] : 'there';
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  
  const draft = `Hey ${capitalizedName},\n\n` + template
    .replace(/\{\{company\}\}/g, company.company)
    .replace(/\{\{event\}\}/g, eventDescription)
    .replace(/\{\{role\}\}/g, role) +
    `\n\nBest,\nImann`;
  
  return draft;
}

function saveTriggerEvents() {
  try {
    fs.writeFileSync(TRIGGER_EVENTS_PATH, JSON.stringify(TRIGGER_EVENTS, null, 2));
  } catch (err) {
    console.error('Error saving trigger events:', err.message);
  }
}

// Industry-specific case studies for personalization
const INDUSTRY_CASE_STUDIES = {
  gaming: { case: 'Whiteout Survival', stats: '48M views, 100K+ new users', hook: 'gaming audiences love my story-driven approach' },
  edtech: { case: 'Gauth AI', stats: '15M+ views', hook: 'educational content integrates naturally into my skits' },
  fintech: { case: 'Gauth AI', stats: '15M+ views', hook: 'my audience is highly engaged with practical tools' },
  ecommerce: { case: 'Valeo', stats: '$30K campaign, strong conversions', hook: 'product integrations work great in story content' },
  saas: { case: 'Allison AI', stats: '$24K campaign', hook: 'tech demos flow naturally into my content style' },
  media: { case: 'Whiteout Survival', stats: '48M views', hook: 'entertainment brands see great engagement' },
  agency: { case: 'multiple brand partnerships', stats: '361M monthly views reach', hook: 'I work with agencies all the time' },
  healthtech: { case: 'Gauth AI', stats: '15M+ views', hook: 'health and wellness topics resonate with my audience' },
  default: { case: 'Whiteout Survival', stats: '48M views, 100K+ users', hook: 'brand integrations feel natural in my content' }
};

// Ghost tracking data file
const GHOST_TRACKING_PATH = path.join(__dirname, 'ghost-tracking.json');
let GHOST_TRACKING = { leads: {}, stats: { total_tracked: 0, ghosts_predicted: 0, accuracy: null }, last_updated: null };
try {
  GHOST_TRACKING = JSON.parse(fs.readFileSync(GHOST_TRACKING_PATH, 'utf8'));
} catch (err) {
  // Will be created on first tracking
}

/**
 * TONE MIRRORING
 * Analyzes incoming message style for response matching
 * Returns: { formality: 1-10, length: 'short'|'medium'|'long', style: 'formal'|'casual'|'friendly', greeting: string }
 */
function analyzeTone(message) {
  if (!message) return { formality: 5, length: 'medium', style: 'casual', greeting: '', punctuationStyle: 'normal' };
  
  const text = message.trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // === FORMALITY SCORE (1-10, 10 = most formal) ===
  let formality = 5;
  
  // Formal indicators (+points)
  const formalPatterns = [
    { pattern: /\b(dear|sincerely|regards|respectfully|hereby|pursuant|kindly|please find|attached herewith)\b/gi, weight: 1.5 },
    { pattern: /\b(would like to|I am writing to|I wish to|we would appreciate|at your earliest convenience)\b/gi, weight: 1 },
    { pattern: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|regarding|furthermore|therefore|however|additionally)\b/gi, weight: 0.5 },
    { pattern: /\b(corporation|organization|institution|committee|department)\b/gi, weight: 0.5 }
  ];
  
  // Casual indicators (-points)
  const casualPatterns = [
    { pattern: /\b(hey|hi there|yo|sup|what's up|gonna|wanna|gotta|kinda|sorta|yeah|yep|nope)\b/gi, weight: -1.5 },
    { pattern: /\b(cool|awesome|great|sounds good|no worries|no problem|btw|fyi|asap|lol|haha)\b/gi, weight: -1 },
    { pattern: /!{2,}|\?{2,}|\.{3,}/g, weight: -0.5 },
    { pattern: /[😀😃😄😁😊🙂😉😎👍👋🔥💯🎉]/g, weight: -1 }
  ];
  
  for (const p of formalPatterns) {
    const matches = text.match(p.pattern);
    if (matches) formality += matches.length * p.weight;
  }
  
  for (const p of casualPatterns) {
    const matches = text.match(p.pattern);
    if (matches) formality += matches.length * p.weight;
  }
  
  // First-person usage affects formality
  const firstPersonCasual = (text.match(/\b(i'm|i've|i'll|we're|we've|we'll|it's|that's)\b/gi) || []).length;
  const firstPersonFormal = (text.match(/\bI am\b|\bI have\b|\bWe are\b|\bWe have\b/g) || []).length;
  formality += (firstPersonFormal - firstPersonCasual * 0.3);
  
  formality = Math.max(1, Math.min(10, Math.round(formality)));
  
  // === LENGTH PREFERENCE ===
  let length;
  if (words.length <= 20) length = 'short';
  else if (words.length <= 75) length = 'medium';
  else length = 'long';
  
  // === STYLE CLASSIFICATION ===
  let style;
  if (formality >= 7) style = 'formal';
  else if (formality <= 3) style = 'friendly';
  else style = 'casual';
  
  // Check for friendly signals even in neutral formality
  const friendlySignals = /thanks!|appreciate it|love|excited|awesome|great|!$/i;
  if (friendlySignals.test(text) && formality < 7) style = 'friendly';
  
  // === GREETING DETECTION ===
  let greeting = '';
  const greetingPatterns = [
    { pattern: /^(dear\s+\w+)/i, style: 'Dear [Name]' },
    { pattern: /^(hello\s+\w+)/i, style: 'Hello [Name]' },
    { pattern: /^(hi\s+\w+)/i, style: 'Hi [Name]' },
    { pattern: /^(hey\s+\w+)/i, style: 'Hey [Name]' },
    { pattern: /^hello[,!]?\s/i, style: 'Hello' },
    { pattern: /^hi[,!]?\s/i, style: 'Hi' },
    { pattern: /^hey[,!]?\s/i, style: 'Hey' },
    { pattern: /^good (morning|afternoon|evening)/i, style: 'Good [time]' }
  ];
  
  for (const gp of greetingPatterns) {
    if (gp.pattern.test(text)) {
      greeting = gp.style;
      break;
    }
  }
  
  // === PUNCTUATION STYLE ===
  let punctuationStyle = 'normal';
  const exclamations = (text.match(/!/g) || []).length;
  const ellipses = (text.match(/\.{3}/g) || []).length;
  const emojis = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  
  if (exclamations >= 2 || emojis >= 1) punctuationStyle = 'enthusiastic';
  else if (ellipses >= 2) punctuationStyle = 'hesitant';
  else if (exclamations === 0 && text.length > 50) punctuationStyle = 'reserved';
  
  return {
    formality,
    length,
    style,
    greeting,
    punctuationStyle,
    // Raw metrics for debugging
    _metrics: {
      wordCount: words.length,
      sentenceCount: sentences.length,
      exclamations,
      emojis,
      ellipses
    }
  };
}

/**
 * Generate tone guidance for Claude based on analyzed tone
 */
function generateToneGuidance(toneProfile) {
  const guidance = [];
  
  // Formality guidance
  if (toneProfile.formality >= 7) {
    guidance.push('Use formal language and complete sentences');
    guidance.push('Avoid contractions (use "I am" instead of "I\'m")');
  } else if (toneProfile.formality <= 3) {
    guidance.push('Keep it casual and conversational');
    guidance.push('Contractions are fine, be friendly');
  }
  
  // Length guidance
  if (toneProfile.length === 'short') {
    guidance.push('Keep response brief (2-3 sentences max)');
  } else if (toneProfile.length === 'long') {
    guidance.push('Can be more detailed since they write longer messages');
  }
  
  // Style guidance
  if (toneProfile.style === 'friendly') {
    guidance.push('Match their friendly energy');
  } else if (toneProfile.style === 'formal') {
    guidance.push('Maintain professional tone throughout');
  }
  
  // Greeting guidance
  if (toneProfile.greeting) {
    guidance.push(`They use "${toneProfile.greeting}" style greetings - mirror this`);
  }
  
  // Punctuation guidance
  if (toneProfile.punctuationStyle === 'enthusiastic') {
    guidance.push('One exclamation mark is fine to match their energy');
  } else if (toneProfile.punctuationStyle === 'reserved') {
    guidance.push('No exclamation marks - they prefer reserved communication');
  }
  
  return guidance.join('. ') + '.';
}

/**
 * BUYING SIGNAL RADAR
 * Detects hot buying signals and scores readiness to close
 * Returns: { score: 0-10, signals: [], isHotLead: boolean, category: string }
 */
function analyzeBuyingSignals(message) {
  if (!message) return { score: 0, signals: [], isHotLead: false, category: 'none' };
  
  const text = message.toLowerCase();
  const signals = [];
  let score = 0;
  
  // === CONTRACT SIGNALS (very hot) ===
  const contractPatterns = [
    { pattern: /\b(contract|agreement|terms|sign|paperwork|proposal|quote|invoice)\b/gi, signal: 'contract_mention', weight: 2.5 },
    { pattern: /\b(send (me |us )?(the |a )?(contract|agreement|proposal))\b/gi, signal: 'requesting_contract', weight: 3 },
    { pattern: /\b(ready to (sign|proceed|move forward))\b/gi, signal: 'ready_to_sign', weight: 3.5 }
  ];
  
  // === TIMELINE SIGNALS (hot) ===
  const timelinePatterns = [
    { pattern: /\b(when can you start|how soon|asap|urgent|deadline|rush)\b/gi, signal: 'urgent_timeline', weight: 2 },
    { pattern: /\b(this quarter|this month|next week|by (monday|tuesday|wednesday|thursday|friday))\b/gi, signal: 'specific_timeline', weight: 2 },
    { pattern: /\b(need (this|it) (by|before|for))\b/gi, signal: 'deadline_pressure', weight: 2.5 },
    { pattern: /\b(q[1-4]|first quarter|second quarter|third quarter|fourth quarter)\b/gi, signal: 'quarter_mention', weight: 1.5 }
  ];
  
  // === BUDGET APPROVAL SIGNALS (very hot) ===
  const budgetPatterns = [
    { pattern: /\b(budget approved|green light|got approval|approved budget|budget is ready)\b/gi, signal: 'budget_approved', weight: 3.5 },
    { pattern: /\b(have (the )?budget|budget (is )?available|can afford|within (our )?budget)\b/gi, signal: 'budget_available', weight: 2.5 },
    { pattern: /\b(what('s| is) (the |your )?(price|cost|rate|investment))\b/gi, signal: 'price_inquiry', weight: 1.5 },
    { pattern: /\b(can you do|would you accept|flexible on pricing)\b/gi, signal: 'price_negotiation', weight: 2 }
  ];
  
  // === TEAM INVOLVEMENT SIGNALS (warm) ===
  const teamPatterns = [
    { pattern: /\b(my team|our team|the team) (wants|loves|is interested|approved)\b/gi, signal: 'team_buy_in', weight: 2.5 },
    { pattern: /\b(showing this to|sharing with|loop in|cc'ing|copying) (my |our )?(boss|manager|ceo|director|vp|team)\b/gi, signal: 'escalating_internally', weight: 2 },
    { pattern: /\b(decision maker|stakeholder|exec|leadership) (involved|on board|interested)\b/gi, signal: 'decision_maker_involved', weight: 3 },
    { pattern: /\b(we('re| are) (all )?interested|everyone('s| is) on board)\b/gi, signal: 'team_consensus', weight: 2.5 }
  ];
  
  // === SPECIFICS SIGNALS (warm - asking about deliverables) ===
  const specificsPatterns = [
    { pattern: /\b(what (formats?|types?|length)|how long|deliverables|requirements)\b/gi, signal: 'asking_deliverables', weight: 1.5 },
    { pattern: /\b(can you (include|add|do)|do you (offer|provide)|is it possible)\b/gi, signal: 'customization_request', weight: 1.5 },
    { pattern: /\b(send (me |us )?(your |the )?(media kit|deck|portfolio|case studies|examples))\b/gi, signal: 'requesting_materials', weight: 2 },
    { pattern: /\b(turnaround|lead time|how (long|quickly)|timeline for)\b/gi, signal: 'timeline_inquiry', weight: 1.5 }
  ];
  
  // === COMMITMENT SIGNALS (very hot) ===
  const commitmentPatterns = [
    { pattern: /\b(let('s| us) (do (it|this)|proceed|move forward|make (it|this) happen))\b/gi, signal: 'verbal_commitment', weight: 3 },
    { pattern: /\b(i('m| am) (in|ready|committed)|count (me|us) in|we('re| are) in)\b/gi, signal: 'explicit_commitment', weight: 3.5 },
    { pattern: /\b(deal|done|sold|yes|absolutely|definitely)\b/gi, signal: 'affirmative_response', weight: 1.5 },
    { pattern: /\b(excited to|looking forward to (working|partnering|collaborating))\b/gi, signal: 'excitement', weight: 2 }
  ];
  
  // Process all pattern groups
  const allPatterns = [
    ...contractPatterns,
    ...timelinePatterns,
    ...budgetPatterns,
    ...teamPatterns,
    ...specificsPatterns,
    ...commitmentPatterns
  ];
  
  for (const p of allPatterns) {
    const matches = message.match(p.pattern);
    if (matches) {
      signals.push({
        signal: p.signal,
        matches: matches.map(m => m.trim()),
        weight: p.weight
      });
      score += p.weight * Math.min(matches.length, 2); // Cap at 2 matches per pattern
    }
  }
  
  // Normalize score to 0-10
  score = Math.min(10, Math.round(score));
  
  // Determine category
  let category = 'none';
  if (score >= 8) category = 'ready_to_close';
  else if (score >= 6) category = 'highly_interested';
  else if (score >= 4) category = 'warming_up';
  else if (score >= 2) category = 'early_interest';
  else if (signals.length > 0) category = 'curious';
  
  // Hot lead flag
  const isHotLead = score >= 7;
  
  return {
    score,
    signals: signals.map(s => s.signal),
    signalDetails: signals,
    isHotLead,
    category,
    recommendation: isHotLead ? 'HOT_LEAD: Prioritize immediate human follow-up' : null
  };
}

/**
 * GHOST PREDICTION
 * Analyzes response patterns to predict if lead will ghost
 * Returns: { ghostRisk: 0-10, signals: [], shouldInterrupt: boolean }
 */
function analyzeGhostRisk(message, leadEmail = null) {
  if (!message) return { ghostRisk: 0, signals: [], shouldInterrupt: false };
  
  const text = message.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  let risk = 0;
  const signals = [];
  
  // === VAGUE LANGUAGE SIGNALS ===
  const vaguePatterns = [
    { pattern: /\b(maybe|perhaps|possibly|might|could be|we'll see|not sure|uncertain)\b/gi, signal: 'vague_language', weight: 1 },
    { pattern: /\b(i('ll| will) (try|think about it|get back|let you know))\b/gi, signal: 'non_committal', weight: 1.5 },
    { pattern: /\b(no promises|can't guarantee|depends|we'll see how it goes)\b/gi, signal: 'hedging', weight: 1.5 },
    { pattern: /\b(at some point|eventually|down the road|in the future|someday)\b/gi, signal: 'indefinite_timeline', weight: 1.5 }
  ];
  
  // === DISENGAGEMENT SIGNALS ===
  const disengagePatterns = [
    { pattern: /\b(busy|swamped|slammed|hectic|crazy time)\b/gi, signal: 'too_busy', weight: 1 },
    { pattern: /\b(not a priority|back burner|low priority|other things)\b/gi, signal: 'deprioritizing', weight: 2 },
    { pattern: /\b(reach out later|circle back|touch base later|revisit)\b/gi, signal: 'pushing_off', weight: 1.5 },
    { pattern: /\b(need to think|consider|evaluate|review internally)\b/gi, signal: 'delay_tactic', weight: 1 }
  ];
  
  // === MESSAGE LENGTH (short = risk) ===
  if (words.length <= 5) {
    signals.push({ signal: 'very_short_response', weight: 2 });
    risk += 2;
  } else if (words.length <= 10) {
    signals.push({ signal: 'short_response', weight: 1 });
    risk += 1;
  }
  
  // === NO QUESTIONS (no engagement) ===
  const hasQuestion = /\?/.test(text);
  if (!hasQuestion && words.length > 5) {
    signals.push({ signal: 'no_questions_asked', weight: 1 });
    risk += 1;
  }
  
  // === ONE-WORD/MINIMAL RESPONSES ===
  const minimalResponses = /^(ok|okay|sure|thanks|noted|got it|sounds good|will do|cool|fine|alright|k|yep|yup)\.?$/i;
  if (minimalResponses.test(text.trim())) {
    signals.push({ signal: 'minimal_response', weight: 2.5 });
    risk += 2.5;
  }
  
  // Process patterns
  for (const p of [...vaguePatterns, ...disengagePatterns]) {
    const matches = message.match(p.pattern);
    if (matches) {
      signals.push({
        signal: p.signal,
        matches: matches.map(m => m.trim()),
        weight: p.weight
      });
      risk += p.weight;
    }
  }
  
  // === CHECK HISTORICAL DATA (if lead email provided) ===
  let historicalRisk = 0;
  if (leadEmail && GHOST_TRACKING.leads[leadEmail]) {
    const history = GHOST_TRACKING.leads[leadEmail];
    
    // Increasing response times = risk
    if (history.responseTimes && history.responseTimes.length >= 2) {
      const times = history.responseTimes.slice(-3);
      const avgRecent = times.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const earlier = times[0];
      if (avgRecent > earlier * 1.5) {
        signals.push({ signal: 'response_time_increasing', weight: 1.5 });
        historicalRisk += 1.5;
      }
    }
    
    // Decreasing message length = risk
    if (history.messageLengths && history.messageLengths.length >= 2) {
      const lengths = history.messageLengths.slice(-3);
      const avgRecent = lengths.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const earlier = lengths[0];
      if (avgRecent < earlier * 0.5) {
        signals.push({ signal: 'message_length_declining', weight: 1.5 });
        historicalRisk += 1.5;
      }
    }
    
    // Multiple non-committal responses
    if (history.nonCommittalCount && history.nonCommittalCount >= 2) {
      signals.push({ signal: 'pattern_of_non_commitment', weight: 2 });
      historicalRisk += 2;
    }
  }
  
  risk += historicalRisk;
  
  // Normalize to 0-10
  const ghostRisk = Math.min(10, Math.round(risk));
  
  // Should we use pattern interrupt?
  const shouldInterrupt = ghostRisk >= 7;
  
  // Generate interrupt suggestion if needed
  let interruptSuggestion = null;
  if (shouldInterrupt) {
    const interruptTechniques = [
      'Try a pattern interrupt: Send something unexpected like a relevant case study or quick video',
      'Consider a breakup email: "Looks like timing isn\'t right - I\'ll close the loop unless I hear back"',
      'Change the medium: Suggest a quick 5-min call instead of more emails',
      'Add urgency: Mention a limited-time opportunity or upcoming campaign slot',
      'Go ultra-short: Reply with just "Still interested?" to break the formality'
    ];
    interruptSuggestion = interruptTechniques[Math.floor(Math.random() * interruptTechniques.length)];
  }
  
  return {
    ghostRisk,
    signals: signals.map(s => s.signal || s),
    signalDetails: signals.filter(s => s.matches),
    shouldInterrupt,
    interruptSuggestion,
    historicalDataUsed: leadEmail && GHOST_TRACKING.leads[leadEmail] ? true : false
  };
}

/**
 * Update ghost tracking data for a lead
 */
function updateGhostTracking(leadEmail, messageLength, responseTimeHours = null, wasNonCommittal = false) {
  if (!leadEmail) return;
  
  // Initialize lead record if needed
  if (!GHOST_TRACKING.leads[leadEmail]) {
    GHOST_TRACKING.leads[leadEmail] = {
      firstSeen: new Date().toISOString(),
      messageLengths: [],
      responseTimes: [],
      nonCommittalCount: 0,
      messageCount: 0
    };
    GHOST_TRACKING.stats.total_tracked++;
  }
  
  const lead = GHOST_TRACKING.leads[leadEmail];
  
  // Update metrics (keep last 5)
  lead.messageLengths.push(messageLength);
  if (lead.messageLengths.length > 5) lead.messageLengths.shift();
  
  if (responseTimeHours !== null) {
    lead.responseTimes.push(responseTimeHours);
    if (lead.responseTimes.length > 5) lead.responseTimes.shift();
  }
  
  if (wasNonCommittal) {
    lead.nonCommittalCount++;
  }
  
  lead.messageCount++;
  lead.lastSeen = new Date().toISOString();
  
  GHOST_TRACKING.last_updated = new Date().toISOString();
  
  // Save to file
  try {
    fs.writeFileSync(GHOST_TRACKING_PATH, JSON.stringify(GHOST_TRACKING, null, 2));
  } catch (err) {
    console.error('Error saving ghost tracking:', err.message);
  }
}

/**
 * Get ghost tracking stats
 */
function getGhostTrackingStats() {
  const leads = Object.entries(GHOST_TRACKING.leads);
  const highRiskLeads = leads.filter(([email, data]) => {
    const lastLength = data.messageLengths[data.messageLengths.length - 1] || 100;
    return lastLength < 20 || data.nonCommittalCount >= 2;
  });
  
  return {
    totalTracked: GHOST_TRACKING.stats.total_tracked,
    activeLeads: leads.length,
    highRiskCount: highRiskLeads.length,
    ghostsPredicted: GHOST_TRACKING.stats.ghosts_predicted,
    lastUpdated: GHOST_TRACKING.last_updated,
    highRiskLeads: highRiskLeads.slice(0, 5).map(([email, data]) => ({
      email: email.substring(0, 20) + '...',
      messages: data.messageCount,
      lastLength: data.messageLengths[data.messageLengths.length - 1],
      nonCommittal: data.nonCommittalCount
    }))
  };
}

// Intent categories
const INTENT_CATEGORIES = [
  'pricing_question',
  'timing_question', 
  'who_are_you',
  'not_interested',
  'wrong_person',
  'interested',
  'meeting_request',
  'info_request',
  'out_of_office',
  'no_budget',
  'bad_timing',
  'competitor',
  'internal_review',
  'other'
];

// Database connection
const getDb = () => new Client({
  host: 'db.rwhqshjmngkyremwandx.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'HUWCP0mlzUiTQqMo',
  ssl: { rejectUnauthorized: false }
});

// Response templates for quick cases (no AI needed)
const TEMPLATES = {
  out_of_office: null, // Don't reply to OOO
  wrong_person: `Thanks for letting me know. Could you point me to the right person who handles influencer partnerships or marketing at {{company}}?

Best,
Imann`,
  not_interested: null, // Don't reply, just block
  not_a_fit: null // Don't reply to NGOs etc
};

/**
 * INTENT CLASSIFICATION
 * Classifies incoming message into specific intent categories
 */
function classifyIntent(replyBody) {
  const body = replyBody.toLowerCase();
  
  // Intent keyword patterns (checked in priority order)
  const intentPatterns = {
    out_of_office: /out of office|ooo|vacation|away|returning|limited access|currently out|currently off|auto.?reply|automatic reply|holiday|annual leave|back on|will return/,
    
    not_interested: /not interested|no thanks|pass|decline|not for us|don't need|not looking|remove me|unsubscribe|stop emailing|don't contact|spam|take me off|opt.?out/,
    
    wrong_person: /wrong person|no longer|left the company|doesn't work here|not the right|has left|no longer with|not my department|talk to|reach out to|forward this/,
    
    no_budget: /no budget|don't have budget|budget constraints|can't afford|too expensive|budget is tight|allocated budget|no marketing budget|outside our budget|budget for this/,
    
    bad_timing: /bad timing|not right now|maybe later|next quarter|next year|busy season|end of quarter|planning phase|revisit later|circle back|touch base later/,
    
    competitor: /already working with|have a partner|using another|agency handles|existing relationship|current partner|already have|work with.*agency/,
    
    internal_review: /check with.*team|run it by|need approval|talk to my|discuss internally|get back to you|need to check|let me ask|sync with|share with|show my|check with my/,
    
    meeting_request: /schedule a call|let's meet|set up a call|book a time|are you free|when are you available|let's schedule|hop on a call|quick call|intro call|next week|calendar|calendly|book with me/,
    
    pricing_question: /how much|pricing|rates|cost|budget required|investment|price range|what do you charge|fee|quote|ballpark|package/,
    
    who_are_you: /who are you|what channel|what content|tell me about|what do you do|your channel|more about you|subscriber count|your audience|who is this/,
    
    timing_question: /when|how long|timeline|turnaround|lead time|how soon|availability|schedule/,
    
    info_request: /send info|more details|more information|tell me more|share more|learn more|what kind|examples|case study|portfolio/,
    
    interested: /interested|sounds good|love to|would like to|curious|definitely|yes|let's do|count me in|on board/
  };
  
  // Check each pattern
  for (const [intent, pattern] of Object.entries(intentPatterns)) {
    if (pattern.test(body)) {
      return intent;
    }
  }
  
  return 'other';
}

/**
 * SENTIMENT SCORING
 * Scores reply sentiment 1-10 and determines warm/cold lead status
 */
function scoreSentiment(replyBody) {
  const body = replyBody.toLowerCase();
  
  // Positive signals (add points)
  const positiveSignals = [
    { pattern: /interested|love|great|perfect|sounds good|yes|definitely|excited|amazing/g, weight: 2 },
    { pattern: /thank|thanks|appreciate/g, weight: 1 },
    { pattern: /let's|would like|happy to|looking forward/g, weight: 1.5 },
    { pattern: /schedule|call|meet|chat/g, weight: 1 },
    { pattern: /\!+/g, weight: 0.5 }, // Enthusiasm via exclamation
    { pattern: /when can|how soon|available/g, weight: 1 }
  ];
  
  // Negative signals (subtract points)
  const negativeSignals = [
    { pattern: /not interested|no thanks|pass|decline/g, weight: -3 },
    { pattern: /unsubscribe|spam|stop|remove/g, weight: -4 },
    { pattern: /no budget|can't afford|too expensive/g, weight: -2 },
    { pattern: /wrong person|not me|doesn't work here/g, weight: -1 },
    { pattern: /busy|no time|bad timing/g, weight: -1.5 },
    { pattern: /already have|working with|competitor/g, weight: -1.5 },
    { pattern: /unfortunately|sorry|regret/g, weight: -1 }
  ];
  
  // Neutral signals (minor adjustments)
  const neutralSignals = [
    { pattern: /out of office|vacation|away/g, weight: 0 }, // Neutral OOO
    { pattern: /maybe|perhaps|might|could/g, weight: -0.5 },
    { pattern: /question|wondering|curious/g, weight: 0.5 }
  ];
  
  // Start at neutral (5)
  let score = 5;
  
  // Apply positive signals
  for (const signal of positiveSignals) {
    const matches = body.match(signal.pattern);
    if (matches) {
      score += matches.length * signal.weight;
    }
  }
  
  // Apply negative signals
  for (const signal of negativeSignals) {
    const matches = body.match(signal.pattern);
    if (matches) {
      score += matches.length * signal.weight;
    }
  }
  
  // Apply neutral signals
  for (const signal of neutralSignals) {
    const matches = body.match(signal.pattern);
    if (matches) {
      score += matches.length * signal.weight;
    }
  }
  
  // Clamp to 1-10
  score = Math.max(1, Math.min(10, Math.round(score)));
  
  // Determine lead temperature
  let leadTemp;
  if (score >= 7) leadTemp = 'warm';
  else if (score >= 4) leadTemp = 'neutral';
  else leadTemp = 'cold';
  
  // Sentiment label
  let sentimentLabel;
  if (score >= 7) sentimentLabel = 'positive';
  else if (score >= 4) sentimentLabel = 'neutral';
  else sentimentLabel = 'negative';
  
  return {
    score,
    sentiment: sentimentLabel,
    leadTemperature: leadTemp
  };
}

/**
 * DRAFT CONFIDENCE SCORING
 * Evaluates quality of generated draft (1-10)
 */
function scoreDraftConfidence(draft, intent, originalMessage, lead) {
  if (!draft) return { score: 0, factors: {}, needsReview: true, reviewReason: 'No draft generated' };
  
  let score = 5; // Start neutral
  const factors = {};
  
  // Factor 1: Intent clarity (was the intent clear?)
  const clearIntents = ['meeting_request', 'pricing_question', 'not_interested', 'wrong_person', 'out_of_office'];
  if (clearIntents.includes(intent)) {
    factors.intentClarity = 2;
    score += 2;
  } else if (intent === 'other') {
    factors.intentClarity = -2;
    score -= 2;
  } else {
    factors.intentClarity = 1;
    score += 1;
  }
  
  // Factor 2: Personalization (includes name/company?)
  const firstName = lead.lead_name ? lead.lead_name.split(' ')[0] : null;
  if (firstName && draft.includes(firstName)) {
    factors.personalization = 1;
    score += 1;
  } else {
    factors.personalization = -1;
    score -= 1;
  }
  
  if (lead.lead_company && draft.toLowerCase().includes(lead.lead_company.toLowerCase())) {
    factors.companyMention = 1;
    score += 1;
  } else {
    factors.companyMention = 0;
  }
  
  // Factor 3: Response length (too short or too long?)
  const wordCount = draft.split(/\s+/).length;
  if (wordCount >= 20 && wordCount <= 100) {
    factors.length = 1;
    score += 1;
  } else if (wordCount < 10 || wordCount > 150) {
    factors.length = -1;
    score -= 1;
  } else {
    factors.length = 0;
  }
  
  // Factor 4: Has call to action (time slots or question?)
  if (draft.match(/\?/) || draft.match(/monday|tuesday|wednesday|thursday|friday|am|pm/i)) {
    factors.callToAction = 1;
    score += 1;
  } else {
    factors.callToAction = -1;
    score -= 1;
  }
  
  // Factor 5: Template vs AI generated (templates are more reliable)
  // This is set externally based on draftMethod
  
  // Clamp to 1-10
  score = Math.max(1, Math.min(10, score));
  
  // Determine if needs review
  const needsReview = score < 6;
  let reviewReason = null;
  
  if (needsReview) {
    const issues = [];
    if (factors.intentClarity < 0) issues.push('unclear intent');
    if (factors.personalization < 0) issues.push('missing personalization');
    if (factors.length < 0) issues.push('unusual length');
    if (factors.callToAction < 0) issues.push('no clear CTA');
    reviewReason = issues.join(', ') || 'low overall confidence';
  }
  
  return {
    score,
    factors,
    needsReview,
    reviewReason
  };
}

/**
 * PERSONALIZATION LAYER
 * Calculates personalization score and adds relevant details to drafts
 */
function calculatePersonalizationScore(enrichment, threadContext) {
  let score = 0;
  const factors = {};
  
  // Factor 1: Industry identified (can use relevant case study)
  if (enrichment?.industry && enrichment.industry !== 'other') {
    score += 25;
    factors.industry = true;
  }
  
  // Factor 2: Company name available
  if (enrichment?.company_name) {
    score += 20;
    factors.company = true;
  }
  
  // Factor 3: Timezone detected (localized scheduling)
  if (enrichment?.timezone && enrichment.timezone !== 'America/New_York') {
    score += 15;
    factors.timezone = true;
  }
  
  // Factor 4: Thread context available (previous conversation)
  if (threadContext?.hasHistory) {
    score += 30;
    factors.thread_history = true;
  }
  
  // Factor 5: Company size known
  if (enrichment?.company_size && enrichment.company_size !== 'unknown') {
    score += 10;
    factors.company_size = true;
  }
  
  return { score: Math.min(score, 100), factors };
}

/**
 * Get relevant case study for industry
 */
function getIndustryCaseStudy(industry) {
  return INDUSTRY_CASE_STUDIES[industry] || INDUSTRY_CASE_STUDIES.default;
}

/**
 * THREAD MEMORY
 * Fetches thread history and builds context for drafting
 */
async function getThreadContext(leadEmail, campaignId) {
  if (!leadEmail) return { hasHistory: false, messageCount: 0, pitchesUsed: [], lastTopics: [] };
  
  const db = getDb();
  await db.connect();
  
  try {
    // Get thread with message history
    const result = await db.query(`
      SELECT * FROM email_threads 
      WHERE lead_email = $1 
      ORDER BY last_reply_at DESC NULLS LAST
      LIMIT 1
    `, [leadEmail]);
    
    if (result.rows.length === 0) {
      await db.end();
      return { hasHistory: false, messageCount: 0, pitchesUsed: [], lastTopics: [] };
    }
    
    const thread = result.rows[0];
    const messages = thread.messages || [];
    
    // Extract topics/pitches from previous messages
    const pitchesUsed = [];
    const lastTopics = [];
    
    for (const msg of messages.slice(-5)) { // Last 5 messages
      const text = (msg.text || '').toLowerCase();
      
      // Track if we already pitched specific things
      if (text.includes('whiteout')) pitchesUsed.push('whiteout_survival');
      if (text.includes('gauth')) pitchesUsed.push('gauth_ai');
      if (text.includes('361m') || text.includes('361 million')) pitchesUsed.push('view_count');
      if (text.includes('10m') || text.includes('10 million')) pitchesUsed.push('sub_count');
      if (text.includes('$15') || text.includes('$25') || text.includes('$30')) pitchesUsed.push('pricing');
      
      // Track topics discussed
      if (text.includes('budget')) lastTopics.push('budget');
      if (text.includes('timing') || text.includes('quarter')) lastTopics.push('timing');
      if (text.includes('team') || text.includes('approval')) lastTopics.push('internal');
    }
    
    await db.end();
    
    return {
      hasHistory: messages.length > 0,
      messageCount: thread.message_count || messages.length,
      pitchesUsed: [...new Set(pitchesUsed)],
      lastTopics: [...new Set(lastTopics)],
      lastReplyAt: thread.last_reply_at,
      firstContactAt: thread.first_contact_at
    };
    
  } catch (err) {
    await db.end();
    console.error('Thread context error:', err.message);
    return { hasHistory: false, messageCount: 0, pitchesUsed: [], lastTopics: [] };
  }
}

/**
 * EDIT TRACKING
 * Records when drafts are edited before sending
 */
function recordEdit(originalDraft, finalDraft, intent, leadEmail) {
  if (!originalDraft || !finalDraft || originalDraft === finalDraft) return;
  
  // Calculate simple edit distance (word changes)
  const originalWords = originalDraft.toLowerCase().split(/\s+/);
  const finalWords = finalDraft.toLowerCase().split(/\s+/);
  const editDistance = Math.abs(originalWords.length - finalWords.length) + 
    originalWords.filter(w => !finalWords.includes(w)).length;
  
  const edit = {
    timestamp: new Date().toISOString(),
    intent,
    lead_email: leadEmail,
    original_length: originalDraft.length,
    final_length: finalDraft.length,
    edit_distance: editDistance,
    original_preview: originalDraft.substring(0, 100),
    final_preview: finalDraft.substring(0, 100)
  };
  
  // Add to edits (keep last 100)
  EDIT_TRACKING.edits.unshift(edit);
  if (EDIT_TRACKING.edits.length > 100) {
    EDIT_TRACKING.edits = EDIT_TRACKING.edits.slice(0, 100);
  }
  
  // Update stats
  EDIT_TRACKING.stats.total_edits++;
  EDIT_TRACKING.stats.by_intent[intent] = (EDIT_TRACKING.stats.by_intent[intent] || 0) + 1;
  
  // Recalculate average edit distance
  const recentEdits = EDIT_TRACKING.edits.slice(0, 50);
  EDIT_TRACKING.stats.average_edit_distance = 
    recentEdits.reduce((sum, e) => sum + e.edit_distance, 0) / recentEdits.length;
  
  EDIT_TRACKING.last_updated = new Date().toISOString();
  
  // Save to file
  try {
    fs.writeFileSync(EDIT_TRACKING_PATH, JSON.stringify(EDIT_TRACKING, null, 2));
  } catch (err) {
    console.error('Error saving edit tracking:', err.message);
  }
  
  return edit;
}

/**
 * Get edit statistics
 */
function getEditStats() {
  const stats = EDIT_TRACKING.stats;
  const edits = EDIT_TRACKING.edits;
  
  // Find most edited intents
  const intentsByEdits = Object.entries(stats.by_intent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  // Recent edits summary
  const recent = edits.slice(0, 10).map(e => ({
    intent: e.intent,
    distance: e.edit_distance,
    when: e.timestamp
  }));
  
  return {
    total_edits: stats.total_edits,
    average_edit_distance: Math.round(stats.average_edit_distance * 10) / 10,
    most_edited_intents: intentsByEdits,
    recent_edits: recent,
    last_updated: EDIT_TRACKING.last_updated
  };
}

/**
 * Get objection template if applicable
 * Enhanced with personalization layer
 */
function getObjectionTemplate(intent, lead, enrichment = null, threadContext = null) {
  // Map intents to objection template keys
  const intentToTemplateKey = {
    'no_budget': 'no_budget',
    'bad_timing': 'bad_timing',
    'wrong_person': 'wrong_person',
    'not_interested': 'not_interested',
    'competitor': 'already_working_with_someone',
    'internal_review': 'need_to_check_with_team',
    'pricing_question': 'pricing_question',
    'who_are_you': 'who_are_you'
  };
  
  const templateKey = intentToTemplateKey[intent] || intent;
  const objection = OBJECTION_TEMPLATES[templateKey];
  if (!objection || !objection.templates || objection.templates.length === 0) {
    return null;
  }
  
  // Pick random template
  const template = objection.templates[Math.floor(Math.random() * objection.templates.length)];
  
  // Get time slots for personalization (use enriched timezone if available)
  const timezone = enrichment?.timezone || 'America/New_York';
  const timeSlots = generateTimeSlots(timezone);
  
  // Calculate next quarter
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
  
  // Personalize template
  const firstName = lead.lead_name ? lead.lead_name.split(' ')[0] : 'there';
  
  // Get industry-specific case study
  const industry = enrichment?.industry || 'other';
  const caseStudy = getIndustryCaseStudy(industry);
  
  // Build personalized response
  let response = template
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company\}\}/g, lead.lead_company || 'your company')
    .replace(/\{\{next_quarter\}\}/g, nextQuarter.toString())
    .replace(/\{\{slot1\}\}/g, timeSlots[0] || '')
    .replace(/\{\{slot2\}\}/g, timeSlots[1] || '')
    .replace(/\{\{slot3\}\}/g, timeSlots[2] || '');
  
  // Add industry-specific case study reference if not already mentioned
  // and if we haven't pitched this before (thread memory)
  if (threadContext?.pitchesUsed?.length > 0) {
    // Avoid repeating the same pitch
    const caseName = caseStudy.case.toLowerCase().replace(/\s+/g, '_');
    if (!threadContext.pitchesUsed.includes(caseName)) {
      // Could inject case study, but keep response concise for now
    }
  }
  
  return response;
}

// System prompt for AI drafting
const SYSTEM_PROMPT = `You are drafting email replies for Imann, a YouTuber with 10M subscribers who does brand partnerships.

CONTEXT:
- Channel: ItssIMANNN (story-driven moral skits)
- Stats: Up to 361M monthly views
- Past success: Whiteout Survival (48M views, 100K+ new users), Gauth AI (15M+ views)
- Goal: Book a meeting to discuss a paid collaboration

RULES:
1. Keep replies SHORT (2-4 sentences max)
2. Be casual and friendly, not corporate
3. Always propose 3 specific meeting times (use placeholder: [TIME_SLOT_1], [TIME_SLOT_2], [TIME_SLOT_3])
4. Never use exclamation marks
5. Match the lead's energy/tone
6. If they ask for info, give brief answer then propose times
7. Sign off as "Imann" or "Best, Imann"

NEVER include:
- Long explanations
- Multiple questions
- Corporate jargon
- Exclamation marks`;

/**
 * Enhanced classifier using intent classification
 * Returns: category, subcategory (intent), shouldReply, shouldBlock, sentiment data
 */
function classifyReply(replyBody) {
  const body = replyBody.toLowerCase();
  
  // Get detailed intent
  const intent = classifyIntent(replyBody);
  
  // Get sentiment scoring
  const sentimentData = scoreSentiment(replyBody);
  
  // Map intent to category and actions
  const intentMapping = {
    out_of_office: { category: 'NEUTRAL', shouldReply: false, shouldBlock: false },
    not_interested: { category: 'NEGATIVE', shouldReply: false, shouldBlock: true },
    wrong_person: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    no_budget: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    bad_timing: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    competitor: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    internal_review: { category: 'POSITIVE', shouldReply: true, shouldBlock: false },
    meeting_request: { category: 'POSITIVE', shouldReply: true, shouldBlock: false },
    pricing_question: { category: 'POSITIVE', shouldReply: true, shouldBlock: false },
    who_are_you: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    timing_question: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false },
    info_request: { category: 'POSITIVE', shouldReply: true, shouldBlock: false },
    interested: { category: 'POSITIVE', shouldReply: true, shouldBlock: false },
    other: { category: 'NEUTRAL', shouldReply: true, shouldBlock: false }
  };
  
  // Special case: hard "not interested" with profanity should block
  if (body.match(/fuck|unsubscribe|stop emailing|remove me|don't contact|spam|take me off|opt.?out|please stop/)) {
    return {
      category: 'NEGATIVE',
      subcategory: 'not_interested',
      intent: 'not_interested',
      shouldReply: false,
      shouldBlock: true,
      ...sentimentData
    };
  }
  
  // Special case: soft "not interested" might be salvageable
  if (intent === 'not_interested' && !body.match(/unsubscribe|spam|stop|remove/)) {
    return {
      category: 'NEUTRAL',
      subcategory: 'not_interested_soft',
      intent: 'not_interested',
      shouldReply: true,  // Try to salvage
      shouldBlock: false,
      ...sentimentData
    };
  }
  
  // Special case: NGO/non-profit
  if (body.match(/ngo|non.?profit|don't do paid|no paid|not doing paid|volunteer|charity/)) {
    return {
      category: 'NEUTRAL',
      subcategory: 'not_a_fit',
      intent: 'not_a_fit',
      shouldReply: false,
      shouldBlock: false,
      ...sentimentData
    };
  }
  
  const mapping = intentMapping[intent] || intentMapping.other;
  
  return {
    category: mapping.category,
    subcategory: intent,
    intent: intent,
    shouldReply: mapping.shouldReply,
    shouldBlock: mapping.shouldBlock,
    ...sentimentData
  };
}

/**
 * Generate time slots for the next few days
 * Adjusts timezone label based on lead's timezone
 */
function generateTimeSlots(leadTimezone = 'America/New_York') {
  const slots = [];
  const now = new Date();
  
  // Timezone abbreviations
  const tzAbbrev = {
    'America/New_York': 'ET',
    'America/Los_Angeles': 'PT',
    'America/Chicago': 'CT',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Europe/Berlin': 'CET',
    'Europe/Warsaw': 'CET',
    'Asia/Tokyo': 'JST',
    'Asia/Singapore': 'SGT',
    'Australia/Sydney': 'AEST'
  };
  
  const tz = tzAbbrev[leadTimezone] || 'ET';
  
  // Generate slots for next 5 business days
  for (let i = 1; i <= 7 && slots.length < 3; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    // Morning and afternoon options (good times for both US and lead's TZ)
    if (slots.length < 3) {
      slots.push(`${dayName} ${monthDay} at 10am ${tz}`);
    }
    if (slots.length < 3) {
      slots.push(`${dayName} ${monthDay} at 2pm ${tz}`);
    }
  }
  
  return slots.slice(0, 3);
}

/**
 * Smart templates for different scenarios
 */
const SMART_TEMPLATES = {
  meeting_request: [
    `Hey {{first_name}}, sounds good. How about one of these times?

- {{slot1}}
- {{slot2}}
- {{slot3}}

Let me know what works.

Best,
Imann`,
    `{{first_name}} - perfect, let's do it.

Any of these work for you?
- {{slot1}}
- {{slot2}}
- {{slot3}}

Imann`
  ],
  
  interested: [
    `Hey {{first_name}}, glad this caught your attention.

Rates depend on the format - integrations run $15-25K, dedicated videos $30-45K. Happy to walk through what would work best for {{company}}.

How about a quick call? Any of these work?
- {{slot1}}
- {{slot2}}
- {{slot3}}

Imann`,
    `{{first_name}} - appreciate the interest.

For {{company}}, I'm thinking either an integration in one of my story videos or a dedicated piece. Let's jump on a call and I can share some ideas.

Times that work:
- {{slot1}}
- {{slot2}}
- {{slot3}}

Best,
Imann`
  ],
  
  question: [
    `Hey {{first_name}}, good question.

Easier to explain on a quick call - would any of these times work?
- {{slot1}}
- {{slot2}}
- {{slot3}}

Imann`,
    `{{first_name}} - let me walk you through it.

Free for a quick call? Here are some times:
- {{slot1}}
- {{slot2}}
- {{slot3}}

Best,
Imann`
  ]
};

/**
 * Draft a response using smart templates
 */
function draftResponseSmart(lead, replyBody, classification) {
  const timeSlots = generateTimeSlots();
  const templates = SMART_TEMPLATES[classification.subcategory];
  
  if (!templates || templates.length === 0) return null;
  
  // Pick a random template for variety
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Get first name
  const firstName = lead.lead_name ? lead.lead_name.split(' ')[0] : 'there';
  
  return template
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company\}\}/g, lead.lead_company || 'your company')
    .replace(/\{\{slot1\}\}/g, timeSlots[0])
    .replace(/\{\{slot2\}\}/g, timeSlots[1])
    .replace(/\{\{slot3\}\}/g, timeSlots[2]);
}

/**
 * Draft a response using template
 */
function draftResponseTemplate(lead, classification) {
  const template = TEMPLATES[classification.subcategory];
  if (!template) return null;
  
  return template
    .replace('{{company}}', lead.lead_company || 'your company')
    .replace('{{name}}', lead.lead_name || 'there');
}

/**
 * Process a reply and generate draft with intelligence
 * Enhanced with personalization layer, thread memory, tone mirroring, buying signals, and ghost prediction
 */
async function processReply(webhookLog) {
  const classification = classifyReply(webhookLog.reply_body);
  
  // === NEW: Tone Analysis ===
  const toneProfile = analyzeTone(webhookLog.reply_body);
  
  // === NEW: Buying Signal Analysis ===
  const buyingSignals = analyzeBuyingSignals(webhookLog.reply_body);
  
  // === NEW: Ghost Risk Analysis ===
  const ghostAnalysis = analyzeGhostRisk(webhookLog.reply_body, webhookLog.lead_email);
  
  // Update ghost tracking
  const messageWords = (webhookLog.reply_body || '').split(/\s+/).length;
  const isNonCommittal = ghostAnalysis.signals.includes('non_committal') || 
                         ghostAnalysis.signals.includes('vague_language');
  updateGhostTracking(webhookLog.lead_email, messageWords, null, isNonCommittal);
  
  console.log(`\n📧 Processing: ${webhookLog.lead_email}`);
  console.log(`   Intent: ${classification.intent}`);
  console.log(`   Category: ${classification.category}/${classification.subcategory}`);
  console.log(`   Sentiment: ${classification.sentiment} (${classification.score}/10) - ${classification.leadTemperature} lead`);
  
  // NEW: Tone info
  console.log(`   Tone: ${toneProfile.style} (formality: ${toneProfile.formality}/10, ${toneProfile.length} messages)`);
  
  // NEW: Buying signals
  if (buyingSignals.score > 0) {
    console.log(`   🎯 Buying Signals: ${buyingSignals.score}/10 [${buyingSignals.category}]`);
    if (buyingSignals.isHotLead) {
      console.log(`   🔥 HOT LEAD - Immediate human attention recommended!`);
    }
  }
  
  // NEW: Ghost risk
  if (ghostAnalysis.ghostRisk >= 4) {
    console.log(`   👻 Ghost Risk: ${ghostAnalysis.ghostRisk}/10 ${ghostAnalysis.shouldInterrupt ? '⚠️ PATTERN INTERRUPT SUGGESTED' : ''}`);
    if (ghostAnalysis.interruptSuggestion) {
      console.log(`      💡 ${ghostAnalysis.interruptSuggestion}`);
    }
  }
  
  // === NEW FEATURE 5: Decision Maker vs Gatekeeper Detection ===
  const contactTypeAnalysis = detectContactType(webhookLog.reply_body, '');
  if (contactTypeAnalysis.contact_type !== 'unknown') {
    const icon = contactTypeAnalysis.contact_type === 'decision_maker' ? '👔' : '🚪';
    console.log(`   ${icon} Contact Type: ${contactTypeAnalysis.contact_type} (confidence: ${contactTypeAnalysis.confidence}/10)`);
    if (contactTypeAnalysis.signals.length > 0) {
      const signalSummary = contactTypeAnalysis.signals.slice(0, 2).map(s => s.value).join(', ');
      console.log(`      Signals: ${signalSummary}`);
    }
  }
  
  // === NEW FEATURE 8: Deal Velocity Tracking ===
  // Auto-update stage based on intent
  let velocityStatus = null;
  if (webhookLog.lead_email) {
    // Auto-detect stage from intent
    if (classification.intent === 'meeting_request' || classification.intent === 'interested') {
      updateDealStage(webhookLog.lead_email, 'first_reply');
    } else if (classification.intent === 'pricing_question') {
      updateDealStage(webhookLog.lead_email, 'qualified');
    }
    
    // Check velocity status
    velocityStatus = checkDealVelocity(webhookLog.lead_email);
    if (velocityStatus.velocity_status !== 'unknown' && velocityStatus.velocity_status !== 'on_track') {
      console.log(`   ⏱️ Velocity: ${velocityStatus.velocity_status.toUpperCase()} at ${velocityStatus.stalled_at} (${velocityStatus.hours_in_stage}h vs avg ${velocityStatus.avg_hours || '?'}h)`);
    }
  }
  
  console.log(`   Should Reply: ${classification.shouldReply}`);
  console.log(`   Should Block: ${classification.shouldBlock}`);
  
  // === LEAD INTELLIGENCE ===
  let enrichment = null;
  let thread = null;
  let threadContext = null;
  let duplicateInfo = null;
  let urgencyScore = 0;
  let personalizationScore = { score: 0, factors: {} };
  
  try {
    // Enrich lead with company info, timezone, industry
    enrichment = await enrichLead(webhookLog.lead_email, webhookLog.lead_company);
    console.log(`   Industry: ${enrichment.industry}, TZ: ${enrichment.timezone}`);
    
    // Get thread context BEFORE drafting (thread memory)
    threadContext = await getThreadContext(webhookLog.lead_email, webhookLog.campaign_id);
    if (threadContext.hasHistory) {
      console.log(`   Thread Memory: ${threadContext.messageCount} previous messages`);
      if (threadContext.pitchesUsed.length > 0) {
        console.log(`   Pitches Used: ${threadContext.pitchesUsed.join(', ')}`);
      }
    }
    
    // Get or create conversation thread
    if (webhookLog.campaign_id) {
      thread = await getOrCreateThread(webhookLog.lead_email, webhookLog.campaign_id);
      if (thread) {
        await addMessageToThread(thread.id, webhookLog.reply_body, 'reply');
        console.log(`   Thread: #${thread.message_count + 1} message`);
      }
    }
    
    // Check for duplicates from same company
    duplicateInfo = await checkForDuplicate(webhookLog.lead_email, webhookLog.lead_company);
    if (duplicateInfo.isDuplicate) {
      console.log(`   ⚠️ Duplicate: ${duplicateInfo.relatedLeads.length} other leads from same domain`);
    }
    
    // Calculate urgency
    urgencyScore = calculateUrgency(
      classification,
      thread ? thread.message_count : 0,
      webhookLog.reply_received_at
    );
    console.log(`   Urgency: ${urgencyScore}/100`);
    
    // Calculate personalization score
    personalizationScore = calculatePersonalizationScore(enrichment, threadContext);
    console.log(`   Personalization: ${personalizationScore.score}/100`);
    
  } catch (err) {
    console.error('   Intelligence error:', err.message);
  }
  
  // === DRAFT GENERATION (with personalization) ===
  let draft = null;
  let draftMethod = null;
  let confidence = { score: 0, factors: {}, needsReview: true, reviewReason: 'No draft' };
  
  if (classification.shouldReply) {
    // Priority 1: Check objection templates (most reliable - covers objections AND common positive intents)
    // Now passes enrichment and threadContext for personalization
    const templatedIntents = [
      'no_budget', 'bad_timing', 'wrong_person', 'competitor', 'internal_review', 
      'pricing_question', 'who_are_you', 'meeting_request', 'interested', 'info_request'
    ];
    if (templatedIntents.includes(classification.intent)) {
      draft = getObjectionTemplate(classification.intent, webhookLog, enrichment, threadContext);
      if (draft) {
        draftMethod = 'objection_template';
        console.log(`   Using objection template for: ${classification.intent}`);
        
        // Add industry case study if relevant and not pitched before
        const industry = enrichment?.industry || 'other';
        const caseStudy = getIndustryCaseStudy(industry);
        const casePitched = threadContext?.pitchesUsed?.some(p => 
          caseStudy.case.toLowerCase().includes(p.replace('_', ' '))
        );
        
        if (!casePitched && personalizationScore.factors.industry) {
          console.log(`   Industry match: ${industry} → ${caseStudy.case}`);
        }
      }
    }
    
    // Priority 2: Try simple template (for legacy cases)
    if (!draft) {
      draft = draftResponseTemplate(webhookLog, classification);
      if (draft) draftMethod = 'template';
    }
    
    // Priority 3: Use smart template with personalization
    if (!draft) {
      draft = draftResponseSmart(webhookLog, webhookLog.reply_body, classification, enrichment);
      if (draft) draftMethod = 'smart';
    }
    
    // Calculate confidence score for the draft
    if (draft) {
      confidence = scoreDraftConfidence(draft, classification.intent, webhookLog.reply_body, webhookLog);
      
      // Boost confidence for objection templates (they're pre-tested)
      if (draftMethod === 'objection_template') {
        confidence.score = Math.min(10, confidence.score + 2);
        confidence.factors.templateQuality = 2;
      }
      
      // Boost confidence for personalized drafts
      if (personalizationScore.score >= 50) {
        confidence.score = Math.min(10, confidence.score + 1);
        confidence.factors.personalization = 1;
      }
      
      // NEW: Add gatekeeper tactic if detected (tactfully ask to loop in decision maker)
      if (contactTypeAnalysis.contact_type === 'gatekeeper' && contactTypeAnalysis.confidence >= 5) {
        const firstName = webhookLog.lead_name ? webhookLog.lead_name.split(' ')[0] : 'there';
        const gatekeeperTactic = getGatekeeperTactic(firstName, webhookLog.lead_company);
        // Only add if draft doesn't already mention "decision maker" or similar
        if (!draft.toLowerCase().includes('decision maker') && !draft.toLowerCase().includes('loop in')) {
          draft = draft.replace(/\n\nBest,\nImann$/i, gatekeeperTactic + '\n\nBest,\nImann');
          console.log(`   🚪 Added gatekeeper escalation tactic`);
          confidence.factors.gatekeeperTactic = true;
        }
      }
      
      // NEW: Add velocity acceleration note if deal is stalled
      if (velocityStatus && (velocityStatus.velocity_status === 'stalled' || velocityStatus.velocity_status === 'slowing')) {
        console.log(`   ⚡ Velocity tactic: ${velocityStatus.acceleration_tactic?.substring(0, 60)}...`);
        confidence.factors.velocityAlert = velocityStatus.velocity_status;
      }
      
      console.log(`   Draft confidence: ${confidence.score}/10 ${confidence.needsReview ? '⚠️ NEEDS REVIEW: ' + confidence.reviewReason : '✓'}`);
    }
  }
  
  return {
    ...classification,
    draft,
    draftMethod,
    timeSlots: generateTimeSlots(enrichment?.timezone),
    // Confidence data
    confidence: confidence.score,
    confidenceFactors: confidence.factors,
    needsReview: confidence.needsReview,
    reviewReason: confidence.reviewReason,
    // Sentiment data (already spread from classification)
    sentimentScore: classification.score,
    sentimentLabel: classification.sentiment,
    leadTemperature: classification.leadTemperature,
    // Intelligence data
    enrichment,
    threadCount: thread ? thread.message_count + 1 : 1,
    isDuplicate: duplicateInfo?.isDuplicate || false,
    relatedLeads: duplicateInfo?.relatedLeads || [],
    urgencyScore,
    // Personalization data
    personalizationScore: personalizationScore.score,
    personalizationFactors: personalizationScore.factors,
    // Thread context
    threadContext: threadContext ? {
      hasHistory: threadContext.hasHistory,
      messageCount: threadContext.messageCount,
      pitchesUsed: threadContext.pitchesUsed,
      lastTopics: threadContext.lastTopics
    } : null,
    // NEW: Tone Mirroring
    toneProfile: {
      formality: toneProfile.formality,
      length: toneProfile.length,
      style: toneProfile.style,
      greeting: toneProfile.greeting,
      punctuationStyle: toneProfile.punctuationStyle
    },
    toneGuidance: generateToneGuidance(toneProfile),
    // NEW: Buying Signals
    buyingSignals: {
      score: buyingSignals.score,
      signals: buyingSignals.signals,
      isHotLead: buyingSignals.isHotLead,
      category: buyingSignals.category
    },
    isHotLead: buyingSignals.isHotLead,
    // NEW: Ghost Prediction
    ghostRisk: {
      score: ghostAnalysis.ghostRisk,
      signals: ghostAnalysis.signals,
      shouldInterrupt: ghostAnalysis.shouldInterrupt,
      interruptSuggestion: ghostAnalysis.interruptSuggestion
    },
    // PHASE 2: Contact Type (Decision Maker vs Gatekeeper)
    contactType: {
      type: contactTypeAnalysis.contact_type,
      confidence: contactTypeAnalysis.confidence,
      signals: contactTypeAnalysis.signals.map(s => s.value)
    },
    isGatekeeper: contactTypeAnalysis.contact_type === 'gatekeeper',
    isDecisionMaker: contactTypeAnalysis.contact_type === 'decision_maker',
    // PHASE 2: Deal Velocity
    velocityStatus: velocityStatus ? {
      status: velocityStatus.velocity_status,
      hoursInStage: velocityStatus.hours_in_stage,
      avgHours: velocityStatus.avg_hours,
      stalledAt: velocityStatus.stalled_at,
      accelerationTactic: velocityStatus.acceleration_tactic
    } : null
  };
}

/**
 * Save draft to database with intelligence data
 */
async function saveDraft(db, webhookLog, result) {
  // Update webhook log as processed
  await db.query(`
    UPDATE smartlead_webhook_log 
    SET 
      category = $1,
      subcategory = $2,
      should_block = $3,
      processed = true,
      processed_at = NOW()
    WHERE id = $4
  `, [
    result.category,
    result.subcategory,
    result.shouldBlock,
    webhookLog.id
  ]);
  
  // Determine status based on confidence
  let status = 'no_action';
  if (result.shouldBlock) {
    status = 'pending_block';
  } else if (result.draft) {
    // Flag low-confidence drafts for priority review
    status = result.needsReview ? 'priority_review' : 'pending_review';
  }
  
  // Save draft to drafts table (only if there's a response to send or action needed)
  if (result.draft || result.shouldBlock) {
    await db.query(`
      INSERT INTO smartlead_reply_drafts 
      (webhook_log_id, campaign_id, lead_id, lead_email, lead_name, lead_company, 
       original_message, category, subcategory, draft_response, draft_method, 
       time_slots, should_block, status,
       lead_timezone, lead_industry, lead_company_size, thread_count, 
       is_duplicate, urgency_score,
       intent, sentiment_score, sentiment_label, lead_temperature,
       confidence_score, needs_review, review_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
    `, [
      webhookLog.id,
      webhookLog.campaign_id,
      webhookLog.lead_id,
      webhookLog.lead_email,
      webhookLog.lead_name,
      webhookLog.lead_company,
      webhookLog.reply_body,
      result.category,
      result.subcategory,
      result.draft,
      result.draftMethod,
      result.timeSlots,
      result.shouldBlock,
      status,
      // Intelligence data
      result.enrichment?.timezone || 'America/New_York',
      result.enrichment?.industry || 'other',
      result.enrichment?.company_size || 'unknown',
      result.threadCount || 1,
      result.isDuplicate || false,
      result.urgencyScore || 0,
      // New fields: intent, sentiment, confidence
      result.intent || result.subcategory,
      result.sentimentScore || 5,
      result.sentimentLabel || 'neutral',
      result.leadTemperature || 'neutral',
      result.confidence || 0,
      result.needsReview || false,
      result.reviewReason || null
    ]);
  }
}

/**
 * Process all unprocessed webhook logs
 */
async function processAllPending() {
  const db = getDb();
  await db.connect();
  
  try {
    // Get unprocessed logs
    const { rows } = await db.query(`
      SELECT * FROM smartlead_webhook_log 
      WHERE processed = false 
      ORDER BY id ASC
    `);
    
    console.log(`\n🔄 Processing ${rows.length} pending replies...\n`);
    
    const results = [];
    
    for (const log of rows) {
      const result = await processReply(log);
      await saveDraft(db, log, result);
      
      results.push({
        email: log.lead_email,
        company: log.lead_company,
        category: `${result.category}/${result.subcategory}`,
        action: result.shouldBlock ? 'BLOCK' : (result.shouldReply ? 'REPLY' : 'SKIP'),
        draft: result.draft ? result.draft.substring(0, 100) + '...' : null
      });
      
      if (result.draft) {
        console.log(`   Draft (${result.draftMethod}):`);
        console.log(`   "${result.draft.substring(0, 150)}..."\n`);
      }
    }
    
    return results;
    
  } finally {
    await db.end();
  }
}

// Export for use
module.exports = {
  classifyReply,
  classifyIntent,
  scoreSentiment,
  scoreDraftConfidence,
  getObjectionTemplate,
  processReply,
  processAllPending,
  draftResponseSmart,
  generateTimeSlots,
  testAnalyze,
  runBatchTests,
  // Personalization & Thread Memory
  calculatePersonalizationScore,
  getIndustryCaseStudy,
  getThreadContext,
  // Edit Tracking
  recordEdit,
  getEditStats,
  // NEW: Tone Mirroring
  analyzeTone,
  generateToneGuidance,
  // NEW: Buying Signals
  analyzeBuyingSignals,
  // NEW: Ghost Prediction
  analyzeGhostRisk,
  updateGhostTracking,
  getGhostTrackingStats,
  // PHASE 2: Contact Type Detection
  detectContactType,
  getGatekeeperTactic,
  // PHASE 2: Deal Velocity
  updateDealStage,
  checkDealVelocity,
  getStalledDeals,
  DEAL_STAGES,
  DEAL_VELOCITY,
  // PHASE 2: Trigger Event Monitoring
  watchCompanyAdd,
  watchCompanyList,
  watchCompanyTrigger,
  generateReactivationDraft,
  TRIGGER_EVENTS,
  // Constants
  OBJECTION_TEMPLATES,
  INTENT_CATEGORIES,
  INDUSTRY_CASE_STUDIES,
  GHOST_TRACKING
};

/**
 * Test mode - analyze a message without database
 * Enhanced with personalization layer, tone mirroring, buying signals, and ghost prediction
 */
function testAnalyze(message, leadName = 'John', leadCompany = 'Test Corp', leadEmail = null) {
  console.log('\n🧪 Test Analysis');
  console.log('─'.repeat(50));
  console.log(`Message: "${message}"\n`);
  
  // Intent classification
  const intent = classifyIntent(message);
  console.log(`📋 Intent: ${intent}`);
  
  // Sentiment scoring
  const sentiment = scoreSentiment(message);
  console.log(`💭 Sentiment: ${sentiment.sentiment} (${sentiment.score}/10)`);
  console.log(`🌡️  Lead Temperature: ${sentiment.leadTemperature}`);
  
  // NEW: Tone analysis
  const tone = analyzeTone(message);
  console.log(`🎨 Tone: ${tone.style} (formality: ${tone.formality}/10)`);
  
  // NEW: Buying signals
  const buyingSignals = analyzeBuyingSignals(message);
  if (buyingSignals.score > 0) {
    console.log(`🎯 Buying Signals: ${buyingSignals.score}/10 [${buyingSignals.category}]${buyingSignals.isHotLead ? ' 🔥 HOT LEAD' : ''}`);
  }
  
  // NEW: Ghost risk
  const ghostRisk = analyzeGhostRisk(message, leadEmail);
  if (ghostRisk.ghostRisk >= 3) {
    console.log(`👻 Ghost Risk: ${ghostRisk.ghostRisk}/10${ghostRisk.shouldInterrupt ? ' ⚠️ INTERRUPT' : ''}`);
  }
  
  // Full classification
  const classification = classifyReply(message);
  console.log(`📁 Category: ${classification.category}/${classification.subcategory}`);
  console.log(`📤 Should Reply: ${classification.shouldReply}`);
  console.log(`🚫 Should Block: ${classification.shouldBlock}`);
  
  // Mock enrichment based on company name
  const mockEnrichment = {
    industry: detectIndustry(leadEmail || '', leadCompany),
    company_name: leadCompany,
    timezone: 'America/New_York',
    company_size: 'unknown'
  };
  
  // Mock thread context (no history in test mode)
  const mockThreadContext = { hasHistory: false, messageCount: 0, pitchesUsed: [], lastTopics: [] };
  
  // Calculate personalization score
  const personalization = calculatePersonalizationScore(mockEnrichment, mockThreadContext);
  console.log(`\n🎨 Personalization:`);
  console.log(`   Industry: ${mockEnrichment.industry}`);
  console.log(`   Score: ${personalization.score}/100`);
  
  // Get industry case study
  const caseStudy = getIndustryCaseStudy(mockEnrichment.industry);
  console.log(`   Case Study: ${caseStudy.case} (${caseStudy.stats})`);
  
  // NEW: Show tone guidance
  console.log(`\n📝 Tone Guidance for Reply:`);
  console.log(`   ${generateToneGuidance(tone)}`);
  
  // Try objection template with personalization
  const mockLead = { lead_name: leadName, lead_company: leadCompany };
  const objectionDraft = getObjectionTemplate(intent, mockLead, mockEnrichment, mockThreadContext);
  if (objectionDraft) {
    console.log(`\n📝 Personalized Draft Response:`);
    console.log('─'.repeat(50));
    console.log(objectionDraft);
    
    // Confidence
    const confidence = scoreDraftConfidence(objectionDraft, intent, message, mockLead);
    console.log('─'.repeat(50));
    console.log(`✅ Confidence: ${confidence.score}/10 ${confidence.needsReview ? '⚠️ ' + confidence.reviewReason : ''}`);
  } else {
    console.log(`\n(No objection template for intent: ${intent})`);
  }
  
  return { intent, sentiment, classification, personalization, tone, buyingSignals, ghostRisk };
}

/**
 * Batch test - run multiple test scenarios
 * Enhanced with tone, buying signals, and ghost risk
 */
function runBatchTests() {
  const testCases = [
    { msg: "What are your rates?", name: "Sarah", company: "AdCo" },
    { msg: "Sounds great! Let's schedule a call", name: "Mike", company: "BrandX" },
    { msg: "Not interested, please remove me", name: "Karen", company: "Corp" },
    { msg: "I'm on vacation until next week", name: "John", company: "Startup" },
    { msg: "Let me check with my team first", name: "Lisa", company: "TechCo" },
    { msg: "We already work with an influencer agency", name: "Tom", company: "BigBrand" },
    { msg: "Who are you and what's your channel about?", name: "Amy", company: "MediaCo" },
    { msg: "Not the best time, maybe next quarter?", name: "Dave", company: "FinanceInc" },
    { msg: "We don't have budget for this right now", name: "Chris", company: "SmallBiz" },
    { msg: "Wrong person, try marketing@company.com", name: "Pat", company: "Acme" },
    // NEW: Hot lead scenarios
    { msg: "Budget is approved, let's do this ASAP!", name: "Hot", company: "ReadyCo" },
    { msg: "ok", name: "Ghost", company: "MaybeInc" },
    { msg: "Maybe... I'll think about it eventually", name: "Vanish", company: "GhostCorp" }
  ];
  
  console.log('\n📊 BATCH TEST RESULTS');
  console.log('═'.repeat(100));
  
  const results = testCases.map(tc => {
    const intent = classifyIntent(tc.msg);
    const sentiment = scoreSentiment(tc.msg);
    const classification = classifyReply(tc.msg);
    const mockLead = { lead_name: tc.name, lead_company: tc.company };
    const draft = getObjectionTemplate(intent, mockLead);
    const confidence = draft ? scoreDraftConfidence(draft, intent, tc.msg, mockLead) : null;
    
    // NEW: Tone analysis
    const tone = analyzeTone(tc.msg);
    
    // NEW: Buying signals
    const buying = analyzeBuyingSignals(tc.msg);
    
    // NEW: Ghost risk
    const ghost = analyzeGhostRisk(tc.msg);
    
    return {
      message: tc.msg.substring(0, 30) + (tc.msg.length > 30 ? '...' : ''),
      intent: intent.length > 12 ? intent.substring(0, 12) + '..' : intent,
      sent: `${sentiment.sentiment.substring(0, 3)} (${sentiment.score})`,
      temp: sentiment.leadTemperature.substring(0, 4),
      tone: tone.style.substring(0, 6),
      buy: buying.score > 0 ? `${buying.score}${buying.isHotLead ? '🔥' : ''}` : '-',
      ghost: ghost.ghostRisk >= 3 ? `${ghost.ghostRisk}${ghost.shouldInterrupt ? '⚠️' : ''}` : '-',
      reply: classification.shouldReply ? '✓' : '✗',
      block: classification.shouldBlock ? '⛔' : '',
      conf: confidence ? `${confidence.score}` : '-'
    };
  });
  
  console.table(results);
  
  // Summary
  const warm = results.filter(r => r.temp === 'warm').length;
  const cold = results.filter(r => r.temp === 'cold').length;
  const replies = results.filter(r => r.reply === '✓').length;
  const blocks = results.filter(r => r.block === '⛔').length;
  const hotLeads = results.filter(r => r.buy.includes('🔥')).length;
  const ghostRisks = results.filter(r => r.ghost !== '-').length;
  
  console.log(`\n📈 Summary:`);
  console.log(`   Leads: ${warm} warm, ${cold} cold | ${replies} to reply, ${blocks} to block`);
  console.log(`   Signals: ${hotLeads} hot leads 🔥, ${ghostRisks} ghost risks 👻`);
}

/**
 * Display edit tracking statistics
 */
function displayEditStats() {
  const stats = getEditStats();
  
  console.log('\n📝 EDIT TRACKING STATISTICS');
  console.log('═'.repeat(60));
  
  console.log(`\n📊 Overview:`);
  console.log(`   Total edits tracked: ${stats.total_edits}`);
  console.log(`   Average edit distance: ${stats.average_edit_distance} words`);
  console.log(`   Last updated: ${stats.last_updated || 'Never'}`);
  
  if (stats.most_edited_intents.length > 0) {
    console.log(`\n🎯 Most Edited Intents:`);
    stats.most_edited_intents.forEach(([intent, count], i) => {
      console.log(`   ${i + 1}. ${intent}: ${count} edits`);
    });
  }
  
  if (stats.recent_edits.length > 0) {
    console.log(`\n🕐 Recent Edits:`);
    stats.recent_edits.forEach((edit, i) => {
      const when = new Date(edit.when).toLocaleDateString();
      console.log(`   ${i + 1}. [${edit.intent}] ${edit.distance} word changes (${when})`);
    });
  } else {
    console.log(`\n   No edits recorded yet. Edits are tracked when drafts are modified before sending.`);
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('💡 To record an edit: recordEdit(originalDraft, finalDraft, intent, email)');
}

/**
 * Test buying signals CLI
 */
function testBuyingSignals(message) {
  console.log('\n🎯 BUYING SIGNAL RADAR');
  console.log('═'.repeat(60));
  console.log(`Message: "${message}"\n`);
  
  const result = analyzeBuyingSignals(message);
  
  // Visual score bar
  const filled = '█'.repeat(result.score);
  const empty = '░'.repeat(10 - result.score);
  console.log(`Score: [${filled}${empty}] ${result.score}/10`);
  console.log(`Category: ${result.category}`);
  
  if (result.isHotLead) {
    console.log('\n🔥 HOT LEAD DETECTED!');
    console.log('   This lead is showing strong buying intent.');
    console.log('   Recommend immediate human follow-up.');
  }
  
  if (result.signals.length > 0) {
    console.log('\n📡 Detected Signals:');
    result.signalDetails.forEach(s => {
      console.log(`   • ${s.signal} (+${s.weight})`);
      if (s.matches) {
        console.log(`     Matched: "${s.matches.join('", "')}"`);
      }
    });
  } else {
    console.log('\n   No strong buying signals detected.');
  }
  
  return result;
}

/**
 * Test tone analysis CLI
 */
function testToneAnalysis(message) {
  console.log('\n🎨 TONE ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`Message: "${message}"\n`);
  
  const tone = analyzeTone(message);
  
  // Formality bar
  const formalFilled = '█'.repeat(tone.formality);
  const formalEmpty = '░'.repeat(10 - tone.formality);
  console.log(`Formality: [${formalFilled}${formalEmpty}] ${tone.formality}/10`);
  console.log(`Style: ${tone.style}`);
  console.log(`Length preference: ${tone.length}`);
  console.log(`Punctuation: ${tone.punctuationStyle}`);
  if (tone.greeting) console.log(`Greeting style: ${tone.greeting}`);
  
  console.log('\n📝 Guidance for Reply:');
  console.log(`   ${generateToneGuidance(tone)}`);
  
  return tone;
}

/**
 * Test ghost risk CLI
 */
function testGhostRisk(message, email = null) {
  console.log('\n👻 GHOST RISK ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`Message: "${message}"\n`);
  
  const result = analyzeGhostRisk(message, email);
  
  // Risk bar
  const riskFilled = '█'.repeat(result.ghostRisk);
  const riskEmpty = '░'.repeat(10 - result.ghostRisk);
  console.log(`Ghost Risk: [${riskFilled}${riskEmpty}] ${result.ghostRisk}/10`);
  
  if (result.shouldInterrupt) {
    console.log('\n⚠️  HIGH GHOST RISK - Pattern interrupt suggested!');
  }
  
  if (result.signals.length > 0) {
    console.log('\n👀 Warning Signals:');
    result.signals.forEach(s => {
      console.log(`   • ${s}`);
    });
  }
  
  if (result.interruptSuggestion) {
    console.log('\n💡 Suggested Approach:');
    console.log(`   ${result.interruptSuggestion}`);
  }
  
  if (result.historicalDataUsed) {
    console.log('\n📊 Historical data was used in this analysis');
  }
  
  return result;
}

/**
 * Display ghost tracking stats
 */
function displayGhostStats() {
  const stats = getGhostTrackingStats();
  
  console.log('\n👻 GHOST TRACKING STATISTICS');
  console.log('═'.repeat(60));
  
  console.log(`\n📊 Overview:`);
  console.log(`   Total leads tracked: ${stats.totalTracked}`);
  console.log(`   Active leads: ${stats.activeLeads}`);
  console.log(`   High risk leads: ${stats.highRiskCount}`);
  console.log(`   Ghosts predicted: ${stats.ghostsPredicted}`);
  console.log(`   Last updated: ${stats.lastUpdated || 'Never'}`);
  
  if (stats.highRiskLeads.length > 0) {
    console.log(`\n⚠️  High Risk Leads:`);
    console.table(stats.highRiskLeads);
  }
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Test mode: node auto-reply-drafter.js test "message"
  if (args[0] === 'test' && args[1]) {
    testAnalyze(args[1], args[2] || 'John', args[3] || 'Test Corp');
  }
  // Batch test mode: node auto-reply-drafter.js batch
  else if (args[0] === 'batch') {
    runBatchTests();
  }
  // NEW: Buying signals test: node auto-reply-drafter.js signals "message"
  else if (args[0] === 'signals' && args[1]) {
    testBuyingSignals(args[1]);
  }
  // NEW: Tone analysis test: node auto-reply-drafter.js tone "message"
  else if (args[0] === 'tone' && args[1]) {
    testToneAnalysis(args[1]);
  }
  // NEW: Ghost risk test: node auto-reply-drafter.js ghost "message" [email]
  else if (args[0] === 'ghost' && args[1]) {
    testGhostRisk(args[1], args[2] || null);
  }
  // NEW: Ghost stats: node auto-reply-drafter.js ghosts
  else if (args[0] === 'ghosts') {
    displayGhostStats();
  }
  // NEW: Full analysis: node auto-reply-drafter.js analyze "message"
  else if (args[0] === 'analyze' && args[1]) {
    console.log('\n' + '═'.repeat(60));
    console.log('FULL MESSAGE ANALYSIS');
    console.log('═'.repeat(60));
    testAnalyze(args[1], args[2] || 'John', args[3] || 'Test Corp');
    testToneAnalysis(args[1]);
    testBuyingSignals(args[1]);
    testGhostRisk(args[1]);
  }
  // Edit tracking stats: node auto-reply-drafter.js edits
  else if (args[0] === 'edits') {
    if (args[1] === 'demo') {
      // Demo: record a sample edit
      console.log('\n📝 Recording demo edit...');
      const original = "Hey John, sounds good. How about one of these times?\n- Monday at 10am ET\n- Tuesday at 2pm ET\n\nBest, Imann";
      const edited = "Hey John, sounds good. Let's hop on a quick call.\n- Monday at 10am ET\n- Tuesday at 2pm ET\n\nLooking forward to it!\n\nBest, Imann";
      recordEdit(original, edited, 'meeting_request', 'demo@example.com');
      console.log('✓ Demo edit recorded');
      displayEditStats();
    } else {
      displayEditStats();
    }
  }
  // List intents
  else if (args[0] === 'intents') {
    console.log('\n📋 Supported Intent Categories:');
    INTENT_CATEGORIES.forEach(i => console.log(`  - ${i}`));
    console.log('\n📚 Objection Templates Loaded:');
    Object.keys(OBJECTION_TEMPLATES).forEach(k => {
      const t = OBJECTION_TEMPLATES[k];
      console.log(`  - ${k}: ${t.templates?.length || 0} templates`);
    });
    console.log('\n🏭 Industry Case Studies:');
    Object.entries(INDUSTRY_CASE_STUDIES).forEach(([ind, data]) => {
      if (ind !== 'default') {
        console.log(`  - ${ind}: ${data.case} (${data.stats})`);
      }
    });
  }
  // Personalization info
  else if (args[0] === 'personalization' || args[0] === 'personal') {
    console.log('\n🎨 PERSONALIZATION LAYER');
    console.log('═'.repeat(60));
    console.log('\nIndustry Case Studies:');
    Object.entries(INDUSTRY_CASE_STUDIES).forEach(([ind, data]) => {
      console.log(`\n  ${ind.toUpperCase()}`);
      console.log(`    Case: ${data.case}`);
      console.log(`    Stats: ${data.stats}`);
      console.log(`    Hook: ${data.hook}`);
    });
    console.log('\n\nPersonalization Score Factors:');
    console.log('  • Industry identified: +25 points');
    console.log('  • Company name available: +20 points');
    console.log('  • Non-US timezone detected: +15 points');
    console.log('  • Thread history exists: +30 points');
    console.log('  • Company size known: +10 points');
    console.log('\n  Maximum score: 100 points');
  }
  // NEW PHASE 2: Contact type test
  else if (args[0] === 'contact' && args[1]) {
    console.log('\n👔 CONTACT TYPE DETECTION');
    console.log('═'.repeat(60));
    console.log(`Message: "${args[1]}"\n`);
    const result = detectContactType(args[1], args[2] || '');
    console.log(`Contact Type: ${result.contact_type}`);
    console.log(`Confidence: ${result.confidence}/10`);
    console.log(`DM Score: ${result.dm_score} | GK Score: ${result.gk_score}`);
    if (result.signals.length > 0) {
      console.log('\nSignals detected:');
      result.signals.forEach(s => {
        console.log(`  [${s.type}] "${s.value}" → ${s.indicates}`);
      });
    } else {
      console.log('\nNo clear signals detected (contact type unknown)');
    }
    if (result.contact_type === 'gatekeeper') {
      console.log('\n💡 Tactic: ' + getGatekeeperTactic('them', 'their company'));
    }
  }
  // NEW PHASE 2: Deal velocity commands
  else if (args[0] === 'velocity') {
    if (args[1] === 'update' && args[2] && args[3]) {
      const result = updateDealStage(args[2], args[3]);
      if (result.updated) {
        console.log(`✓ Updated ${args[2]} to stage: ${args[3]}`);
      } else {
        console.log(`No update needed. Current stage: ${result.currentStage}`);
      }
    } else if (args[1] === 'check' && args[2]) {
      const velocity = checkDealVelocity(args[2]);
      console.log('\n⏱️ DEAL VELOCITY CHECK');
      console.log('═'.repeat(60));
      console.log(`Email: ${args[2]}`);
      console.log(`Status: ${velocity.velocity_status}`);
      if (velocity.hours_in_stage) {
        console.log(`Hours in stage: ${velocity.hours_in_stage} (avg: ${velocity.avg_hours || 'N/A'})`);
      }
      if (velocity.acceleration_tactic) {
        console.log(`\n💡 Acceleration Tactic:\n${velocity.acceleration_tactic}`);
      }
    } else {
      // Show all stalled deals
      console.log('\n⏱️ DEAL VELOCITY - STALLED DEALS');
      console.log('═'.repeat(60));
      const stalled = getStalledDeals();
      if (stalled.length === 0) {
        console.log('No stalled deals. All deals are on track!');
      } else {
        console.log(`Found ${stalled.length} stalled/slowing deals:\n`);
        stalled.forEach((d, i) => {
          const icon = d.velocity_status === 'stalled' ? '🛑' : '⚠️';
          console.log(`${i + 1}. ${icon} ${d.email}`);
          console.log(`   Stage: ${d.current_stage} | ${d.hours_in_stage}h (${d.velocity_status})`);
          if (d.acceleration_tactic) {
            console.log(`   💡 ${d.acceleration_tactic.substring(0, 70)}...`);
          }
          console.log('');
        });
      }
      console.log('Usage: node auto-reply-drafter.js velocity update <email> <stage>');
      console.log(`Stages: ${DEAL_STAGES.join(', ')}`);
    }
  }
  // NEW PHASE 2: Watch list commands (Trigger Event Monitoring)
  else if (args[0] === 'watch') {
    if (args[1] === 'add' && args[2]) {
      const result = watchCompanyAdd(args[2], args[3] || '', args[4] || 'went cold');
      console.log(`✓ Added "${args[2]}" to watch list`);
      console.log(`  Email: ${args[3] || '(none)'}`);
      console.log(`  Reason: ${args[4] || 'went cold'}`);
    } else if (args[1] === 'list') {
      console.log('\n👁️ WATCHED COMPANIES (Cold Lead Reactivation)');
      console.log('═'.repeat(60));
      const companies = watchCompanyList();
      if (companies.length === 0) {
        console.log('No companies in watch list.');
        console.log('\nAdd with: node auto-reply-drafter.js watch add "Company" "email" "reason"');
      } else {
        console.log(`${companies.length} companies being monitored:\n`);
        companies.forEach((c, i) => {
          const status = c.triggered ? '✅ TRIGGERED' : `❄️ ${c.days_cold}d cold`;
          console.log(`${i + 1}. ${c.company} [${status}]`);
          console.log(`   Email: ${c.email || '(none)'}`);
          console.log(`   Reason: ${c.reason}`);
          console.log('');
        });
      }
    } else if (args[1] === 'trigger' && args[2] && args[3]) {
      const result = watchCompanyTrigger(args[2], args[3]);
      if (result.success) {
        console.log(`\n🎯 TRIGGER EVENT FIRED`);
        console.log('═'.repeat(60));
        console.log(`Company: ${result.company}`);
        console.log(`Event: ${result.event}`);
        console.log(`Email: ${result.email || '(none)'}`);
        console.log('\n📝 REACTIVATION DRAFT:');
        console.log('─'.repeat(60));
        console.log(result.draft);
        console.log('─'.repeat(60));
      } else {
        console.log(`✗ Error: ${result.error}`);
        console.log('Use "watch list" to see available companies');
      }
    } else {
      console.log('\n👁️ TRIGGER EVENT MONITORING');
      console.log('═'.repeat(60));
      console.log('Commands:');
      console.log('  watch add "Company" "email" "reason"   Add company to watch list');
      console.log('  watch list                             Show all watched companies');
      console.log('  watch trigger "Company" "event desc"   Fire trigger, generate draft');
      console.log('\nExample:');
      console.log('  node auto-reply-drafter.js watch add "Acme Corp" "john@acme.com" "no budget Q1"');
      console.log('  node auto-reply-drafter.js watch trigger "Acme Corp" "just raised Series B"');
    }
  }
  // Help
  else if (args[0] === 'help' || args[0] === '-h' || args[0] === '--help') {
    console.log(`
Auto-Reply Drafter - Intelligent reply drafting with intent classification

Usage:
  node auto-reply-drafter.js                    Process all pending replies
  node auto-reply-drafter.js test "msg" [name] [company]   Test analyze a message
  node auto-reply-drafter.js batch              Run batch tests (10 scenarios)
  node auto-reply-drafter.js signals "msg"      Test buying signal detection
  node auto-reply-drafter.js tone "msg"         Test tone analysis
  node auto-reply-drafter.js ghost "msg" [email]  Test ghost risk prediction
  node auto-reply-drafter.js ghosts             View ghost tracking statistics
  node auto-reply-drafter.js analyze "msg"      Full analysis (intent+tone+signals+ghost)
  node auto-reply-drafter.js edits              View edit tracking stats
  node auto-reply-drafter.js intents            List supported intents & templates
  node auto-reply-drafter.js personalization    Show personalization layer info
  
  Phase 2 Commands:
  node auto-reply-drafter.js contact "msg"      Detect decision maker vs gatekeeper
  node auto-reply-drafter.js velocity           Show stalled/slowing deals
  node auto-reply-drafter.js velocity update <email> <stage>   Update deal stage
  node auto-reply-drafter.js velocity check <email>   Check specific deal velocity
  node auto-reply-drafter.js watch add "Company" "email" "reason"   Add to watch list
  node auto-reply-drafter.js watch list         Show watched companies
  node auto-reply-drafter.js watch trigger "Company" "event"   Fire trigger event
  node auto-reply-drafter.js help               Show this help

Features:
  • Intent Classification (14 categories)
  • Sentiment Scoring (1-10 scale, warm/neutral/cold leads)
  • Draft Confidence Scoring (1-10, flags <6 for review)
  • Objection Template Library (27 templates across 11 intents)
  • Personalization Layer (industry case studies, company/role context)
  • Thread Memory (avoids repeating pitches, references past context)
  • Edit Learning (tracks corrections for continuous improvement)
  • Tone Mirroring (analyzes formality, length, style for response matching)
  • Buying Signal Radar (detects hot leads, scores 0-10, flags HOT_LEAD)
  • Ghost Prediction (tracks response patterns, predicts ghosting risk)
  
  Phase 2 Features:
  • Decision Maker vs Gatekeeper Detection (title + language analysis)
  • Deal Velocity Alerts (tracks stage timing, flags stalled deals)
  • Trigger Event Monitoring (watch cold leads, generate reactivation drafts)
`);
  }
  // Normal processing
  else {
    processAllPending()
      .then(results => {
        console.log('\n=== Summary ===');
        console.table(results);
      })
      .catch(console.error);
  }
}
