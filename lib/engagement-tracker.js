/**
 * Engagement Tracker
 * 
 * Tracks whether Jan engages with morning briefings and actions.
 * Helps identify patterns in what works and what doesn't.
 * 
 * Usage:
 *   gex engage log briefing       # Log that briefing was sent
 *   gex engage log action <desc>  # Log an action taken
 *   gex engage log email <lead>   # Log email sent
 *   gex engage status             # Today's engagement
 *   gex engage week               # Weekly report
 *   gex engage patterns           # Identify what works
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ENGAGEMENT_FILE = path.join(DATA_DIR, 'engagement.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
  if (fs.existsSync(ENGAGEMENT_FILE)) {
    return JSON.parse(fs.readFileSync(ENGAGEMENT_FILE, 'utf8'));
  }
  return { 
    days: {},
    totals: {
      briefingsSent: 0,
      actionsLogged: 0,
      emailsSent: 0,
      engagedDays: 0,
      zeroEngagementDays: 0
    }
  };
}

function saveData(data) {
  fs.writeFileSync(ENGAGEMENT_FILE, JSON.stringify(data, null, 2));
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDayData(data, date) {
  if (!data.days[date]) {
    data.days[date] = {
      briefingSent: false,
      briefingSentAt: null,
      actions: [],
      emails: [],
      engaged: false
    };
  }
  return data.days[date];
}

function logBriefing() {
  const data = loadData();
  const today = getToday();
  const day = getDayData(data, today);
  
  day.briefingSent = true;
  day.briefingSentAt = new Date().toISOString();
  data.totals.briefingsSent++;
  
  saveData(data);
  
  console.log(`\n✅ Briefing logged for ${today}`);
  console.log(`   Time: ${new Date().toLocaleTimeString()}`);
  console.log(`   Total briefings sent: ${data.totals.briefingsSent}`);
}

function logAction(description) {
  const data = loadData();
  const today = getToday();
  const day = getDayData(data, today);
  
  day.actions.push({
    description,
    time: new Date().toISOString()
  });
  day.engaged = true;
  data.totals.actionsLogged++;
  
  // Update engaged days count
  const engagedDays = Object.values(data.days).filter(d => d.engaged).length;
  data.totals.engagedDays = engagedDays;
  
  saveData(data);
  
  console.log(`\n✅ Action logged: ${description}`);
  console.log(`   Time: ${new Date().toLocaleTimeString()}`);
  console.log(`   Actions today: ${day.actions.length}`);
}

function logEmail(leadInfo) {
  const data = loadData();
  const today = getToday();
  const day = getDayData(data, today);
  
  day.emails.push({
    lead: leadInfo,
    time: new Date().toISOString()
  });
  day.engaged = true;
  data.totals.emailsSent++;
  
  // Update engaged days count
  const engagedDays = Object.values(data.days).filter(d => d.engaged).length;
  data.totals.engagedDays = engagedDays;
  
  saveData(data);
  
  console.log(`\n✅ Email logged: ${leadInfo}`);
  console.log(`   Time: ${new Date().toLocaleTimeString()}`);
  console.log(`   Emails today: ${day.emails.length}`);
}

function showStatus() {
  const data = loadData();
  const today = getToday();
  const day = data.days[today] || { briefingSent: false, actions: [], emails: [], engaged: false };
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 TODAY\'S ENGAGEMENT                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📅 Date: ${today}`);
  console.log(`📧 Briefing sent: ${day.briefingSent ? '✅ Yes' : '❌ No'}`);
  if (day.briefingSentAt) {
    console.log(`   Sent at: ${new Date(day.briefingSentAt).toLocaleTimeString()}`);
  }
  
  console.log(`\n📋 Actions taken: ${day.actions.length}`);
  day.actions.forEach((action, i) => {
    console.log(`   ${i + 1}. ${action.description} (${new Date(action.time).toLocaleTimeString()})`);
  });
  
  console.log(`\n📬 Emails sent: ${day.emails.length}`);
  day.emails.forEach((email, i) => {
    console.log(`   ${i + 1}. ${email.lead} (${new Date(email.time).toLocaleTimeString()})`);
  });
  
  console.log(`\n🎯 Engaged today: ${day.engaged ? '✅ Yes' : '❌ No'}`);
  
  // Calculate streak
  const dates = Object.keys(data.days).sort().reverse();
  let streak = 0;
  for (const date of dates) {
    if (data.days[date].engaged) {
      streak++;
    } else if (data.days[date].briefingSent) {
      break; // Briefing sent but no engagement = streak broken
    }
  }
  
  console.log(`🔥 Current streak: ${streak} days`);
}

function showWeekly() {
  const data = loadData();
  const today = new Date();
  const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 WEEKLY ENGAGEMENT REPORT                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  let weekBriefings = 0;
  let weekEngaged = 0;
  let weekActions = 0;
  let weekEmails = 0;
  
  const weekData = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const day = data.days[date] || { briefingSent: false, actions: [], emails: [], engaged: false };
    
    weekData.push({ date, ...day });
    
    if (day.briefingSent) weekBriefings++;
    if (day.engaged) weekEngaged++;
    weekActions += day.actions?.length || 0;
    weekEmails += day.emails?.length || 0;
  }
  
  console.log('📅 Last 7 Days:');
  console.log('─'.repeat(60));
  
  weekData.forEach(day => {
    const status = day.engaged ? '✅' : (day.briefingSent ? '❌' : '⬜');
    const actions = day.actions?.length || 0;
    const emails = day.emails?.length || 0;
    console.log(`   ${day.date}: ${status} ${actions} actions, ${emails} emails`);
  });
  
  console.log('\n📊 Summary:');
  console.log(`   Briefings sent: ${weekBriefings}/7`);
  console.log(`   Days engaged: ${weekEngaged}/7 (${Math.round(weekEngaged/7*100)}%)`);
  console.log(`   Total actions: ${weekActions}`);
  console.log(`   Total emails: ${weekEmails}`);
  
  const engagementRate = weekBriefings > 0 ? Math.round(weekEngaged / weekBriefings * 100) : 0;
  console.log(`\n🎯 Engagement rate: ${engagementRate}%`);
  
  if (engagementRate < 30) {
    console.log('   ⚠️ Low engagement - consider different briefing format');
  } else if (engagementRate < 60) {
    console.log('   📈 Moderate engagement - room for improvement');
  } else {
    console.log('   🚀 Good engagement - keep it up!');
  }
}

function showPatterns() {
  const data = loadData();
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 ENGAGEMENT PATTERNS                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const dayOfWeek = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  const engagementByDay = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const briefingsByDay = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  
  Object.entries(data.days).forEach(([dateStr, day]) => {
    const date = new Date(dateStr);
    const dow = date.getDay();
    if (day.briefingSent) briefingsByDay[dow]++;
    if (day.engaged) engagementByDay[dow]++;
  });
  
  console.log('📅 Engagement by Day of Week:');
  console.log('─'.repeat(40));
  
  for (let i = 1; i <= 6; i++) { // Mon-Sat
    const dow = i % 7;
    const rate = briefingsByDay[dow] > 0 
      ? Math.round(engagementByDay[dow] / briefingsByDay[dow] * 100) 
      : 0;
    const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
    console.log(`   ${dayOfWeek[dow]}: ${bar} ${rate}%`);
  }
  // Sunday
  const sunRate = briefingsByDay[0] > 0 
    ? Math.round(engagementByDay[0] / briefingsByDay[0] * 100) 
    : 0;
  const sunBar = '█'.repeat(Math.round(sunRate / 10)) + '░'.repeat(10 - Math.round(sunRate / 10));
  console.log(`   Sun: ${sunBar} ${sunRate}%`);
  
  // Find best day
  let bestDay = 0;
  let bestRate = 0;
  for (let i = 0; i < 7; i++) {
    const rate = briefingsByDay[i] > 0 ? engagementByDay[i] / briefingsByDay[i] : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestDay = i;
    }
  }
  
  console.log(`\n💡 Best engagement day: ${dayOfWeek[bestDay]} (${Math.round(bestRate * 100)}%)`);
  
  // All-time stats
  console.log('\n📊 All-Time Stats:');
  console.log(`   Total briefings: ${data.totals.briefingsSent}`);
  console.log(`   Total actions: ${data.totals.actionsLogged}`);
  console.log(`   Total emails: ${data.totals.emailsSent}`);
  console.log(`   Engaged days: ${data.totals.engagedDays}`);
}

async function run(args = []) {
  const subcommand = args[0]?.toLowerCase();
  
  if (!subcommand || subcommand === 'status') {
    showStatus();
    return;
  }
  
  if (subcommand === 'log') {
    const type = args[1]?.toLowerCase();
    const value = args.slice(2).join(' ');
    
    if (type === 'briefing') {
      logBriefing();
    } else if (type === 'action') {
      logAction(value || 'Unspecified action');
    } else if (type === 'email') {
      logEmail(value || 'Unknown lead');
    } else {
      console.log('\n❌ Unknown log type. Use: briefing, action, or email');
      console.log('   gex engage log briefing');
      console.log('   gex engage log action "Followed up with Doug"');
      console.log('   gex engage log email "Doug @ CanarySpeech"');
    }
    return;
  }
  
  if (subcommand === 'week' || subcommand === 'weekly') {
    showWeekly();
    return;
  }
  
  if (subcommand === 'patterns' || subcommand === 'analyze') {
    showPatterns();
    return;
  }
  
  // Help
  console.log('\n📊 ENGAGEMENT TRACKER');
  console.log('─'.repeat(40));
  console.log('\nCommands:');
  console.log('  gex engage                    Today\'s status');
  console.log('  gex engage log briefing       Log briefing sent');
  console.log('  gex engage log action <desc>  Log action taken');
  console.log('  gex engage log email <lead>   Log email sent');
  console.log('  gex engage week               Weekly report');
  console.log('  gex engage patterns           Analyze patterns');
}

module.exports = { run, logBriefing, logAction, logEmail, showStatus };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
