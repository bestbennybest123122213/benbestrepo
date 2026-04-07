#!/usr/bin/env node
/**
 * Stale Lead Re-Engagement Tool
 * 
 * Generates personalized re-engagement email drafts for stale leads (15+ days old)
 * based on their original reply category and lead context.
 * 
 * Usage:
 *   node stale-reengager.js                        # Default: all categories, limit 20
 *   node stale-reengager.js [limit]                # Specify number of leads
 *   node stale-reengager.js --category meeting_request
 *   node stale-reengager.js --category interested --limit 10
 *   node stale-reengager.js --all                  # All stale leads
 *   node stale-reengager.js --dry-run              # Preview without saving
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

// =============================================================================
// RE-ENGAGEMENT EMAIL TEMPLATES
// =============================================================================

const REENGAGEMENT_TEMPLATES = {
  // For leads who requested a meeting but never scheduled
  meeting_request: {
    name: 'Gentle Nudge - Meeting Request',
    subject: (lead) => `Quick follow-up on scheduling a call, ${lead.firstName}`,
    body: (lead, context) => `Hi ${lead.firstName},

I wanted to circle back on our earlier conversation. You mentioned interest in connecting, and I'd still love to find a time that works for you.

I know calendars fill up fast, so here are a few fresh slots:
• Tomorrow at 10am or 2pm
• ${context.nextWeekDay} at 11am or 3pm

Or grab any time that works: ${context.calendlyLink}

No pressure at all — if priorities have shifted, just let me know and I'll close the loop on my end.

Looking forward to connecting!

Best,
Imann`,
    priority: 1
  },

  // For leads who showed interest but need value to re-engage
  interested: {
    name: 'Value Add - Interested',
    subject: (lead) => `Thought of ${lead.company} when I saw this`,
    body: (lead, context) => `Hi ${lead.firstName},

I came across something recently that made me think of our conversation. ${context.industryHook}

Since we last spoke, we've been working on some exciting things that might be relevant for ${lead.company}:
• Helped similar companies increase their reach by 40%+
• Launched new features specifically for the ${context.industry || 'your'} space
• Built partnerships with teams facing similar challenges

Would love to share more details if you're still open to it. Do you have 15 minutes this week?

Best,
Imann`,
    priority: 2
  },

  // For leads who asked for information - gentle check-in
  information_request: {
    name: 'Check-In - Information Request',
    subject: (lead) => `Did that info help, ${lead.firstName}?`,
    body: (lead, context) => `Hi ${lead.firstName},

I wanted to follow up on the information I shared earlier. Did it answer your questions about ${context.topic || 'what we do'}?

Happy to clarify anything or hop on a quick call if it's easier to discuss live. Sometimes 10 minutes of conversation saves a dozen emails!

Let me know what would be most helpful for you.

Best,
Imann`,
    priority: 3
  }
};

// Industry-specific hooks for value-add emails
const INDUSTRY_HOOKS = {
  'Gaming': 'There was an interesting article about player engagement trends in 2025.',
  'Gaming/Technology': 'The latest developer survey showed some fascinating insights about tool adoption.',
  'EdTech': 'I noticed some interesting shifts in how companies are approaching learner retention.',
  'FinTech': 'There was a great piece on fintech partnerships and distribution strategies.',
  'Technology': 'I saw a case study that reminded me of the challenges you mentioned.',
  'AI': 'The AI space is moving so fast — I thought you might find this trend relevant.',
  'Media': 'There was an interesting development in content monetization that caught my eye.',
  'default': 'I came across something that made me think of the conversation we had.',
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Fetches stale leads from Supabase positive_replies table
 */
