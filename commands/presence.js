#!/usr/bin/env node
/**
 * Industry Presence Tracker
 * Track podcast appearances, speaking engagements, and industry visibility.
 * Part of the inbound growth strategy.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/presence.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { appearances: [], target: { quarterly: 1 } };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getQuarter(date) {
  const month = new Date(date).getMonth();
  return Math.floor(month / 3) + 1;
}

async function main() {
  const args = process.argv.slice(2);
  const data = loadData();
  const subcommand = args[0];

  if (subcommand === 'add' || subcommand === 'log') {
    const type = args[1] || 'podcast';
    const name = args.slice(2).join(' ') || 'Appearance';
    const date = new Date().toISOString().split('T')[0];
    
    data.appearances = data.appearances || [];
    data.appearances.push({ date, type, name });
    saveData(data);
    
    console.log(`✅ Logged: ${type} - "${name}" on ${date}`);
    console.log(`Total appearances: ${data.appearances.length}`);
    return;
  }

  if (subcommand === 'list') {
    console.log('\n📋 APPEARANCE HISTORY');
    console.log('═'.repeat(50));
    
    if (!data.appearances || data.appearances.length === 0) {
      console.log('\nNo appearances logged yet.');
      console.log('Use: gex presence add podcast "Podcast Name"');
      return;
    }
    
    data.appearances.slice(-10).reverse().forEach(a => {
      console.log(`  ${a.date} - [${a.type}] ${a.name}`);
    });
    return;
  }

  // Default: show status
  const now = new Date();
  const currentQ = getQuarter(now);
  const year = now.getFullYear();
  
  const thisQuarter = (data.appearances || []).filter(a => {
    const aDate = new Date(a.date);
    return aDate.getFullYear() === year && getQuarter(a.date) === currentQ;
  });

  console.log('\n🎙️ INDUSTRY PRESENCE TRACKER');
  console.log('═'.repeat(50));
  console.log(`\nQ${currentQ} ${year} Appearances: ${thisQuarter.length}`);
  console.log(`Target: ${data.target?.quarterly || 1} per quarter`);
  
  if (thisQuarter.length === 0) {
    console.log('\n⚠️  No appearances this quarter.');
    console.log('   Industry presence drives inbound leads.');
  } else {
    console.log('\nThis quarter:');
    thisQuarter.forEach(a => console.log(`  ✓ [${a.type}] ${a.name}`));
  }
  
  console.log('\nWhy it matters:');
  console.log('  - Podcasts/speaking build authority');
  console.log('  - Authority drives inbound inquiries');
  console.log('  - 1 appearance per quarter = 3+ inbound leads');

  console.log('\nCommands:');
  console.log('  gex presence add podcast "Name"    - Log podcast');
  console.log('  gex presence add speaking "Event"  - Log speaking');
  console.log('  gex presence add interview "Pub"   - Log interview');
  console.log('  gex presence list                  - View history');
  
  console.log('\nIdeas:');
  console.log('  - Reach out to marketing podcasts');
  console.log('  - Speak at gaming/creator conferences');
  console.log('  - Write guest posts for industry blogs');
}

main().catch(console.error);
