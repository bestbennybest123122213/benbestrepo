#!/usr/bin/env node
/**
 * 🚀 DAILY OPS - One Command to Rule Them All
 * 
 * Run every morning to get:
 * 1. New positive replies check
 * 2. Pipeline health snapshot
 * 3. Top 5 priority follow-ups with emails
 * 4. Upcoming meetings
 * 5. Stale leads alert
 * 
 * Usage: node daily-ops.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Notable companies for scoring
const NOTABLE = ['rovio', 'sega', 'unity', 'ign', 'complex', 'udemy', 'replit', 'doist', 'osmo', 'skillz', 'jackpot', 'figure', 'pixonic', 'snail', 'resolution', 'owlcat', 'virtus'];

async function dailyOps() {
  const now = new Date();
  const today = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🚀 DAILY OPS - ${today.padEnd(36)}     ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Get all leads
  const { data: leads, error } = await supabase
    .from('imann_positive_replies')
    .select('*');

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  // === 1. PIPELINE SNAPSHOT ===
  const booked = leads.filter(l => l.status === 'Booked').length;
  const scheduling = leads.filter(l => l.status === 'Scheduling').length;
  const notBooked = leads.filter(l => l.status === 'Not booked').length;
  const total = leads.length;
  const convRate = ((booked / total) * 100).toFixed(1);

  console.log(`📊 PIPELINE SNAPSHOT
────────────────────────────────────────
  Total Replies: ${total}
  ✅ Booked:     ${booked} (${convRate}% conversion)
  ⏳ Scheduling: ${scheduling}
  ❌ Not Booked: ${notBooked}
`);

  // === 2. STALE LEADS ALERT ===
  const schedulingLeads = leads.filter(l => l.status === 'Scheduling');
  const staleLeads = schedulingLeads.filter(l => {
    if (!l.conversation_date) return false;
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 14;
  });

  const critical = staleLeads.filter(l => {
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 30;
  });

  console.log(`🚨 STALE LEADS ALERT
────────────────────────────────────────
  🔴 Critical (>30d): ${critical.length}
  🟠 Warning (>14d):  ${staleLeads.length - critical.length}
  Total Stale:       ${staleLeads.length}
`);

  // === 3. TOP 5 PRIORITY FOLLOW-UPS ===
  const scored = schedulingLeads.map(l => {
    let score = 0;
    const company = (l.company || '').toLowerCase();
    const days = l.conversation_date 
      ? Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Staleness score
    if (days > 60) score += 40;
    else if (days > 30) score += 30;
    else if (days > 14) score += 20;
    else if (days > 7) score += 10;
    
    // Company score
    if (NOTABLE.some(n => company.includes(n))) score += 30;
    
    // Category score
    if (l.category === 'Meeting Request') score += 30;
    else if (l.category === 'Interested') score += 20;
    else score += 10;
    
    return { ...l, score, days };
  }).sort((a, b) => b.score - a.score);

  const top5 = scored.slice(0, 5);

  console.log(`🎯 TOP 5 FOLLOW-UPS TODAY
────────────────────────────────────────`);
  
  top5.forEach((l, i) => {
    const urgency = l.score >= 70 ? '🔴' : l.score >= 50 ? '🟠' : '🟡';
    console.log(`
${urgency} ${i+1}. ${l.name || 'Unknown'} @ ${l.company || 'Unknown'}
   📧 ${l.email}
   📊 Score: ${l.score} | ${l.days}d stale | ${l.category || 'Unknown'}
   
   ✉️ QUICK EMAIL:
   Subject: Quick question, ${(l.name || '').split(' ')[0] || 'there'}
   
   Hey ${(l.name || '').split(' ')[0] || 'there'},

   We connected about influencer marketing for ${l.company || 'your company'}.
   Still interested? Here's my calendar: [LINK]

   Best, Imann`);
  });

  // === 4. UPCOMING MEETINGS ===
  const withMeetings = leads.filter(l => l.meeting_date);
  const upcoming = withMeetings
    .filter(l => new Date(l.meeting_date) >= now)
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date));

  console.log(`\n\n📅 UPCOMING MEETINGS (${upcoming.length})
────────────────────────────────────────`);

  if (upcoming.length === 0) {
    console.log('  No upcoming meetings scheduled.');
  } else {
    upcoming.slice(0, 5).forEach(l => {
      const date = new Date(l.meeting_date);
      const isToday = date.toDateString() === now.toDateString();
      const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
      const dayLabel = isToday ? '🟢 TODAY' : isTomorrow ? '🟡 TOMORROW' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      console.log(`  ${dayLabel} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
      console.log(`  └─ ${l.name} @ ${l.company}`);
    });
  }

  // === 5. NOTABLE COMPANIES IN PIPELINE ===
  const notableInScheduling = schedulingLeads.filter(l => {
    const company = (l.company || '').toLowerCase();
    return NOTABLE.some(n => company.includes(n));
  });

  console.log(`\n\n⭐ NOTABLE COMPANIES IN SCHEDULING (${notableInScheduling.length})
────────────────────────────────────────`);
  
  notableInScheduling.slice(0, 8).forEach(l => {
    const days = l.conversation_date 
      ? Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24))
      : 0;
    console.log(`  • ${l.company}: ${l.name} (${days}d stale)`);
  });

  // === TELEGRAM SUMMARY ===
  console.log(`\n
╔══════════════════════════════════════════════════════════════╗
║  📱 TELEGRAM SUMMARY (copy below)                            ║
╚══════════════════════════════════════════════════════════════╝

☀️ Daily Ops - ${today}

📊 Pipeline: ${booked}/${total} booked (${convRate}%)
🚨 ${staleLeads.length} stale leads need follow-up

🎯 Top 3 priorities:
${top5.slice(0, 3).map((l, i) => `${i+1}. ${l.company} - ${l.name}`).join('\n')}

📅 Next meeting: ${upcoming.length > 0 ? `${upcoming[0].name} @ ${upcoming[0].company}` : 'None scheduled'}

Run: node daily-ops.js
`);
}

dailyOps().catch(console.error);
