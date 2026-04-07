#!/usr/bin/env node
/**
 * Quick Win Finder (`gex quickwin` or `gex easy`)
 * 
 * Surface the EASIEST wins for today - minimal effort, maximum momentum.
 * Not the biggest deals, but the ones that require least effort to close.
 * 
 * Quick Win Criteria:
 * 1. Already booked meetings (just need follow-up)
 * 2. Meeting requests from last 3 days (fresh intent)
 * 3. Leads who replied positively with simple asks
 * 4. Leads where we just need to send Calendly link
 * 5. Leads in final negotiation stage
 * 
 * Commands:
 *   gex quickwin           - Top 5 easiest wins
 *   gex quickwin --all     - Show all quick wins
 *   gex quickwin --email   - Generate follow-up emails
 *   gex quickwin --time 15 - Wins achievable in 15 minutes
 *   gex quickwin --done    - Mark a win as complete
 *   gex quickwin --report  - Daily quick win summary
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase, getPositiveReplies } = require('./lib/supabase');

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const QUICK_WIN_DATA_PATH = path.join(__dirname, 'data', 'quick-wins.json');
const CALENDLY_LINK = 'https://calendly.com/jan-by-influence/30min';

// Quick Win Categories with scoring and time estimates
const WIN_TYPES = {
  BOOKED_FOLLOWUP: {
    name: 'Booked Meeting',
    icon: '📅',
    baseScore: 95,
    timeMin: 5,
    action: 'Send confirmation/prep email',
    probability: 90
  },
  MEETING_REQUEST: {
    name: 'Meeting Request',
    icon: '🔥',
    baseScore: 90,
    timeMin: 5,
    action: 'Send Calendly link',
    probability: 85
  },
  FRESH_POSITIVE: {
    name: 'Fresh Positive Reply',
    icon: '✨',
    baseScore: 80,
    timeMin: 10,
    action: 'Send quick personalized response',
    probability: 70
  },
  INTERESTED_SIMPLE: {
    name: 'Simple Interest',
    icon: '💡',
    baseScore: 75,
    timeMin: 10,
    action: 'Answer question & propose call',
    probability: 60
  },
  FINAL_NEGOTIATION: {
    name: 'Final Negotiation',
    icon: '🤝',
    baseScore: 85,
    timeMin: 15,
    action: 'Send final offer/contract',
    probability: 75
  },
  WAITING_LINK: {
    name: 'Waiting for Link',
    icon: '📎',
    baseScore: 88,
    timeMin: 2,
    action: 'Just send Calendly link',
    probability: 80
  }
};

// ═══════════════════════════════════════════════════════════════
// Quick Win Scoring Engine
// ═══════════════════════════════════════════════════════════════

function categorizeQuickWin(lead) {
  const now = new Date();
  const replyDate = lead.replied_at ? new Date(lead.replied_at) : null;
  const ageDays = replyDate ? Math.floor((now - replyDate) / (1000 * 60 * 60 * 24)) : 999;
  const category = lead.reply_category || '';
  const status = lead.status || lead.follow_up_status || '';
  const notes = (lead.notes || lead.last_reply || '').toLowerCase();
  
  // Already booked - just needs follow-up
  if (status === 'Booked' || category === 'Booked') {
    return WIN_TYPES.BOOKED_FOLLOWUP;
  }
  
  // Meeting request in last 3 days
  if (category === 'Meeting Request' && ageDays <= 3) {
    return WIN_TYPES.MEETING_REQUEST;
  }
  
  // Check for "waiting for link" signals
  const linkSignals = ['calendly', 'calendar', 'book', 'schedule', 'when can we', 'set up a call', 'link'];
  if (linkSignals.some(s => notes.includes(s)) && ageDays <= 7) {
    return WIN_TYPES.WAITING_LINK;
  }
  
  // Fresh positive reply (< 3 days)
  if ((category === 'Interested' || category === 'Positive') && ageDays <= 3) {
    return WIN_TYPES.FRESH_POSITIVE;
  }
  
  // Simple interest - just needs a quick answer
  const simpleAskSignals = ['tell me more', 'interested', 'sounds good', 'what are your rates', 'pricing', 'more info'];
  if (simpleAskSignals.some(s => notes.includes(s)) && ageDays <= 7) {
    return WIN_TYPES.INTERESTED_SIMPLE;
  }
  
  // Final negotiation stage
  if (status === 'Negotiating' || notes.includes('contract') || notes.includes('agreement') || notes.includes('budget')) {
    return WIN_TYPES.FINAL_NEGOTIATION;
  }
  
  // Meeting request older than 3 days still counts
  if (category === 'Meeting Request') {
    return { ...WIN_TYPES.MEETING_REQUEST, baseScore: 75 }; // Lower score for older
  }
  
  return null; // Not a quick win
}

function calculateQuickWinScore(lead, winType) {
  let score = winType.baseScore;
  const now = new Date();
  const replyDate = lead.replied_at ? new Date(lead.replied_at) : null;
  const ageDays = replyDate ? Math.floor((now - replyDate) / (1000 * 60 * 60 * 24)) : 999;
  
  // Freshness bonus
  if (ageDays <= 1) score += 10;
  else if (ageDays <= 3) score += 5;
  else if (ageDays > 7) score -= 10;
  else if (ageDays > 14) score -= 20;
  
  // Enterprise bonus
  const tier = lead.tier || lead.company_tier || '';
  if (tier === 'enterprise') score += 10;
  else if (tier === 'midmarket') score += 5;
  
  // Fast responder bonus
  if (lead.response_time_seconds && lead.response_time_seconds < 3600) {
    score += 5;
  }
  
  return Math.min(100, Math.max(0, score));
}

function estimateDealValue(lead) {
  const tier = lead.tier || lead.company_tier || 'unknown';
  const category = lead.reply_category || '';
  
  // Base values
  const tierValues = {
    enterprise: 35000,
    midmarket: 20000,
    startup: 12000,
    unknown: 15000
  };
  
  let value = tierValues[tier] || 15000;
  
  // Adjust based on category
  if (category === 'Booked') value *= 1.2;
  else if (category === 'Meeting Request') value *= 1.0;
  else if (category === 'Interested') value *= 0.8;
  
  return value;
}

// ═══════════════════════════════════════════════════════════════
// Data Management
// ═══════════════════════════════════════════════════════════════

function loadQuickWinData() {
  try {
    if (fs.existsSync(QUICK_WIN_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(QUICK_WIN_DATA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Warning: Could not load quick win data:', e.message);
  }
  return { completedToday: [], history: [] };
}

function saveQuickWinData(data) {
  try {
    fs.mkdirSync(path.dirname(QUICK_WIN_DATA_PATH), { recursive: true });
    fs.writeFileSync(QUICK_WIN_DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Warning: Could not save quick win data:', e.message);
  }
}

function markAsDone(leadId, leadInfo = null) {
  const data = loadQuickWinData();
  const today = new Date().toISOString().split('T')[0];
  
  if (!data.completedToday) data.completedToday = [];
  if (!data.history) data.history = [];
  if (!data.dailyStats) data.dailyStats = {};
  
  // Clean old completed items
  data.completedToday = data.completedToday.filter(c => c.date === today);
  
  // Check if already marked done
  if (data.completedToday.some(c => c.leadId === leadId)) {
    return false; // Already done
  }
  
  // Add new completion
  const completion = {
    leadId,
    date: today,
    completedAt: new Date().toISOString(),
    name: leadInfo?.name || null,
    company: leadInfo?.company || null,
    estimatedValue: leadInfo?.estimatedValue || 15000
  };
  
  data.completedToday.push(completion);
  
  // Add to history
  data.history.push(completion);
  
  // Update daily stats
  if (!data.dailyStats[today]) {
    data.dailyStats[today] = { count: 0, totalValue: 0 };
  }
  data.dailyStats[today].count++;
  data.dailyStats[today].totalValue += completion.estimatedValue;
  
  // Keep history manageable
  if (data.history.length > 500) {
    data.history = data.history.slice(-500);
  }
  
  // Keep only last 30 days of daily stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];
  for (const date in data.dailyStats) {
    if (date < cutoff) delete data.dailyStats[date];
  }
  
  saveQuickWinData(data);
  return true;
}

function getCompletedToday() {
  const data = loadQuickWinData();
  const today = new Date().toISOString().split('T')[0];
  return (data.completedToday || [])
    .filter(c => c.date === today)
    .map(c => c.leadId);
}

// ═══════════════════════════════════════════════════════════════
// Email Generation
// ═══════════════════════════════════════════════════════════════

function generateFollowUpEmail(lead, winType) {
  const firstName = (lead.lead_name || lead.name || 'there').split(' ')[0];
  const company = lead.lead_company || lead.company || 'your company';
  
  // Map win type names to template keys
  const typeKey = winType.name
    .replace('Booked Meeting', 'BOOKED_FOLLOWUP')
    .replace('Meeting Request', 'MEETING_REQUEST')
    .replace('Fresh Positive Reply', 'FRESH_POSITIVE')
    .replace('Simple Interest', 'INTERESTED_SIMPLE')
    .replace('Final Negotiation', 'FINAL_NEGOTIATION')
    .replace('Waiting for Link', 'WAITING_LINK');
  
  const templates = {
    BOOKED_FOLLOWUP: {
      subject: `Quick confirmation for our call`,
      body: `Hi ${firstName},

Looking forward to our upcoming call! Just wanted to touch base beforehand.

I've been researching ${company} and have some ideas I think you'll find valuable. Is there anything specific you'd like me to prepare or cover?

See you soon!

Best,
Jan`
    },
    MEETING_REQUEST: {
      subject: `Let's find a time to connect`,
      body: `Hi ${firstName},

Thanks for your interest in working together! 

Here's my calendar to book a convenient time:
${CALENDLY_LINK}

Looking forward to chatting!

Best,
Jan`
    },
    FRESH_POSITIVE: {
      subject: `Re: Quick follow up`,
      body: `Hi ${firstName},

Great to hear from you! I'd love to tell you more about how we've helped brands like ${company} reach millions of engaged viewers.

Would a quick 15-minute call work? Here's my calendar:
${CALENDLY_LINK}

Best,
Jan`
    },
    INTERESTED_SIMPLE: {
      subject: `Re: Your question`,
      body: `Hi ${firstName},

Thanks for reaching out! To answer your question:

[INSERT ANSWER HERE]

Happy to jump on a quick call to discuss further. Here's my calendar:
${CALENDLY_LINK}

Best,
Jan`
    },
    FINAL_NEGOTIATION: {
      subject: `Next steps for our partnership`,
      body: `Hi ${firstName},

Following up on our conversation - I'm excited about the potential partnership with ${company}!

I've attached [the proposal/contract] for your review. Let me know if you have any questions or if there's anything you'd like to adjust.

Best,
Jan`
    },
    WAITING_LINK: {
      subject: `Here's my calendar`,
      body: `Hi ${firstName},

Here's my calendar - grab whatever time works best for you:
${CALENDLY_LINK}

Looking forward to it!

Best,
Jan`
    }
  };
  
  return templates[typeKey] || templates.FRESH_POSITIVE;
}

// ═══════════════════════════════════════════════════════════════
// Display Functions
// ═══════════════════════════════════════════════════════════════

function formatUrgencyCountdown(ageDays) {
  if (ageDays <= 1) return '🔴 TODAY';
  if (ageDays <= 2) return '🟠 ' + ageDays + 'd ago';
  if (ageDays <= 5) return '🟡 ' + ageDays + 'd ago';
  if (ageDays <= 7) return '⚪ ' + ageDays + 'd ago';
  return '⚫ ' + ageDays + 'd ago';
}

function formatProbability(probability) {
  if (probability >= 80) return '🟢 ' + probability + '%';
  if (probability >= 60) return '🟡 ' + probability + '%';
  return '🔴 ' + probability + '%';
}

function displayQuickWins(wins, options = {}) {
  const { showAll = false, timeLimit = null, showEmails = false, topN = 5 } = options;
  const completedIds = getCompletedToday();
  
  // Filter out completed
  let displayWins = wins.filter(w => !completedIds.includes(String(w.leadId || w.id)));
  
  // Apply time filter
  if (timeLimit) {
    displayWins = displayWins.filter(w => w.timeEstimate <= timeLimit);
  }
  
  // Limit unless --all
  const limit = showAll ? displayWins.length : topN;
  displayWins = displayWins.slice(0, limit);
  
  // Format stats for aligned display
  const completedStr = `${completedIds.length} completed today`;
  const availableStr = `${wins.length} quick wins available`;
  const statsLine = `${completedStr} | ${availableStr}`.padEnd(71);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ⚡ QUICK WIN FINDER - Start your day with momentum!                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  ${statsLine}         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  if (displayWins.length === 0) {
    console.log('  ✅ No quick wins available right now. Great job!\n');
    return;
  }

  let totalTime = 0;
  let totalValue = 0;

  displayWins.forEach((win, i) => {
    const rank = (i + 1).toString().padStart(2, ' ');
    const urgency = formatUrgencyCountdown(win.ageDays);
    const prob = formatProbability(win.probability);
    
    totalTime += win.timeEstimate;
    totalValue += win.estimatedValue;

    console.log(`┌─ ${win.winType.icon} #${rank} ${win.name || 'Unknown'} @ ${win.company || 'Unknown'}`);
    console.log(`│  📧 ${win.email || 'N/A'}`);
    console.log(`│`);
    console.log(`│  WHY:    ${win.winType.name}`);
    console.log(`│  ACTION: ${win.winType.action}`);
    console.log(`│  ⏱️  ${win.timeEstimate}m  │  💰 $${(win.estimatedValue/1000).toFixed(0)}K  │  ${prob}  │  ${urgency}`);
    
    if (showEmails) {
      const email = generateFollowUpEmail(win, win.winType);
      console.log(`│`);
      console.log(`│  ─── EMAIL DRAFT ───`);
      console.log(`│  Subject: ${email.subject}`);
      email.body.split('\n').forEach(line => {
        console.log(`│  ${line}`);
      });
    }
    
    console.log(`└${'─'.repeat(75)}`);
    console.log('');
  });

  // Summary
  console.log('━'.repeat(77));
  console.log(`  📊 SUMMARY: ${displayWins.length} quick wins | ⏱️  ~${totalTime}m total | 💰 ~$${(totalValue/1000).toFixed(0)}K potential`);
  console.log('');

  if (!showAll && wins.length > 5) {
    console.log(`  💡 ${wins.length - 5} more quick wins available. Run: gex quickwin --all`);
  }

  console.log(`
  🚀 NEXT STEPS:
     • Start with #1 - it's the easiest win
     • gex quickwin --email     Generate emails for all
     • gex quickwin --done <#>  Mark as complete
     • gex quickwin --report    See today's progress
`);
}

function displayReport() {
  const data = loadQuickWinData();
  const today = new Date().toISOString().split('T')[0];
  const completedToday = (data.completedToday || []).filter(c => c.date === today);
  const todayStats = data.dailyStats?.[today] || { count: 0, totalValue: 0 };
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📊 DAILY QUICK WIN REPORT - ${today}                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

  ✅ Completed Today: ${completedToday.length}
  💰 Today's Potential Value: $${(todayStats.totalValue / 1000).toFixed(0)}K
  📈 Total Historical: ${(data.history || []).length}
`);

  if (completedToday.length > 0) {
    console.log('  Today\'s Wins:');
    completedToday.forEach((c, i) => {
      const time = new Date(c.completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const label = c.company ? `${c.name || 'Lead'} @ ${c.company}` : `Lead #${c.leadId}`;
      const value = c.estimatedValue ? ` (~$${(c.estimatedValue/1000).toFixed(0)}K)` : '';
      console.log(`    ${i + 1}. ${label}${value} @ ${time}`);
    });
  }

  // Weekly stats
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyWins = (data.history || []).filter(h => 
    new Date(h.completedAt) >= oneWeekAgo
  );
  const weeklyValue = weeklyWins.reduce((sum, w) => sum + (w.estimatedValue || 15000), 0);

  // Last 7 days breakdown
  console.log(`
  📅 WEEKLY SUMMARY (Last 7 Days)`);
  console.log('  ───────────────────────────────');
  
  const dailyStats = data.dailyStats || {};
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const stats = dailyStats[dateStr] || { count: 0, totalValue: 0 };
    last7Days.push({ date: dateStr, dayName, ...stats });
  }
  
  last7Days.forEach(day => {
    const bar = '█'.repeat(Math.min(day.count, 10)) + '░'.repeat(10 - Math.min(day.count, 10));
    const isToday = day.date === today ? ' 👈' : '';
    console.log(`    ${day.dayName}: ${bar} ${day.count}${isToday}`);
  });

  console.log(`
  📊 STATS
  ───────────────────────────────
  • Wins This Week:     ${weeklyWins.length}
  • Weekly Value:       $${(weeklyValue / 1000).toFixed(0)}K
  • Daily Average:      ${(weeklyWins.length / 7).toFixed(1)} wins/day
  • Avg Value/Win:      $${weeklyWins.length > 0 ? ((weeklyValue / weeklyWins.length) / 1000).toFixed(0) : 0}K
`);

  // Streak calculation
  let streak = 0;
  const sortedDates = Object.keys(dailyStats).sort().reverse();
  for (const date of sortedDates) {
    if (dailyStats[date]?.count > 0) {
      streak++;
    } else {
      break;
    }
  }
  
  if (streak > 0) {
    console.log(`  🔥 Current Streak: ${streak} day${streak > 1 ? 's' : ''} with quick wins!`);
  }
  
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ⚡ QUICK WIN FINDER - Help                                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝

  Find the EASIEST wins for today - minimal effort, maximum momentum.

  USAGE:
    gex quickwin [options]

  OPTIONS:
    --all, -a         Show all quick wins (not just top 5)
    --email, -e       Generate follow-up email drafts
    --time, -t <min>  Only show wins achievable in N minutes
    --top <N>         Show top N quick wins (default: 5)
    --done, -d <id>   Mark a lead as completed
    --report, -r      Show daily progress report
    --json            Output as JSON (for scripting)
    --help, -h        Show this help message

  ALIASES:
    gex quickwin      Main command
    gex easy          Same as quickwin
    gex quick         Same as quickwin
    gex lowhanging    Same as quickwin
    gex momentum      Same as quickwin

  EXAMPLES:
    gex quickwin                 Top 5 easiest wins
    gex quickwin --all           Show all quick wins
    gex quickwin --time 10       Wins achievable in 10 min
    gex quickwin --top 10        Top 10 quick wins
    gex easy --email             Quick wins with email drafts
    gex quickwin --done 123      Mark lead #123 as complete
    gex quickwin --report        Today's progress summary

  WIN CATEGORIES:
    📅 Booked Meeting    - Already scheduled, just need prep
    🔥 Meeting Request   - Asked for a call, send Calendly
    ✨ Fresh Positive    - Recent interest, quick response
    💡 Simple Interest   - Easy question, quick answer
    🤝 Final Negotiation - Close to deal, just needs nudge
    📎 Waiting for Link  - Literally just send the link
`);
}

async function findQuickWins() {
  const args = process.argv.slice(2);
  
  // Handle --help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  const showAll = args.includes('--all') || args.includes('-a');
  const showEmails = args.includes('--email') || args.includes('-e');
  const showReport = args.includes('--report') || args.includes('-r');
  
  // Handle --done flag
  const doneIdx = args.findIndex(a => a === '--done' || a === '-d');
  if (doneIdx !== -1) {
    const leadNum = args[doneIdx + 1];
    if (leadNum) {
      const success = markAsDone(String(leadNum));
      if (success) {
        const completedCount = getCompletedToday().length;
        const motivations = [
          '🎉 Momentum building!',
          '🚀 You\'re on fire!',
          '💪 Keep crushing it!',
          '⭐ Another one down!',
          '🏆 Winner mentality!'
        ];
        const motivation = motivations[completedCount % motivations.length];
        console.log(`\n  ✅ Marked lead ${leadNum} as done! ${motivation}`);
        console.log(`  📊 Total today: ${completedCount} quick wins completed\n`);
      } else {
        console.log(`\n  ⚠️  Lead ${leadNum} was already marked as done today.\n`);
      }
      return;
    } else {
      console.log('\n  Usage: gex quickwin --done <lead_id>\n');
      return;
    }
  }
  
  // Handle --json flag for export
  const showJson = args.includes('--json');

  // Handle --report flag
  if (showReport) {
    displayReport();
    return;
  }

  // Handle --time flag
  let timeLimit = null;
  const timeIdx = args.findIndex(a => a === '--time' || a === '-t');
  if (timeIdx !== -1 && args[timeIdx + 1]) {
    timeLimit = parseInt(args[timeIdx + 1]);
  }
  
  // Handle --top flag
  let topN = 5;
  const topIdx = args.findIndex(a => a === '--top');
  if (topIdx !== -1 && args[topIdx + 1]) {
    topN = parseInt(args[topIdx + 1]) || 5;
  }

  // Get leads from database
  const supabase = initSupabase();
  if (!supabase) {
    console.error('\n❌ Database not configured. Run: gex doctor\n');
    process.exit(1);
  }

  // Try multiple tables for lead data
  let leads = [];
  
  // Try imann_positive_replies first
  const { data: imannData, error: imannError } = await supabase
    .from('imann_positive_replies')
    .select('*');
  
  if (!imannError && imannData) {
    leads = leads.concat(imannData.map(l => ({
      ...l,
      leadId: l.id,
      email: l.email,
      name: l.name,
      company: l.company,
      replied_at: l.conversation_date || l.created_at,
      reply_category: l.status === 'Booked' ? 'Booked' : 
                      l.status === 'Scheduling' ? 'Meeting Request' : 'Interested',
      notes: l.notes || '',
      tier: l.company_tier || 'unknown'
    })));
  }

  // Also try positive_replies table
  const { data: positiveData, error: positiveError } = await supabase
    .from('positive_replies')
    .select('*');

  if (!positiveError && positiveData) {
    leads = leads.concat(positiveData.map(l => ({
      ...l,
      leadId: l.id,
      email: l.lead_email,
      name: l.lead_name,
      company: l.lead_company,
      replied_at: l.replied_at,
      reply_category: l.reply_category,
      notes: l.last_reply || '',
      tier: l.tier || 'unknown'
    })));
  }

  if (leads.length === 0) {
    console.log('\n  ⚠️  No leads found in database.\n');
    return;
  }

  // Find quick wins
  const now = new Date();
  const quickWins = [];

  for (const lead of leads) {
    const winType = categorizeQuickWin(lead);
    if (!winType) continue;

    const replyDate = lead.replied_at ? new Date(lead.replied_at) : null;
    const ageDays = replyDate ? Math.floor((now - replyDate) / (1000 * 60 * 60 * 24)) : 999;
    
    const score = calculateQuickWinScore(lead, winType);
    const estimatedValue = estimateDealValue(lead);
    
    quickWins.push({
      leadId: lead.leadId || lead.id,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      winType,
      score,
      ageDays,
      timeEstimate: winType.timeMin,
      probability: winType.probability,
      estimatedValue,
      originalLead: lead
    });
  }

  // Sort by score
  quickWins.sort((a, b) => b.score - a.score);

  // Handle JSON output
  if (showJson) {
    const output = quickWins.slice(0, showAll ? undefined : topN).map(w => ({
      id: w.leadId,
      name: w.name,
      company: w.company,
      email: w.email,
      winType: w.winType.name,
      action: w.winType.action,
      score: w.score,
      probability: w.probability,
      timeEstimate: w.timeEstimate,
      ageDays: w.ageDays,
      estimatedValue: w.estimatedValue
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Display
  displayQuickWins(quickWins, { showAll, timeLimit, showEmails, topN });
}

// Run
findQuickWins().catch(err => {
  console.error('\n❌ Error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
