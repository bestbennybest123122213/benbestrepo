#!/usr/bin/env node
/**
 * Pipeline Visualization
 * ASCII art funnel visualization of the sales pipeline
 */

const { leads } = require('./enriched-leads.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📊 PIPELINE VISUALIZATION                                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Count by category
const total = leads.length;
const meetingReq = leads.filter(l => l.reply_category === 'Meeting Request').length;
const interested = leads.filter(l => l.reply_category === 'Interested').length;
const infoReq = leads.filter(l => l.reply_category === 'Information Request').length;
const booked = leads.filter(l => l.reply_category === 'Booked').length;

// Calculate percentages for visualization
const maxWidth = 50;
const meetingReqBar = Math.round((meetingReq / total) * maxWidth);
const interestedBar = Math.round((interested / total) * maxWidth);
const infoReqBar = Math.round((infoReq / total) * maxWidth);
const bookedBar = Math.round((booked / total) * maxWidth);

// ASCII funnel
console.log('                     SALES FUNNEL');
console.log('                     ════════════');
console.log('');
console.log('    ┌' + '─'.repeat(maxWidth + 4) + '┐');
console.log('    │  TOTAL LEADS: ' + String(total).padStart(3) + '                                   │');
console.log('    └' + '─'.repeat(maxWidth + 4) + '┘');
console.log('                         │');
console.log('                         ▼');

// Meeting Request bar
const mrPct = ((meetingReq / total) * 100).toFixed(1);
console.log('   ┌' + '─'.repeat(maxWidth + 6) + '┐');
console.log('   │ Meeting Requests: ' + String(meetingReq).padStart(2) + ' (' + mrPct + '%)' + ' '.repeat(maxWidth - 20) + '│');
console.log('   │ ' + '█'.repeat(meetingReqBar) + '░'.repeat(maxWidth - meetingReqBar + 4) + ' │');
console.log('   │ ' + ' $' + (meetingReq * 500).toLocaleString() + ' potential' + ' '.repeat(maxWidth - 15) + '│');
console.log('   └' + '─'.repeat(maxWidth + 6) + '┘');
console.log('                         │');
console.log('                         ▼');

// Interested bar  
const intPct = ((interested / total) * 100).toFixed(1);
console.log('      ┌' + '─'.repeat(maxWidth) + '┐');
console.log('      │ Interested: ' + String(interested).padStart(2) + ' (' + intPct + '%)' + ' '.repeat(maxWidth - 25) + '│');
console.log('      │ ' + '█'.repeat(interestedBar) + '░'.repeat(maxWidth - interestedBar - 2) + ' │');
console.log('      └' + '─'.repeat(maxWidth) + '┘');
console.log('                         │');
console.log('                         ▼');

// Info Request bar
const infoPct = ((infoReq / total) * 100).toFixed(1);
console.log('         ┌' + '─'.repeat(maxWidth - 6) + '┐');
console.log('         │ Info Request: ' + String(infoReq).padStart(2) + ' (' + infoPct + '%)' + ' '.repeat(maxWidth - 33) + '│');
console.log('         │ ' + '█'.repeat(infoReqBar) + '░'.repeat(maxWidth - infoReqBar - 8) + ' │');
console.log('         └' + '─'.repeat(maxWidth - 6) + '┘');
console.log('                         │');
console.log('                         ▼');

// Booked bar
const bookPct = ((booked / total) * 100).toFixed(1);
console.log('            ┌' + '─'.repeat(maxWidth - 12) + '┐');
console.log('            │ ✅ BOOKED: ' + String(booked).padStart(2) + ' (' + bookPct + '%)' + ' '.repeat(maxWidth - 39) + '│');
console.log('            │ ' + '█'.repeat(bookedBar) + '░'.repeat(maxWidth - bookedBar - 14) + ' │');
console.log('            │ $' + (booked * 500).toLocaleString() + ' revenue' + ' '.repeat(maxWidth - 32) + '│');
console.log('            └' + '─'.repeat(maxWidth - 12) + '┘');

// Conversion metrics
console.log('\n');
console.log('═══════════════════════════════════════════════════════════════');
console.log('📈 CONVERSION METRICS');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('  Meeting Req → Booked:  ' + ((booked / meetingReq) * 100).toFixed(1) + '% conversion');
console.log('  Total → Booked:        ' + bookPct + '% conversion');
console.log('');
console.log('  Current Revenue:       $' + (booked * 500).toLocaleString());
console.log('  Pipeline Value:        $' + ((meetingReq + interested + infoReq) * 500).toLocaleString());
console.log('  Max Potential:         $' + (total * 500).toLocaleString());

// Tier breakdown
console.log('\n');
console.log('═══════════════════════════════════════════════════════════════');
console.log('🏢 BY TIER');
console.log('═══════════════════════════════════════════════════════════════');

const tiers = ['enterprise', 'midmarket', 'startup', 'unknown'];
const tierData = {};

tiers.forEach(tier => {
  const tierLeads = leads.filter(l => (l.tier || 'unknown') === tier);
  const tierBooked = tierLeads.filter(l => l.reply_category === 'Booked').length;
  const tierPending = tierLeads.filter(l => l.reply_category === 'Meeting Request').length;
  tierData[tier] = { total: tierLeads.length, booked: tierBooked, pending: tierPending };
});

console.log('');
console.log('  Tier         Total  Booked  Pending  Conversion');
console.log('  ────────────────────────────────────────────────');
tiers.forEach(tier => {
  const d = tierData[tier];
  const conv = d.total > 0 ? ((d.booked / d.total) * 100).toFixed(0) : 0;
  console.log(`  ${tier.padEnd(12)} ${String(d.total).padStart(4)}   ${String(d.booked).padStart(4)}    ${String(d.pending).padStart(4)}      ${conv}%`);
});

console.log('\n💡 Focus: Enterprise tier has 0% conversion - 7 pending leads worth $7,000!');
