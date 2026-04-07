#!/usr/bin/env node
/**
 * GEX Focus Mode - Track and display current focus
 * 
 * Usage:
 *   node gex.js focus              # Show current focus
 *   node gex.js focus "task"       # Set focus with description
 *   node gex.js focus clear        # Clear focus
 *   node gex.js focus time         # Show time in focus
 */

const fs = require('fs');
const path = require('path');

const FOCUS_FILE = path.join(__dirname, '.focus');

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainMins}m`;
  }
  return `${mins}m`;
}

function loadFocus() {
  try {
    if (fs.existsSync(FOCUS_FILE)) {
      return JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveFocus(focus) {
  fs.writeFileSync(FOCUS_FILE, JSON.stringify(focus, null, 2));
}

function clearFocus() {
  if (fs.existsSync(FOCUS_FILE)) {
    fs.unlinkSync(FOCUS_FILE);
  }
}

function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  
  if (!action) {
    // Show current focus
    const focus = loadFocus();
    if (!focus) {
      console.log('\n📍 No current focus set');
      console.log('   Use: gex focus "Your task description"');
      console.log('');
    } else {
      const elapsed = Date.now() - new Date(focus.startedAt).getTime();
      console.log('\n' + '═'.repeat(50));
      console.log('  🎯 CURRENT FOCUS');
      console.log('═'.repeat(50));
      console.log(`  📋 ${focus.task}`);
      console.log(`  ⏱️  Time: ${formatDuration(elapsed)}`);
      console.log(`  🕐 Started: ${new Date(focus.startedAt).toLocaleTimeString()}`);
      console.log('═'.repeat(50) + '\n');
    }
    return;
  }
  
  if (action === 'clear' || action === 'done' || action === 'stop') {
    const focus = loadFocus();
    if (focus) {
      const elapsed = Date.now() - new Date(focus.startedAt).getTime();
      console.log(`\n✅ Focus cleared: "${focus.task}"`);
      console.log(`   Duration: ${formatDuration(elapsed)}\n`);
    } else {
      console.log('\n📍 No focus to clear\n');
    }
    clearFocus();
    return;
  }
  
  if (action === 'time') {
    const focus = loadFocus();
    if (focus) {
      const elapsed = Date.now() - new Date(focus.startedAt).getTime();
      console.log(formatDuration(elapsed));
    } else {
      console.log('0m');
    }
    return;
  }
  
  // Set new focus
  const task = args.join(' ');
  const oldFocus = loadFocus();
  
  if (oldFocus) {
    const elapsed = Date.now() - new Date(oldFocus.startedAt).getTime();
    console.log(`\n⏸️  Previous focus: "${oldFocus.task}" (${formatDuration(elapsed)})`);
  }
  
  saveFocus({
    task,
    startedAt: new Date().toISOString()
  });
  
  console.log(`\n🎯 Focus set: "${task}"`);
  console.log('   Timer started. Use `gex focus` to check time.\n');
}

main();
