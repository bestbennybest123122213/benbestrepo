#!/usr/bin/env node
/**
 * Meeting Closer - Convert meeting requests to booked calls
 * 
 * Tracks and manages leads who expressed interest in meetings but
 * haven't booked yet. Generates urgency-based follow-up templates.
 * 
 * Usage:
 *   node meeting-closer.js           # Dashboard view
 *   node meeting-closer.js drafts 10 # Generate 10 email drafts
 *   node meeting-closer.js stats     # Quick stats
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');
const fs = require('fs');

// Calendar booking link
const CALENDAR_LINK = 'https://calendly.com/imann/30min';

// Age brackets for urgency
const URGENCY_BRACKETS = {
  urgent:  { min: 0,  max: 7,  label: '🔥 URGENT',   color: '\x1b[31m' },
  warm:    { min: 8,  max: 14, label: '🟡 WARM',     color: '\x1b[33m' },
  cooling: { min: 15, max: 21, label: '🟠 COOLING',  color: '\x1b[38;5;208m' },
  atRisk:  { min: 22, max: 999, label: '⚠️  AT-RISK', color: '\x1b[90m' }
};

const RESET = '\x1b[0m';

// Templates by urgency tier
const TEMPLATES = {
  urgent: {
    name: "Let's Lock It In",
    subject: (lead) => `Let's lock in a time, ${lead.firstName}!`,
    body: (lead) => `Hi ${lead.firstName},

Great to hear you want to connect! Let's make it happen.

I've got some slots open this week - grab one that works:
📅 ${CALENDAR_LINK}

Or if those don't work, just reply with a few times and I'll find a match.

Looking forward to chatting about ${lead.company ? `what we can do for ${lead.company}` : 'how we can help'}!

Best,
Imann`
  },
  
  warm: {
    name: "Following Up",
    subject: (lead) => `Following up on our call - ${lead.firstName}`,
    body: (lead) => `Hi ${lead.firstName},

Just circling back on scheduling our conversation. I know calendars fill up fast!

Here's my availability: ${CALENDAR_LINK}

Would love to connect this week if you have 15-20 minutes. ${lead.company ? `I've got some ideas specifically for ${lead.company} I'd like to share.` : ''}

Let me know what works!

Best,
Imann`
  },
  
  cooling: {
    name: "Still Interested?",
    subject: (lead) => `Still interested in connecting, ${lead.firstName}?`,
    body: (lead) => `Hi ${lead.firstName},

Wanted to check in - you mentioned wanting to chat, but I know timing can be tricky.

Are you still interested in connecting? If so, my calendar is here: ${CALENDAR_LINK}

If now's not the right time, no worries at all - just let me know and I can reach back out later.

Hope all is well${lead.company ? ` at ${lead.company}` : ''}!

Best,
Imann`
  },
  
  atRisk: {
    name: "Last Chance / Re-pitch",
    subject: (lead) => `One last try, ${lead.firstName}?`,
    body: (lead) => `Hi ${lead.firstName},

I've reached out a few times about scheduling our call - I'm guessing things got busy on your end.

Just want to close the loop: would you still like to connect, or should I check back in a few months?

If you've got 15 minutes this week: ${CALENDAR_LINK}

Either way, I'd love to hear back so I know where we stand.

${lead.company ? `Wishing you and the ${lead.company} team all the best!` : 'All the best!'}

Imann`
  }
};

function getUrgencyTier(ageDays) {
  if (ageDays <= URGENCY_BRACKETS.urgent.max) return 'urgent';
  if (ageDays <= URGENCY_BRACKETS.warm.max) return 'warm';
  if (ageDays <= URGENCY_BRACKETS.cooling.max) return 'cooling';
  return 'atRisk';
}

async function fetchMeetingRequestLeads() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  // Fetch leads with Meeting Request category, excluding Booked
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .neq('follow_up_status', 'meeting_scheduled')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);
  
  const now = Date.now();
  
  // Enrich leads with age and company info
  return (leads || []).map(lead => {
    const info = getCompanyInfo(lead.lead_email);
    const ageDays = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    const firstName = lead.lead_name 
      ? lead.lead_name.split(' ')[0]
      : lead.lead_email.split('@')[0].split('.')[0];
    
    return {
      ...lead,
      firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
      company: info?.name || lead.lead_company,
      industry: info?.industry,
      tier: info?.tier,
      ageDays,
      urgency: getUrgencyTier(ageDays)
    };
  });
}

function groupByUrgency(leads) {
  const groups = {
    urgent: [],
    warm: [],
    cooling: [],
    atRisk: []
  };
  
  for (const lead of leads) {
    groups[lead.urgency].push(lead);
  }
  
  // Sort each group by age (oldest first within tier, so they get attention)
  for (const tier of Object.keys(groups)) {
    groups[tier].sort((a, b) => b.ageDays - a.ageDays);
  }
  
  return groups;
}

function showDashboard(groups) {
  const total = Object.values(groups).reduce((sum, g) => sum + g.length, 0);
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   📅 MEETING CLOSER DASHBOARD                                                ║
║   ${total} leads requested meetings but haven't booked                           ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣`);

  for (const [tier, bracket] of Object.entries(URGENCY_BRACKETS)) {
    const leads = groups[tier];
    const pct = total > 0 ? ((leads.length / total) * 100).toFixed(0) : 0;
    
    console.log(`║                                                                              ║`);
    console.log(`║   ${bracket.label} (${bracket.min}-${bracket.max === 999 ? '∞' : bracket.max} days): ${leads.length} leads (${pct}%)`.padEnd(79) + '║');
    console.log(`║   ${'─'.repeat(72)}   ║`);
    
    if (leads.length === 0) {
      console.log(`║      No leads in this tier`.padEnd(79) + '║');
    } else {
      const shown = leads.slice(0, 5);
      for (const lead of shown) {
        const name = (lead.lead_name || 'Unknown').substring(0, 20).padEnd(20);
        const company = (lead.company || 'Unknown').substring(0, 25).padEnd(25);
        const age = `${lead.ageDays}d`.padStart(4);
        console.log(`║      ${name} │ ${company} │ ${age}`.padEnd(79) + '║');
      }
      if (leads.length > 5) {
        console.log(`║      ... and ${leads.length - 5} more`.padEnd(79) + '║');
      }
    }
  }

  console.log(`║                                                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
  console.log(`║                                                                              ║`);
  console.log(`║   📊 CONVERSION FUNNEL                                                       ║`);
  console.log(`║   ${'─'.repeat(72)}   ║`);
  
  const urgentCount = groups.urgent.length;
  const warmCount = groups.warm.length;
  const coolingCount = groups.cooling.length;
  const atRiskCount = groups.atRisk.length;
  
  const maxWidth = 50;
  const scale = (count) => Math.round((count / Math.max(total, 1)) * maxWidth);
  
  console.log(`║   Urgent:  ${'█'.repeat(scale(urgentCount)).padEnd(maxWidth)} ${urgentCount}`.padEnd(79) + '║');
  console.log(`║   Warm:    ${'█'.repeat(scale(warmCount)).padEnd(maxWidth)} ${warmCount}`.padEnd(79) + '║');
  console.log(`║   Cooling: ${'█'.repeat(scale(coolingCount)).padEnd(maxWidth)} ${coolingCount}`.padEnd(79) + '║');
  console.log(`║   At-Risk: ${'█'.repeat(scale(atRiskCount)).padEnd(maxWidth)} ${atRiskCount}`.padEnd(79) + '║');
  
  console.log(`║                                                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════════════════════╣`);
  console.log(`║                                                                              ║`);
  console.log(`║   💡 RECOMMENDED ACTIONS                                                     ║`);
  console.log(`║   ${'─'.repeat(72)}   ║`);
  
  if (urgentCount > 0) {
    console.log(`║   🔥 ${urgentCount} urgent leads need immediate follow-up!`.padEnd(79) + '║');
    console.log(`║      Run: node meeting-closer.js drafts ${Math.min(urgentCount, 10)}`.padEnd(79) + '║');
  }
  if (atRiskCount > 0) {
    console.log(`║   ⚠️  ${atRiskCount} leads are at risk of going cold`.padEnd(79) + '║');
  }
  if (total === 0) {
    console.log(`║   ✅ All meeting requests have been handled!`.padEnd(79) + '║');
  }
  
  console.log(`║                                                                              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════════════╝
`);
}

function generateDrafts(groups, limit = 10) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  📧 MEETING CLOSER - EMAIL DRAFTS                                            ║
║  Priority order: Urgent → Warm → Cooling → At-Risk                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  // Prioritize: urgent first, then warm, cooling, at-risk
  const priorityOrder = ['urgent', 'warm', 'cooling', 'atRisk'];
  const allLeads = [];
  
  for (const tier of priorityOrder) {
    for (const lead of groups[tier]) {
      allLeads.push({ ...lead, tierLabel: URGENCY_BRACKETS[tier].label });
    }
  }
  
  const selected = allLeads.slice(0, limit);
  const drafts = [];
  
  for (let i = 0; i < selected.length; i++) {
    const lead = selected[i];
    const template = TEMPLATES[lead.urgency];
    
    const subject = template.subject(lead);
    const body = template.body(lead);
    
    const draft = {
      to: lead.lead_email,
      subject,
      body,
      template: template.name,
      lead: {
        name: lead.lead_name,
        company: lead.company,
        tier: lead.tierLabel,
        age: `${lead.ageDays} days`
      }
    };
    
    drafts.push(draft);
    
    console.log('═'.repeat(80));
    console.log(`📧 DRAFT ${i + 1}/${selected.length} │ ${lead.tierLabel} │ ${template.name}`);
    console.log('═'.repeat(80));
    console.log(`TO:      ${draft.to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`LEAD:    ${lead.lead_name || 'Unknown'} @ ${lead.company || 'Unknown'} (${lead.ageDays}d old)`);
    console.log('─'.repeat(80));
    console.log(body);
    console.log('');
  }
  
  // Save to file
  const output = drafts.map(d => `
TO: ${d.to}
SUBJECT: ${d.subject}
TEMPLATE: ${d.template}
LEAD: ${d.lead.name} @ ${d.lead.company} (${d.lead.age})
---
${d.body}
===
`).join('\n');

  fs.writeFileSync('meeting-closer-drafts.txt', output);
  
  console.log('═'.repeat(80));
  console.log(`✅ ${drafts.length} drafts saved to meeting-closer-drafts.txt`);
  console.log('═'.repeat(80));

  return drafts;
}

function showStats(groups) {
  const total = Object.values(groups).reduce((sum, g) => sum + g.length, 0);
  
  console.log('\n📊 Meeting Request Pipeline Stats\n');
  console.log(`Total unbooked requests: ${total}`);
  console.log('');
  
  for (const [tier, bracket] of Object.entries(URGENCY_BRACKETS)) {
    const count = groups[tier].length;
    console.log(`  ${bracket.label}: ${count}`);
  }
  
  // Calculate average age
  const allLeads = Object.values(groups).flat();
  const avgAge = allLeads.length > 0
    ? (allLeads.reduce((sum, l) => sum + l.ageDays, 0) / allLeads.length).toFixed(1)
    : 0;
  
  console.log('');
  console.log(`Average age: ${avgAge} days`);
  
  // Top companies
  const companies = allLeads
    .filter(l => l.company && l.tier === 'enterprise')
    .map(l => l.company);
  
  if (companies.length > 0) {
    console.log('\n🏢 Enterprise leads waiting:');
    companies.slice(0, 5).forEach(c => console.log(`  • ${c}`));
  }
  
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    const leads = await fetchMeetingRequestLeads();
    const groups = groupByUrgency(leads);
    
    if (!command || command === 'dashboard') {
      showDashboard(groups);
    } else if (command === 'drafts') {
      const limit = parseInt(args[1]) || 10;
      generateDrafts(groups, limit);
    } else if (command === 'stats') {
      showStats(groups);
    } else {
      console.error(`Unknown command: ${command}`);
      console.error('Usage: node meeting-closer.js [dashboard|drafts <count>|stats]');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { fetchMeetingRequestLeads, groupByUrgency, TEMPLATES, URGENCY_BRACKETS };

if (require.main === module) {
  main();
}
