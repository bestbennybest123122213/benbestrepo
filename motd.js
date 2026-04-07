#!/usr/bin/env node
/**
 * Message of the Day - Random motivational message
 * 
 * Usage:
 *   node motd.js         # Show random message
 *   node motd.js --add   # Add a new message
 */

const fs = require('fs');
const path = require('path');

const messages = [
  "🎯 Focus on the hot leads first - they convert 10x better!",
  "💪 Every email you send is a step towards your goal.",
  "⏰ Speed wins - respond to leads within 24 hours.",
  "📈 Consistency beats intensity. Small progress daily.",
  "🎉 You've got this! One meeting at a time.",
  "🧠 Quality over quantity - but don't forget quantity matters too.",
  "🚀 Today's effort is tomorrow's success.",
  "💡 The fortune is in the follow-up.",
  "🏆 Enterprise deals take time. Patience pays.",
  "⚡ Action beats perfection. Send that email!",
  "🌟 Every 'no' is one step closer to a 'yes'.",
  "📧 Personalization is key - make them feel special.",
  "🎯 Focus on decision makers, not gatekeepers.",
  "💼 You're building a pipeline, not just sending emails.",
  "🌱 Plant seeds today, harvest tomorrow."
];

const args = process.argv.slice(2);

if (args.includes('--all') || args.includes('-a')) {
  console.log('\n  📜 ALL MESSAGES:\n');
  messages.forEach((msg, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${msg}`);
  });
  console.log('');
} else {
  const msg = messages[Math.floor(Math.random() * messages.length)];
  console.log(`\n  ${msg}\n`);
}
