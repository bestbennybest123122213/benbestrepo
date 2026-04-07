#!/usr/bin/env node
/**
 * Goal & Accountability Tracker
 * 
 * Track weekly goals and daily progress to close the execution gap.
 * 
 * Commands:
 *   gex goals             - Show current week progress
 *   gex goals set emails 30 - Set weekly email target to 30
 *   gex goals log emails 5  - Log 5 emails sent today
 *   gex goals history     - Show past weeks
 *   gex goals streak      - Show current streak
 *   gex goals reset       - Force reset to new week
 *   gex goals summary     - Generate weekly summary
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase, getPositiveReplies, getResponseTimeAverages } = require('./lib/supabase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATA_DIR = path.join(__dirname, 'data');
const GOALS_FILE = path.join(DATA_DIR, 'goals.json');

const DEFAULT_GOALS = {
  emails: { target: 25, unit: 'emails', icon: '📧' },
  meetings: { target: 5, unit: 'meetings', icon: '📅' },
  response_time: { target: 24, unit: 'hours', icon: '⏱️', lowerIsBetter: true },
  hot_leads: { target: 100, unit: '%', icon: '🔥' }
};

const MOTIVATIONAL_MESSAGES = {
  crushing: [
    "🔥 You're on fire! Keep that momentum!",
    "🚀 Absolute beast mode activated!",
    "💪 Jan is cooking! Numbers don't lie!",
    "⭐ This is what excellence looks like!",
    "🎯 Crushing it! The pipeline thanks you!"
  ],
  onTrack: [
    "👍 Solid progress! Stay consistent!",
    "✅ Right on pace. Keep going!",
    "📈 Trending in the right direction!",
    "💼 Professional execution. Nice work!"
  ],
  behind: [
    "⚡ Time to pick up the pace!",
    "🎯 Focus mode: activated!",
    "💪 You've got this - push through!",
    "🔄 Every email counts. Get after it!"
  ],
  critical: [
    "🚨 All hands on deck!",
    "⏰ Crunch time! Make it count!",
    "🔥 Dig deep - champions finish strong!"
  ]
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Data Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(GOALS_FILE)) {
      const data = JSON.parse(fs.readFileSync(GOALS_FILE, 'utf8'));
      // Auto-reset if we're in a new week
      const currentWeek = getWeekStart();
      if (data.currentWeek !== currentWeek) {
        return initNewWeek(data);
      }
      return data;
    }
  } catch (e) {
    console.error('Error loading goals:', e.message);
  }
  return initNewWeek({});
}

function initNewWeek(existingData = {}) {
  const currentWeek = getWeekStart();
  const today = getToday();
  
  // Archive old week to history if exists
  const history = existingData.history || [];
  if (existingData.currentWeek && existingData.progress) {
    history.push({
      week: existingData.currentWeek,
      goals: { ...existingData.goals },
      progress: { ...existingData.progress },
      dailyLogs: { ...existingData.dailyLogs },
      streak: existingData.streak || 0
    });
  }
  
  return {
    currentWeek,
    goals: existingData.goals || { ...DEFAULT_GOALS },
    progress: {
      emails: 0,
      meetings: 0,
      response_time: 0,
      hot_leads: 0
    },
    dailyLogs: {
      [today]: { emails: 0, meetings: 0, hot_leads: 0 }
    },
    streak: existingData.streak || 0,
    lastActiveDate: today,
    history: history.slice(-12) // Keep last 12 weeks
  };
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(GOALS_FILE, JSON.stringify(data, null, 2));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Progress Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getDayOfWeek() {
  const now = new Date();
  const day = now.getDay();
  return day === 0 ? 7 : day; // Monday = 1, Sunday = 7
}

function getWeekProgress() {
  return getDayOfWeek() / 7;
}

function getPaceStatus(current, target, weekProgress, lowerIsBetter = false) {
  if (target === 0) return { status: 'N/A', emoji: '⚪' };
  
  const pctComplete = current / target;
  const expectedPct = weekProgress;
  
  if (lowerIsBetter) {
    // For response time: lower is better
    if (current <= target) return { status: 'On Track', emoji: '🟢' };
    if (current <= target * 1.5) return { status: 'Needs Work', emoji: '🟡' };
    return { status: 'Behind', emoji: '🔴' };
  }
  
  if (pctComplete >= 1) return { status: 'Complete!', emoji: '✅' };
  if (pctComplete >= expectedPct * 1.2) return { status: 'Ahead', emoji: '🟢' };
  if (pctComplete >= expectedPct * 0.8) return { status: 'On Track', emoji: '🟡' };
  if (pctComplete >= expectedPct * 0.5) return { status: 'Behind', emoji: '🟠' };
  return { status: 'Critical', emoji: '🔴' };
}

function progressBar(current, target, width = 25, lowerIsBetter = false) {
  if (lowerIsBetter) {
    // For response time: full bar when at or below target
    const pct = Math.max(0, Math.min(100, (1 - (current - target) / target) * 100));
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(width - Math.max(0, filled));
  }
  
  const pct = Math.min(100, (current / target) * 100);
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Integration with Existing Data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchMeetingsFromDB() {
  try {
    const client = initSupabase();
    if (!client) return 0;
    
    const weekStart = getWeekStart();
    const { data } = await client
      .from('positive_replies')
      .select('*')
      .gte('replied_at', weekStart)
      .in('reply_category', ['Booked', 'Meeting Request', 'Meeting Scheduled']);
    
    return data?.length || 0;
  } catch (e) {
    return 0;
  }
}

async function fetchResponseTimeFromDB() {
  try {
    const { data } = await getResponseTimeAverages(7);
    if (data && data.length > 0) {
      const latest = data[data.length - 1];
      return latest.avg_response_hours || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

async function fetchHotLeadsClearedFromDB() {
  try {
    const client = initSupabase();
    if (!client) return 0;
    
    const { data: pending } = await client
      .from('positive_replies')
      .select('id')
      .eq('follow_up_status', 'pending')
      .in('reply_category', ['Meeting Request', 'Interested', 'Booked']);
    
    const { data: total } = await client
      .from('positive_replies')
      .select('id')
      .in('reply_category', ['Meeting Request', 'Interested', 'Booked']);
    
    if (!total || total.length === 0) return 100;
    const cleared = total.length - (pending?.length || 0);
    return Math.round((cleared / total.length) * 100);
  } catch (e) {
    return 0;
  }
}

async function autoCalculateMetrics(data) {
  // Fetch meetings from DB if available
  const dbMeetings = await fetchMeetingsFromDB();
  if (dbMeetings > data.progress.meetings) {
    data.progress.meetings = dbMeetings;
  }
  
  // Fetch response time
  const responseTime = await fetchResponseTimeFromDB();
  if (responseTime > 0) {
    data.progress.response_time = Math.round(responseTime * 10) / 10;
  }
  
  // Fetch hot leads cleared %
  const hotLeadsCleared = await fetchHotLeadsClearedFromDB();
  data.progress.hot_leads = hotLeadsCleared;
  
  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateStreak(data) {
  const today = getToday();
  const lastActive = data.lastActiveDate;
  
  if (!lastActive) {
    data.streak = 1;
    data.lastActiveDate = today;
    return data;
  }
  
  const lastDate = new Date(lastActive);
  const todayDate = new Date(today);
  const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Same day, no change
  } else if (diffDays === 1) {
    // Consecutive day - check if yesterday hit targets
    const yesterdayLogs = data.dailyLogs[lastActive];
    if (yesterdayLogs && yesterdayLogs.emails >= 5) { // Min 5 emails/day to keep streak
      data.streak++;
    } else {
      data.streak = 1;
    }
  } else {
    // Missed days - reset streak
    data.streak = 1;
  }
  
  data.lastActiveDate = today;
  return data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Commands
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function showProgress() {
  let data = loadData();
  data = await autoCalculateMetrics(data);
  saveData(data);
  
  const dayOfWeek = getDayOfWeek();
  const weekProgress = getWeekProgress();
  const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🎯 GOAL & ACCOUNTABILITY TRACKER                                             ║
║  Week of ${data.currentWeek} (${dayNames[dayOfWeek]} - Day ${dayOfWeek}/7)                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  // Week progress indicator
  const weekBar = '▓'.repeat(dayOfWeek) + '░'.repeat(7 - dayOfWeek);
  console.log(`  📆 Week Progress: [${weekBar}] ${Math.round(weekProgress * 100)}%`);
  console.log(`  🔥 Current Streak: ${data.streak} day${data.streak !== 1 ? 's' : ''}`);
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WEEKLY GOALS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const goals = data.goals;
  const progress = data.progress;
  let overallHealth = 0;
  let goalCount = 0;

  const metrics = [
    { key: 'emails', label: 'Emails Sent' },
    { key: 'meetings', label: 'Meetings Booked' },
    { key: 'response_time', label: 'Response Time' },
    { key: 'hot_leads', label: 'Hot Leads Cleared' }
  ];

  for (const m of metrics) {
    const goal = goals[m.key] || DEFAULT_GOALS[m.key];
    const current = progress[m.key] || 0;
    const lowerIsBetter = goal.lowerIsBetter || false;
    
    const pace = getPaceStatus(current, goal.target, weekProgress, lowerIsBetter);
    const bar = progressBar(current, goal.target, 25, lowerIsBetter);
    
    let valueDisplay;
    if (m.key === 'response_time') {
      valueDisplay = `${current}h / <${goal.target}h`;
    } else if (m.key === 'hot_leads') {
      valueDisplay = `${current}% / ${goal.target}%`;
    } else {
      valueDisplay = `${current} / ${goal.target}`;
    }
    
    console.log(`  ${goal.icon} ${m.label.padEnd(20)} ${pace.emoji} ${bar} ${valueDisplay.padStart(12)}`);
    console.log(`     ${' '.repeat(20)} Status: ${pace.status}`);
    console.log();
    
    // Calculate overall health
    if (!lowerIsBetter) {
      overallHealth += current / goal.target;
    } else {
      overallHealth += current <= goal.target ? 1 : goal.target / current;
    }
    goalCount++;
  }

  // Overall assessment
  const avgHealth = overallHealth / goalCount;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let motivationCategory;
  if (avgHealth >= 1) motivationCategory = 'crushing';
  else if (avgHealth >= weekProgress) motivationCategory = 'onTrack';
  else if (avgHealth >= weekProgress * 0.5) motivationCategory = 'behind';
  else motivationCategory = 'critical';
  
  const messages = MOTIVATIONAL_MESSAGES[motivationCategory];
  const message = messages[Math.floor(Math.random() * messages.length)];
  
  console.log(`\n  💬 ${message}\n`);

  // Today's activity
  const today = getToday();
  const todayLogs = data.dailyLogs[today] || { emails: 0, meetings: 0 };
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TODAY\'S ACTIVITY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  📧 Emails logged: ${todayLogs.emails}`);
  console.log(`  📅 Meetings logged: ${todayLogs.meetings}`);
  
  // Recommendations
  const emailsNeeded = Math.max(0, goals.emails.target - progress.emails);
  const daysLeft = 7 - dayOfWeek;
  const emailsPerDay = daysLeft > 0 ? Math.ceil(emailsNeeded / daysLeft) : emailsNeeded;
  
  if (emailsNeeded > 0 && daysLeft > 0) {
    console.log(`\n  📊 Need ${emailsNeeded} more emails → ${emailsPerDay}/day for ${daysLeft} remaining days`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════════\n');
}

function setGoal(metric, value) {
  const data = loadData();
  
  const validMetrics = ['emails', 'meetings', 'response_time', 'hot_leads'];
  if (!validMetrics.includes(metric)) {
    console.log(`❌ Invalid metric. Valid options: ${validMetrics.join(', ')}`);
    return;
  }
  
  const numValue = parseFloat(value);
  if (isNaN(numValue) || numValue <= 0) {
    console.log('❌ Value must be a positive number');
    return;
  }
  
  if (!data.goals[metric]) {
    data.goals[metric] = { ...DEFAULT_GOALS[metric] };
  }
  data.goals[metric].target = numValue;
  
  saveData(data);
  console.log(`✅ Set ${metric} weekly target to ${numValue}`);
}

function logProgress(metric, value) {
  let data = loadData();
  const today = getToday();
  
  const validMetrics = ['emails', 'meetings', 'hot_leads'];
  if (!validMetrics.includes(metric)) {
    console.log(`❌ Cannot manually log '${metric}'. Valid options: ${validMetrics.join(', ')}`);
    return;
  }
  
  const numValue = parseInt(value);
  if (isNaN(numValue) || numValue < 0) {
    console.log('❌ Value must be a non-negative number');
    return;
  }
  
  // Initialize today's log if needed
  if (!data.dailyLogs[today]) {
    data.dailyLogs[today] = { emails: 0, meetings: 0, hot_leads: 0 };
  }
  
  // Add to daily log and overall progress
  data.dailyLogs[today][metric] = (data.dailyLogs[today][metric] || 0) + numValue;
  data.progress[metric] = (data.progress[metric] || 0) + numValue;
  
  // Update streak
  data = updateStreak(data);
  
  saveData(data);
  
  const goal = data.goals[metric] || DEFAULT_GOALS[metric];
  const progress = data.progress[metric];
  const pct = Math.round((progress / goal.target) * 100);
  
  console.log(`✅ Logged ${numValue} ${metric} for today`);
  console.log(`📊 Week total: ${progress}/${goal.target} (${pct}%)`);
  console.log(`🔥 Streak: ${data.streak} day${data.streak !== 1 ? 's' : ''}`);
}

function showHistory() {
  const data = loadData();
  
  if (!data.history || data.history.length === 0) {
    console.log('📭 No history yet. Complete your first week to see history!');
    return;
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📜 GOAL HISTORY                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  for (const week of data.history.slice(-8).reverse()) {
    const goals = week.goals;
    const progress = week.progress;
    
    let goalsHit = 0;
    let totalGoals = 0;
    
    for (const key of ['emails', 'meetings']) {
      const goal = goals[key] || DEFAULT_GOALS[key];
      const current = progress[key] || 0;
      if (current >= goal.target) goalsHit++;
      totalGoals++;
    }
    
    const grade = goalsHit === totalGoals ? '🏆' : goalsHit > 0 ? '✅' : '❌';
    
    console.log(`  ${grade} Week of ${week.week}`);
    console.log(`     📧 Emails: ${progress.emails || 0}/${goals.emails?.target || 25}`);
    console.log(`     📅 Meetings: ${progress.meetings || 0}/${goals.meetings?.target || 5}`);
    console.log(`     🔥 Streak: ${week.streak || 0} days`);
    console.log();
  }
}

function showStreak() {
  let data = loadData();
  data = updateStreak(data);
  saveData(data);
  
  const streak = data.streak;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔥 STREAK TRACKER                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  // Visual streak display
  const flames = '🔥'.repeat(Math.min(streak, 10));
  console.log(`  Current Streak: ${streak} day${streak !== 1 ? 's' : ''} ${flames}`);
  console.log();
  
  // Streak milestones
  const milestones = [
    { days: 7, label: 'Week Warrior', emoji: '🗓️' },
    { days: 14, label: 'Fortnight Fighter', emoji: '⚔️' },
    { days: 30, label: 'Monthly Master', emoji: '🏆' },
    { days: 60, label: 'Discipline Demon', emoji: '👹' },
    { days: 90, label: 'Quarter King', emoji: '👑' }
  ];
  
  console.log('  Milestones:');
  for (const m of milestones) {
    const achieved = streak >= m.days;
    const status = achieved ? '✅' : `${m.days - streak} days to go`;
    console.log(`    ${m.emoji} ${m.label} (${m.days} days): ${status}`);
  }
  
  // Streak rules
  console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 Streak Rules:
  • Log at least 5 emails per day to maintain streak
  • Missing a day resets your streak
  • Check in daily with 'gex goals log emails <count>'
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function generateSummary() {
  const data = loadData();
  
  const goals = data.goals;
  const progress = data.progress;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📊 WEEKLY SUMMARY                                                            ║
║  Week of ${data.currentWeek}                                                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  const results = [];
  let totalHit = 0;
  let totalGoals = 0;
  
  const metrics = [
    { key: 'emails', label: 'Emails Sent', format: v => v },
    { key: 'meetings', label: 'Meetings Booked', format: v => v },
    { key: 'response_time', label: 'Avg Response Time', format: v => `${v}h` },
    { key: 'hot_leads', label: 'Hot Leads Cleared', format: v => `${v}%` }
  ];
  
  for (const m of metrics) {
    const goal = goals[m.key] || DEFAULT_GOALS[m.key];
    const current = progress[m.key] || 0;
    const lowerIsBetter = goal.lowerIsBetter || false;
    
    let hit;
    if (lowerIsBetter) {
      hit = current <= goal.target;
    } else {
      hit = current >= goal.target;
    }
    
    if (hit) totalHit++;
    totalGoals++;
    
    results.push({
      label: m.label,
      current: m.format(current),
      target: m.format(goal.target),
      hit,
      icon: goal.icon
    });
  }
  
  for (const r of results) {
    const status = r.hit ? '✅' : '❌';
    console.log(`  ${r.icon} ${r.label.padEnd(22)} ${r.current.toString().padStart(6)} / ${r.target.toString().padStart(6)}  ${status}`);
  }
  
  const grade = totalHit === totalGoals ? 'A+' : 
                totalHit >= totalGoals * 0.75 ? 'A' :
                totalHit >= totalGoals * 0.5 ? 'B' :
                totalHit >= totalGoals * 0.25 ? 'C' : 'D';
  
  console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  GRADE: ${grade} (${totalHit}/${totalGoals} goals hit)
  STREAK: ${data.streak} days
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function forceReset() {
  const data = loadData();
  const newData = initNewWeek(data);
  newData.currentWeek = getWeekStart(); // Force current week
  saveData(newData);
  console.log(`✅ Reset to new week: ${newData.currentWeek}`);
}

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🎯 GOAL TRACKER - Help                                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝

  Commands:
  
    gex goals                    Show current week progress
    gex goals set <metric> <n>   Set weekly target (e.g., gex goals set emails 30)
    gex goals log <metric> <n>   Log daily progress (e.g., gex goals log emails 5)
    gex goals history            Show past weeks
    gex goals streak             Show streak status and milestones
    gex goals summary            Generate weekly summary report
    gex goals reset              Force reset to new week
    gex goals help               Show this help
  
  Metrics:
    emails        - Outbound emails sent
    meetings      - Meetings booked/scheduled  
    response_time - Average response time in hours (auto-calculated)
    hot_leads     - % of hot leads cleared (auto-calculated)
  
  Aliases: gex goals, gex goal, gex targets
  
  Examples:
    gex goals set emails 30      Set email target to 30/week
    gex goals log emails 8       Log 8 emails sent today
    gex goals log meetings 1     Log 1 meeting booked
  
  Tips:
  • Run 'gex goals log emails <n>' daily to track progress
  • Meetings and response time are auto-synced from database
  • Maintain your streak by logging 5+ emails daily
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'show';
  
  try {
    switch (action) {
      case 'show':
      case 'progress':
      case 'status':
        await showProgress();
        break;
        
      case 'set':
        if (args.length < 3) {
          console.log('Usage: gex goals set <metric> <value>');
          console.log('Metrics: emails, meetings, response_time, hot_leads');
          return;
        }
        setGoal(args[1], args[2]);
        break;
        
      case 'log':
      case 'add':
        if (args.length < 3) {
          console.log('Usage: gex goals log <metric> <value>');
          console.log('Metrics: emails, meetings, hot_leads');
          return;
        }
        logProgress(args[1], args[2]);
        break;
        
      case 'history':
      case 'past':
        showHistory();
        break;
        
      case 'streak':
        showStreak();
        break;
        
      case 'summary':
      case 'report':
        generateSummary();
        break;
        
      case 'reset':
        forceReset();
        break;
        
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
        
      default:
        console.log(`Unknown action: ${action}`);
        showHelp();
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { 
  showProgress, 
  setGoal, 
  logProgress, 
  showHistory, 
  showStreak, 
  generateSummary,
  loadData,
  saveData
};

if (require.main === module) {
  main().catch(console.error);
}
