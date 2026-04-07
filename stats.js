#!/usr/bin/env node
/**
 * GEX Stats - Combined statistics from all systems
 * 
 * Usage: node gex.js stats [period]
 *        period: today, week, month (default: today)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MC_DATA = path.join(__dirname, '..', 'mission-control', 'data.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'command-history.json');

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function loadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function main() {
  const period = process.argv[2] || 'today';
  const today = getToday();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 GEX COMBINED STATISTICS                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  // GEX Command History Stats
  const history = loadJSON(HISTORY_FILE);
  if (history && history.commands) {
    const todayCommands = history.commands.filter(c => 
      c.timestamp && c.timestamp.startsWith(today)
    );
    
    // Command frequency
    const freq = {};
    todayCommands.forEach(c => {
      freq[c.command] = (freq[c.command] || 0) + 1;
    });
    
    const topCommands = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log(`📈 GEX Commands Today: ${todayCommands.length}`);
    if (topCommands.length > 0) {
      console.log('   Top commands:');
      topCommands.forEach(([cmd, count]) => {
        console.log(`     • ${cmd}: ${count}x`);
      });
    }
    console.log('');
  }
  
  // Mission Control Stats
  const mcData = loadJSON(MC_DATA);
  if (mcData) {
    const stats = {
      backlog: mcData.columns?.backlog?.length || 0,
      inProgress: mcData.columns?.inProgress?.length || 0,
      review: mcData.columns?.review?.length || 0,
      done: mcData.columns?.done?.length || 0
    };
    
    const total = stats.backlog + stats.inProgress + stats.review + stats.done;
    
    console.log('📋 Mission Control Pipeline:');
    console.log(`   📥 Backlog:     ${stats.backlog}`);
    console.log(`   🔄 In Progress: ${stats.inProgress}`);
    console.log(`   👀 Review:      ${stats.review}`);
    console.log(`   ✅ Done:        ${stats.done}`);
    console.log(`   ─────────────────`);
    console.log(`   📊 Total:       ${total}`);
    console.log('');
    
    // Today's completions
    const todayDone = (mcData.columns?.done || []).filter(t => 
      t.completed && t.completed.startsWith(today)
    ).length;
    console.log(`🏆 Completed Today: ${todayDone}`);
    console.log('');
    
    // High priority items
    const highPri = [
      ...(mcData.columns?.backlog || []),
      ...(mcData.columns?.inProgress || []),
      ...(mcData.columns?.review || [])
    ].filter(t => t.priority === 'high');
    
    if (highPri.length > 0) {
      console.log(`🔥 High Priority (${highPri.length}):`);
      highPri.forEach(t => {
        console.log(`   • ${t.title}`);
      });
      console.log('');
    }
  }
  
  // Focus status
  const focusFile = path.join(__dirname, '.focus');
  if (fs.existsSync(focusFile)) {
    try {
      const focus = JSON.parse(fs.readFileSync(focusFile, 'utf8'));
      const elapsed = Date.now() - new Date(focus.startedAt).getTime();
      const mins = Math.floor(elapsed / 60000);
      console.log(`🎯 Current Focus: "${focus.task}" (${mins}m)`);
      console.log('');
    } catch (e) {}
  }
  
  console.log('═'.repeat(68) + '\n');
}

main();
