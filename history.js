#!/usr/bin/env node
/**
 * Command History Viewer
 * Shows recent GEX commands with timestamps
 * 
 * Usage: node gex.js history [count]
 */

const fs = require('fs');
const path = require('path');

const historyPath = path.join(__dirname, 'data', 'command-history.json');
const count = parseInt(process.argv[2]) || 20;

if (!fs.existsSync(historyPath)) {
  console.log('\n📜 No command history yet.\n');
  console.log('   Run some commands first!\n');
  process.exit(0);
}

try {
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  
  if (history.length === 0) {
    console.log('\n📜 No command history yet.\n');
    process.exit(0);
  }
  
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  📜 COMMAND HISTORY (Last ${Math.min(count, history.length)} of ${history.length})                          │
╰──────────────────────────────────────────────────────────────╯
`);
  
  // Group by date
  const byDate = {};
  history.slice(0, count).forEach(entry => {
    const date = entry.timestamp.split('T')[0];
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(entry);
  });
  
  Object.entries(byDate).forEach(([date, entries]) => {
    const displayDate = date === new Date().toISOString().split('T')[0] ? 'Today' : date;
    console.log(`  📅 ${displayDate}`);
    console.log(`  ${'─'.repeat(40)}`);
    
    entries.forEach(entry => {
      const time = entry.timestamp.split('T')[1].split('.')[0].slice(0, 5);
      const args = entry.args?.length > 0 ? ` ${entry.args.join(' ')}` : '';
      console.log(`    ${time}  ${entry.command}${args}`);
    });
    console.log('');
  });
  
  // Show most used commands
  const cmdCounts = {};
  history.forEach(entry => {
    cmdCounts[entry.command] = (cmdCounts[entry.command] || 0) + 1;
  });
  
  const topCmds = Object.entries(cmdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log(`  🔥 Most used: ${topCmds.map(([cmd, n]) => `${cmd}(${n})`).join('  ')}`);
  console.log('');
  
} catch (err) {
  console.error(`❌ Error reading history: ${err.message}`);
  process.exit(1);
}