async function fetchStaleLeads(options = {}) {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const {
    category = null,
    minDays = 15,
    limit = null,
    excludeBooked = true,
    excludeContacted = true
  } = options;

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - minDays);

  let query = client
    .from('positive_replies')
    .select('*')
    .lt('replied_at', cutoffDate.toISOString())
    .order('replied_at', { ascending: true });

  // Filter by category if specified
  if (category) {
    const categoryMap = {
      'meeting_request': 'Meeting Request',
      'interested': 'Interested',
      'information_request': 'Information Request'
    };
    const dbCategory = categoryMap[category.toLowerCase()] || category;
    query = query.eq('reply_category', dbCategory);
  }

  // Exclude booked leads (they're already converted)
  if (excludeBooked) {
    query = query.neq('reply_category', 'Booked');
  }

  // Exclude already contacted leads
  if (excludeContacted) {
    query = query.or('follow_up_status.eq.pending,follow_up_status.is.null');
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  // Enrich with age and company info
  const now = Date.now();
  const enrichedLeads = (data || []).map(lead => {
    const ageDays = Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    const companyInfo = getCompanyInfo(lead.lead_email);
    const firstName = lead.lead_name 
      ? lead.lead_name.split(' ')[0] 
      : lead.lead_email.split('@')[0].split('.')[0];

    return {
      ...lead,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      company: lead.lead_company || companyInfo?.name || 'your company',
      ageDays,
      companyInfo,
      tier: companyInfo?.tier || 'unknown',
      industry: companyInfo?.industry || null
    };
  });

  // Sort by priority: Meeting Request > Interested > Information Request, then by age
  return enrichedLeads.sort((a, b) => {
    const priority = { 'Meeting Request': 1, 'Interested': 2, 'Information Request': 3 };
    const aPri = priority[a.reply_category] || 4;
    const bPri = priority[b.reply_category] || 4;
    if (aPri !== bPri) return aPri - bPri;
    return b.ageDays - a.ageDays; // Older first within same category
  });
}

/**
 * Generates personalized email draft for a lead
 */
function generateEmailDraft(lead) {
  // Map category to template key
  const categoryToTemplate = {
    'Meeting Request': 'meeting_request',
    'Interested': 'interested',
    'Information Request': 'information_request'
  };

  const templateKey = categoryToTemplate[lead.reply_category] || 'interested';
  const template = REENGAGEMENT_TEMPLATES[templateKey];

  // Build context for template
  const nextWeekDay = getNextWeekday();
  const industryHook = INDUSTRY_HOOKS[lead.industry] || INDUSTRY_HOOKS['default'];
  
  const context = {
    calendlyLink: '[YOUR_CALENDLY_LINK]',
    nextWeekDay,
    industry: lead.industry,
    industryHook,
    topic: lead.reply_category === 'Information Request' ? 'our collaboration' : null
  };

  const subject = template.subject(lead);
  const body = template.body(lead, context);

  return {
    to: lead.lead_email,
    name: lead.lead_name,
    company: lead.company,
    subject,
    body,
    category: lead.reply_category,
    template: template.name,
    ageDays: lead.ageDays,
    tier: lead.tier,
    leadId: lead.id
  };
}

/**
 * Gets a weekday name for next week (for scheduling)
 */
function getNextWeekday() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  // Get next Tuesday or Wednesday (mid-week is best for scheduling)
  const daysUntilTuesday = (2 - today.getDay() + 7) % 7 || 7;
  const nextTuesday = new Date(today);
  nextTuesday.setDate(today.getDate() + daysUntilTuesday);
  return days[nextTuesday.getDay()];
}

