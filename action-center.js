#!/usr/bin/env node
/**
 * Action Center - Quick overview of what needs to be done NOW
 * The ultimate "what should I do first" command
 */

const { leads } = require('./enriched-leads.json');

const now = Date.now();

// Add age to all leads
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
  l.age_hours = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60));
});

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🎯 ACTION CENTER - What to Do Right Now                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============== URGENT ACTIONS ==============
const enterpriseMeetingReq = leads.filter(l => 
  l.tier === 'enterprise' && l.reply_category === 'Meeting Request'
).sort((a, b) => a.age_days - b.age_days);

const hotLeads = leads.filter(l => 
  l.age_days <= 3 && 
  l.reply_category !== 'Booked' && 
  ['Meeting Request', 'Interested'].includes(l.reply_category)
);

const warmMeetingReq = leads.filter(l =>
  l.age_days > 3 && l.age_days <= 7 &&
  l.reply_category === 'Meeting Request'
);

console.log('🚨 URGENT (Do Now)');
console.log('─'.repeat(65));

if (enterpriseMeetingReq.length > 0) {
  console.log(`\n  🏢 ${enterpriseMeetingReq.length} ENTERPRISE Meeting Requests ($$$ at stake!):`);
  enterpriseMeetingReq.forEach((l, i) => {
    console.log(`     ${i + 1}. ${l.lead_company} - ${l.lead_name}`);
    console.log(`        📧 ${l.lead_email} | ${l.age_days}d old`);
    console.log(`        💡 Action: Send calendar link NOW`);
  });
}

if (hotLeads.length > 0) {
  console.log(`\n  🔥 ${hotLeads.length} HOT Leads (< 3 days old):`);
  hotLeads.forEach((l, i) => {
    console.log(`     ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.reply_category})`);
    console.log(`        💡 Action: Respond within 4 hours for best conversion`);
  });
}

if (warmMeetingReq.length > 0) {
  console.log(`\n  🟠 ${warmMeetingReq.length} WARM Meeting Requests (4-7 days):`);
  warmMeetingReq.slice(0, 5).forEach((l, i) => {
    console.log(`     ${i + 1}. ${l.lead_company} - ${l.lead_name}`);
  });
  if (warmMeetingReq.length > 5) {
    console.log(`     ... and ${warmMeetingReq.length - 5} more`);
  }
}

// ============== IMPORTANT (Today) ==============
console.log('\n\n⚡ IMPORTANT (Do Today)');
console.log('─'.repeat(65));

const interestedNurture = leads.filter(l => 
  l.reply_category === 'Interested' && l.age_days <= 14
);

const staleMeetingReq = leads.filter(l =>
  l.reply_category === 'Meeting Request' && 
  l.age_days > 7 && l.age_days <= 21
);

console.log(`\n  💡 ${interestedNurture.length} "Interested" leads to nurture:`);
interestedNurture.slice(0, 5).forEach((l, i) => {
  console.log(`     ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
  console.log(`        💡 Send case study or value prop`);
});

console.log(`\n  ⏰ ${staleMeetingReq.length} Stale Meeting Requests (getting cold!):`);
staleMeetingReq.slice(0, 5).forEach((l, i) => {
  console.log(`     ${i + 1}. ${l.lead_company} - ${l.lead_name} (${l.age_days}d)`);
  console.log(`        💡 Send "still interested?" follow-up`);
});

// ============== QUICK STATS ==============
console.log('\n\n📊 QUICK STATS');
console.log('─'.repeat(65));

const booked = leads.filter(l => l.reply_category === 'Booked').length;
const totalMeetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const pendingValue = totalMeetingReq * 500;
const bookedValue = booked * 500;

console.log(`\n  ✅ Booked:          ${booked} deals | $${bookedValue.toLocaleString()}`);
console.log(`  ⏳ Meeting Requests: ${totalMeetingReq} pending | $${pendingValue.toLocaleString()} potential`);
console.log(`  🏢 Enterprise:      ${enterpriseMeetingReq.length} waiting for response`);
console.log(`  🔥 Hot/Warm:        ${hotLeads.length + warmMeetingReq.length} need action today`);

// ============== ONE-CLICK ACTIONS ==============
console.log('\n\n🖱️  QUICK COMMANDS');
console.log('─'.repeat(65));
console.log('  node gex.js pdrafts   → Generate email drafts for top leads');
console.log('  node gex.js followup  → See prioritized follow-up schedule');
console.log('  node gex.js insights  → Deep dive on conversion patterns');
console.log('  node gex.js optimize  → Campaign performance analysis');
console.log('  node gex.js dreport   → Full daily report');

// ============== TODAY'S GOAL ==============
console.log('\n\n🎯 TODAY\'S GOAL');
console.log('─'.repeat(65));
const targetBookings = Math.ceil(totalMeetingReq * 0.1); // 10% of pending
console.log(`  Convert ${targetBookings} Meeting Requests to Booked`);
console.log(`  = Additional $${(targetBookings * 500).toLocaleString()} revenue`);
console.log(`  Focus: ${enterpriseMeetingReq.length} enterprise leads first!`);

console.log('\n');
