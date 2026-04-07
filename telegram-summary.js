#!/usr/bin/env node
/**
 * Telegram Summary Generator
 * Creates formatted summaries ready for Telegram delivery
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
});

// Calculate metrics
const total = leads.length;
const booked = leads.filter(l => l.reply_category === 'Booked').length;
const meetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const enterprise = leads.filter(l => l.tier === 'enterprise');
const enterprisePending = enterprise.filter(l => l.reply_category === 'Meeting Request').length;
const hot = leads.filter(l => l.age_days <= 3 && l.reply_category !== 'Booked').length;
const stale = leads.filter(l => l.age_days > 14 && l.reply_category !== 'Booked').length;

// Different summary types
const summaries = {
  quick: `📊 *Quick Status*

✅ Booked: ${booked} ($${(booked * 500).toLocaleString()})
⏳ Pending: ${meetingReq} meeting requests
🏢 Enterprise: ${enterprisePending} waiting
🔥 Hot: ${hot} | ⚠️ Stale: ${stale}

Run \`node gex.js action\` for details`,

  detailed: `📊 *DAILY PIPELINE REPORT*

━━━━━━━━━━━━━━━━━━━

📈 *Pipeline Overview*
• Total: ${total} leads
• Booked: ${booked} (${((booked/total)*100).toFixed(1)}%)
• Meeting Req: ${meetingReq}
• Enterprise: ${enterprise.length}

💰 *Revenue*
• Current: $${(booked * 500).toLocaleString()}
• Pipeline: $${(meetingReq * 500).toLocaleString()}

🚨 *Urgency*
• Hot (<3d): ${hot}
• Stale (>14d): ${stale}

🎯 *Today's Focus*
1. ${enterprisePending} enterprise meeting requests
2. ${hot} hot leads
3. ${stale} stale leads to reactivate`,

  priorities: `🎯 *TOP PRIORITIES*

🏢 *Enterprise Leads* (${enterprisePending})
${enterprise.filter(l => l.reply_category === 'Meeting Request').slice(0, 5).map((l, i) => 
  `${i + 1}. *${l.lead_company}* - ${l.lead_name}\n   ${l.age_days}d old`
).join('\n')}

⚡ *Quick Actions*
\`node gex.js action\` - What to do now
\`node gex.js qwins\` - Quick wins
\`node gex.js pdrafts\` - Email drafts`,

  alert: `🚨 *ATTENTION NEEDED*

${enterprisePending > 0 ? `⚠️ ${enterprisePending} ENTERPRISE leads waiting!
Worth $${(enterprisePending * 1000).toLocaleString()}+\n` : ''}
${hot > 0 ? `🔥 ${hot} HOT leads (respond fast!)\n` : ''}
${stale > 50 ? `⚠️ ${stale} leads going STALE\n` : ''}

Run \`node gex.js followup\` for schedule`
};

// Command line argument handling
const type = process.argv[2] || 'detailed';

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📱 TELEGRAM SUMMARY                                           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('Available types: quick, detailed, priorities, alert\n');
console.log('─'.repeat(60));
console.log(`\nType: ${type.toUpperCase()}\n`);

const summary = summaries[type] || summaries.detailed;
console.log(summary);

// Save for easy copy
fs.writeFileSync(`./telegram-${type}.txt`, summary);
console.log(`\n\n✅ Saved to telegram-${type}.txt`);
console.log('\nUsage: node telegram-summary.js [quick|detailed|priorities|alert]');
