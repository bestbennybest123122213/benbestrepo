#!/usr/bin/env node
/**
 * Hotkeys Reference - Display all keyboard shortcuts
 * 
 * Usage:
 *   node hotkeys.js        # Show all shortcuts
 *   node hotkeys.js cli    # CLI aliases only
 */

const args = process.argv.slice(2);
const SECTION = args[0];

const shortcuts = {
  cli: {
    title: 'CLI Aliases',
    items: [
      ['s', 'status', 'Quick status check'],
      ['p', 'pulse', 'One-line status'],
      ['d', 'daily', 'Full daily routine'],
      ['r', 'rank', 'Lead ranking'],
      ['e', 'export', 'Export data'],
      ['h', 'health', 'Pipeline health'],
      ['g', 'goals', 'Goal progress'],
      ['t', 'templates', 'Email templates'],
      ['f', 'fast', 'Hot lead responses'],
      ['i', 'inbox', 'Priority inbox'],
      ['n', 'nba', 'Next best action'],
      ['w', 'winrate', 'Win rate analysis']
    ]
  },
  dashboard: {
    title: 'Dashboard (localhost:3456)',
    items: [
      ['⌘K', 'Command palette'],
      ['G H', 'Go to Home'],
      ['G L', 'Go to Leads'],
      ['G B', 'Go to Bookings'],
      ['R', 'Refresh data'],
      ['/', 'Focus search'],
      ['?', 'Show help']
    ]
  },
  missionControl: {
    title: 'Mission Control',
    items: [
      ['/', 'Search tasks'],
      ['R', 'Refresh'],
      ['1', 'Show all'],
      ['2', 'High priority'],
      ['Esc', 'Clear search'],
      ['?', 'Show help']
    ]
  }
};

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⌨️  GEX KEYBOARD SHORTCUTS & HOTKEYS                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

if (!SECTION || SECTION === 'cli') {
  console.log(`  📟 ${shortcuts.cli.title}`);
  console.log('  ' + '─'.repeat(40));
  shortcuts.cli.items.forEach(([key, cmd, desc]) => {
    console.log(`    ${key.padEnd(4)} → ${cmd.padEnd(12)} ${desc}`);
  });
  console.log('');
}

if (!SECTION || SECTION === 'dashboard') {
  console.log(`  🖥️  ${shortcuts.dashboard.title}`);
  console.log('  ' + '─'.repeat(40));
  shortcuts.dashboard.items.forEach(([key, desc]) => {
    console.log(`    ${key.padEnd(8)} ${desc}`);
  });
  console.log('');
}

if (!SECTION || SECTION === 'mc') {
  console.log(`  📋 ${shortcuts.missionControl.title}`);
  console.log('  ' + '─'.repeat(40));
  shortcuts.missionControl.items.forEach(([key, desc]) => {
    console.log(`    ${key.padEnd(8)} ${desc}`);
  });
  console.log('');
}

console.log('  💡 TIP: Add "source completions.sh" to your shell for tab completion');
console.log('');
