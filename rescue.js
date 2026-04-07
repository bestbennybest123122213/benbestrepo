#!/usr/bin/env node
/**
 * Scheduling Rescue System
 * 
 * Systematically rescue leads stuck in "scheduling" status.
 * These are leads who replied positively but haven't booked a call.
 * 
 * Time Buckets:
 *   🟢 Fresh (1-3 days)   - Still warm, gentle reminder
 *   🟡 Warm (4-7 days)    - Need nudge, add urgency
 *   🟠 Cooling (8-14 days) - Risk of losing, offer alternatives
 *   🔴 Cold (14+ days)    - Emergency rescue, fresh angle
 * 
 * Usage:
 *   node rescue.js                    # Show rescue dashboard
 *   node rescue.js --urgent           # Only 🟠 and 🔴 leads
 *   node rescue.js draft <email>      # Generate rescue email for lead
 *   node rescue.js batch              # Generate all rescue emails
 *   node rescue.js stats              # Conversion tracking
 *   node rescue.js list               # List all stuck leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ACTION = args[0] || 'dashboard';
const TARGET = args[1];

// Time bucket definitions
const BUCKETS = {
  fresh: { min: 1, max: 3, emoji: '🟢', label: 'Fresh', color: 'green', priority: 4 },
  warm: { min: 4, max: 7, emoji: '🟡', label: 'Warm', color: 'yellow', priority: 3 },
  cooling: { min: 8, max: 14, emoji: '🟠', label: 'Cooling', color: 'orange', priority: 2 },
  cold: { min: 15, max: 9999, emoji: '🔴', label: 'Cold', color: 'red', priority: 1 }
};

// Stage-specific email templates
const RESCUE_TEMPLATES = {
  fresh: {
    name: 'Gentle Calendly Reminder',
    subject: 'Re: Quick reminder — free times this week',
    body: `Hi [FIRST_NAME],

Just a quick follow-up on scheduling our call.

Here's my Calendly if it's easier: [CALENDLY_LINK]

Or let me know what times work best for you this week.

Looking forward to connecting!`
  },
  warm: {
    name: 'Urgency Nudge',
    subject: 'Re: Slots filling up this week',
    body: `Hi [FIRST_NAME],

Wanted to make sure we connect while timing is still good.

My calendar is filling up this week, but I saved a few slots if any work:
• [TIME_SLOT_1]
• [TIME_SLOT_2]

Or grab any open time: [CALENDLY_LINK]

Quick 15-minute call — I'll share some relevant case studies for [COMPANY].`
  },
  cooling: {
    name: 'Alternative Offer',
    subject: 'Re: Would a quick call work better?',
    body: `Hi [FIRST_NAME],

I know schedules get crazy. Would any of these work better?

1. Quick 10-min call instead of 30 (I'll be brief)
2. A Loom video walkthrough I can send
3. Email-only — I can share case studies in writing

What's easiest for you? Just want to make sure I'm not being a nuisance.`
  },
  cold: {
    name: 'Fresh Angle Re-engagement',
    subject: 'New campaign results — thought you\'d want to see',
    body: `Hi [FIRST_NAME],

Circling back with some new results you might find interesting.

ItssIMANNN just wrapped a campaign that drove [RECENT_RESULT]. Given what [COMPANY] is doing, thought there might be a fit.

If influencer marketing is still on your radar, I'd love to share how this could look for you.

Worth a quick 15 minutes?`
  }
};

// Get bucket for a given number of days
function getBucket(days) {
  for (const [key, bucket] of Object.entries(BUCKETS)) {
    if (days >= bucket.min && days <= bucket.max) {
      return { key, ...bucket };
    }
  }
  return { key: 'cold', ...BUCKETS.cold };
}

// Calculate days since a date
function daysSince(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

// Categorize leads into buckets
function categorizeLeads(leads) {
  const buckets = {
    fresh: [],
    warm: [],
    cooling: [],
    cold: []
  };

  leads.forEach(lead => {
    const days = daysSince(lead.replied_at);
    const bucket = getBucket(days);
    buckets[bucket.key].push({ ...lead, daysStuck: days, bucket });
  });

  return buckets;
}

// Show rescue dashboard
async function showDashboard(urgentOnly = false) {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get leads stuck in scheduling status
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Scheduling', 'scheduling', 'Meeting Requested', 'meeting_requested', 'Interested'])
    .order('replied_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching leads:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log('\n✅ No leads stuck in scheduling! Pipeline is clear.\n');
    return;
  }

  const buckets = categorizeLeads(leads);
  const totalLeads = leads.length;
  const urgentCount = buckets.cooling.length + buckets.cold.length;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🚨 SCHEDULING RESCUE DASHBOARD                                          ║
║  ${totalLeads} leads stuck in scheduling | ${urgentCount} need urgent attention
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Summary bar
  const freshBar = '█'.repeat(Math.min(buckets.fresh.length, 20));
  const warmBar = '█'.repeat(Math.min(buckets.warm.length, 20));
  const coolingBar = '█'.repeat(Math.min(buckets.cooling.length, 20));
  const coldBar = '█'.repeat(Math.min(buckets.cold.length, 20));

  console.log('  TIME BUCKET DISTRIBUTION');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  🟢 Fresh (1-3d)    ${String(buckets.fresh.length).padStart(3)} │ ${freshBar}`);
  console.log(`  🟡 Warm (4-7d)     ${String(buckets.warm.length).padStart(3)} │ ${warmBar}`);
  console.log(`  🟠 Cooling (8-14d) ${String(buckets.cooling.length).padStart(3)} │ ${coolingBar}`);
  console.log(`  🔴 Cold (14+d)     ${String(buckets.cold.length).padStart(3)} │ ${coldBar}`);
  console.log('');

  // Calculate estimated revenue at risk
  const avgDealValue = 20000; // $20K average deal
  const atRiskValue = (buckets.cooling.length + buckets.cold.length) * avgDealValue * 0.3; // 30% conversion assumption

  console.log('  💰 REVENUE AT RISK');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  Cooling + Cold leads: ${buckets.cooling.length + buckets.cold.length}`);
  console.log(`  Estimated value at risk: $${atRiskValue.toLocaleString()}`);
  console.log(`  (Based on $${avgDealValue.toLocaleString()} avg deal, 30% conversion)`);
  console.log('');

  // Show buckets based on filter
  const bucketsToShow = urgentOnly 
    ? ['cold', 'cooling'] 
    : ['cold', 'cooling', 'warm', 'fresh'];

  bucketsToShow.forEach(bucketKey => {
    const bucketLeads = buckets[bucketKey];
    if (bucketLeads.length === 0) return;

    const bucketDef = BUCKETS[bucketKey];
    const template = RESCUE_TEMPLATES[bucketKey];

    console.log(`  ${bucketDef.emoji} ${bucketDef.label.toUpperCase()} (${bucketLeads.length} leads) — ${template.name}`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    bucketLeads.slice(0, 10).forEach(lead => {
      const company = lead.lead_company || 'Unknown Company';
      const daysLabel = lead.daysStuck === 1 ? '1 day' : `${lead.daysStuck} days`;
      console.log(`    □ ${(lead.lead_name || 'Unknown').padEnd(20)} ${company.padEnd(25)} ${daysLabel}`);
      console.log(`      📧 ${lead.lead_email}`);
    });

    if (bucketLeads.length > 10) {
      console.log(`      ... and ${bucketLeads.length - 10} more`);
    }
    console.log('');
  });

  // Quick actions
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  QUICK ACTIONS');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  gex rescue draft <email>     Generate rescue email for specific lead');
  console.log('  gex rescue batch             Generate all rescue emails');
  console.log('  gex rescue --urgent          Show only cooling + cold leads');
  console.log('  gex rescue stats             View rescue conversion stats');
  console.log('  gex rescue list              List all leads with emails');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Generate rescue email for specific lead
async function generateDraft(emailOrName) {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Search for lead by email or name
  let query = client
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Scheduling', 'scheduling', 'Meeting Requested', 'meeting_requested', 'Interested']);

  // Check if it's an email
  if (emailOrName.includes('@')) {
    query = query.ilike('lead_email', `%${emailOrName}%`);
  } else {
    query = query.ilike('lead_name', `%${emailOrName}%`);
  }

  const { data: leads, error } = await query.limit(5);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log(`\n❌ No lead found matching: ${emailOrName}`);
    console.log('   Run "gex rescue list" to see all stuck leads.\n');
    return;
  }

  // If multiple matches, show options
  if (leads.length > 1) {
    console.log(`\n📋 Multiple leads found. Which one?\n`);
    leads.forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.lead_name} — ${lead.lead_email}`);
    });
    console.log(`\n💡 Use the exact email: gex rescue draft ${leads[0].lead_email}\n`);
    return;
  }

  const lead = leads[0];
  const days = daysSince(lead.replied_at);
  const bucket = getBucket(days);
  const template = RESCUE_TEMPLATES[bucket.key];

  // Fill in placeholders
  const firstName = (lead.lead_name || 'there').split(' ')[0];
  const company = lead.lead_company || 'your company';
  
  let body = template.body
    .replace(/\[FIRST_NAME\]/g, firstName)
    .replace(/\[COMPANY\]/g, company)
    .replace(/\[CALENDLY_LINK\]/g, 'https://calendly.com/jan-byinfluence/30min')
    .replace(/\[TIME_SLOT_1\]/g, 'Tuesday 2pm ET')
    .replace(/\[TIME_SLOT_2\]/g, 'Wednesday 11am ET')
    .replace(/\[RECENT_RESULT\]/g, '48M views and 100K+ new users');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 RESCUE EMAIL for ${lead.lead_name.substring(0, 40).padEnd(40)}║
╚══════════════════════════════════════════════════════════════════════════╝

  Lead:     ${lead.lead_name}
  Email:    ${lead.lead_email}
  Company:  ${lead.lead_company || 'Unknown'}
  Stuck:    ${days} days (${bucket.emoji} ${bucket.label})
  Strategy: ${template.name}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TO: ${lead.lead_email}
SUBJECT: ${template.subject.replace('[COMPANY]', company)}

${body}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Copy this email and send it!
   After sending, mark as contacted: gex qm ${lead.lead_email}
`);

  // Save draft to file for easy access
  const draftsDir = path.join(__dirname, 'data', 'rescue-drafts');
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }
  
  const draftFile = path.join(draftsDir, `${lead.lead_email.replace('@', '_at_')}.txt`);
  const draftContent = `TO: ${lead.lead_email}
SUBJECT: ${template.subject.replace('[COMPANY]', company)}

${body}

---
Generated: ${new Date().toISOString()}
Lead: ${lead.lead_name}
Bucket: ${bucket.label} (${days} days)
`;

  fs.writeFileSync(draftFile, draftContent);
  console.log(`  📁 Draft saved to: ${draftFile}\n`);
}

// Generate batch emails for all stuck leads
async function generateBatch() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Scheduling', 'scheduling', 'Meeting Requested', 'meeting_requested', 'Interested'])
    .order('replied_at', { ascending: true });

  if (error || !leads || leads.length === 0) {
    console.log('\n✅ No leads to generate emails for.\n');
    return;
  }

  const buckets = categorizeLeads(leads);
  const draftsDir = path.join(__dirname, 'data', 'rescue-drafts');
  
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  let generated = 0;
  const summary = [];

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 BATCH RESCUE EMAIL GENERATOR                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  for (const [bucketKey, bucketLeads] of Object.entries(buckets)) {
    if (bucketLeads.length === 0) continue;

    const template = RESCUE_TEMPLATES[bucketKey];
    const bucketDef = BUCKETS[bucketKey];

    console.log(`\n  ${bucketDef.emoji} ${bucketDef.label} (${bucketLeads.length} emails)`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    for (const lead of bucketLeads) {
      const firstName = (lead.lead_name || 'there').split(' ')[0];
      const company = lead.lead_company || 'your company';
      
      let body = template.body
        .replace(/\[FIRST_NAME\]/g, firstName)
        .replace(/\[COMPANY\]/g, company)
        .replace(/\[CALENDLY_LINK\]/g, 'https://calendly.com/jan-byinfluence/30min')
        .replace(/\[TIME_SLOT_1\]/g, 'Tuesday 2pm ET')
        .replace(/\[TIME_SLOT_2\]/g, 'Wednesday 11am ET')
        .replace(/\[RECENT_RESULT\]/g, '48M views and 100K+ new users');

      const draftFile = path.join(draftsDir, `${lead.lead_email.replace('@', '_at_')}.txt`);
      const draftContent = `TO: ${lead.lead_email}
SUBJECT: ${template.subject.replace('[COMPANY]', company)}

${body}

---
Generated: ${new Date().toISOString()}
Lead: ${lead.lead_name}
Company: ${company}
Bucket: ${bucketDef.label} (${lead.daysStuck} days)
`;

      fs.writeFileSync(draftFile, draftContent);
      console.log(`    ✅ ${lead.lead_name} (${lead.lead_email})`);
      generated++;

      summary.push({
        email: lead.lead_email,
        name: lead.lead_name,
        bucket: bucketKey,
        days: lead.daysStuck,
        file: draftFile
      });
    }
  }

  // Save summary
  const summaryFile = path.join(draftsDir, '_batch-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    total: generated,
    drafts: summary
  }, null, 2));

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Generated ${generated} rescue emails
  📁 Saved to: ${draftsDir}
  📋 Summary: ${summaryFile}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// Show rescue stats
async function showStats() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Get all positive replies to track conversions
  const { data: allReplies, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  // Calculate stats
  const stats = {
    total: allReplies.length,
    scheduling: 0,
    booked: 0,
    closed: 0,
    lost: 0,
    byBucket: { fresh: 0, warm: 0, cooling: 0, cold: 0 }
  };

  const schedulingCategories = ['Scheduling', 'scheduling', 'Meeting Requested', 'meeting_requested', 'Interested'];
  const bookedCategories = ['Booked', 'booked', 'Meeting Booked', 'meeting_booked'];
  const closedCategories = ['Closed', 'closed', 'Won', 'won', 'Deal Closed'];
  const lostCategories = ['Lost', 'lost', 'Not Interested', 'Rejected'];

  allReplies.forEach(lead => {
    const category = lead.reply_category || '';
    
    if (schedulingCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
      stats.scheduling++;
      const days = daysSince(lead.replied_at);
      const bucket = getBucket(days);
      stats.byBucket[bucket.key]++;
    } else if (bookedCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
      stats.booked++;
    } else if (closedCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
      stats.closed++;
    } else if (lostCategories.some(c => c.toLowerCase() === category.toLowerCase())) {
      stats.lost++;
    }
  });

  const conversionRate = stats.total > 0 
    ? ((stats.booked + stats.closed) / stats.total * 100).toFixed(1) 
    : 0;

  const rescueRate = stats.scheduling > 0
    ? (stats.booked / (stats.scheduling + stats.booked) * 100).toFixed(1)
    : 0;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 RESCUE CONVERSION STATS                                              ║
╚══════════════════════════════════════════════════════════════════════════╝

  PIPELINE OVERVIEW
  ─────────────────────────────────────────────────────────────────────────
  Total Positive Replies:    ${stats.total}
  Currently Scheduling:      ${stats.scheduling}  ← rescue target
  Booked Meetings:          ${stats.booked}
  Closed Deals:             ${stats.closed}
  Lost:                     ${stats.lost}

  CONVERSION RATES
  ─────────────────────────────────────────────────────────────────────────
  Reply → Booking Rate:     ${conversionRate}%
  Rescue Success Rate:      ${rescueRate}%

  STUCK LEAD BREAKDOWN
  ─────────────────────────────────────────────────────────────────────────
  🟢 Fresh (1-3d):          ${stats.byBucket.fresh}   (Easy wins)
  🟡 Warm (4-7d):           ${stats.byBucket.warm}   (Need nudge)
  🟠 Cooling (8-14d):       ${stats.byBucket.cooling}   (At risk)
  🔴 Cold (14+d):           ${stats.byBucket.cold}   (Emergency)

  RECOMMENDATIONS
  ─────────────────────────────────────────────────────────────────────────
`);

  if (stats.byBucket.cold > 5) {
    console.log(`  🚨 ${stats.byBucket.cold} cold leads need URGENT rescue emails`);
    console.log(`     Run: gex rescue batch`);
  }
  if (stats.byBucket.cooling > 5) {
    console.log(`  ⚠️  ${stats.byBucket.cooling} cooling leads — send "alternative offer" emails`);
  }
  if (stats.byBucket.fresh > 10) {
    console.log(`  💡 ${stats.byBucket.fresh} fresh leads — send gentle Calendly reminders`);
  }
  if (stats.scheduling > 50) {
    console.log(`  📌 High scheduling backlog — consider batch processing`);
  }

  console.log('');
}

// List all stuck leads
async function listLeads() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Scheduling', 'scheduling', 'Meeting Requested', 'meeting_requested', 'Interested'])
    .order('replied_at', { ascending: true });

  if (error || !leads || leads.length === 0) {
    console.log('\n✅ No leads stuck in scheduling!\n');
    return;
  }

  const buckets = categorizeLeads(leads);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📋 ALL STUCK LEADS (${leads.length} total)                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  for (const [bucketKey, bucketLeads] of Object.entries(buckets)) {
    if (bucketLeads.length === 0) continue;

    const bucketDef = BUCKETS[bucketKey];
    console.log(`\n  ${bucketDef.emoji} ${bucketDef.label.toUpperCase()} (${bucketLeads.length})`);
    console.log('  ─────────────────────────────────────────────────────────────────');

    // Sort by days stuck (most stuck first)
    bucketLeads.sort((a, b) => b.daysStuck - a.daysStuck);

    bucketLeads.forEach(lead => {
      const name = (lead.lead_name || 'Unknown').substring(0, 22).padEnd(22);
      const email = lead.lead_email.substring(0, 35).padEnd(35);
      const days = `${lead.daysStuck}d`.padStart(4);
      console.log(`    ${days} │ ${name} │ ${email}`);
    });
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generate email: gex rescue draft <email>
  Batch generate: gex rescue batch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// Main router
async function main() {
  const isUrgent = args.includes('--urgent') || args.includes('-u');
  const action = ACTION.replace(/^--/, '');

  switch (action) {
    case 'dashboard':
    case 'urgent':
      await showDashboard(isUrgent || action === 'urgent');
      break;
    case 'draft':
      if (!TARGET) {
        console.log('\n❌ Please specify an email or name:');
        console.log('   gex rescue draft john@company.com\n');
        process.exit(1);
      }
      await generateDraft(TARGET);
      break;
    case 'batch':
      await generateBatch();
      break;
    case 'stats':
      await showStats();
      break;
    case 'list':
      await listLeads();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(`
  🚨 SCHEDULING RESCUE SYSTEM

  Rescue leads stuck in "scheduling" status who haven't booked.

  COMMANDS:
    gex rescue              Show rescue dashboard with buckets
    gex rescue --urgent     Only show 🟠 and 🔴 leads
    gex rescue draft <email> Generate rescue email for lead
    gex rescue batch        Generate all rescue emails
    gex rescue stats        Conversion tracking
    gex rescue list         List all stuck leads

  TIME BUCKETS:
    🟢 Fresh (1-3 days)     Gentle Calendly reminder
    🟡 Warm (4-7 days)      "Slots filling up" urgency
    🟠 Cooling (8-14 days)  "Quick call work better?" alternative
    🔴 Cold (14+ days)      Fresh angle re-engagement
`);
      break;
    default:
      // Check if they passed an email directly
      if (action.includes('@')) {
        await generateDraft(action);
      } else {
        await showDashboard(isUrgent);
      }
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
