/**
 * Bull BRO SOP Matcher
 * Matches incoming messages to SOP templates and generates responses
 */

const fs = require('fs');
const path = require('path');

const SOP_FILE = path.join(__dirname, 'sop-brain.json');

// Load SOP brain
const loadSOP = () => {
  try {
    return JSON.parse(fs.readFileSync(SOP_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load SOP brain:', e.message);
    return null;
  }
};

// Intent patterns for classification
const INTENT_PATTERNS = {
  // Meeting-related
  declined_meeting: /declined|can'?t make it|won'?t be able|cancel.*meeting/i,
  missed_meeting: /missed|no[- ]?show|didn'?t (show|attend|join)|where were you/i,
  reschedule: /reschedule|different time|change.*time|postpone|move.*meeting|can we do/i,
  multiple_cancellations: /cancel.*again|third time|keep cancelling/i,
  
  // Interest levels
  not_interested: /not interested|no thanks|pass|don'?t think|not for us/i,
  not_a_fit: /not a fit|wrong fit|doesn'?t fit|not right|mismatch/i,
  interested: /interested|sounds good|tell me more|let'?s (talk|chat|discuss)|want to know/i,
  meeting_request: /book|schedule|call|meet|available|calendar|time slot/i,
  
  // Budget/pricing
  budget_low: /budget.*low|can'?t afford|too expensive|out of.*budget|only have \$?[0-9]/i,
  pricing_question: /how much|cost|price|rate|fee|charge|investment|budget/i,
  
  // Status changes
  no_longer_at_company: /left.*company|no longer|moved on|not here|different (company|role)/i,
  company_bankrupt: /bankrupt|shut.*down|closing|out of business|financial trouble/i,
  
  // Timing
  revisit_later: /later|few months|next (quarter|year)|not now|reach out.*later|touch base/i,
  not_doing_influencer: /don'?t (do|have|run).*influencer|no influencer|not doing.*marketing|budget.*allocated|don'?t run.*campaign|no.*marketing department/i,
  out_of_office: /out of office|ooo|on vacation|will be back|away until/i,
  
  // Information requests
  target_audience: /audience|demographic|who watches|viewers|reach.*people/i,
  geographic_targeting: /target.*city|reach.*country|geographic|location|region/i,
  video_examples: /example|show me|video.*look|creative|concept|portfolio/i,
  more_info: /more info|details|learn more|send.*info|documentation/i,
  whats_included: /what'?s included|include|package|deliverable/i,
  
  // Objections
  suspicious_request: /download|software|verify|unusual|install/i,
  commission_only: /commission|affiliate|performance|rev share|revenue share/i,
  inauthentic: /inauthentic|fake|not real|sponsored.*feel/i,
  
  // Other
  referral: /connect.*with|introduce|colleague|someone else|friend.*industry/i,
  wrong_person: /wrong person|not me|not.*handle|different department/i,
  dnc: /unsubscribe|stop.*email|remove.*list|don'?t contact/i
};

// Detect mailbox from context
const detectMailbox = (context) => {
  if (!context) return 'imman_smartlead';
  
  const email = (context.fromEmail || context.email || '').toLowerCase();
  const source = (context.source || '').toLowerCase();
  
  if (email.includes('3wrk') || source.includes('jan') || source.includes('3wrk')) {
    return 'jan_3wrk';
  }
  if (email.includes('alementary') || source.includes('alementary') || source.includes('alasdair')) {
    return 'partnership_alementary';
  }
  return 'imman_smartlead';
};

// Classify intent from message
const classifyIntent = (message) => {
  const lower = message.toLowerCase();
  
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(lower)) {
      return intent;
    }
  }
  
  return 'general_inquiry';
};

// Get matching template from SOP
const getTemplate = (sop, mailbox, intent) => {
  const templates = sop.templates[mailbox];
  if (!templates) return null;
  
  // Direct intent match
  if (templates[intent]) {
    return templates[intent];
  }
  
  // Try mapping common intents
  const intentMappings = {
    'interested': 'lead_responded_positively',
    'pricing_question': 'initial_inquiry',
    'reschedule': 'lead_requested_reschedule',
    'declined_meeting': 'lead_declined_meeting',
    'missed_meeting': 'lead_missed_meeting_1',
    'not_interested': 'not_interested',
    'not_a_fit': 'not_a_fit',
    'budget_low': mailbox === 'imman_smartlead' ? 'budget_lower_than_typical' : 'budget_too_low',
    'no_longer_at_company': 'no_longer_at_company',
    'company_bankrupt': 'company_bankrupt',
    'revisit_later': 'revisit_in_few_months',
    'not_doing_influencer': 'not_doing_influencer',
    'target_audience': 'asked_about_target_audience',
    'geographic_targeting': 'asked_about_geographic_targeting',
    'video_examples': 'asked_for_video_examples',
    'suspicious_request': 'suspicious_request',
    'asked_for_something_we_dont_do': 'asked_for_something_we_dont_do'
  };
  
  const mappedIntent = intentMappings[intent];
  if (mappedIntent && templates[mappedIntent]) {
    return templates[mappedIntent];
  }
  
  return null;
};

