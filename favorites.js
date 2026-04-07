#!/usr/bin/env node
/**
 * Favorites - Quick access to most-used commands
 * 
 * Usage:
 *   node favorites.js           # Show favorites
 *   node favorites.js add <cmd> # Add to favorites
 */

const fs = require('fs');
const path = require('path');

const FAVORITES_FILE = path.join(__dirname, '.favorites.json');

const defaultFavorites = [
  { cmd: 'start', desc: 'Morning routine' },
  { cmd: 'pulse', desc: 'Quick status' },
  { cmd: 'nba', desc: 'Next best action' },
  { cmd: 'inbox', desc: 'Priority inbox' },
  { cmd: 'fast', desc: 'Hot leads' }
];

function loadFavorites() {
  try {
    return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
  } catch {
    return defaultFavorites;
  }
}

function saveFavorites(favorites) {
  fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
}

const args = process.argv.slice(2);
const ACTION = args[0];

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⭐ FAVORITE COMMANDS                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

if (ACTION === 'add' && args[1]) {
  const favorites = loadFavorites();
  const cmd = args[1];
  if (!favorites.find(f => f.cmd === cmd)) {
    favorites.push({ cmd, desc: args[2] || '' });
    saveFavorites(favorites);
    console.log(`  ✅ Added "${cmd}" to favorites\n`);
  } else {
    console.log(`  ℹ️  "${cmd}" is already a favorite\n`);
  }
} else if (ACTION === 'remove' && args[1]) {
  const favorites = loadFavorites();
  const filtered = favorites.filter(f => f.cmd !== args[1]);
  saveFavorites(filtered);
  console.log(`  ✅ Removed "${args[1]}" from favorites\n`);
} else {
  const favorites = loadFavorites();
  
  favorites.forEach((f, i) => {
    console.log(`  ${i + 1}. node gex.js ${f.cmd.padEnd(10)} # ${f.desc || ''}`);
  });
  
  console.log(`
  ─────────────────────────────────────────────────────
  💡 Add favorite: node favorites.js add <command> "description"
  💡 Remove:       node favorites.js remove <command>
`);
}
