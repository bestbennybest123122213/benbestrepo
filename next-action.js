#!/usr/bin/env node
/**
 * Next Action
 * 
 * Tells you the ONE thing you should do right now.
 * No analysis paralysis - just one clear action.
 * 
 * Usage:
 *   node next-action.js           # Get your next action
 *   node next-action.js --done    # Mark current action done, get next
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const MARK_DONE = args.includes('--done');

// Priority scoring (higher = more urgent)
function priorityScore(lead, ageDays) {
  let score = 0;
  
  // Category priority
  const catScores = {
    'Meeting Request': 100,
    'Demo Request': 90,
    'Interested': 70,
    'Information Request': 50
  };
  score += catScores[lead.reply_category] || 40;
  
  // Tier bonus
  if (lead.lead_tier === 'enterprise') score += 80;
  else if (lead.lead_tier === 'midmarket') score += 40;
  
  // Age urgency (hot leads are critical)
  if (ageDays <= 1) score += 100;
  else if (ageDays <= 3) score += 60;
  else if (ageDays <= 7) score += 30;
  // Older leads get negative score
  else if (ageDays > 14) score -= 20;
  
  return score;
}

async function getNextAction() {
  const client = initSupabase();
  if (!client) {
    console.error('DB not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads || leads.length === 0) {
    console.log('\n✅ All clear! No leads need follow-up.\n');
    console.log('Consider:');
    console.log('  • Run a new campaign');
    console.log('  • Review booked meetings');
    console.log('  • Research new lead sources\n');
    process.exit(0);
  }

  const now = Date.now();
  
  // Score and sort leads
  const scored = leads.map(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    return {
      ...lead,
      age_days: age,
      score: priorityScore(lead, age)
    };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  
  // Determine urgency level
  let urgency, emoji, timeframe;
  if (top.age_days <= 1) {
    urgency = 'CRITICAL';
    emoji = '🔴';
    timeframe = 'RIGHT NOW';
  } else if (top.age_days <= 3) {
    urgency = 'HIGH';
    emoji = '🟠';
    timeframe = 'within the hour';
  } else if (top.age_days <= 7) {
    urgency = 'MEDIUM';
    emoji = '🟡';
    timeframe = 'today';
  } else {
    urgency = 'LOW';
    emoji = '🔵';
    timeframe = 'when you can';
  }

  // Determine action type
  let action, detail;
  if (top.reply_category === 'Meeting Request') {
    action = 'SEND CALENDAR LINK';
    detail = 'They want to book! Send your Calendly/booking link.';
  } else if (top.reply_category === 'Demo Request') {
    action = 'SCHEDULE DEMO';
    detail = 'Offer 2-3 demo time slots this week.';
  } else if (top.reply_category === 'Interested') {
    action = 'FOLLOW UP';
    detail = 'Ask what questions they have and offer a call.';
  } else {
    action = 'RESPOND';
    detail = 'Answer their question and offer to hop on a call.';
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ${emoji} YOUR NEXT ACTION                                                 ║
╚══════════════════════════════════════════════════════════════════════════╝

  ${action}

  📧 ${top.lead_name || 'Unknown'} ${top.lead_email ? `<${top.lead_email}>` : ''}
  🏢 ${top.lead_company || 'Unknown company'}
  📋 ${top.reply_category} | ${top.age_days} day${top.age_days !== 1 ? 's' : ''} old
  📊 Priority score: ${top.score}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ${detail}

  ⏰ Urgency: ${urgency} - Do this ${timeframe}
  ${top.campaign_name ? `📬 Campaign: ${top.campaign_name.substring(0, 50)}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  💡 Quick actions:
     • node gex.js hotdraft --count=1   Generate email draft
     • node gex.js mark ${top.lead_email}   Mark as contacted
     • node gex.js next --done             Get next action

  📊 Queue: ${scored.length} total leads needing follow-up
     ${scored.filter(l => l.age_days <= 3).length} hot (0-3d)
     ${scored.filter(l => l.age_days > 3 && l.age_days <= 7).length} warm (4-7d)
     ${scored.filter(l => l.age_days > 7).length} cold (8d+)

══════════════════════════════════════════════════════════════════════════
`);
}

getNextAction().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
