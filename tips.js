#!/usr/bin/env node
/**
 * GEX Tips - Quick helpful tips and keyboard shortcuts
 * 
 * Usage: node gex.js tips [category]
 */

const tips = {
  workflow: [
    '🎯 Use `gex pulse` for a one-line status check anytime',
    '📋 `gex nba` shows your Next Best Action - start there',
    '⚡ `gex start` runs the full morning routine',
    '🔄 Alias shortcuts: s=status, p=pulse, d=daily, r=rank, n=nba',
    '📊 `gex dash` opens the interactive dashboard'
  ],
  
  leads: [
    '🎯 `gex rank` prioritizes leads by score',
    '🔥 `gex wins` shows quick wins you can close today',
    '📧 `gex drafts` generates email drafts for follow-ups',
    '🔄 `gex reactivate` finds cold leads worth warming up',
    '📝 `gex mark <domain>` records contact activity'
  ],
  
  productivity: [
    '⏰ Run `gex pulse` between tasks for focus check',
    '📆 `gex calendar` syncs your meeting schedule',
    '📊 `gex weekly` shows performance trends',
    '🎯 Batch similar activities: research → outreach → follow-up',
    '🔔 `gex notify` sends Telegram alerts for urgent items'
  ],
  
  integration: [
    '🔗 `gex mc` bridges to Mission Control for task tracking',
    '📊 `gex mc add "task"` creates a new backlog item',
    '✅ `gex mc done <id>` marks tasks complete',
    '📜 `gex history` shows your recent command usage',
    '💾 `gex backup` creates timestamped data snapshots'
  ],
  
  shortcuts: [
    'gex s     → status',
    'gex p     → pulse', 
    'gex d     → daily',
    'gex r     → rank',
    'gex n     → nba',
    'gex h     → help',
    'gex mc s  → Mission Control summary',
    'gex mc a  → Add task to backlog'
  ]
};

function showTips(category) {
  const categories = Object.keys(tips);
  
  if (category && tips[category]) {
    console.log(`\n💡 ${category.toUpperCase()} TIPS:\n`);
    tips[category].forEach(tip => console.log(`  ${tip}`));
    console.log('');
  } else if (category === 'random' || !category) {
    // Show random tips from all categories
    console.log('\n💡 GEX TIPS OF THE DAY:\n');
    const allTips = Object.values(tips).flat();
    const shuffled = allTips.sort(() => 0.5 - Math.random());
    shuffled.slice(0, 5).forEach(tip => console.log(`  ${tip}`));
    console.log('\n  Run `gex tips <category>` for more');
    console.log(`  Categories: ${categories.join(', ')}\n`);
  } else {
    console.log('\n❌ Unknown category:', category);
    console.log(`   Valid: ${categories.join(', ')}\n`);
    process.exit(1);
  }
}

showTips(process.argv[2]);
