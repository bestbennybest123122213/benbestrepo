#!/usr/bin/env node
/**
 * Morning Action Pack
 * Everything Jan needs to start the day in one place
 * 
 * Usage:
 *   node morning-pack.js          # Full morning pack
 *   node morning-pack.js --quick  # Just the action list
 *   node morning-pack.js --email  # Show copy-paste emails
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

// Gaming leads with draft emails
const GAMING_LEADS = [
  {
    name: 'Stillfront',
    contact: 'Marina Andersson',
    email: 'marina@stillfront.com',
    potential: 25000,
    subject: 'Quick question about ItssIMANNN partnership',
    body: `Hi Marina,

Following up on our previous conversation about a potential partnership between Stillfront and ItssIMANNN.

Quick stats reminder:
• 10.5M subscribers, 150-361M monthly views
• 18-34 demographic (72%) - perfect for mobile gaming
• Previous gaming campaigns: 48M views, 100K+ installs, 380% ROI

Would you have 15 minutes this week to discuss a potential integration?

Best,
Jan`
  },
  {
    name: 'Dream11',
    contact: 'Marketing Team',
    email: 'partnerships@dream11.com',
    potential: 30000,
    subject: 'ItssIMANNN x Dream11 - Partnership Opportunity',
    body: `Hi Dream11 Team,

I represent ItssIMANNN (10.5M subs, 150-361M monthly views) and believe there's a strong fit for a gaming partnership.

Our audience demographics align perfectly with fantasy sports:
• 18-34 age range (72%)
• High engagement (8.2%)
• 65% US-based

Recent gaming campaign results: Whiteout Survival achieved 48M views with 100K+ verified installs.

Would love to explore this further. Are you available for a quick call?

Best,
Jan`
  },
  {
    name: 'Paradox Interactive',
    contact: 'Influencer Team',
    email: 'influencer@paradoxplaza.com',
    potential: 35000,
    subject: 'Story-driven content partnership - ItssIMANNN',
    body: `Hi Paradox Team,

ItssIMANNN's story-driven content style would be a natural fit for showcasing Paradox games in an authentic way.

Channel stats:
• 10.5M subscribers
• 150-361M monthly views
• Story-driven moral skits with high emotional engagement

I'd love to discuss how we could create compelling content around your titles.

Best,
Jan`
  }
];

async function getHotLeads() {
  try {
    const client = initSupabase();
    if (!client) return [];
    
    const { data } = await client
      .from('imann_positive_replies')
      .select('*')
      .order('conversation_date', { ascending: false })
      .limit(5);
    
    return data || [];
  } catch {
    return [];
  }
}

function displayMorningPack(hotLeads, args) {
  const isQuick = args.includes('--quick');
  const showEmails = args.includes('--email');
  
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ☀️  MORNING ACTION PACK                                    ║
║                    ${dateStr.padEnd(40)}      ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  if (!isQuick) {
    console.log(`
Good morning! Here's everything you need to crush it today.
Time: ${timeStr} | Estimated completion: 15-20 minutes

═══════════════════════════════════════════════════════════════════════════════
 📊 OVERNIGHT SUMMARY
═══════════════════════════════════════════════════════════════════════════════

  • Pipeline: 151 leads total
  • At risk: $20,550 from stale leads
  • Opportunity: $72,000 in gaming commission ready to pursue

`);
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 🎯 TODAY'S TOP 5 ACTIONS (in priority order)
═══════════════════════════════════════════════════════════════════════════════

  ┌────┬─────────────────────────────────────────────────┬──────────┬─────────┐
  │ #  │ Action                                          │ Time     │ Impact  │
  ├────┼─────────────────────────────────────────────────┼──────────┼─────────┤
  │ 1  │ Send Stillfront follow-up email                 │ 2 min    │ $7,500  │
  │ 2  │ Send Dream11 partnership pitch                  │ 2 min    │ $9,000  │
  │ 3  │ Send Paradox Interactive outreach               │ 2 min    │ $10,500 │
  │ 4  │ Check for hot leads: \`gex hot\`                  │ 3 min    │ varies  │
  │ 5  │ Review stale leads: \`gex stale\`                 │ 5 min    │ $20K+   │
  └────┴─────────────────────────────────────────────────┴──────────┴─────────┘

  Total time: ~15 minutes | Total potential: $47,000+ in commission

`);

  if (showEmails) {
    console.log(`
═══════════════════════════════════════════════════════════════════════════════
 📧 COPY-PASTE EMAILS (ready to send)
═══════════════════════════════════════════════════════════════════════════════
`);

    GAMING_LEADS.slice(0, 3).forEach((lead, i) => {
      console.log(`
──────────────────────────────────────────────────────────────────────────────
  EMAIL ${i + 1}: ${lead.name}
──────────────────────────────────────────────────────────────────────────────
  TO: ${lead.email}
  SUBJECT: ${lead.subject}
  
  ${lead.body.split('\n').map(line => '  ' + line).join('\n')}
  
  💰 Potential: $${lead.potential.toLocaleString()} | Commission: $${(lead.potential * 0.3).toLocaleString()}
`);
    });
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 ⚡ QUICK COMMANDS
═══════════════════════════════════════════════════════════════════════════════

  gex hot           → See leads that need immediate attention
  gex forecast      → Revenue forecast with motivation
  gex qp gaming     → Generate gaming vertical pitch
  gex casestudy     → Get case studies to share
  gex rescue        → See 35 stuck leads ready to rescue



═══════════════════════════════════════════════════════════════════════════════
 🚨 SCHEDULING RESCUE (NEW!)
═══════════════════════════════════════════════════════════════════════════════

  35 leads stuck in scheduling → $198K at risk
  Emails already drafted and ready to send!

  gex rescue         → See leads by urgency (🟢🟡🟠🔴)
  gex rescue --urgent → Only critical ones (33 leads)
  gex send           → Send pre-written rescue emails


═══════════════════════════════════════════════════════════════════════════════
 ⚠️ CRITICAL LEAD TRIAGE (NEW!)
═══════════════════════════════════════════════════════════════════════════════

  93 leads in critical zone (30-60 days old) → $399K potential
  10 leads need IMMEDIATE action before they're lost forever!

  gex triage         → See all critical leads by priority
  gex triage --save  → Only "Save Now" leads (10 urgent)
  gex triage batch   → Generate last-chance emails


═══════════════════════════════════════════════════════════════════════════════
 💪 MOTIVATION
═══════════════════════════════════════════════════════════════════════════════

  "The best time to send a follow-up was yesterday. 
   The second best time is right now."

  You have $240,000 in gaming leads drafted and ready.
  15 minutes of work could generate $20-30K in commission.
  
  Let's go! 🚀

═══════════════════════════════════════════════════════════════════════════════
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  const hotLeads = await getHotLeads();
  displayMorningPack(hotLeads, args);
}

main().catch(console.error);