/**
 * Main CLI function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let limit = 20;
  let category = null;
  let dryRun = false;
  let showAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--category' && args[i + 1]) {
      category = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--all') {
      showAll = true;
      limit = null;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (!isNaN(parseInt(arg, 10))) {
      limit = parseInt(arg, 10);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔄 STALE LEAD RE-ENGAGEMENT TOOL                                        ║
║  Generating personalized email drafts for leads 15+ days old             ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  try {
    // Fetch stale leads
    console.log('📊 Fetching stale leads from Supabase...\n');
    
    const leads = await fetchStaleLeads({ 
      category, 
      limit: showAll ? null : limit 
    });

    if (leads.length === 0) {
      console.log('✅ No stale leads found matching criteria!');
      return;
    }

    // Display summary
    const byCategory = {};
    leads.forEach(l => {
      byCategory[l.reply_category] = (byCategory[l.reply_category] || 0) + 1;
    });

    console.log(`📈 STALE LEADS SUMMARY (${leads.length} total)`);
    console.log('─'.repeat(60));
    Object.entries(byCategory).forEach(([cat, count]) => {
      const icon = cat === 'Meeting Request' ? '🔥' : cat === 'Interested' ? '💡' : '❓';
      console.log(`  ${icon} ${cat}: ${count}`);
    });

    // Age distribution
    const under30 = leads.filter(l => l.ageDays < 30).length;
    const under60 = leads.filter(l => l.ageDays >= 30 && l.ageDays < 60).length;
    const over60 = leads.filter(l => l.ageDays >= 60).length;
    
    console.log(`\n⏰ AGE DISTRIBUTION`);
    console.log('─'.repeat(60));
    console.log(`  🟢 15-30 days: ${under30} (warmest)`);
    console.log(`  🟡 30-60 days: ${under60} (cooling)`);
    console.log(`  🔴 60+ days:   ${over60} (coldest)`);

    // Generate drafts
    console.log('\n\n📧 GENERATED EMAIL DRAFTS');
    console.log('═'.repeat(70));

    const drafts = [];

    leads.forEach((lead, i) => {
      const draft = generateEmailDraft(lead);
      drafts.push(draft);

      const urgency = lead.ageDays > 45 ? '🔴' : lead.ageDays > 30 ? '🟡' : '🟢';
      const tierBadge = lead.tier === 'enterprise' ? '🏢' : lead.tier === 'midmarket' ? '🏬' : lead.tier === 'startup' ? '🚀' : '';
      
      console.log(`\n${urgency} ${i + 1}. ${lead.company} ${tierBadge}`);
      console.log(`   To: ${lead.lead_email}`);
      console.log(`   Name: ${lead.lead_name || 'N/A'}`);
      console.log(`   Category: ${lead.reply_category} | Age: ${lead.ageDays} days`);
      console.log(`   Template: ${draft.template}`);
      console.log('─'.repeat(70));
      console.log(`   Subject: ${draft.subject}`);
      console.log('─'.repeat(70));
      console.log(draft.body.split('\n').map(line => `   ${line}`).join('\n'));
      console.log('═'.repeat(70));
    });

    // Save to files
    if (!dryRun) {
      // Save as JSON for programmatic use
      const jsonOutput = {
        generated: new Date().toISOString(),
        criteria: { category, limit: showAll ? 'all' : limit },
        summary: { total: leads.length, byCategory },
        drafts: drafts.map(d => ({
          to: d.to,
          name: d.name,
          company: d.company,
          subject: d.subject,
          body: d.body,
          category: d.category,
          template: d.template,
          ageDays: d.ageDays,
          tier: d.tier,
          leadId: d.leadId
        }))
      };
      fs.writeFileSync('stale-reengagement-drafts.json', JSON.stringify(jsonOutput, null, 2));

      // Save as text for easy copy-paste
      let textOutput = `STALE LEAD RE-ENGAGEMENT DRAFTS
Generated: ${new Date().toISOString()}
Total: ${drafts.length} emails
${'═'.repeat(70)}

`;
      drafts.forEach((draft, i) => {
        textOutput += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${i + 1}. ${draft.company}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TO: ${draft.to}
SUBJECT: ${draft.subject}
TEMPLATE: ${draft.template}
AGE: ${draft.ageDays} days | TIER: ${draft.tier}
────────────────────────────────────────────────────────────────────

${draft.body}

`;
      });

      fs.writeFileSync('stale-reengagement-drafts.txt', textOutput);

      console.log('\n\n✅ SAVED FILES');
      console.log('─'.repeat(60));
      console.log(`  📄 stale-reengagement-drafts.json (${drafts.length} drafts)`);
      console.log(`  📄 stale-reengagement-drafts.txt  (ready to copy-paste)`);
    } else {
      console.log('\n\n🔍 DRY RUN - No files saved');
    }

    // Quick actions
    console.log('\n\n💡 QUICK ACTIONS');
    console.log('─'.repeat(60));
    console.log('  • Review drafts in stale-reengagement-drafts.txt');
    console.log('  • Update [YOUR_CALENDLY_LINK] with actual booking link');
    console.log('  • Send highest priority (Meeting Requests) first');
    console.log('  • Mark leads as "contacted" after sending: ');
    console.log('    node batch-actions.js mark "email1,email2" contacted');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
STALE LEAD RE-ENGAGEMENT TOOL

Generates personalized re-engagement email drafts for leads that 
haven't been contacted in 15+ days.

USAGE:
  node stale-reengager.js                        # Default: 20 leads, all categories
  node stale-reengager.js 50                     # Limit to 50 leads
  node stale-reengager.js --category meeting_request
  node stale-reengager.js --category interested --limit 10
  node stale-reengager.js --all                  # All stale leads (no limit)
  node stale-reengager.js --dry-run              # Preview without saving files

CATEGORIES:
  meeting_request     Leads who asked for a meeting (gentle nudge template)
  interested          Leads who showed interest (value-add template)
  information_request Leads who asked for info (check-in template)

OUTPUT FILES:
  stale-reengagement-drafts.json    Structured data for programmatic use
  stale-reengagement-drafts.txt     Ready-to-paste email drafts

TEMPLATES:
  Meeting Request → Gentle nudge with fresh availability slots
  Interested      → Value-add with industry insights
  Info Request    → Friendly check-in asking if info was helpful
`);
}

// Export for use as module
module.exports = { 
  fetchStaleLeads, 
  generateEmailDraft, 
  REENGAGEMENT_TEMPLATES 
};

if (require.main === module) {
  main();
}
