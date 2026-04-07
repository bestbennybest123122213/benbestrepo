#!/usr/bin/env node
/**
 * Quick Status Check - One command to see everything
 * Usage: node status.js
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function getStatus() {
  const now = new Date();
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  📊 GEX OS STATUS - ${now.toLocaleString()}
╚══════════════════════════════════════════════════════════════╝
`);

  const supabase = initSupabase();
  if (!supabase) {
    console.error('Error: Failed to initialize Supabase client');
    return;
  }

  try {
    // Get all leads from imann_positive_replies (canonical source)
    const { data: leads, error } = await supabase
      .from('imann_positive_replies')
      .select('*');
    
    if (error) throw error;
    
    const total = leads.length;
    const booked = leads.filter(l => l.status === 'Booked').length;
    const scheduling = leads.filter(l => l.status === 'Scheduling').length;
    const notBooked = leads.filter(l => l.status === 'Not booked').length;
    
    // Stale leads
    const stale = leads.filter(l => {
      if (l.status !== 'Scheduling' || !l.conversation_date) return false;
      const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
      return days > 14;
    });
    
    const critical = stale.filter(l => {
      const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
      return days >= 60;
    });
    
    // Upcoming meetings
    const upcoming = leads.filter(l => 
      l.meeting_date && new Date(l.meeting_date) >= now
    ).sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date));
    
    // By source
    const coldEmail = leads.filter(l => (l.notes || '').includes('[cold_email]')).length;
    const inbound = leads.filter(l => (l.notes || '').includes('[inbound]')).length;
    const reactivation = leads.filter(l => (l.notes || '').includes('[reactivation]')).length;
    
    const bookedPct = total > 0 ? ((booked / total) * 100).toFixed(1) : '0.0';
    console.log(`📈 PIPELINE
   Total Leads:    ${total}
   Booked:         ${booked} (${bookedPct}%)
   Scheduling:     ${scheduling}
   Not Booked:     ${notBooked}
`);

    console.log(`🚨 STALE LEADS
   Total Stale:    ${stale.length} (>14 days)
   Critical:       ${critical.length} (>60 days)
   Need Follow-up: ${stale.length > 0 ? '⚠️  YES' : '✅ None'}
`);

    console.log(`📅 MEETINGS
   Upcoming:       ${upcoming.length}
   Next:           ${upcoming[0] ? upcoming[0].name + ' @ ' + upcoming[0].company + ' (' + new Date(upcoming[0].meeting_date).toLocaleDateString() + ')' : 'None scheduled'}
`);

    console.log(`📊 BY SOURCE
   Cold Email:     ${coldEmail}
   Inbound:        ${inbound}
   Reactivation:   ${reactivation}
`);

    // Top priority stale lead
    if (stale.length > 0) {
      const top = stale.sort((a, b) => {
        const aDays = Math.floor((now - new Date(a.conversation_date)) / (1000 * 60 * 60 * 24));
        const bDays = Math.floor((now - new Date(b.conversation_date)) / (1000 * 60 * 60 * 24));
        return bDays - aDays;
      })[0];
      const days = Math.floor((now - new Date(top.conversation_date)) / (1000 * 60 * 60 * 24));
      
      console.log(`🎯 TOP PRIORITY
   ${top.name} @ ${top.company}
   📧 ${top.email}
   ⏰ ${days} days stale
`);
    }

    console.log(`════════════════════════════════════════════════════════════════
💡 Quick Actions:
   • Follow up on stale leads: node batch-followups.js
   • Morning briefing:         node morning-briefing.js
   • Meeting prep:             node meeting-prep.js
   • Dashboard:                http://localhost:3456
════════════════════════════════════════════════════════════════
`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

getStatus();
