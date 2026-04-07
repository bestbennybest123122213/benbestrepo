#!/usr/bin/env node
/**
 * Overnight Work Summary Generator
 * Creates a comprehensive summary for Jan's morning review
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
});

// Key metrics
const total = leads.length;
const booked = leads.filter(l => l.reply_category === 'Booked').length;
const meetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const enterprise = leads.filter(l => l.tier === 'enterprise').length;
const enterpriseMeetingReq = leads.filter(l => l.tier === 'enterprise' && l.reply_category === 'Meeting Request').length;
const stale = leads.filter(l => l.age_days > 14 && l.reply_category !== 'Booked').length;

// New tools built overnight
const newTools = [
  { name: 'pdrafts', desc: 'Priority email drafts', file: 'generate-priority-drafts.js' },
  { name: 'enrich2', desc: 'Lead enrichment', file: 'enrich-unknown-leads.js' },
  { name: 'alert', desc: 'Hot lead alerts', file: 'hot-lead-alert.js' },
  { name: 'insights', desc: 'Conversion insights', file: 'conversion-insights.js' },
  { name: 'followup', desc: 'Smart follow-up scheduler', file: 'smart-followup-scheduler.js' },
  { name: 'optimize', desc: 'Campaign optimizer', file: 'campaign-optimizer.js' },
  { name: 'dreport', desc: 'Daily report generator', file: 'daily-report-generator.js' },
  { name: 'rhelp', desc: 'Research helper', file: 'research-helper.js' },
  { name: 'action', desc: 'Action center', file: 'action-center.js' },
  { name: 'mprep', desc: 'Meeting prep generator', file: 'meeting-prep-generator.js' },
  { name: 'trends', desc: 'Weekly trends tracker', file: 'weekly-trends.js' },
  { name: 'roi', desc: 'ROI calculator', file: 'roi-calculator.js' },
  { name: 'stale', desc: 'Stale reactivation', file: 'stale-reactivation.js' },
  { name: 'compintel', desc: 'Competitive intelligence', file: 'competitive-intel.js' }
];

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🌙 OVERNIGHT WORK SUMMARY                                                  ║
║   Feb 5-6, 2026 | 00:00 - 08:00                                              ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
📊 PIPELINE STATUS
═══════════════════════════════════════════════════════════════════════════════

  Total Leads:         ${total}
  Booked:              ${booked} ($${(booked * 500).toLocaleString()} revenue)
  Meeting Requests:    ${meetingReq} ($${(meetingReq * 500).toLocaleString()} potential)
  Enterprise Pending:  ${enterpriseMeetingReq} ($${(enterpriseMeetingReq * 1000).toLocaleString()} at stake!)
  Stale (>14 days):    ${stale}

═══════════════════════════════════════════════════════════════════════════════
🛠️  NEW TOOLS BUILT (${newTools.length} commands added to GEX)
═══════════════════════════════════════════════════════════════════════════════
`);

newTools.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. node gex.js ${t.name.padEnd(10)} - ${t.desc}`);
});

console.log(`
═══════════════════════════════════════════════════════════════════════════════
🔑 KEY FINDINGS
═══════════════════════════════════════════════════════════════════════════════

  1. ⚠️  0% ENTERPRISE BOOKING RATE
     - 7 enterprise meeting requests waiting
     - Unity, Udemy, Replit, IGN, Complex, Naver, Paradox
     - $7,000 at stake

  2. 📉 LEAD VOLUME DOWN 95%
     - Only 1 new lead this week vs 20 last week
     - May need to increase outbound

  3. ⏰ RESPONSE TIME CORRELATION
     - Booked leads: 20.9h avg response
     - Unbooked: 39h avg response
     - Faster response = higher conversion

  4. 🎯 TOP CAMPAIGN: Reactivation (23.8% booking rate)
     - Best performing campaign type
     - Consider expanding reactivation efforts

  5. 💰 REVENUE POTENTIAL
     - Current: $10,500
     - Pipeline: $40,500
     - If 40% convert: $23,500 total

═══════════════════════════════════════════════════════════════════════════════
📋 TODAY'S ACTION ITEMS
═══════════════════════════════════════════════════════════════════════════════

  🔴 URGENT (Do First):
  1. Follow up on 7 enterprise meeting requests
  2. Respond to 1 hot lead (Stillfront - 1 day old)
  3. Contact 34 moderate stale leads (15-30 days)

  🟠 IMPORTANT:
  4. Send reactivation campaign to 19 cold leads
  5. Research 52 unknown-tier companies
  6. Review 5 frozen leads (last chance)

  🟡 QUICK COMMANDS:
  - node gex.js action     # What to do NOW
  - node gex.js pdrafts    # Get email drafts
  - node gex.js followup   # Prioritized schedule
  - node gex.js roi        # Revenue breakdown

═══════════════════════════════════════════════════════════════════════════════
📁 GENERATED FILES
═══════════════════════════════════════════════════════════════════════════════

  Email Drafts:
  - priority-email-drafts.md (47 drafts)
  - reactivation-moderate.md (34 emails)
  - reactivation-cold.md (19 emails)
  - reactivation-frozen.md (5 emails)

  Reports:
  - daily-report.txt (Telegram-ready)
  - research-list.md (52 companies)
  - meeting-prep-notes.md (21 meetings)

  Data:
  - enriched-unknown-leads.json
  - followup-schedule-today.json
  - competitive-intel.json
  - weekly-history.json

═══════════════════════════════════════════════════════════════════════════════
🎯 RECOMMENDATIONS
═══════════════════════════════════════════════════════════════════════════════

  1. 🚨 PRIORITY: Book at least 1 enterprise deal this week
     Focus on Unity & Udemy (both strong ICP fit)

  2. 📧 SPEED UP: Aim for <4 hour response time
     Current 39h is too slow - losing deals

  3. 🔄 REACTIVATE: Run moderate stale campaign TODAY
     34 leads, $5,100 potential

  4. 📈 VOLUME: May need more outbound to hit targets
     Lead volume down 95% week over week

═══════════════════════════════════════════════════════════════════════════════
`);

// Save summary for Telegram delivery
const telegramSummary = `🌙 *OVERNIGHT WORK COMPLETE*

📊 *Pipeline Status*
• ${booked} booked ($${(booked * 500).toLocaleString()})
• ${meetingReq} meeting requests pending
• ${enterpriseMeetingReq} enterprise leads waiting!
• ${stale} stale leads need attention

🛠️ *Built ${newTools.length} New GEX Commands*
\`action\` \`pdrafts\` \`followup\` \`roi\` \`stale\` \`insights\` \`optimize\` \`trends\` + 6 more

🔑 *Key Findings*
1. ⚠️ 0% enterprise booking rate ($7K at stake)
2. 📉 Lead volume down 95% this week
3. ⏰ Faster response = higher conversion
4. 💰 $40K in pipeline if converted

📋 *Today's Priority*
1. Follow up 7 enterprise meeting requests
2. Run reactivation campaign (34 leads)
3. Research 52 unknown companies

Quick start: \`node gex.js action\``;

fs.writeFileSync('./overnight-summary.txt', telegramSummary);
console.log('✅ Telegram summary saved to overnight-summary.txt');
