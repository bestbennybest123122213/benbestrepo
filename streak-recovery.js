#!/usr/bin/env node
/**
 * Win Streak Recovery Tool
 * 
 * Identifies leads closest to closing and creates actionable win paths.
 * Built to break the 24-day dry streak and get back to winning.
 * 
 * Usage:
 *   node streak-recovery.js               # Dashboard of closest-to-win leads
 *   node streak-recovery.js --quick       # Top 3 most closeable leads
 *   node streak-recovery.js --path <email> # Win path for specific lead
 *   node streak-recovery.js --email       # Generate closing emails for top 5
 *   node streak-recovery.js stats         # Streak stats and analysis
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA_DIR = path.join(__dirname, 'data');
const MILESTONES_FILE = path.join(DATA_DIR, 'milestones.json');
const COMMISSIONS_FILE = path.join(DATA_DIR, 'commissions.json');

// Stage scoring (closer to close = higher score)
const STAGE_SCORES = {
  'Booked': 95,
  'Meeting Booked': 95,
  'Meeting Scheduled': 90,
  'Meeting Request': 80,
  'Interested': 70,
  'Pricing Request': 85,
  'Proposal Sent': 88,
  'Negotiation': 92,
  'Follow Up': 60,
  'Warm Response': 50,
  'Default': 40
};

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Data Loading
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loadMilestones() {
  try {
    if (fs.existsSync(MILESTONES_FILE)) {
      return JSON.parse(fs.readFileSync(MILESTONES_FILE, 'utf8'));
    }
  } catch (e) {}
  return { wins: [] };
}

function loadCommissions() {
  try {
    if (fs.existsSync(COMMISSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(COMMISSIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { commissions: [] };
}

function getAllWins() {
  const milestones = loadMilestones();
  const commissions = loadCommissions();
  const allWins = [];
  
  for (const win of (milestones.wins || [])) {
    allWins.push({ ...win, source: 'milestone' });
  }
  
  for (const comm of (commissions.commissions || [])) {
    allWins.push({
      id: `comm-${comm.id}`,
      dealName: comm.company,
      amount: comm.commission,
      dealValue: comm.dealValue,
      date: comm.date,
      creator: comm.creator,
      source: 'commission'
    });
  }
  
  allWins.sort((a, b) => new Date(a.date) - new Date(b.date));
  return allWins;
}

function getDaysSinceLastWin() {
  const wins = getAllWins();
  if (wins.length === 0) return null;
  const lastWin = wins[wins.length - 1];
  const lastDate = new Date(lastWin.date);
  const now = new Date();
  return Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lead Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calculateStreakBreakerScore(lead) {
  const now = Date.now();
  const repliedAt = lead.replied_at ? new Date(lead.replied_at).getTime() : now;
  const daysOld = Math.max(0, Math.floor((now - repliedAt) / (1000 * 60 * 60 * 24)));
  
  // Base stage score
  const category = lead.reply_category || 'Default';
  let stageScore = STAGE_SCORES[category] || STAGE_SCORES['Default'];
  
  // Recency bonus (fresher leads are hotter)
  let recencyScore = 0;
  if (daysOld <= 2) recencyScore = 30;
  else if (daysOld <= 5) recencyScore = 25;
  else if (daysOld <= 7) recencyScore = 20;
  else if (daysOld <= 14) recencyScore = 10;
  else if (daysOld <= 21) recencyScore = 5;
  else recencyScore = 0;
  
  // Engagement bonus (pending means not dead)
  let engagementScore = 0;
  const status = lead.follow_up_status || 'pending';
  if (status === 'pending') engagementScore = 10;
  else if (status === 'contacted') engagementScore = 15;
  else if (status === 'meeting_scheduled') engagementScore = 25;
  else if (status === 'closed') engagementScore = -50; // Already closed
  else if (status === 'lost') engagementScore = -50;
  
  // Total score (0-100 scale)
  const totalScore = Math.min(100, Math.max(0, stageScore + recencyScore + engagementScore));
  
  return {
    total: totalScore,
    stageScore,
    recencyScore,
    engagementScore,
    daysOld
  };
}

function estimateDaysToClose(lead, score) {
  const category = lead.reply_category || 'Default';
  
  // Base estimates by stage
  const baseEstimates = {
    'Booked': 3,
    'Meeting Booked': 3,
    'Meeting Scheduled': 5,
    'Meeting Request': 7,
    'Pricing Request': 5,
    'Proposal Sent': 4,
    'Negotiation': 3,
    'Interested': 14,
    'Follow Up': 21,
    'Warm Response': 21,
    'Default': 30
  };
  
  let estimate = baseEstimates[category] || 30;
  
  // Adjust for recency
  if (score.daysOld > 14) estimate += Math.floor((score.daysOld - 14) / 7) * 3;
  
  // Adjust for engagement
  if (lead.follow_up_status === 'meeting_scheduled') estimate -= 2;
  if (lead.follow_up_status === 'contacted') estimate -= 1;
  
  return Math.max(1, Math.round(estimate));
}

function calculateStreakBreakerProbability(score, daysToClose) {
  // Higher score + shorter time = higher probability
  let probability = score.total;
  
  // Time penalty
  if (daysToClose <= 3) probability *= 1.2;
  else if (daysToClose <= 7) probability *= 1.0;
  else if (daysToClose <= 14) probability *= 0.8;
  else probability *= 0.6;
  
  return Math.min(95, Math.max(5, Math.round(probability)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Win Path Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateWinPath(lead) {
  const category = lead.reply_category || 'Default';
  const status = lead.follow_up_status || 'pending';
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  const paths = {
    'Booked': [
      '1. ✅ Meeting already booked - confirm date/time',
      '2. 📋 Prep case study (Whiteout/Gauth success stories)',
      '3. 💰 Have pricing ready ($15-50K range)',
      '4. 📝 Draft contract/agreement template',
      '5. 🎯 Close during or immediately after meeting'
    ],
    'Meeting Booked': [
      '1. ✅ Meeting confirmed - check calendar',
      '2. 📋 Research their recent campaigns/competitors',
      '3. 💰 Prepare custom pricing based on budget signals',
      '4. 📝 Create tailored proposal with IMANN stats',
      '5. 🎯 Send contract within 24h of meeting'
    ],
    'Meeting Request': [
      '1. 📅 Send calendar link IMMEDIATELY',
      '2. ⏰ Offer 3 specific time slots (next 48h)',
      '3. 📧 If no response in 24h, follow up with urgency',
      '4. 📋 Prep case study while waiting',
      '5. 🎯 Confirm meeting and send agenda'
    ],
    'Pricing Request': [
      '1. 💰 Send pricing within 2 hours',
      '2. 📊 Include ROI breakdown (Whiteout: 48M views, 100K users)',
      '3. 🎁 Offer early-bird or package discount',
      '4. 📅 Propose quick call to discuss',
      '5. 🎯 Create urgency with limited slots'
    ],
    'Interested': [
      '1. 📧 Send personalized follow-up TODAY',
      '2. 📊 Share relevant case study for their vertical',
      '3. 💬 Ask about their specific goals/budget',
      '4. 📅 Propose a 15-min discovery call',
      '5. 🎯 Convert to meeting request within 48h'
    ],
    'Warm Response': [
      '1. 📧 Acknowledge their response warmly',
      '2. ❓ Ask qualifying question (budget/timeline)',
      '3. 📊 Share a quick win stat that matches their industry',
      '4. 📅 Soft pitch a call: "Would love to chat about this"',
      '5. 🎯 Goal: Get them to meeting request stage'
    ],
    'Default': [
      '1. 📧 Send personalized follow-up',
      '2. ❓ Ask about their current influencer marketing',
      '3. 📊 Share a relevant success story',
      '4. 📅 Offer a no-pressure discovery call',
      '5. 🎯 Move them up the pipeline'
    ]
  };
  
  return paths[category] || paths['Default'];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Email Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateClosingEmail(lead) {
  const category = lead.reply_category || 'Default';
  const email = lead.lead_email || lead.email || '';
  const leadName = lead.lead_name || '';
  const firstName = leadName.split(' ')[0] || email.split('@')[0]?.split('.')[0] || 'there';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0]?.replace(/\b\w/g, l => l.toUpperCase()) || '';
  
  const templates = {
    'Meeting Request': {
      subject: `Quick call this week? Re: ${company} x IMANN`,
      body: `Hi ${firstName},

Thanks for your interest in working with IMANN! Let's get a quick call scheduled.

Here are a few slots that work:
• Tomorrow at 2pm ET
• Thursday at 11am ET
• Friday at 3pm ET

Or grab a time that works best for you: [CALENDAR_LINK]

Looking forward to discussing how we can drive results like we did for Whiteout Survival (48M views, 100K+ new users).

Best,
Jan`
    },
    'Pricing Request': {
      subject: `IMANN Pricing & ROI Breakdown`,
      body: `Hi ${firstName},

Great to hear from you! Here's a quick overview of what we offer:

**Campaign Investment**: $15,000 - $50,000
• Integration in IMANN's story-driven content
• 10M+ subscribers, up to 361M monthly views
• Average engagement: 8-12% (vs. 2% industry avg)

**Recent Results**:
• Whiteout Survival: 48M views, 100K+ new users
• Gauth AI: 15M+ views
• Consistent 5-10x ROI for gaming/app clients

Want to hop on a quick call to discuss a custom package for ${company}? I can share more case studies relevant to your vertical.

Best,
Jan`
    },
    'Interested': {
      subject: `Quick question about ${company}'s influencer goals`,
      body: `Hi ${firstName},

Thanks for the positive response! I'd love to learn more about what ${company} is looking to achieve with influencer marketing.

A few quick questions:
1. What's your campaign timeline looking like?
2. Have you worked with YouTube creators before?
3. What does success look like for this campaign?

We've driven incredible results for gaming and app clients - would love to see if there's a fit.

Free for a 15-min call this week?

Best,
Jan`
    },
    'Booked': {
      subject: `Looking forward to our call! + Quick agenda`,
      body: `Hi ${firstName},

Just wanted to confirm our upcoming call and share a quick agenda:

1. Learn about ${company}'s goals (5 min)
2. IMANN's content style + audience fit (5 min)
3. Case studies & results (5 min)
4. Pricing & next steps (5 min)

Please feel free to bring any questions about our process, timeline, or past campaigns.

See you soon!

Best,
Jan`
    },
    'Default': {
      subject: `Following up: ${company} x IMANN partnership`,
      body: `Hi ${firstName},

Just wanted to circle back on this! IMANN's calendar is filling up for Q1, and I wanted to make sure ${company} has a chance to grab a spot.

Quick reminder of what we offer:
• 10M+ subscribers, story-driven moral content
• Up to 361M monthly views
• Proven results: Whiteout (48M views), Gauth (15M+ views)

Would love to set up a quick call to explore if there's a fit.

Best,
Jan`
    }
  };
  
  return templates[category] || templates['Default'];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Closing Script Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateClosingScript(lead) {
  const email = lead.lead_email || lead.email || '';
  const leadName = lead.lead_name || '';
  const firstName = leadName.split(' ')[0] || email.split('@')[0]?.split('.')[0] || 'there';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0]?.replace(/\b\w/g, l => l.toUpperCase()) || 'your company';
  const category = lead.reply_category || 'Default';
  
  const scripts = {
    'Meeting Request': {
      opener: `"Hey ${firstName}! Thanks for hopping on. I know you're busy so I'll keep this focused. Quick question before we dive in - what made you interested in working with IMANN?"`,
      discovery: [
        `"What are your main goals for this campaign?"`,
        `"What's your timeline looking like?"`,
        `"Have you worked with YouTube creators before?"`,
        `"What does success look like for ${company}?"`
      ],
      pitch: `"Perfect. Based on what you've shared, I think IMANN could be a great fit. Here's why..."`,
      close: `"So here's what I'm thinking - we could do a [X] integration for [$Y]. I can send over a proposal today and if it looks good, we could have this live within 2-3 weeks. Does that timeline work for you?"`,
      urgency: `"I should mention - IMANN's calendar fills up fast. If we can lock this in this week, I can guarantee your slot. Otherwise we might be looking at [later date]."`
    },
    'Pricing Request': {
      opener: `"Hey ${firstName}! Thanks for reaching out about pricing. Before I share numbers, I want to make sure I give you something that actually fits what you're looking for."`,
      discovery: [
        `"What kind of budget are you working with?"`,
        `"What's driving this campaign - awareness, downloads, signups?"`,
        `"When are you looking to launch?"`
      ],
      pitch: `"Got it. So based on that, here's what I'd recommend..."`,
      close: `"For what you're looking for, we'd be at [$X]. That includes [deliverables]. If that works for you, I can send the contract over today."`,
      urgency: `"Just so you know, we've got a few other brands in your space reaching out. If you want to secure this slot, I'd recommend moving forward this week."`
    },
    'Booked': {
      opener: `"Hey ${firstName}! Excited to connect. So you've already got a slot locked in - let's make sure this campaign is a home run."`,
      discovery: [
        `"What assets do you need from us?"`,
        `"Any specific messaging requirements?"`,
        `"What's the approval process look like on your end?"`
      ],
      pitch: `"Perfect. We'll make sure everything is dialed in."`,
      close: `"So next steps: I'll send over the contract today, you get us the creative brief, and we can have this live by [date]. Sound good?"`,
      urgency: `"The sooner we get the paperwork done, the better slot we can secure in IMANN's content calendar."`
    },
    'Default': {
      opener: `"Hey ${firstName}! Appreciate you taking the time. I'll keep this brief - just wanted to explore if there's a fit between ${company} and IMANN."`,
      discovery: [
        `"Are you currently doing any influencer marketing?"`,
        `"What's worked well for you in the past?"`,
        `"What would make this a successful campaign?"`
      ],
      pitch: `"That's helpful. Let me share a bit about what we've done for similar brands..."`,
      close: `"If this sounds interesting, I can put together a quick proposal. Would that be helpful?"`,
      urgency: `"We're booking out for [next quarter] already, so if you're interested, now's a good time to explore."`
    }
  };
  
  return scripts[category] || scripts['Default'];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Objection Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getObjectionHandlers() {
  return {
    'Too expensive': {
      response: `"I totally get it. Let me ask - what kind of ROI are you expecting from this campaign? Because when you look at what we delivered for Whiteout Survival - 48M views, 100K+ new users - the cost per acquisition is actually really competitive."`,
      followUp: `"Would it help if we structured this as a smaller test campaign first?"`
    },
    'Need to think about it': {
      response: `"Absolutely, take your time. Just so you know - our calendar fills up fast and I'd hate for you to miss the slot if you decide to move forward. What would you need to see to feel confident about this?"`,
      followUp: `"Would it help if I sent over some additional case studies or talked to one of our existing clients?"`
    },
    'Bad timing': {
      response: `"I hear you. When would be better timing for you? The good news is we can lock in rates now and schedule the campaign for whenever works best."`,
      followUp: `"Would it make sense to at least book a slot for [future date] while we have availability?"`
    },
    'Need internal approval': {
      response: `"Makes sense. Who else needs to be involved in this decision? I'd be happy to hop on a call with your team or send over materials that make it easy to get buy-in."`,
      followUp: `"Would a one-pager with ROI projections help you make the case internally?"`
    },
    'Working with other creators': {
      response: `"That's great that you're investing in creator marketing! Out of curiosity, what's working well with your current creators? IMANN's audience is pretty unique - story-driven content that gets 8-12% engagement vs. industry avg of 2%."`,
      followUp: `"A lot of brands work with us alongside their other creators. Would you be open to a test campaign to compare results?"`
    },
    'Not sure about fit': {
      response: `"That's a fair concern. Let me ask - what would make this a good fit for you? We've worked with brands across gaming, apps, education... IMANN's audience skews 18-34, mostly US, very engaged."`,
      followUp: `"Would it help to see content from a brand similar to yours?"`
    }
  };
}

function displayObjectionHandlers() {
  const handlers = getObjectionHandlers();
  
  console.log(`
${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}
${c.bold}║${c.reset}  🛡️ ${c.bold}OBJECTION HANDLERS${c.reset}                                                      ${c.bold}║${c.reset}
${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}
`);
  
  for (const [objection, handler] of Object.entries(handlers)) {
    console.log(`${c.bold}${c.yellow}"${objection}"${c.reset}`);
    console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.cyan}Response:${c.reset} ${handler.response}`);
    console.log(`${c.green}Follow-up:${c.reset} ${handler.followUp}`);
    console.log('');
  }
}

function displayClosingScript(lead) {
  const script = generateClosingScript(lead);
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  console.log(`
${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}
${c.bold}║${c.reset}  📞 ${c.bold}CLOSING SCRIPT: ${c.cyan}${company}${c.reset}                                     
${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}1. OPENER${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${script.opener}

${c.bold}2. DISCOVERY QUESTIONS${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  for (const q of script.discovery) {
    console.log(`   • ${q}`);
  }
  
  console.log(`
${c.bold}3. PITCH${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${script.pitch}

${c.bold}4. CLOSE${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${script.close}

${c.bold}5. URGENCY${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${script.urgency}
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Calendar Link Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateCalendarLink(lead) {
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Brand';
  const title = encodeURIComponent(`${company} x IMANN Partnership Call`);
  const description = encodeURIComponent(`Quick call to discuss potential IMANN partnership for ${company}.`);
  
  // Default to 30-min meeting
  const calLinks = {
    calendly: `https://calendly.com/jan-byinfluence/30min?name=${encodeURIComponent(lead.lead_name || '')}&email=${encodeURIComponent(email)}`,
    googleCal: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&add=${encodeURIComponent(email)}`,
  };
  
  return calLinks;
}

function displayCalendarLinks(lead) {
  const links = generateCalendarLink(lead);
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  console.log(`
${c.bold}📅 CALENDAR LINKS: ${c.cyan}${company}${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}

${c.bold}Calendly:${c.reset}
${links.calendly}

${c.bold}Google Calendar:${c.reset}
${links.googleCal}

${c.dim}Tip: Replace calendly link with your actual scheduling link${c.reset}
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function displayStreakHeader(daysSinceWin) {
  const urgency = daysSinceWin > 21 ? c.red : daysSinceWin > 14 ? c.yellow : c.green;
  
  console.log(`
${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}
${c.bold}║${c.reset}  🎯 ${c.bold}WIN STREAK RECOVERY${c.reset}                                                    ${c.bold}║${c.reset}
${c.bold}║${c.reset}  ${urgency}${c.bold}${daysSinceWin}${c.reset} days since last win • Time to close!                             ${c.bold}║${c.reset}
${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function displayLeadCard(lead, rank, scoreData, daysToClose, probability) {
  const email = lead.lead_email || lead.email || 'unknown';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  const leadName = lead.lead_name || '';
  const category = lead.reply_category || 'Unknown';
  const status = lead.follow_up_status || 'pending';
  
  // Probability color
  let probColor = c.red;
  if (probability >= 70) probColor = c.green;
  else if (probability >= 50) probColor = c.yellow;
  
  // Days color
  let daysColor = c.green;
  if (daysToClose > 14) daysColor = c.red;
  else if (daysToClose > 7) daysColor = c.yellow;
  
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
  
  console.log(`
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${medal} ${c.bold}#${rank}${c.reset} ${c.cyan}${company}${c.reset}
   📧 ${email}
   📊 Stage: ${c.yellow}${category}${c.reset} | Status: ${status}
   ⏱️  ${scoreData.daysOld} days old | ${daysColor}Est. ${daysToClose}d to close${c.reset}
   
   ${c.bold}STREAK BREAKER:${c.reset} ${probColor}${probability}%${c.reset} probability
   ${renderProgressBar(probability)}
`);
}

function renderProgressBar(value, width = 30) {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;
  
  let color = c.red;
  if (value >= 70) color = c.green;
  else if (value >= 50) color = c.yellow;
  
  return `   ${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

function displayWinPath(lead, winPath) {
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  console.log(`
${c.bold}🎯 WIN PATH: ${c.cyan}${company}${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);
  
  for (const step of winPath) {
    console.log(`   ${step}`);
  }
  
  console.log(`
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);
}

function displayEmail(lead, emailData) {
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  console.log(`
${c.bold}📧 CLOSING EMAIL: ${c.cyan}${company}${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${c.bold}To:${c.reset} ${email}
${c.bold}Subject:${c.reset} ${emailData.subject}
${c.dim}───────────────────────────────────────────────────────────────────────────${c.reset}
${emailData.body}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
`);
}

function displayStats() {
  const wins = getAllWins();
  const daysSinceWin = getDaysSinceLastWin();
  
  // Calculate stats
  const totalWins = wins.length;
  const totalRevenue = wins.reduce((sum, w) => sum + (w.amount || 0), 0);
  
  // Average time between wins
  let avgDaysBetweenWins = 0;
  if (wins.length >= 2) {
    const gaps = [];
    for (let i = 1; i < wins.length; i++) {
      const gap = (new Date(wins[i].date) - new Date(wins[i-1].date)) / (1000 * 60 * 60 * 24);
      gaps.push(gap);
    }
    avgDaysBetweenWins = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }
  
  // Best streak (shortest gap)
  let bestStreak = { gap: Infinity, from: null, to: null };
  let worstStreak = { gap: 0, from: null, to: null };
  
  if (wins.length >= 2) {
    for (let i = 1; i < wins.length; i++) {
      const gap = (new Date(wins[i].date) - new Date(wins[i-1].date)) / (1000 * 60 * 60 * 24);
      if (gap < bestStreak.gap) {
        bestStreak = { gap: Math.round(gap), from: wins[i-1], to: wins[i] };
      }
      if (gap > worstStreak.gap) {
        worstStreak = { gap: Math.round(gap), from: wins[i-1], to: wins[i] };
      }
    }
  }
  
  // Last 3 wins
  const recentWins = wins.slice(-3).reverse();
  
  // Status emoji
  const statusEmoji = daysSinceWin > avgDaysBetweenWins ? '🔴' : daysSinceWin > avgDaysBetweenWins * 0.7 ? '🟡' : '🟢';
  
  console.log(`
${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}
${c.bold}║${c.reset}  📊 ${c.bold}WIN STREAK STATISTICS${c.reset}                                                 ${c.bold}║${c.reset}
${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}

${c.bold}CURRENT STATUS${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
   ${statusEmoji} Days since last win: ${c.bold}${daysSinceWin}${c.reset} days
   📈 Average close time: ${c.bold}${avgDaysBetweenWins}${c.reset} days
   🏆 Total wins: ${c.bold}${totalWins}${c.reset}
   💰 Total revenue: ${c.green}$${totalRevenue.toLocaleString()}${c.reset}

${c.bold}STREAK RECORDS${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
   🏃 Best streak: ${c.green}${bestStreak.gap}${c.reset} days between wins
   🐢 Longest drought: ${c.red}${worstStreak.gap}${c.reset} days between wins

${c.bold}RECENT WINS${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  for (const win of recentWins) {
    const date = new Date(win.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    console.log(`   💰 ${date}: ${win.dealName || 'Deal'} - ${c.green}$${(win.amount || 0).toLocaleString()}${c.reset}`);
  }
  
  console.log(`
${c.bold}ACTION REQUIRED${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  if (daysSinceWin > 21) {
    console.log(`   ${c.red}⚠️  URGENT: ${daysSinceWin} days without a win!${c.reset}`);
    console.log(`   ${c.red}   Focus all energy on closing the hottest leads today.${c.reset}`);
  } else if (daysSinceWin > 14) {
    console.log(`   ${c.yellow}⚠️  WARNING: Getting close to drought territory.${c.reset}`);
    console.log(`   ${c.yellow}   Time to push hard on pipeline.${c.reset}`);
  } else if (daysSinceWin > avgDaysBetweenWins) {
    console.log(`   ${c.yellow}📌 Slightly behind pace. Normal, but stay focused.${c.reset}`);
  } else {
    console.log(`   ${c.green}✅ On track! Keep the momentum going.${c.reset}`);
  }
  
  console.log(`
${c.dim}Run 'gex streak' to see your top leads ready to close.${c.reset}
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getCloseableLeads() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not available');
    return [];
  }
  
  // Get all active positive replies
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .in('follow_up_status', ['pending', 'contacted', 'meeting_scheduled', 'snoozed'])
    .order('replied_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error.message);
    return [];
  }
  
  // Score leads
  const scoredLeads = (leads || [])
    .filter(lead => {
      const status = lead.follow_up_status;
      return status !== 'closed' && status !== 'lost';
    })
    .map(lead => {
      const scoreData = calculateStreakBreakerScore(lead);
      const daysToClose = estimateDaysToClose(lead, scoreData);
      const probability = calculateStreakBreakerProbability(scoreData, daysToClose);
      
      return {
        ...lead,
        scoreData,
        daysToClose,
        probability
      };
    })
    .sort((a, b) => b.probability - a.probability);
  
  // Deduplicate by email (keep highest probability version)
  const seen = new Set();
  const deduped = scoredLeads.filter(lead => {
    const email = lead.lead_email || lead.email || '';
    if (seen.has(email.toLowerCase())) return false;
    seen.add(email.toLowerCase());
    return true;
  });
  
  return deduped;
}

async function showDashboard(limit = 10) {
  const daysSinceWin = getDaysSinceLastWin();
  displayStreakHeader(daysSinceWin || 0);
  
  const leads = await getCloseableLeads();
  
  if (leads.length === 0) {
    console.log(`${c.yellow}No active leads found. Time to generate some pipeline!${c.reset}\n`);
    return;
  }
  
  console.log(`${c.bold}TOP ${Math.min(limit, leads.length)} CLOSEST TO CLOSE${c.reset}`);
  
  for (let i = 0; i < Math.min(limit, leads.length); i++) {
    const lead = leads[i];
    displayLeadCard(lead, i + 1, lead.scoreData, lead.daysToClose, lead.probability);
  }
  
  // Summary
  const highProb = leads.filter(l => l.probability >= 70).length;
  const medProb = leads.filter(l => l.probability >= 50 && l.probability < 70).length;
  
  console.log(`
${c.bold}SUMMARY${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
   🟢 High probability (70%+): ${c.green}${highProb}${c.reset} leads
   🟡 Medium probability (50-69%): ${c.yellow}${medProb}${c.reset} leads
   📊 Total in pipeline: ${leads.length} leads

${c.bold}💡 TIP:${c.reset} Run ${c.cyan}gex streak --path <email>${c.reset} for detailed win path
         Run ${c.cyan}gex streak --email${c.reset} to generate closing emails
`);
}

async function showQuick() {
  const daysSinceWin = getDaysSinceLastWin();
  const leads = await getCloseableLeads();
  
  console.log(`
${c.bold}🎯 TOP 3 STREAK BREAKERS${c.reset} (${daysSinceWin || 0}d since last win)
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  for (let i = 0; i < Math.min(3, leads.length); i++) {
    const lead = leads[i];
    const email = lead.lead_email || lead.email || '';
    const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
    const probColor = lead.probability >= 70 ? c.green : lead.probability >= 50 ? c.yellow : c.red;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    
    console.log(`${medal} ${c.bold}${company}${c.reset} - ${probColor}${lead.probability}%${c.reset} (${lead.daysToClose}d to close)`);
    console.log(`   📧 ${email} | ${c.cyan}${lead.reply_category || 'Unknown'}${c.reset}`);
  }
  
  console.log(`
${c.dim}Run 'gex streak' for full dashboard${c.reset}
`);
}

async function showWinPath(emailSearch) {
  const leads = await getCloseableLeads();
  const lead = leads.find(l => {
    const email = l.lead_email || l.email || '';
    return email.toLowerCase().includes(emailSearch.toLowerCase());
  });
  
  if (!lead) {
    console.log(`${c.red}Lead not found: ${email}${c.reset}`);
    console.log(`${c.dim}Try searching with partial email or company name${c.reset}`);
    return;
  }
  
  const winPath = generateWinPath(lead);
  displayLeadCard(lead, 1, lead.scoreData, lead.daysToClose, lead.probability);
  displayWinPath(lead, winPath);
}

async function showEmails(count = 5) {
  const daysSinceWin = getDaysSinceLastWin();
  const leads = await getCloseableLeads();
  
  console.log(`
${c.bold}📧 CLOSING EMAILS FOR TOP ${Math.min(count, leads.length)} LEADS${c.reset}
${c.dim}(${daysSinceWin || 0} days since last win - let's break this streak!)${c.reset}
`);
  
  for (let i = 0; i < Math.min(count, leads.length); i++) {
    const lead = leads[i];
    const emailData = generateClosingEmail(lead);
    displayEmail(lead, emailData);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLI Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function showScript(emailSearch) {
  const leads = await getCloseableLeads();
  const lead = leads.find(l => {
    const email = l.lead_email || l.email || '';
    return email.toLowerCase().includes(emailSearch.toLowerCase());
  });
  
  if (!lead) {
    console.log(`${c.red}Lead not found: ${emailSearch}${c.reset}`);
    return;
  }
  
  displayClosingScript(lead);
}

async function showFullPrep(emailSearch) {
  const leads = await getCloseableLeads();
  const lead = leads.find(l => {
    const email = l.lead_email || l.email || '';
    return email.toLowerCase().includes(emailSearch.toLowerCase());
  });
  
  if (!lead) {
    console.log(`${c.red}Lead not found: ${emailSearch}${c.reset}`);
    return;
  }
  
  const email = lead.lead_email || lead.email || '';
  const company = lead.lead_company || email.split('@')[1]?.split('.')[0] || 'Unknown';
  
  console.log(`
${c.bold}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}
${c.bold}║${c.reset}  🎯 ${c.bold}FULL CLOSE PREP: ${c.cyan}${company.toUpperCase()}${c.reset}
${c.bold}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}
`);
  
  // 1. Lead card with probability
  displayLeadCard(lead, 1, lead.scoreData, lead.daysToClose, lead.probability);
  
  // 2. Win Path
  const winPath = generateWinPath(lead);
  displayWinPath(lead, winPath);
  
  // 3. Closing Script
  displayClosingScript(lead);
  
  // 4. Email Template
  const emailData = generateClosingEmail(lead);
  displayEmail(lead, emailData);
  
  // 5. Calendar Links
  displayCalendarLinks(lead);
  
  // 6. Top 3 likely objections for this stage
  console.log(`
${c.bold}🛡️ LIKELY OBJECTIONS FOR ${c.yellow}${lead.reply_category || 'this stage'}${c.reset}
${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  
  const handlers = getObjectionHandlers();
  const category = lead.reply_category || 'Default';
  
  // Pick relevant objections based on stage
  let relevantObjections = ['Too expensive', 'Need to think about it', 'Bad timing'];
  if (category === 'Meeting Request') {
    relevantObjections = ['Bad timing', 'Need internal approval', 'Need to think about it'];
  } else if (category === 'Pricing Request') {
    relevantObjections = ['Too expensive', 'Need internal approval', 'Working with other creators'];
  } else if (category === 'Booked') {
    relevantObjections = ['Bad timing', 'Need internal approval', 'Not sure about fit'];
  }
  
  for (const obj of relevantObjections) {
    const handler = handlers[obj];
    if (handler) {
      console.log(`\n${c.yellow}"${obj}"${c.reset}`);
      console.log(`${c.dim}→${c.reset} ${handler.response.substring(0, 100)}...`);
    }
  }
  
  console.log(`
${c.dim}Run 'gex streak --objections' for full objection playbook${c.reset}
`);
}

async function showCalendar(emailSearch) {
  const leads = await getCloseableLeads();
  const lead = leads.find(l => {
    const email = l.lead_email || l.email || '';
    return email.toLowerCase().includes(emailSearch.toLowerCase());
  });
  
  if (!lead) {
    console.log(`${c.red}Lead not found: ${emailSearch}${c.reset}`);
    return;
  }
  
  displayCalendarLinks(lead);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${c.bold}Win Streak Recovery Tool${c.reset}

${c.bold}Usage:${c.reset}
  gex streak                    Dashboard of closest-to-win leads
  gex streak --quick            Top 3 most closeable leads  
  gex streak --path <email>     Win path for specific lead
  gex streak --email            Generate closing emails for top 5
  gex streak --script <email>   Closing script for specific lead
  gex streak --prep <email>     FULL close prep (path + script + email + objections)
  gex streak --objections       Show objection handlers
  gex streak --calendar <email> Calendar links for lead
  gex streak stats              Streak statistics and analysis

${c.bold}Examples:${c.reset}
  gex streak --prep sara        Full preparation pack for Sara
  gex streak --path john@acme   Show win path for john@acme.com
  gex streak --script sara      Get closing script for Sara
  gex streak --objections       See how to handle objections
`);
    return;
  }
  
  if (args.includes('stats') || args.includes('statistics')) {
    displayStats();
    return;
  }
  
  if (args.includes('--quick') || args.includes('-q')) {
    await showQuick();
    return;
  }
  
  if (args.includes('--objections') || args.includes('objections')) {
    displayObjectionHandlers();
    return;
  }
  
  const prepIdx = args.indexOf('--prep');
  if (prepIdx !== -1 && args[prepIdx + 1]) {
    await showFullPrep(args[prepIdx + 1]);
    return;
  }
  
  const scriptIdx = args.indexOf('--script');
  if (scriptIdx !== -1 && args[scriptIdx + 1]) {
    await showScript(args[scriptIdx + 1]);
    return;
  }
  
  const calendarIdx = args.indexOf('--calendar');
  if (calendarIdx !== -1 && args[calendarIdx + 1]) {
    await showCalendar(args[calendarIdx + 1]);
    return;
  }
  
  const pathIdx = args.indexOf('--path');
  if (pathIdx !== -1 && args[pathIdx + 1]) {
    await showWinPath(args[pathIdx + 1]);
    return;
  }
  
  if (args.includes('--email') || args.includes('--emails') || args.includes('-e')) {
    const countIdx = args.indexOf('--count');
    const count = countIdx !== -1 ? parseInt(args[countIdx + 1]) || 5 : 5;
    await showEmails(count);
    return;
  }
  
  // Default: show dashboard
  await showDashboard();
}

main().catch(err => {
  console.error(`${c.red}Error:${c.reset}`, err.message);
  process.exit(1);
});