// Replace variables in template
const fillTemplate = (script, lead) => {
  if (!script) return script;
  
  const replacements = {
    '{{first_name}}': lead.firstName || lead.name?.split(' ')[0] || 'there',
    '{{company_name}}': lead.company || 'your company',
    '{{meeting_date_time}}': lead.meetingTime || '[meeting time]',
    '{{new_meeting_date_time}}': lead.newMeetingTime || '[new time]',
    '{{schedule}}': lead.schedule || 'Tuesday 2pm EST or Thursday 11am EST',
    '{{suggested_month}}': lead.suggestedMonth || getNextMonth(),
    '{{relevant_content_type}}': lead.contentType || lead.industry || 'your niche',
    '{{country_city}}': lead.location || '[location]',
    '{{provide_2_time_slots_with_dates_and_timezone}}': lead.timeSlots || 'Tuesday 2pm EST or Thursday 11am EST',
    '{{suggest_two_time_slots_next_week}}': lead.timeSlots || 'Tuesday 2pm or Thursday 11am'
  };
  
  let filled = script;
  for (const [key, value] of Object.entries(replacements)) {
    filled = filled.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  return filled;
};

// Get next month name
const getNextMonth = () => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const nextMonth = (new Date().getMonth() + 1) % 12;
  return months[nextMonth];
};

// Get current quarter
const getCurrentQuarter = () => {
  const month = new Date().getMonth();
  return `Q${Math.floor(month / 3) + 1}`;
};

// Main matching function
const matchAndGenerate = (message, lead = {}, context = {}) => {
  const sop = loadSOP();
  if (!sop) {
    return { error: 'SOP brain not loaded' };
  }
  
  const mailbox = detectMailbox(context);
  const intent = classifyIntent(message);
  const template = getTemplate(sop, mailbox, intent);
  
  const mailboxConfig = sop.mailboxes[mailbox.replace('_', '@').replace('3wrk', '3wrk.com').replace('imman_smartlead', 'imman_smartlead')] || 
                        sop.mailboxes[Object.keys(sop.mailboxes)[2]]; // Default to Imman
  
  const result = {
    mailbox,
    intent,
    tone: mailboxConfig?.tone || 'Conversational, confident, data-driven',
    signature: mailboxConfig?.signature || 'Best,\nImman',
    template: null,
    generatedResponse: null,
    tag: null,
    actions: [],
    confidence: 0
  };
  
  if (template) {
    result.template = template;
    result.generatedResponse = fillTemplate(template.script, lead);
    result.tag = template.tag;
    result.actions = template.actions || [];
    result.confidence = 0.9;
    
    // Handle alternative scripts
    if (template.alternative && lead.seemsBusy) {
      result.generatedResponse = fillTemplate(template.alternative, lead);
    }
  } else {
    result.confidence = 0.5;
    result.actions = ['Manual review required - no matching template'];
  }
  
  return result;
};

// Export for use in other modules
module.exports = {
  loadSOP,
  classifyIntent,
  detectMailbox,
  getTemplate,
  fillTemplate,
  matchAndGenerate,
  INTENT_PATTERNS
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    const message = args.slice(1).join(' ') || 'What are your rates?';
    const result = matchAndGenerate(message, { firstName: 'John', company: 'TestCorp' });
    
    console.log('🐂 Bull BRO SOP Matcher\n');
    console.log('Input:', message);
    console.log('\n--- Result ---');
    console.log('Mailbox:', result.mailbox);
    console.log('Intent:', result.intent);
    console.log('Confidence:', (result.confidence * 100).toFixed(0) + '%');
    console.log('Tag:', result.tag || 'None');
    console.log('Tone:', result.tone);
    console.log('\n--- Generated Response ---');
    console.log(result.generatedResponse || 'No template found');
    console.log('\n--- Actions ---');
    result.actions.forEach(a => console.log('•', a));
  } else if (args[0] === 'intents') {
    console.log('🐂 Available Intents:\n');
    Object.keys(INTENT_PATTERNS).forEach(intent => {
      console.log('•', intent);
    });
  } else {
    console.log('🐂 Bull BRO SOP Matcher');
    console.log('========================\n');
    console.log('Commands:');
    console.log('  node sop-matcher.js test "message"  - Test intent matching');
    console.log('  node sop-matcher.js intents         - List all intents');
  }
}
