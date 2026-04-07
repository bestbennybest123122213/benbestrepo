#!/usr/bin/env node
/**
 * Morning Briefing Generator for ItssIMANNN
 * Generates a Telegram-ready summary of:
 * - New positive replies (last 24h)
 * - Stale leads needing follow-up
 * - Key metrics
 * - Today's priorities
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function generateBriefing() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log('❌ Failed to initialize Supabase');
    return;
  }

  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  
  console.log('☀️ MORNING BRIEFING - ' + now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  }));
  console.log('='.repeat(40));
  
  // 1. Get all leads for stats
  const { data: allLeads } = await supabase
    .from('imann_positive_replies')
    .select('*');
  
  if (!allLeads) {
    console.log('❌ Error fetching leads');
    return;
  }
  
  // 2. Calculate metrics
  const booked = allLeads.filter(l => l.status === 'Booked').length;
  const scheduling = allLeads.filter(l => l.status === 'Scheduling').length;
  const notBooked = allLeads.filter(l => l.status === 'Not booked').length;
  const total = allLeads.length;
  const conversionRate = total > 0 ? ((booked / total) * 100).toFixed(1) : '0.0';
  
  console.log('\n📊 PIPELINE SNAPSHOT');
  console.log(`• Total Positive Replies: ${total}`);
  console.log(`• 📅 Booked: ${booked} (${conversionRate}%)`);
  console.log(`• ⏳ In Scheduling: ${scheduling}`);
  console.log(`• ❌ Not Booked: ${notBooked}`);
  
  // 3. Stale leads analysis
  const staleLeads = allLeads.filter(l => {
    if (l.status !== 'Scheduling' || !l.conversation_date) return false;
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 14;
  });
  
  const criticalStale = staleLeads.filter(l => {
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 30;
  });
  
  console.log('\n🚨 STALE LEADS ALERT');
  console.log(`• Critical (>30 days): ${criticalStale.length}`);
  console.log(`• Warning (>14 days): ${staleLeads.length - criticalStale.length}`);
  
  // 4. Top 5 priority follow-ups
  console.log('\n🎯 TOP 5 FOLLOW-UPS TODAY');
  
  const priorityLeads = staleLeads
    .map(l => ({
      ...l,
      days: Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24))
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  
  priorityLeads.forEach((l, i) => {
    const urgency = l.days > 60 ? '🔴' : l.days > 30 ? '🟠' : '🟡';
    console.log(`${urgency} ${i+1}. ${l.name || 'Unknown'} @ ${l.company || 'Unknown'}`);
    console.log(`   📧 ${l.email}`);
    console.log(`   ⏰ ${l.days} days since reply`);
  });
  
  // 5. Notable companies needing attention
  console.log('\n⭐ BIG NAMES TO PRIORITIZE');
  const notableKeywords = ['rovio', 'sega', 'replit', 'ign', 'udemy', 'complex', 'doist', 'unity', 'osmo', 'figure', 'jackpot'];
  const notableStale = staleLeads.filter(l => {
    const company = (l.company || '').toLowerCase();
    return notableKeywords.some(k => company.includes(k));
  });
  
  if (notableStale.length > 0) {
    notableStale.slice(0, 5).forEach(l => {
      console.log(`• ${l.company}: ${l.name} (${l.email})`);
    });
  } else {
    console.log('• No big-name leads in stale list today');
  }
  
  // 6. Action items
  console.log('\n✅ TODAY\'S ACTIONS');
  console.log('1. Follow up on top 5 stale leads above');
  console.log('2. Check SmartLead for new positive replies');
  console.log('3. Review any meetings scheduled for today');
  
  // 7. Quick stats for copy-paste
  console.log('\n' + '='.repeat(40));
  console.log('📱 TELEGRAM SUMMARY (copy-paste):\n');
  console.log(`☀️ Morning Briefing - ${now.toLocaleDateString()}

📊 Pipeline: ${booked} booked / ${scheduling} scheduling / ${total} total
📈 Conversion: ${conversionRate}%

🚨 ${staleLeads.length} stale leads need follow-up!

🎯 Top priority:
${priorityLeads.slice(0, 3).map((l, i) => `${i+1}. ${l.company} - ${l.name}`).join('\n')}

Run \`node morning-briefing.js\` for full report.`);
}

generateBriefing().catch(console.error);
