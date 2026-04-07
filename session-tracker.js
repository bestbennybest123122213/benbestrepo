#!/usr/bin/env node
/**
 * Work Session Tracker
 * 
 * Tracks your work sessions:
 * - Leads contacted
 * - Time spent
 * - Conversions
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');

const SESSION_FILE = 'current-session.json';
const HISTORY_FILE = 'session-history.json';

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sessions: [] };
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function startSession() {
  const existing = loadSession();
  if (existing) {
    console.log('\n⚠️  Session already in progress!');
    console.log(`   Started: ${new Date(existing.startTime).toLocaleString()}`);
    console.log(`   Leads contacted: ${existing.leadsContacted.length}`);
    console.log('\n   Run "node session-tracker.js end" to finish this session.\n');
    return;
  }

  const session = {
    id: Date.now(),
    startTime: new Date().toISOString(),
    leadsContacted: [],
    notes: []
  };

  saveSession(session);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🚀 WORK SESSION STARTED                                                 ║
║  ${new Date().toLocaleString()}                                           
╚══════════════════════════════════════════════════════════════════════════╝

Track your progress:
  • Mark leads contacted: node session-tracker.js contact <email>
  • Add a note: node session-tracker.js note "Your note here"
  • Check status: node session-tracker.js status
  • End session: node session-tracker.js end

Good luck! 💪
`);
}

async function logContact(email) {
  const session = loadSession();
  if (!session) {
    console.log('\n❌ No active session. Start one with "node session-tracker.js start"\n');
    return;
  }

  if (!session.leadsContacted.includes(email)) {
    session.leadsContacted.push(email);
    saveSession(session);
    console.log(`✅ Logged: ${email}`);
    console.log(`   Total contacts this session: ${session.leadsContacted.length}`);
  } else {
    console.log(`ℹ️  ${email} already logged this session`);
  }
}

function addNote(note) {
  const session = loadSession();
  if (!session) {
    console.log('\n❌ No active session.\n');
    return;
  }

  session.notes.push({
    time: new Date().toISOString(),
    text: note
  });
  saveSession(session);
  console.log(`📝 Note added: "${note}"`);
}

function showStatus() {
  const session = loadSession();
  if (!session) {
    console.log('\n❌ No active session. Start one with "node session-tracker.js start"\n');
    return;
  }

  const start = new Date(session.startTime);
  const now = new Date();
  const minutes = Math.floor((now - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 SESSION STATUS                                                       ║
╚══════════════════════════════════════════════════════════════════════════╝

  Started:     ${start.toLocaleString()}
  Duration:    ${hours}h ${mins}m
  
  Leads contacted: ${session.leadsContacted.length}
  Notes: ${session.notes.length}

  Recent contacts:
${session.leadsContacted.slice(-5).map(e => `    • ${e}`).join('\n') || '    (none yet)'}

  Recent notes:
${session.notes.slice(-3).map(n => `    • ${n.text}`).join('\n') || '    (none yet)'}
`);
}

async function endSession() {
  const session = loadSession();
  if (!session) {
    console.log('\n❌ No active session to end.\n');
    return;
  }

  const start = new Date(session.startTime);
  const end = new Date();
  const minutes = Math.floor((end - start) / 60000);

  session.endTime = end.toISOString();
  session.durationMinutes = minutes;

  // Save to history
  const history = loadHistory();
  history.sessions.push(session);
  saveHistory(history);

  // Clear current session
  fs.unlinkSync(SESSION_FILE);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ SESSION COMPLETE                                                     ║
╚══════════════════════════════════════════════════════════════════════════╝

  Duration:         ${Math.floor(minutes / 60)}h ${minutes % 60}m
  Leads contacted:  ${session.leadsContacted.length}
  
  Rate: ${(session.leadsContacted.length / (minutes || 1) * 60).toFixed(1)} leads/hour

  ${session.leadsContacted.length >= 10 ? '🎉 Great session!' : 'Keep pushing!'}

  Session saved to history.
`);
}

function showHistory() {
  const history = loadHistory();
  
  if (history.sessions.length === 0) {
    console.log('\n📊 No session history yet.\n');
    return;
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 SESSION HISTORY (Last 10)                                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  history.sessions.slice(-10).reverse().forEach((s, i) => {
    const date = new Date(s.startTime).toLocaleDateString('en-GB');
    const dur = s.durationMinutes;
    console.log(`  ${i + 1}. ${date} - ${Math.floor(dur / 60)}h ${dur % 60}m - ${s.leadsContacted.length} leads`);
  });

  // Totals
  const totalMinutes = history.sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalLeads = history.sessions.reduce((sum, s) => sum + s.leadsContacted.length, 0);
  
  console.log(`\n  Total: ${history.sessions.length} sessions, ${Math.floor(totalMinutes / 60)}h, ${totalLeads} leads\n`);
}

async function main() {
  const action = process.argv[2] || 'status';
  const arg = process.argv.slice(3).join(' ');

  switch (action) {
    case 'start':
      await startSession();
      break;
    case 'contact':
    case 'log':
      if (!arg) {
        console.log('Usage: node session-tracker.js contact <email>');
        return;
      }
      await logContact(arg);
      break;
    case 'note':
      if (!arg) {
        console.log('Usage: node session-tracker.js note "Your note"');
        return;
      }
      addNote(arg);
      break;
    case 'status':
      showStatus();
      break;
    case 'end':
      await endSession();
      break;
    case 'history':
      showHistory();
      break;
    default:
      console.log('Commands: start, contact <email>, note "text", status, end, history');
  }
}

module.exports = { startSession, logContact, endSession, showStatus };

if (require.main === module) {
  main().catch(console.error);
}
