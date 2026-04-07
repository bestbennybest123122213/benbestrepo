#!/usr/bin/env node
/**
 * Daily Digest - Everything Jan needs to know
 * Combines: Pipeline, Priority Queue, Hot Prospects, Upcoming Meetings
 * Usage: node digest.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function generateDigest() {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📊 DAILY DIGEST - ${dayName}, ${dateStr}
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Get all leads
  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*');
  
  if (!leads) {
    console.log('Error fetching data');
    return;
  }

  // === PIPELINE STATS ===
  const booked = leads.filter(l => l.status === 'Booked').length;
  const scheduling = leads.filter(l => l.status === 'Scheduling').length;
  const notBooked = leads.filter(l => l.status === 'Not booked').length;
  const total = leads.length;
  
  console.log(`📈 PIPELINE SNAPSHOT
   Total: ${total} | Booked: ${booked} (${(booked/total*100).toFixed(1)}%) | Scheduling: ${scheduling} | Not Booked: ${notBooked}
`);

  // === STALE LEADS ===
  const stale = leads.filter(l => {
    if (l.status !== 'Scheduling' || !l.conversation_date) return false;
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 14;
  });
  
  const critical = stale.filter(l => {
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days >= 60;
  });
  
  console.log(`🚨 STALE LEADS: ${stale.length} total (${critical.length} critical 60+d)
`);

  // === TOP 5 PRIORITY ===
  const notable = ['rovio', 'sega', 'replit', 'udemy', 'ign', 'osmo', 'doist', 'complex', 'pixonic', 'virtus'];
  
  const scored = stale.map(l => {
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    let score = days >= 60 ? 40 : days >= 30 ? 30 : 20;
    if (notable.some(n => (l.company || '').toLowerCase().includes(n))) score += 30;
    if (l.category === 'Meeting Request') score += 20;
    else if (l.category === 'Interested') score += 15;
    
    const slug = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hasResearch = fs.existsSync(path.join(__dirname, 'lead-research', slug + '-research.md'));
    
    return { ...l, days, score, hasResearch };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  
  console.log('🎯 TOP 5 PRIORITY FOLLOW-UPS:');
  scored.forEach((l, i) => {
    const urgency = l.days >= 60 ? '🔴' : l.days >= 30 ? '🟠' : '🟡';
    const research = l.hasResearch ? '📋' : '';
    console.log(`   ${urgency} ${i+1}. ${l.name || 'Unknown'} @ ${l.company} (${l.days}d) ${research}`);
  });
  console.log('');

  // === UPCOMING MEETINGS ===
  const upcoming = leads.filter(l => l.meeting_date && new Date(l.meeting_date) >= now)
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))
    .slice(0, 3);
  
  console.log('📅 UPCOMING MEETINGS:');
  if (upcoming.length > 0) {
    upcoming.forEach(m => {
      const date = new Date(m.meeting_date);
      console.log(`   • ${date.toLocaleDateString()} - ${m.name} @ ${m.company}`);
    });
  } else {
    console.log('   No meetings scheduled');
  }
  console.log('');

  // === RESEARCH FILES ===
  const researchDir = path.join(__dirname, 'lead-research');
  const researchFiles = fs.existsSync(researchDir) 
    ? fs.readdirSync(researchDir).filter(f => f.endsWith('-research.md'))
    : [];
  
  console.log(`📋 RESEARCH: ${researchFiles.length} files prepared`);
  if (researchFiles.length > 0) {
    console.log(`   Companies: ${researchFiles.map(f => f.replace('-research.md', '')).join(', ')}`);
  }
  console.log('');

  // === SOURCE ANALYTICS ===
  const coldEmail = leads.filter(l => (l.notes || '').includes('[cold_email]'));
  const inbound = leads.filter(l => (l.notes || '').includes('[inbound]'));
  const coldBooked = coldEmail.filter(l => l.status === 'Booked').length;
  const inboundBooked = inbound.filter(l => l.status === 'Booked').length;
  const coldRate = coldEmail.length > 0 ? ((coldBooked / coldEmail.length) * 100).toFixed(1) : '0';
  const inboundRate = inbound.length > 0 ? ((inboundBooked / inbound.length) * 100).toFixed(1) : '0';
  
  console.log(`📊 SOURCE CONVERSION:
   Cold Email: ${coldBooked}/${coldEmail.length} (${coldRate}%)
   Inbound:    ${inboundBooked}/${inbound.length} (${inboundRate}%)
   ${parseFloat(inboundRate) > parseFloat(coldRate) ? '💡 Inbound converts ' + (parseFloat(inboundRate) / parseFloat(coldRate)).toFixed(1) + 'x better!' : ''}
`);

  // === TODAY'S ACTIONS ===
  console.log(`✅ TODAY'S ACTIONS:
   1. Follow up on top 5 priority leads above
   2. Check SmartLead for new positive replies
   3. Review any meetings scheduled for today
   4. Generate research for new leads: node research-lead.js <email>
`);

  // === QUICK COMMANDS ===
  console.log(`════════════════════════════════════════════════════════════════════════
🛠️  QUICK COMMANDS:
   node status.js        - Quick status check
   node priority.js      - Priority queue
   node quick-email.js   - Generate follow-up emails
   node meeting-prep.js  - Prep for meetings
   
📱 Dashboard: http://localhost:3456
════════════════════════════════════════════════════════════════════════
`);

  // === TELEGRAM SUMMARY ===
  console.log(`📱 TELEGRAM SUMMARY (copy-paste):

☀️ Daily Digest - ${dateStr}

📊 Pipeline: ${booked}/${total} booked (${(booked/total*100).toFixed(1)}%)
🚨 Stale: ${stale.length} leads (${critical.length} critical)
📅 Meetings: ${upcoming.length} upcoming

🎯 Top Priority:
${scored.slice(0, 3).map((l, i) => `${i+1}. ${l.company} - ${l.name} (${l.days}d)`).join('\n')}

Dashboard: http://localhost:3456`);
}

generateDigest();
