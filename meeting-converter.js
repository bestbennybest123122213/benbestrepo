#!/usr/bin/env node
/**
 * Meeting Request Converter
 * 
 * Convert "Meeting Request" leads into booked calls.
 * These leads ASKED to meet - highest intent. Fastest path to revenue.
 * 
 * Usage:
 *   node meeting-converter.js              # Dashboard of unbooked meetings
 *   node meeting-converter.js --urgent     # Only last 7 days
 *   node meeting-converter.js draft <email> # Generate nudge for specific lead
 *   node meeting-converter.js batch        # Generate all booking emails
 *   node meeting-converter.js stats        # Conversion statistics
 * 
 * Aliases: meetings, book-now, unbooked, meeting-requests
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const SUBCOMMAND = args.find(a => !a.startsWith('-')) || 'dashboard';
const FLAGS = {
  urgent: args.includes('--urgent') || args.includes('-u'),
  all: args.includes('--all') || args.includes('-a'),
  json: args.includes('--json'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20
};

// ANSI colors
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', 
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
  bg: { green: '\x1b[42m', yellow: '\x1b[43m', red: '\x1b[41m' }
};

// Constants
const CALENDLY_LINK = 'https://calendly.com/jan-byinfluence/discovery';
const AVG_DEAL_SIZE = 22500;  // Average deal size in $
const CONVERSION_TO_DEAL = 0.60;  // 60% close rate on inbound
const COMMISSION_RATE = 0.30;  // 30% average commission

// Time slot suggestions (Central European Time)
function getTimeSlots() {
  const now = new Date();
  const slots = [];
  let daysAdded = 0;
  let offset = 1;
  
  while (daysAdded < 3 && offset < 14) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    offset++;
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    
    const times = ['2:00 PM', '3:00 PM', '4:00 PM'];
    slots.push({ day: dayName, date: dateStr, time: times[daysAdded], full: `${dayName} ${dateStr} at ${times[daysAdded]} CET` });
    daysAdded++;
  }
  
  return slots;
}

// Calculate urgency score (0-100)
function getUrgencyScore(lead) {
  let score = 100;
  const ageDays = lead.age_days || 0;
  
  // Decay based on age (loses ~5 points per day)
  score -= ageDays * 5;
  
  // Boost for high engagement leads (if available)
  if (lead.engagement_score) score += lead.engagement_score * 10;
  
  // Boost for known companies
  if (lead.lead_company && lead.lead_company !== 'Unknown') score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// Get urgency tier
function getUrgencyTier(lead) {
  const days = lead.age_days || 0;
  if (days <= 1) return { tier: 'critical', emoji: '🔥', label: 'CRITICAL', color: c.red };
  if (days <= 3) return { tier: 'hot', emoji: '🔴', label: 'HOT', color: c.red };
  if (days <= 7) return { tier: 'warm', emoji: '🟡', label: 'WARM', color: c.yellow };
  if (days <= 14) return { tier: 'cooling', emoji: '🟠', label: 'COOLING', color: c.yellow };
  return { tier: 'stale', emoji: '⚪', label: 'STALE', color: c.dim };
}

// Calculate money left on table
function calculateMoneyLeft(unbookedCount, bookedCount) {
  const totalRequests = unbookedCount + bookedCount;
  const conversionRate = totalRequests > 0 ? bookedCount / totalRequests : 0;
  
  // Potential value if all unbooked converted
  const potentialDeals = unbookedCount * CONVERSION_TO_DEAL;
  const potentialRevenue = potentialDeals * AVG_DEAL_SIZE;
  const potentialCommission = potentialRevenue * COMMISSION_RATE;
  
  // Realistic expectation (based on historical conversion)
  const expectedBookings = unbookedCount * (conversionRate > 0 ? conversionRate : 0.30);
  const expectedDeals = expectedBookings * CONVERSION_TO_DEAL;
  const expectedCommission = expectedDeals * AVG_DEAL_SIZE * COMMISSION_RATE;
  
  return {
    unbookedCount,
    bookedCount,
    conversionRate,
    potentialRevenue,
    potentialCommission,
    expectedCommission,
    perLeadValue: potentialCommission / Math.max(1, unbookedCount)
  };
}

// Generate personalized nudge email
function generateNudgeEmail(lead, slotsOrNull) {
  // Use timezone-aware slots if not provided
  const { slots, timezone } = slotsOrNull 
    ? { slots: slotsOrNull.map(s => s.full ? s : { full: s }), timezone: null }
    : getTimeSlotsForLead(lead);
  
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || '';
  const age = lead.age_days || 0;
  const urgency = getUrgencyTier(lead);
  const tzNote = timezone ? ` (I've suggested times that should work for ${timezone.friendly})` : '';
  
  let subject, body, tone;
  
  const slot0 = slots[0]?.full || slots[0];
  const slot1 = slots[1]?.full || slots[1];
  const slot2 = slots[2]?.full || slots[2];
  
  if (age <= 1) {
    // Same day / next day - eager response
    subject = `Re: Let's connect - times available`;
    body = `Hi ${firstName},

Thanks for your interest in discussing a partnership! I have a few slots open this week${tzNote}:

• ${slot0}
• ${slot1}
• ${slot2}

Or grab any time that works: ${CALENDLY_LINK}

Looking forward to connecting!`;
    tone = 'eager';
  } else if (age <= 3) {
    // 2-3 days - quick follow-up
    subject = `Re: Quick follow-up on scheduling`;
    body = `Hi ${firstName},

Just wanted to follow up on scheduling our chat${company ? ` about ${company}` : ''}.

Here are a few options${tzNote}:
• ${slot0}
• ${slot1}
• ${slot2}

Or book directly: ${CALENDLY_LINK}

Let me know what works!`;
    tone = 'friendly';
  } else if (age <= 7) {
    // 4-7 days - gentle reminder
    subject = `Re: Still keen to connect?`;
    body = `Hi ${firstName},

I know things get busy - just wanted to circle back on finding a time to chat.

I'm available${tzNote}:
• ${slot0}
• ${slot1}

Or pick any slot here: ${CALENDLY_LINK}

Would love to hear about what you have in mind!`;
    tone = 'understanding';
  } else if (age <= 14) {
    // 8-14 days - re-engagement
    subject = `Re: Shall we reschedule?`;
    body = `Hi ${firstName},

I wanted to check if timing didn't work out for our call?

I'm flexible if you'd like to reconnect - just let me know and I'll make time.

Quick link to book: ${CALENDLY_LINK}

No pressure either way!`;
    tone = 're-engage';
  } else {
    // 15+ days - last chance
    subject = `Re: One last check-in`;
    body = `Hi ${firstName},

Wanted to send a quick note to see if you're still interested in connecting.

If timing has changed, no worries at all. If you'd still like to chat, I'm here:
${CALENDLY_LINK}

Either way, wishing you all the best!`;
    tone = 'graceful';
  }
  
  return {
    to: lead.lead_email,
    subject,
    body,
    tone,
    urgency,
    age,
    perLeadValue: calculateMoneyLeft(1, 0).perLeadValue
  };
}

// Detect timezone from email domain
function guessTimezone(email, company) {
  const domain = email?.split('@')[1]?.toLowerCase() || '';
  const companyLower = (company || '').toLowerCase();
  
  // Common patterns
  if (domain.endsWith('.jp') || companyLower.includes('japan')) return { tz: 'Asia/Tokyo', offset: '+9', friendly: 'JST' };
  if (domain.endsWith('.kr') || domain.includes('naver') || domain.includes('kakao')) return { tz: 'Asia/Seoul', offset: '+9', friendly: 'KST' };
  if (domain.endsWith('.cn') || domain.endsWith('.hk')) return { tz: 'Asia/Hong_Kong', offset: '+8', friendly: 'HKT' };
  if (domain.endsWith('.sg')) return { tz: 'Asia/Singapore', offset: '+8', friendly: 'SGT' };
  if (domain.endsWith('.au')) return { tz: 'Australia/Sydney', offset: '+11', friendly: 'AEDT' };
  if (domain.endsWith('.de') || domain.endsWith('.fr') || domain.endsWith('.nl') || domain.endsWith('.se') || domain.endsWith('.no')) 
    return { tz: 'Europe/Berlin', offset: '+1', friendly: 'CET' };
  if (domain.endsWith('.uk') || domain.endsWith('.ie')) return { tz: 'Europe/London', offset: '+0', friendly: 'GMT' };
  if (domain.endsWith('.ca')) return { tz: 'America/Toronto', offset: '-5', friendly: 'EST' };
  
  // US domains are tricky, default to Pacific/Eastern
  if (domain.endsWith('.com') || domain.endsWith('.io') || domain.endsWith('.co')) {
    // Check for keywords
    if (companyLower.includes('sf') || companyLower.includes('san francisco') || companyLower.includes('la') || companyLower.includes('seattle'))
      return { tz: 'America/Los_Angeles', offset: '-8', friendly: 'PST' };
    if (companyLower.includes('nyc') || companyLower.includes('new york') || companyLower.includes('boston'))
      return { tz: 'America/New_York', offset: '-5', friendly: 'EST' };
  }
  
  // Default to EST (most common for US-based leads)
  return { tz: 'America/New_York', offset: '-5', friendly: 'EST' };
}

// Get time slots adjusted for lead timezone
function getTimeSlotsForLead(lead) {
  const tz = guessTimezone(lead.lead_email, lead.lead_company);
  const now = new Date();
  const slots = [];
  let daysAdded = 0;
  let offset = 1;
  
  while (daysAdded < 3 && offset < 14) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    offset++;
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    
    // Times that work for both CET (host) and lead timezone
    // Jan is in CET, so pick times that overlap working hours
    let suggestedTime;
    const offsetNum = parseInt(tz.offset);
    
    if (offsetNum >= 8) {
      // Asia Pacific - morning CET = afternoon/evening for them
      suggestedTime = '9:00 AM CET';
    } else if (offsetNum <= -5) {
      // Americas - late afternoon CET = morning for them  
      suggestedTime = '4:00 PM CET';
    } else {
      // Europe - standard afternoon
      suggestedTime = ['2:00 PM', '3:00 PM', '4:00 PM'][daysAdded] + ' CET';
    }
    
    slots.push({
      day: dayName,
      date: dateStr,
      time: suggestedTime,
      full: `${dayName} ${dateStr} at ${suggestedTime}`,
      leadTz: tz.friendly
    });
    daysAdded++;
  }
  
  return { slots, timezone: tz };
}

async function getUnbookedMeetings(client) {
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .neq('follow_up_status', 'booked')
    .order('replied_at', { ascending: false });

  if (error) throw error;

  const now = Date.now();
  
  // Deduplicate by email - keep the most recent entry for each email
  const byEmail = new Map();
  for (const lead of leads || []) {
    const email = lead.lead_email?.toLowerCase();
    if (!email) continue;
    
    const existing = byEmail.get(email);
    const leadDate = lead.replied_at ? new Date(lead.replied_at) : new Date(0);
    const existingDate = existing?.replied_at ? new Date(existing.replied_at) : new Date(0);
    
    if (!existing || leadDate > existingDate) {
      byEmail.set(email, lead);
    }
  }
  
  return Array.from(byEmail.values()).map(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const tzInfo = guessTimezone(lead.lead_email, lead.lead_company);
    return { 
      ...lead, 
      age_days: age,
      urgency_score: getUrgencyScore({ ...lead, age_days: age }),
      timezone: tzInfo
    };
  }).sort((a, b) => b.urgency_score - a.urgency_score);
}

async function getBookedMeetings(client) {
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .or('reply_category.eq.Meeting Request,reply_category.eq.Booked')
    .eq('follow_up_status', 'booked');

  if (error) throw error;
  return leads || [];
}

async function getConversionStats(client) {
  // Get all meeting requests ever
  const { data: allRequests } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request');

  // Get booked ones
  const { data: booked } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .eq('follow_up_status', 'booked');

  const total = (allRequests || []).length;
  const bookedCount = (booked || []).length;
  const unbookedCount = total - bookedCount;
  
  // Time-based breakdown
  const now = Date.now();
  const byAge = { last24h: 0, last7d: 0, last30d: 0, older: 0 };
  
  for (const req of allRequests || []) {
    if (req.follow_up_status === 'booked') continue;
    const age = req.replied_at 
      ? Math.floor((now - new Date(req.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    if (age <= 1) byAge.last24h++;
    else if (age <= 7) byAge.last7d++;
    else if (age <= 30) byAge.last30d++;
    else byAge.older++;
  }

  return {
    total,
    bookedCount,
    unbookedCount,
    conversionRate: total > 0 ? bookedCount / total : 0,
    byAge,
    money: calculateMoneyLeft(unbookedCount, bookedCount)
  };
}

// Dashboard view
async function showDashboard(client) {
  console.log(`\n${c.bold}📅 Meeting Request Converter${c.reset}`);
  console.log(`${c.dim}These leads ASKED to meet. Highest intent. Fastest path to revenue.${c.reset}\n`);
  
  let leads = await getUnbookedMeetings(client);
  const stats = await getConversionStats(client);
  
  // Filter if --urgent
  if (FLAGS.urgent) {
    leads = leads.filter(l => l.age_days <= 7);
    console.log(`${c.yellow}Showing urgent only (≤7 days)${c.reset}\n`);
  }
  
  if (leads.length === 0) {
    console.log(`${c.green}✓ All meeting requests have been booked! Great work.${c.reset}\n`);
    return;
  }

  // Money on table
  console.log(`${c.bold}💰 MONEY LEFT ON TABLE${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Unbooked meeting requests: ${c.bold}${stats.unbookedCount}${c.reset}`);
  console.log(`   Potential commission:      ${c.green}$${stats.money.potentialCommission.toLocaleString()}${c.reset}`);
  console.log(`   Realistic expectation:     ${c.cyan}$${Math.round(stats.money.expectedCommission).toLocaleString()}${c.reset}`);
  console.log(`   Per-lead value:            ${c.yellow}$${Math.round(stats.money.perLeadValue).toLocaleString()}${c.reset}`);
  console.log('');

  // Urgency breakdown
  const critical = leads.filter(l => l.age_days <= 1);
  const hot = leads.filter(l => l.age_days > 1 && l.age_days <= 3);
  const warm = leads.filter(l => l.age_days > 3 && l.age_days <= 7);
  const cooling = leads.filter(l => l.age_days > 7 && l.age_days <= 14);
  const stale = leads.filter(l => l.age_days > 14);

  console.log(`${c.bold}📊 URGENCY BREAKDOWN${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   🔥 Critical (today):    ${c.red}${c.bold}${critical.length}${c.reset} → Book NOW`);
  console.log(`   🔴 Hot (2-3 days):      ${c.red}${hot.length}${c.reset} → Book today`);
  console.log(`   🟡 Warm (4-7 days):     ${c.yellow}${warm.length}${c.reset} → Follow up`);
  console.log(`   🟠 Cooling (8-14 days): ${c.yellow}${cooling.length}${c.reset} → Re-engage`);
  console.log(`   ⚪ Stale (15+ days):    ${c.dim}${stale.length}${c.reset} → Last attempt`);
  console.log('');

  // Show top leads
  const showCount = FLAGS.all ? leads.length : Math.min(FLAGS.limit, leads.length);
  console.log(`${c.bold}🎯 TOP ${showCount} LEADS TO BOOK${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  
  for (let i = 0; i < showCount; i++) {
    const lead = leads[i];
    const tier = getUrgencyTier(lead);
    const name = lead.lead_name || 'Unknown';
    const company = lead.lead_company || '';
    const email = lead.lead_email;
    
    const tz = lead.timezone?.friendly || 'EST';
    console.log(`\n${tier.emoji} ${c.bold}#${i + 1}${c.reset} ${name}${company ? ` @ ${company}` : ''}`);
    console.log(`   ${c.dim}${email}${c.reset}`);
    console.log(`   ${c.dim}Age: ${lead.age_days}d | Score: ${lead.urgency_score}/100 | TZ: ${tz} | Value: $${Math.round(stats.money.perLeadValue)}${c.reset}`);
    
    if (FLAGS.verbose && lead.reply_content) {
      const preview = lead.reply_content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   ${c.dim}Reply: "${preview}..."${c.reset}`);
    }
  }
  
  if (leads.length > showCount) {
    console.log(`\n${c.dim}... and ${leads.length - showCount} more. Use --all to see all.${c.reset}`);
  }

  // Quick actions
  console.log(`\n${c.bold}⚡ QUICK ACTIONS${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   ${c.cyan}gex meetings draft <email>${c.reset}  Generate personalized nudge email`);
  console.log(`   ${c.cyan}gex meetings prep <email>${c.reset}   Meeting prep notes & questions`);
  console.log(`   ${c.cyan}gex meetings mark <email>${c.reset}   Mark lead as booked`);
  console.log(`   ${c.cyan}gex meetings batch${c.reset}          All nudge emails at once`);
  console.log(`   ${c.cyan}gex meetings stats${c.reset}          Conversion funnel & revenue`);
  console.log(`   ${c.cyan}gex meetings --urgent${c.reset}       Only ≤7 days old (hottest)`);
  console.log(`   ${c.cyan}gex meetings noshow <email>${c.reset} Generate no-show follow-up`);
  console.log('');
}

// Generate single draft
async function showDraft(client, email) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .eq('reply_category', 'Meeting Request')
    .ilike('lead_email', `%${email}%`);

  if (!leads || leads.length === 0) {
    console.error(`${c.red}❌ No meeting request found for: ${email}${c.reset}`);
    process.exit(1);
  }

  const lead = leads[0];
  const age = lead.replied_at 
    ? Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  lead.age_days = age;
  
  const draft = generateNudgeEmail(lead, null);  // Auto-detect timezone
  
  console.log(`\n${c.bold}📧 NUDGE EMAIL FOR ${lead.lead_name || lead.lead_email}${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`${draft.urgency.emoji} ${draft.urgency.label} | Age: ${draft.age}d | Value: $${Math.round(draft.perLeadValue)}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`${c.dim}TO:${c.reset} ${draft.to}`);
  console.log(`${c.dim}SUBJECT:${c.reset} ${draft.subject}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(draft.body);
  console.log(`${'─'.repeat(60)}\n`);
  
  if (lead.reply_content) {
    console.log(`${c.dim}Their original message:${c.reset}`);
    console.log(`${c.dim}${lead.reply_content.substring(0, 300)}...${c.reset}\n`);
  }
}

// Batch generate all emails
async function showBatch(client) {
  let leads = await getUnbookedMeetings(client);
  
  if (FLAGS.urgent) {
    leads = leads.filter(l => l.age_days <= 7);
  }
  
  console.log(`\n${c.bold}📧 BATCH NUDGE EMAILS (${leads.length} leads)${c.reset}\n`);
  
  // Only show hot/warm by default
  const prioritized = FLAGS.all 
    ? leads 
    : leads.filter(l => l.age_days <= 14);
  
  for (const lead of prioritized.slice(0, FLAGS.limit)) {
    const draft = generateNudgeEmail(lead, null);  // Auto-detect timezone
    
    console.log(`${'═'.repeat(60)}`);
    console.log(`${draft.urgency.emoji} ${c.bold}${lead.lead_name || 'Unknown'}${c.reset} @ ${lead.lead_company || 'Unknown'}`);
    console.log(`${c.dim}TO:${c.reset} ${draft.to}`);
    console.log(`${c.dim}SUBJECT:${c.reset} ${draft.subject}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(draft.body);
    console.log('');
  }
  
  if (prioritized.length > FLAGS.limit) {
    console.log(`${c.dim}... and ${prioritized.length - FLAGS.limit} more. Use --limit=N or --all${c.reset}\n`);
  }
  
  const totalValue = calculateMoneyLeft(leads.length, 0);
  console.log(`${c.bold}💰 Total potential value: $${Math.round(totalValue.potentialCommission).toLocaleString()}${c.reset}\n`);
}

// Show conversion stats
async function showStats(client) {
  const stats = await getConversionStats(client);
  
  console.log(`\n${c.bold}📊 MEETING REQUEST CONVERSION STATS${c.reset}`);
  console.log(`${'═'.repeat(60)}`);
  
  // Overall funnel
  console.log(`\n${c.bold}CONVERSION FUNNEL${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Meeting requests:  ${c.bold}${stats.total}${c.reset}`);
  console.log(`   ├─ Booked:         ${c.green}${stats.bookedCount}${c.reset} (${(stats.conversionRate * 100).toFixed(1)}%)`);
  console.log(`   └─ Unbooked:       ${c.red}${stats.unbookedCount}${c.reset} (${((1 - stats.conversionRate) * 100).toFixed(1)}%)`);
  
  // Age breakdown
  console.log(`\n${c.bold}UNBOOKED BY AGE${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   🔥 Last 24h:  ${c.red}${stats.byAge.last24h}${c.reset}  → Critical`);
  console.log(`   🔴 Last 7d:   ${c.yellow}${stats.byAge.last7d}${c.reset}  → Urgent`);
  console.log(`   🟡 Last 30d:  ${c.dim}${stats.byAge.last30d}${c.reset}  → At risk`);
  console.log(`   ⚪ Older:     ${c.dim}${stats.byAge.older}${c.reset}  → Cold`);
  
  // Money calculation
  console.log(`\n${c.bold}💰 REVENUE IMPACT${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Assumptions:`);
  console.log(`   ${c.dim}├─ Avg deal size:     $${AVG_DEAL_SIZE.toLocaleString()}${c.reset}`);
  console.log(`   ${c.dim}├─ Deal close rate:   ${(CONVERSION_TO_DEAL * 100)}%${c.reset}`);
  console.log(`   ${c.dim}└─ Commission rate:   ${(COMMISSION_RATE * 100)}%${c.reset}`);
  console.log('');
  console.log(`   If ALL ${stats.unbookedCount} unbooked convert:`);
  console.log(`   ${c.dim}├─${c.reset} Potential deals:     ${Math.round(stats.unbookedCount * CONVERSION_TO_DEAL)}`);
  console.log(`   ${c.dim}├─${c.reset} Potential revenue:   ${c.green}$${Math.round(stats.money.potentialRevenue).toLocaleString()}${c.reset}`);
  console.log(`   ${c.dim}└─${c.reset} Your commission:     ${c.green}$${Math.round(stats.money.potentialCommission).toLocaleString()}${c.reset}`);
  console.log('');
  console.log(`   Realistic expectation (${(stats.conversionRate * 100).toFixed(0)}% booking rate):`);
  console.log(`   ${c.dim}└─${c.reset} Expected commission: ${c.cyan}$${Math.round(stats.money.expectedCommission).toLocaleString()}${c.reset}`);
  
  // Action recommendation
  console.log(`\n${c.bold}⚡ RECOMMENDED ACTION${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  if (stats.byAge.last24h > 0) {
    console.log(`   ${c.red}${c.bold}URGENT:${c.reset} ${stats.byAge.last24h} leads from today need immediate follow-up!`);
  }
  if (stats.byAge.last7d > 0) {
    console.log(`   ${c.yellow}Focus on ${stats.byAge.last7d} warm leads (last 7 days) first.${c.reset}`);
  }
  console.log(`\n   Run: ${c.cyan}gex meetings batch --urgent${c.reset} to generate all emails\n`);
}

// Generate meeting prep notes
async function showPrep(client, email) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .ilike('lead_email', `%${email}%`)
    .limit(5);

  if (!leads || leads.length === 0) {
    console.error(`${c.red}❌ No lead found for: ${email}${c.reset}`);
    process.exit(1);
  }

  const lead = leads[0];
  const tz = guessTimezone(lead.lead_email, lead.lead_company);
  
  console.log(`\n${c.bold}📋 MEETING PREP: ${lead.lead_name || lead.lead_email}${c.reset}`);
  console.log(`${'═'.repeat(60)}`);
  
  // Basic info
  console.log(`\n${c.bold}CONTACT INFO${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Name:    ${lead.lead_name || 'Unknown'}`);
  console.log(`   Email:   ${lead.lead_email}`);
  console.log(`   Company: ${lead.lead_company || 'Unknown'}`);
  console.log(`   TZ:      ${tz.friendly} (${tz.tz})`);
  
  // Campaign context
  console.log(`\n${c.bold}OUTREACH CONTEXT${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Campaign:      ${lead.campaign_name || 'Unknown'}`);
  console.log(`   Reply Type:    ${lead.reply_category || 'Unknown'}`);
  console.log(`   Reply Date:    ${lead.replied_at ? new Date(lead.replied_at).toLocaleDateString() : 'Unknown'}`);
  console.log(`   Follow-up:     ${lead.follow_up_status || 'pending'}`);
  
  // Their message
  if (lead.reply_content) {
    console.log(`\n${c.bold}THEIR MESSAGE${c.reset}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`${c.dim}${lead.reply_content}${c.reset}`);
  }
  
  // Talking points
  console.log(`\n${c.bold}💡 TALKING POINTS${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   1. Thank them for their response and interest`);
  console.log(`   2. Ask about their current marketing strategy for [content type]`);
  console.log(`   3. Share ItssIMANNN stats: 10M+ subs, 361M monthly views`);
  console.log(`   4. Discuss their goals and timeline`);
  console.log(`   5. Propose a pilot campaign with clear KPIs`);
  
  // Questions to ask
  console.log(`\n${c.bold}❓ DISCOVERY QUESTIONS${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   • What content/audience type are you looking to reach?`);
  console.log(`   • What's your typical budget for influencer campaigns?`);
  console.log(`   • What does success look like for you?`);
  console.log(`   • Who else is involved in the decision?`);
  console.log(`   • What's your timeline for launching?`);
  
  // Deal potential
  const potentialDeal = AVG_DEAL_SIZE;
  const potentialCommission = potentialDeal * COMMISSION_RATE;
  
  console.log(`\n${c.bold}💰 DEAL POTENTIAL${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   Est. deal size:    ${c.green}$${potentialDeal.toLocaleString()}${c.reset}`);
  console.log(`   Your commission:   ${c.green}$${potentialCommission.toLocaleString()}${c.reset}`);
  console.log('');
}

// Mark a lead as booked
async function markBooked(client, email) {
  const { data, error } = await client
    .from('positive_replies')
    .update({ follow_up_status: 'booked' })
    .ilike('lead_email', `%${email}%`)
    .select();

  if (error) {
    console.error(`${c.red}❌ Failed to update: ${error.message}${c.reset}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error(`${c.red}❌ No lead found for: ${email}${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.green}✓ Marked ${data.length} record(s) as booked for ${email}${c.reset}`);
  console.log(`${c.dim}Run 'gex meetings stats' to see updated conversion rates${c.reset}\n`);
}

// Generate no-show follow-up sequence
async function showNoShow(client, email) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .ilike('lead_email', `%${email}%`)
    .limit(1);

  if (!leads || leads.length === 0) {
    console.error(`${c.red}❌ No lead found for: ${email}${c.reset}`);
    process.exit(1);
  }

  const lead = leads[0];
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const { slots } = getTimeSlotsForLead(lead);
  
  console.log(`\n${c.bold}🚫 NO-SHOW FOLLOW-UP SEQUENCE: ${lead.lead_name || lead.lead_email}${c.reset}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`${c.dim}Use these emails in sequence if they missed the meeting${c.reset}\n`);

  // Email 1: Same day (within 1 hour)
  console.log(`${c.bold}📧 EMAIL 1: Same Day (send within 1 hour)${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`${c.dim}SUBJECT:${c.reset} Missed you today - let's reschedule`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Hi ${firstName},

I was looking forward to our call today but didn't see you join.

No worries at all - I know things come up. Would any of these work for a quick reschedule?

• ${slots[0].full}
• ${slots[1].full}
• ${slots[2].full}

Or grab any time here: ${CALENDLY_LINK}

Talk soon!`);
  console.log('');

  // Email 2: Next day
  console.log(`${c.bold}📧 EMAIL 2: Next Day${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`${c.dim}SUBJECT:${c.reset} Quick follow-up on our chat`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Hi ${firstName},

Just wanted to check in - are you still interested in connecting about influencer marketing?

If timing didn't work, I'm happy to find a better slot. Here's my calendar: ${CALENDLY_LINK}

If priorities have shifted, no problem at all. Just let me know either way.`);
  console.log('');

  // Email 3: 3-5 days later
  console.log(`${c.bold}📧 EMAIL 3: 3-5 Days Later (final attempt)${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`${c.dim}SUBJECT:${c.reset} Should I close your file?`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Hi ${firstName},

I haven't heard back after our missed call, so I wanted to check if I should close out your inquiry.

If you'd still like to explore a partnership, I'm here: ${CALENDLY_LINK}

Otherwise, I wish you all the best and I'm here if things change in the future!`);
  console.log('');

  console.log(`${c.bold}💡 TIPS${c.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   • Space emails: Day 0 → Day 1 → Day 4`);
  console.log(`   • If no response after Email 3, move on`);
  console.log(`   • Consider SMS if you have their number`);
  console.log(`   • Check spam folder - your email might be there`);
  console.log('');
}

// Show help
function showHelp() {
  console.log(`
${c.bold}📅 Meeting Request Converter${c.reset}
${c.dim}Convert "Meeting Request" leads into booked calls${c.reset}

${c.bold}USAGE${c.reset}
  gex meetings [command] [options]

${c.bold}COMMANDS${c.reset}
  ${c.cyan}(default)${c.reset}       Dashboard of unbooked meeting requests
  ${c.cyan}draft <email>${c.reset}  Generate personalized nudge email
  ${c.cyan}prep <email>${c.reset}   Meeting prep notes & discovery questions
  ${c.cyan}mark <email>${c.reset}   Mark a lead as booked
  ${c.cyan}noshow <email>${c.reset} Generate no-show follow-up sequence
  ${c.cyan}batch${c.reset}          Generate all nudge emails
  ${c.cyan}stats${c.reset}          Show conversion funnel & revenue impact

${c.bold}OPTIONS${c.reset}
  ${c.cyan}--urgent, -u${c.reset}   Only show leads from last 7 days
  ${c.cyan}--all, -a${c.reset}      Show all leads (not just top 20)
  ${c.cyan}--verbose, -v${c.reset}  Show more details
  ${c.cyan}--limit=N${c.reset}      Limit results (default: 20)

${c.bold}ALIASES${c.reset}
  meetings, book-now, unbooked, meeting-requests, booknow

${c.bold}EXAMPLES${c.reset}
  gex meetings                           # Dashboard
  gex meetings --urgent                  # Hot leads only
  gex meetings draft john@example.com    # Nudge email
  gex meetings prep john@example.com     # Meeting prep
  gex meetings mark john@example.com     # Mark as booked
  gex meetings noshow john@example.com   # No-show sequence
  gex meetings stats                     # Conversion stats
`);
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error(`${c.red}❌ Database not initialized${c.reset}`);
    process.exit(1);
  }

  // Route subcommands
  switch (SUBCOMMAND) {
    case 'help':
    case '-h':
    case '--help':
      showHelp();
      break;
    case 'dashboard':
    case 'list':
    case 'show':
      await showDashboard(client);
      break;
    case 'draft':
      const emailArg = args[1] || args.find(a => a.includes('@'));
      if (!emailArg) {
        console.error(`${c.red}❌ Please provide an email: gex meetings draft <email>${c.reset}`);
        process.exit(1);
      }
      await showDraft(client, emailArg);
      break;
    case 'prep':
    case 'prepare':
    case 'notes':
      const prepEmail = args[1] || args.find(a => a.includes('@'));
      if (!prepEmail) {
        console.error(`${c.red}❌ Please provide an email: gex meetings prep <email>${c.reset}`);
        process.exit(1);
      }
      await showPrep(client, prepEmail);
      break;
    case 'noshow':
    case 'no-show':
    case 'missed':
      const noshowEmail = args[1] || args.find(a => a.includes('@'));
      if (!noshowEmail) {
        console.error(`${c.red}❌ Please provide an email: gex meetings noshow <email>${c.reset}`);
        process.exit(1);
      }
      await showNoShow(client, noshowEmail);
      break;
    case 'mark':
    case 'book':
    case 'booked':
      const markEmail = args[1] || args.find(a => a.includes('@'));
      if (!markEmail) {
        console.error(`${c.red}❌ Please provide an email: gex meetings mark <email>${c.reset}`);
        process.exit(1);
      }
      await markBooked(client, markEmail);
      break;
    case 'batch':
    case 'all':
      await showBatch(client);
      break;
    case 'stats':
    case 'conversion':
    case 'funnel':
      await showStats(client);
      break;
    default:
      // Check if it's an email
      if (SUBCOMMAND.includes('@')) {
        await showDraft(client, SUBCOMMAND);
      } else {
        console.error(`${c.red}❌ Unknown command: ${SUBCOMMAND}${c.reset}`);
        console.log(`\nRun 'gex meetings help' for usage`);
        process.exit(1);
      }
  }
}

main().catch(err => {
  console.error(`${c.red}❌ Error: ${err.message}${c.reset}`);
  if (FLAGS.verbose) console.error(err);
  process.exit(1);
});
