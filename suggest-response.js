#!/usr/bin/env node
/**
 * AI-Powered Email Response Suggester
 * 
 * Analyzes lead replies and generates contextual response drafts.
 * Makes responding a 30-second review instead of a 5-minute task.
 * 
 * Usage:
 *   node suggest-response.js                    # Show all pending replies with suggestions
 *   node suggest-response.js --lead=email       # Suggest for specific lead
 *   node suggest-response.js --save             # Save drafts to file
 *   node suggest-response.js --category=TYPE    # Filter by category
 *   node suggest-response.js --limit=N          # Limit output
 *   node suggest-response.js --json             # JSON output for integrations
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const LEAD_FILTER = args.find(a => a.startsWith('--lead='))?.split('=')[1];
const SAVE_FILE = args.includes('--save');
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1];
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20;
const JSON_OUTPUT = args.includes('--json');

// Business context for personalization
const BUSINESS_CONTEXT = {
  creators: {
    itssimannn: {
      name: 'ItssIMANNN',
      subscribers: '10M+',
      type: 'moral skits, story-driven content',
      views: 'up to 361M monthly',
      bestFor: ['gaming', 'mobile apps', 'education', 'AI tools', 'consumer brands']
    },
    alasdair: {
      name: 'Alasdair (Alementary)',
      type: 'tech content',
      bestFor: ['tech', 'SaaS', 'developer tools']
    }
  },
  caseStudies: [
    { brand: 'Whiteout Survival', views: '48M', users: '100K+', vertical: 'gaming' },
    { brand: 'Gauth AI', views: '15M+', downloads: '50K+', vertical: 'education/AI' },
    { brand: 'Valeo', revenue: '$30,906', vertical: 'consumer' },
    { brand: 'Allison AI', revenue: '$24,045', vertical: 'AI' }
  ],
  pricing: {
    storyIntegration: '$15-25K',
    dedicatedVideo: '$30-45K',
    series: '$50-75K'
  }
};

// Intent detection patterns
const INTENT_PATTERNS = {
  SCHEDULING: [
    /when.*available/i, /book.*call/i, /schedule/i, /calendar/i, /time.*work/i,
    /let'?s.*chat/i, /hop on.*call/i, /meet/i, /slot/i, /availability/i
  ],
  INTERESTED: [
    /interested/i, /tell me more/i, /sounds? good/i, /like to learn/i,
    /more info/i, /curious/i, /want to know/i, /sounds interesting/i
  ],
  QUESTION: [
    /how much/i, /what.*cost/i, /pricing/i, /rates?/i, /budget/i,
    /how does.*work/i, /process/i, /what.*include/i, /deliverables/i,
    /audience/i, /demographics/i, /views/i, /engagement/i
  ],
  OBJECTION: [
    /not.*budget/i, /too expensive/i, /can't afford/i, /not.*right time/i,
    /maybe later/i, /next quarter/i, /not now/i, /hold off/i, /pause/i,
    /not sure/i, /concerns?/i
  ],
  NOT_NOW: [
    /not interested/i, /unsubscribe/i, /remove/i, /stop/i,
    /wrong person/i, /not.*right fit/i
  ]
};

// Detect intent from reply text
function detectIntent(replyText, category) {
  if (!replyText) return { intent: mapCategoryToIntent(category), confidence: 0.5 };
  
  const text = replyText.toLowerCase();
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { intent, confidence: 0.8, matchedPattern: pattern.toString() };
      }
    }
  }
  
  // Fall back to category mapping
  return { intent: mapCategoryToIntent(category), confidence: 0.5 };
}

function mapCategoryToIntent(category) {
  const mapping = {
    'Meeting Booked': 'SCHEDULING',
    'Meeting Request': 'SCHEDULING',
    'Interested': 'INTERESTED',
    'Information Request': 'QUESTION',
    'Demo Request': 'SCHEDULING',
    'Out of Office': 'NOT_NOW'
  };
  return mapping[category] || 'INTERESTED';
}

// Find relevant case study based on vertical/industry
function findRelevantCaseStudy(lead) {
  const company = (lead.lead_company || '').toLowerCase();
  const email = (lead.lead_email || '').toLowerCase();
  
  // Gaming detection
  if (/game|gaming|studio|play|mobile.*game/i.test(company) || 
      /game|gaming|studio/i.test(email)) {
    return BUSINESS_CONTEXT.caseStudies[0]; // Whiteout
  }
  
  // Education/AI detection
  if (/edu|learn|school|ai|artificial|ml|machine/i.test(company)) {
    return BUSINESS_CONTEXT.caseStudies[1]; // Gauth
  }
  
  // Default to best performer
  return BUSINESS_CONTEXT.caseStudies[0];
}

// Response templates by intent
const RESPONSE_TEMPLATES = {
  SCHEDULING: (lead, context) => ({
    subject: `Re: Let's find a time`,
    body: `Hi ${context.firstName},

That works. Here are a few options:

• Tomorrow at [TIME]
• [DAY] at [TIME]
• Or grab a slot directly: [CALENDAR_LINK]

Looking forward to it.`,
    notes: 'Lead is ready to schedule. Offer specific times.'
  }),

  INTERESTED: (lead, context) => ({
    subject: `Re: More about ${BUSINESS_CONTEXT.creators.itssimannn.name}`,
    body: `Hi ${context.firstName},

Happy to share more.

${BUSINESS_CONTEXT.creators.itssimannn.name} has ${BUSINESS_CONTEXT.creators.itssimannn.subscribers} subscribers and does ${BUSINESS_CONTEXT.creators.itssimannn.type}. ${context.caseStudy ? `Our ${context.caseStudy.brand} campaign got ${context.caseStudy.views} views${context.caseStudy.users ? ` and drove ${context.caseStudy.users} new users` : ''}.` : ''}

Would a 15-minute call work to discuss? I can walk you through some examples that would be relevant for ${lead.lead_company || 'your brand'}.`,
    notes: 'Lead expressed interest. Share context and push for call.'
  }),

  QUESTION: (lead, context) => {
    // Detect what they're asking about
    const replyText = (lead.reply_text || lead.lead_email_body || '').toLowerCase();
    const askingPricing = /price|cost|rate|budget|how much/i.test(replyText);
    const askingProcess = /how|process|work|timeline/i.test(replyText);
    const askingAudience = /audience|demographic|viewer|who watch/i.test(replyText);

    if (askingPricing) {
      return {
        subject: `Re: Rates for ${BUSINESS_CONTEXT.creators.itssimannn.name}`,
        body: `Hi ${context.firstName},

Rates depend on the integration type:

• Story integration (woven into video): ${BUSINESS_CONTEXT.pricing.storyIntegration}
• Dedicated video: ${BUSINESS_CONTEXT.pricing.dedicatedVideo}
• Series partnership: ${BUSINESS_CONTEXT.pricing.series}

Happy to discuss what would work best for ${lead.lead_company || 'your goals'}. Want to hop on a quick call?`,
        notes: 'Pricing question. Share ranges and push for call to discuss specifics.'
      };
    }

    if (askingAudience) {
      return {
        subject: `Re: ${BUSINESS_CONTEXT.creators.itssimannn.name}'s audience`,
        body: `Hi ${context.firstName},

${BUSINESS_CONTEXT.creators.itssimannn.name}'s audience is primarily 18-34, heavy on mobile, and highly engaged with story-driven content. Monthly views hit ${BUSINESS_CONTEXT.creators.itssimannn.views}.

${context.caseStudy ? `For context, ${context.caseStudy.brand} saw ${context.caseStudy.views} views and ${context.caseStudy.users || context.caseStudy.downloads || 'strong engagement'}.` : ''}

Want me to send over a detailed media kit?`,
        notes: 'Audience question. Share highlights and offer media kit.'
      };
    }

    return {
      subject: `Re: Your question`,
      body: `Hi ${context.firstName},

Good question. Rather than go back and forth over email, want to hop on a quick 10-minute call? I can give you all the details and answer any other questions.

Does [DAY] work?`,
      notes: 'General question. Push for call to handle efficiently.'
    };
  },

  OBJECTION: (lead, context) => {
    const replyText = (lead.reply_text || lead.lead_email_body || '').toLowerCase();
    const budgetObjection = /budget|expensive|afford|cost/i.test(replyText);
    const timingObjection = /later|quarter|not now|timing|busy/i.test(replyText);

    if (budgetObjection) {
      return {
        subject: `Re: Making it work`,
        body: `Hi ${context.firstName},

Totally get it. We've structured deals in different ways before — payment splits, performance components, smaller initial tests.

${context.caseStudy ? `${context.caseStudy.brand} started with a single integration and it drove ${context.caseStudy.users || context.caseStudy.downloads || 'great results'}. We can do something similar if that's easier.` : ''}

Worth a quick chat to see if there's a way to make it work?`,
        notes: 'Budget objection. Offer flexibility and smaller starts.'
      };
    }

    if (timingObjection) {
      return {
        subject: `Re: Following up later`,
        body: `Hi ${context.firstName},

No problem. When would be a better time to reconnect?

I can set a reminder and reach out then. Just want to make sure I follow up when it makes sense for ${lead.lead_company || 'you'}.`,
        notes: 'Timing objection. Get a specific timeline for follow-up.'
      };
    }

    return {
      subject: `Re: Understanding your concerns`,
      body: `Hi ${context.firstName},

Appreciate the honesty. Is there anything specific holding you back?

If it's not a fit, totally fine — just want to make sure I understand what you're looking for in case we can help down the line.`,
      notes: 'General objection. Probe to understand the real blocker.'
    };
  },

  NOT_NOW: (lead, context) => ({
    subject: null, // Don't respond
    body: null,
    notes: 'Lead not interested. Do not respond. Remove from active list.'
  })
};

// Generate response for a lead
function generateResponse(lead) {
  const replyText = lead.reply_text || lead.lead_email_body || '';
  const { intent, confidence, matchedPattern } = detectIntent(replyText, lead.reply_category);
  
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const caseStudy = findRelevantCaseStudy(lead);
  
  const context = { firstName, caseStudy };
  const template = RESPONSE_TEMPLATES[intent];
  const response = template ? template(lead, context) : null;
  
  return {
    lead: {
      email: lead.lead_email,
      name: lead.lead_name,
      company: lead.lead_company,
      category: lead.reply_category,
      ageDays: lead.age_days
    },
    originalReply: replyText.substring(0, 200) + (replyText.length > 200 ? '...' : ''),
    intent: { type: intent, confidence, matchedPattern },
    suggestedResponse: response,
    timestamp: new Date().toISOString()
  };
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  // Build query
  let query = client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (LEAD_FILTER) {
    query = query.ilike('lead_email', `%${LEAD_FILTER}%`);
  }

  if (CATEGORY) {
    query = query.eq('reply_category', CATEGORY);
  }

  const { data: leads, error } = await query;

  if (error || !leads) {
    console.error('Error fetching leads:', error?.message);
    process.exit(1);
  }

  const now = Date.now();
  
  // Add age and filter to recent (last 30 days by default)
  const processedLeads = leads
    .map(lead => {
      const age = lead.replied_at 
        ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return { ...lead, age_days: age };
    })
    .filter(l => l.age_days <= 30)
    .slice(0, LIMIT);

  if (processedLeads.length === 0) {
    console.log('No pending replies need suggested responses.');
    process.exit(0);
  }

  // Generate suggestions
  const suggestions = processedLeads.map(generateResponse);
  const actionable = suggestions.filter(s => s.suggestedResponse?.body);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(suggestions, null, 2));
    process.exit(0);
  }

  // Format output
  let output = `# 📧 Suggested Responses
Generated: ${new Date().toLocaleString()}
Total leads: ${processedLeads.length} | Actionable: ${actionable.length}

---

`;

  suggestions.forEach((s, i) => {
    if (!s.suggestedResponse) return;

    output += `## ${i + 1}. ${s.lead.name || s.lead.email}
**Company:** ${s.lead.company || 'Unknown'}
**Category:** ${s.lead.category} → **Intent:** ${s.intent.type} (${Math.round(s.intent.confidence * 100)}%)
**Age:** ${s.lead.ageDays} day${s.lead.ageDays !== 1 ? 's' : ''}

### Their Reply:
> ${s.originalReply || '[No reply text available]'}

### Suggested Response:
**To:** ${s.lead.email}
${s.suggestedResponse.subject ? `**Subject:** ${s.suggestedResponse.subject}\n` : ''}
${s.suggestedResponse.body || '*No response needed*'}

**Notes:** ${s.suggestedResponse.notes}

---

`;
  });

  // Stats
  const intentCounts = {};
  suggestions.forEach(s => {
    intentCounts[s.intent.type] = (intentCounts[s.intent.type] || 0) + 1;
  });

  output += `
## 📊 Summary

| Intent | Count |
|--------|-------|
${Object.entries(intentCounts).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

**Priority Order:**
1. SCHEDULING - ready to book, respond NOW
2. INTERESTED - warm, push for call
3. QUESTION - answer + propose call
4. OBJECTION - handle carefully
5. NOT_NOW - skip

`;

  // Output
  if (SAVE_FILE) {
    const filepath = './suggested-responses.md';
    fs.writeFileSync(filepath, output);
    console.log(`Saved ${actionable.length} suggested responses to ${filepath}`);
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
