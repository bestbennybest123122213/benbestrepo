/**
 * Engagement Streak Tracker
 * Tracks when Jan last took action (not just wins)
 * 
 * Usage: 
 *   gex engaged           # Check current streak
 *   gex engaged --log     # Log an action taken today
 *   gex engaged --history # Show action history
 * 
 * Built: Feb 9, 2026 22:25
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/engagement-log.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { actions: [], lastAction: null };
}

function saveData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function getStreakMessage(days) {
  if (days === null) return "No actions logged yet";
  if (days === 0) return "🔥 Active today!";
  if (days === 1) return "⚡ Last action: yesterday";
  if (days === 2) return "⚠️ 2 days without action";
  if (days <= 3) return `🟡 ${days} days without action`;
  if (days <= 7) return `🟠 ${days} days without action - momentum fading`;
  return `🔴 ${days} days without action - URGENT`;
}

function logAction(description) {
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];
  
  const action = {
    date: today,
    timestamp: new Date().toISOString(),
    description: description || 'Action taken'
  };
  
  data.actions.push(action);
  data.lastAction = today;
  saveData(data);
  
  console.log(`\n✅ Logged: "${action.description}" on ${today}\n`);
}

function showHistory() {
  const data = loadData();
  
  console.log('\n' + '═'.repeat(50));
  console.log('📋 ENGAGEMENT HISTORY');
  console.log('═'.repeat(50) + '\n');
  
  if (!data.actions || data.actions.length === 0) {
    console.log('No actions logged yet.\n');
    console.log('Use: gex engaged --log "description" to log an action.\n');
    return;
  }
  
  // Group by date
  const byDate = {};
  data.actions.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  
  // Show last 14 days
  const dates = Object.keys(byDate).sort().reverse().slice(0, 14);
  
  dates.forEach(date => {
    console.log(`📅 ${date}`);
    byDate[date].forEach(a => {
      const time = new Date(a.timestamp).toLocaleTimeString();
      console.log(`   ${time} - ${a.description}`);
    });
    console.log('');
  });
}

function showStatus() {
  const data = loadData();
  const days = daysSince(data.lastAction);
  const message = getStreakMessage(days);
  
  console.log('\n' + '═'.repeat(50));
  console.log('📊 ENGAGEMENT STREAK');
  console.log('═'.repeat(50));
  
  console.log(`\n${message}\n`);
  
  if (days !== null) {
    // Visual streak bar
    const maxDays = 7;
    const filled = Math.min(days, maxDays);
    const bar = '█'.repeat(filled) + '░'.repeat(maxDays - filled);
    console.log(`Days inactive: [${bar}] ${days}d\n`);
  }
  
  console.log('─'.repeat(50));
  console.log('QUICK STATS');
  console.log('─'.repeat(50));
  
  const totalActions = data.actions?.length || 0;
  const thisWeek = (data.actions || []).filter(a => {
    const d = new Date(a.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;
  
  console.log(`  Total actions logged:  ${totalActions}`);
  console.log(`  Actions this week:     ${thisWeek}`);
  console.log(`  Last action:           ${data.lastAction || 'Never'}`);
  console.log('─'.repeat(50));
  
  if (days === null || days >= 1) {
    console.log('\n💡 To log an action: gex engaged --log "sent follow-up emails"\n');
  }
  
  // Show what counts as an action
  console.log('─'.repeat(50));
  console.log('WHAT COUNTS AS AN ACTION?');
  console.log('─'.repeat(50));
  console.log('  ✅ Sent emails to leads');
  console.log('  ✅ Had a sales call');
  console.log('  ✅ Booked a meeting');
  console.log('  ✅ Closed a deal');
  console.log('  ✅ Responded to inquiries');
  console.log('  ❌ Checking dashboards (doesn\'t count)');
  console.log('  ❌ Planning (doesn\'t count)');
  console.log('─'.repeat(50) + '\n');
}

async function run() {
  const args = process.argv.slice(2);
  
  if (args.includes('--log') || args.includes('-l')) {
    const logIndex = args.indexOf('--log') !== -1 ? args.indexOf('--log') : args.indexOf('-l');
    const description = args.slice(logIndex + 1).join(' ') || 'Action taken';
    logAction(description);
    return;
  }
  
  if (args.includes('--history') || args.includes('-h')) {
    showHistory();
    return;
  }
  
  showStatus();
}

module.exports = { run, loadData, saveData, logAction };

if (require.main === module) {
  require('dotenv').config();
  run().catch(console.error);
}
