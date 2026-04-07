#!/usr/bin/env node
/**
 * Daily Report Generator
 * Creates a comprehensive daily report for Telegram delivery
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();

// Calculate metrics
const total = leads.length;
const booked = leads.filter(l => l.reply_category === 'Booked').length;
const meetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const interested = leads.filter(l => l.reply_category === 'Interested').length;
const infoReq = leads.filter(l => l.reply_category === 'Information Request').length;

const bookingRate = ((booked / total) * 100).toFixed(1);
const pendingRate = ((meetingReq / total) * 100).toFixed(1);

// Enterprise metrics
const enterprise = leads.filter(l => l.tier === 'enterprise');
const enterpriseBooked = enterprise.filter(l => l.reply_category === 'Booked').length;
const enterprisePending = enterprise.filter(l => l.reply_category === 'Meeting Request').length;

// Age metrics
const addAge = (lead) => {
  lead.age_days = Math.floor((now - new Date(lead.replied_at)) / (1000 * 60 * 60 * 24));
  return lead;
};
leads.forEach(addAge);

const hot = leads.filter(l => l.age_days <= 3 && l.reply_category !== 'Booked').length;
const warm = leads.filter(l => l.age_days > 3 && l.age_days <= 7 && l.reply_category !== 'Booked').length;
const stale = leads.filter(l => l.age_days > 14 && l.reply_category !== 'Booked').length;
const critical = leads.filter(l => l.age_days > 60 && l.reply_category !== 'Booked').length;

// Top priorities
const priorities = leads
  .filter(l => l.reply_category !== 'Booked')
  .map(l => {
    let score = 0;
    if (l.reply_category === 'Meeting Request') score += 100;
    if (l.reply_category === 'Interested') score += 60;
    if (l.tier === 'enterprise') score += 80;
    if (l.age_days <= 3) score += 50;
    else if (l.age_days <= 7) score += 40;
    else if (l.age_days <= 14) score += 30;
    return { ...l, score };
  })
  .sort((a, b) => b.score - a.score);

// Generate report
const date = new Date().toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
});

let report = `📊 *DAILY PIPELINE REPORT*
${date}

━━━━━━━━━━━━━━━━━━━━━━━

📈 *PIPELINE OVERVIEW*
• Total Leads: ${total}
• Booked: ${booked} (${bookingRate}%)
• Meeting Requests: ${meetingReq} (pending!)
• Interested: ${interested}
• Info Requests: ${infoReq}

🏢 *ENTERPRISE STATUS*
• ${enterprise.length} enterprise leads
• ${enterpriseBooked} booked, ${enterprisePending} pending
• 0% enterprise booking rate ⚠️

⏰ *URGENCY BREAKDOWN*
• 🔥 Hot (0-3d): ${hot}
• 🟠 Warm (4-7d): ${warm}
• ⚠️ Stale (15+d): ${stale}
• 🚨 Critical (60+d): ${critical}

━━━━━━━━━━━━━━━━━━━━━━━

🎯 *TOP 5 PRIORITIES TODAY*
`;

priorities.slice(0, 5).forEach((l, i) => {
  const tier = l.tier === 'enterprise' ? ' [ENT]' : '';
  report += `\n${i + 1}. *${l.lead_company}*${tier}
   ${l.lead_name} | ${l.reply_category}
   ${l.age_days}d old | Score: ${l.score}`;
});

report += `

━━━━━━━━━━━━━━━━━━━━━━━

💰 *REVENUE POTENTIAL*
• Current: $${(booked * 500).toLocaleString()}
• If all MeetReq convert: $${((booked + meetingReq) * 500).toLocaleString()}
• Upside: $${(meetingReq * 500).toLocaleString()}

📌 *ACTION ITEMS*
1. Follow up on ${enterprisePending} enterprise meeting requests
2. Contact ${hot + warm} hot/warm leads today
3. Reactivate ${stale} stale leads
4. Convert ${meetingReq - enterprisePending} other meeting requests

Run \`node gex.js followup\` for detailed schedule
Dashboard: http://localhost:3456`;

console.log(report);

// Save for Telegram delivery
fs.writeFileSync('./daily-report.txt', report);
console.log('\n\n✅ Report saved to daily-report.txt');

// Also export as JSON
const jsonReport = {
  generated: new Date().toISOString(),
  metrics: {
    total, booked, meetingReq, interested, infoReq,
    bookingRate: parseFloat(bookingRate),
    pendingRate: parseFloat(pendingRate)
  },
  enterprise: {
    total: enterprise.length,
    booked: enterpriseBooked,
    pending: enterprisePending
  },
  urgency: { hot, warm, stale, critical },
  topPriorities: priorities.slice(0, 10).map(l => ({
    company: l.lead_company,
    name: l.lead_name,
    category: l.reply_category,
    tier: l.tier,
    ageDays: l.age_days,
    score: l.score
  })),
  revenue: {
    current: booked * 500,
    potential: (booked + meetingReq) * 500,
    upside: meetingReq * 500
  }
};

fs.writeFileSync('./daily-report.json', JSON.stringify(jsonReport, null, 2));
console.log('✅ JSON report saved to daily-report.json');
