#!/usr/bin/env node
/**
 * Daily Focus - Your ONE thing for today
 * 
 * Cuts through the noise and gives you a single clear priority.
 * No lists, no options - just THE most important action right now.
 * 
 * Usage:
 *   gex focus        - Get today's ONE thing
 *   gex focus --why  - Show reasoning behind the choice
 *   gex focus --done - Mark complete, get next focus
 *   gex one          - Alias for focus
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const FLAGS = {
  why: args.includes('--why') || args.includes('-w'),
  done: args.includes('--done') || args.includes('-d'),
  json: args.includes('--json'),
  help: args.includes('--help') || args.includes('-h') || args.includes('help')
};

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Average deal values
const AVG_DEAL = 22500;
const CLOSE_RATE = 0.60;

// Focus data persistence
const FOCUS_FILE = path.join(__dirname, 'data', 'focus-state.json');

function loadFocusState() {
  try {
    if (fs.existsSync(FOCUS_FILE)) {
      return JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { completed: [], current: null };
}

function saveFocusState(state) {
  const dir = path.dirname(FOCUS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FOCUS_FILE, JSON.stringify(state, null, 2));
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function showHelp() {
  console.log(`
${c.bold}🎯 DAILY FOCUS${c.reset} - Your ONE priority for today

${c.cyan}Commands:${c.reset}
  gex focus              Get today's ONE thing
  gex focus --why        Show the reasoning
  gex focus --done       Mark complete, get next
  gex one                Alias for focus

${c.cyan}Priority Logic:${c.reset}
  1. Deal about to close (>80% probability)
  2. Hot lead (<24 hours old)
  3. Meeting scheduled today
  4. Meeting request (<3 days old)
  5. Pipeline health critical
  6. Highest value opportunity

${c.dim}Cuts through the noise. One action. One focus.${c.reset}
`);
}

async function main() {
  if (FLAGS.help) {
    return showHelp();
  }

  if (FLAGS.done) {
    return markDone();
  }

  const client = initSupabase();
  if (!client) {
    console.log(`${c.red}❌ Database connection failed${c.reset}`);
    process.exit(1);
  }

  // Fetch all active leads
  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*');

  if (error || !leads) {
    console.log(`${c.red}❌ Failed to fetch leads${c.reset}`);
    process.exit(1);
  }

  // Find THE ONE thing
  const focus = determineFocus(leads);
  
  if (!focus) {
    console.log(`\n${c.green}✨ All clear!${c.reset} No urgent priorities right now.`);
    console.log(`${c.dim}Run ${c.cyan}gex rank${c.dim} to find opportunities${c.reset}\n`);
    return;
  }

  // Save current focus
  const state = loadFocusState();
  state.current = { ...focus, timestamp: new Date().toISOString() };
  saveFocusState(state);

  // Display
  displayFocus(focus);
}

function determineFocus(leads) {
  const now = Date.now();

  // Priority 1: Deal about to close (>80% probability = Booked status)
  const closingDeals = leads.filter(l => 
    l.status === 'Booked' && 
    l.meeting_date && 
    getAgeDays(l.meeting_date) <= 7
  );
  
  if (closingDeals.length > 0) {
    const deal = closingDeals.sort((a, b) => 
      new Date(a.meeting_date) - new Date(b.meeting_date)
    )[0];
    
    return {
      type: 'CLOSING_DEAL',
      priority: 1,
      lead: deal,
      action: `Close the deal with ${extractCompany(deal)}`,
      why: 'Booked meeting ready to convert - highest probability revenue',
      how: `gex view ${deal.id || deal.email}`,
      value: AVG_DEAL,
      time: '30 min'
    };
  }

  // Priority 2: Hot lead (<24 hours old)
  const hotLeads = leads.filter(l => {
    const age = (now - new Date(l.conversation_date || l.conversation_date).getTime()) / (1000 * 60 * 60);
    return age < 24 && l.status !== 'Booked';
  });

  if (hotLeads.length > 0) {
    const lead = hotLeads[0];
    return {
      type: 'HOT_LEAD',
      priority: 2,
      lead,
      action: `Respond to ${extractCompany(lead)} - they replied ${timeAgo(lead.conversation_date || lead.conversation_date)}`,
      why: 'Fresh lead waiting for response - speed wins deals',
      how: `gex draft ${lead.email}`,
      value: Math.round(AVG_DEAL * CLOSE_RATE),
      time: '10 min'
    };
  }

  // Priority 3: Meeting today
  const meetingsToday = leads.filter(l => 
    l.status === 'Booked' && isToday(l.meeting_date)
  );

  if (meetingsToday.length > 0) {
    const meeting = meetingsToday[0];
    return {
      type: 'MEETING_TODAY',
      priority: 3,
      lead: meeting,
      action: `Prepare for meeting with ${extractCompany(meeting)}`,
      why: 'You have a meeting today - be ready to close',
      how: `gex research ${meeting.email}`,
      value: AVG_DEAL,
      time: '20 min'
    };
  }

  // Priority 4: Meeting request <3 days old
  const meetingRequests = leads.filter(l => 
    l.category === 'Meeting Request' && 
    l.status !== 'Booked' &&
    getAgeDays(l.conversation_date || l.conversation_date) < 3
  );

  if (meetingRequests.length > 0) {
    const request = meetingRequests.sort((a, b) => 
      new Date(b.conversation_date || b.replied_at) - new Date(a.conversation_date || a.replied_at)
    )[0];
    
    return {
      type: 'MEETING_REQUEST',
      priority: 4,
      lead: request,
      action: `Book meeting with ${extractCompany(request)}`,
      why: 'They asked to meet - send Calendly link NOW',
      how: `gex book ${request.email}`,
      value: Math.round(AVG_DEAL * CLOSE_RATE),
      time: '5 min'
    };
  }

  // Priority 5: Pipeline critical (<30% healthy)
  const activeLeads = leads.filter(l => 
    l.status !== 'Booked' && 
    l.status !== 'Closed' &&
    getAgeDays(l.conversation_date || l.conversation_date) < 30
  );
  const bookedCount = leads.filter(l => l.status === 'Booked').length;
  const pipelineScore = leads.length > 0 ? Math.round((bookedCount / leads.length) * 100) : 0;

  if (pipelineScore < 30 && activeLeads.length > 0) {
    const staleCount = leads.filter(l => 
      l.status === 'Scheduling' && 
      getAgeDays(l.conversation_date) > 7
    ).length;

    return {
      type: 'PIPELINE_RESCUE',
      priority: 5,
      lead: null,
      action: `Rescue your pipeline - ${staleCount} leads going cold`,
      why: `Pipeline health at ${pipelineScore}% - needs attention`,
      how: 'gex followups --stale',
      value: Math.round(staleCount * AVG_DEAL * 0.1),
      time: '45 min'
    };
  }

  // Priority 6: Default - highest value lead needing action
  const needsAction = leads
    .filter(l => 
      l.status === 'Scheduling' || 
      (l.category && l.category !== 'Booked')
    )
    .sort((a, b) => {
      // Sort by freshness (newer first)
      return new Date(b.conversation_date || b.replied_at) - 
             new Date(a.conversation_date || a.replied_at);
    });

  if (needsAction.length > 0) {
    const lead = needsAction[0];
    return {
      type: 'BEST_OPPORTUNITY',
      priority: 6,
      lead,
      action: `Follow up with ${extractCompany(lead)}`,
      why: 'Highest priority lead in your pipeline',
      how: `gex draft ${lead.email}`,
      value: Math.round(AVG_DEAL * CLOSE_RATE * 0.5),
      time: '15 min'
    };
  }

  return null;
}

function extractCompany(lead) {
  if (!lead) return 'Unknown';
  if (lead.company) return lead.company;
  if (lead.email) {
    const domain = lead.email.split('@')[1];
    if (domain) return domain.split('.')[0].toUpperCase();
  }
  return lead.name || 'a lead';
}

function timeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function displayFocus(focus) {
  console.log();
  console.log(`${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}🎯 TODAY'S FOCUS${c.reset}`);
  console.log(`${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();
  console.log(`${c.green}${c.bold}${focus.action}${c.reset}`);
  console.log();

  if (FLAGS.why) {
    console.log(`${c.dim}Why: ${focus.why}${c.reset}`);
    console.log();
  }

  console.log(`${c.cyan}▸ How:${c.reset}   ${c.bold}${focus.how}${c.reset}`);
  console.log(`${c.yellow}▸ Value:${c.reset} $${focus.value.toLocaleString()} potential`);
  console.log(`${c.magenta}▸ Time:${c.reset}  ${focus.time}`);
  console.log();
  console.log(`${c.dim}Done? Run: gex focus --done${c.reset}`);
  console.log();

  if (FLAGS.json) {
    console.log(JSON.stringify(focus, null, 2));
  }
}

function markDone() {
  const state = loadFocusState();
  
  if (!state.current) {
    console.log(`${c.yellow}No active focus to mark done.${c.reset}`);
    console.log(`Run ${c.cyan}gex focus${c.reset} to get your next priority.`);
    return;
  }

  // Archive current
  state.completed.push({
    ...state.current,
    completedAt: new Date().toISOString()
  });
  
  // Keep only last 30 completed items
  if (state.completed.length > 30) {
    state.completed = state.completed.slice(-30);
  }

  state.current = null;
  saveFocusState(state);

  console.log();
  console.log(`${c.green}✅ Marked as done!${c.reset}`);
  console.log(`${c.dim}${state.completed.length} tasks completed total${c.reset}`);
  console.log();
  console.log(`Run ${c.cyan}gex focus${c.reset} for your next priority.`);
  console.log();
}

main().catch(err => {
  console.error(`${c.red}Error:${c.reset}`, err.message);
  process.exit(1);
});
