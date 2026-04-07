#!/usr/bin/env node
/**
 * Recent Activity - Quick overview of recent changes
 * 
 * Shows pipeline changes, new replies, and recent activities
 * Useful for catching up after being away.
 * 
 * Usage:
 *   node recent.js          # Last 24 hours
 *   node recent.js --week   # Last 7 days
 *   node recent.js --all    # All time
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function main() {
  const args = process.argv.slice(2);
  const showWeek = args.includes('--week') || args.includes('-w');
  const showAll = args.includes('--all') || args.includes('-a');
  
  const hours = showAll ? 99999 : showWeek ? 168 : 24;
  const label = showAll ? 'ALL TIME' : showWeek ? 'LAST 7 DAYS' : 'LAST 24 HOURS';
  
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not configured');
    console.error('   Run: node gex.js doctor');
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hours);

  // Get recent leads
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', cutoff.toISOString())
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }

  // Get all leads for comparison
  const { data: allLeads } = await client
    .from('positive_replies')
    .select('*');

  const total = allLeads?.length || 0;
  const booked = (allLeads || []).filter(l => l.reply_category === 'Booked').length;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 RECENT ACTIVITY - ${label.padEnd(47)}   ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Stats summary
  const recentBooked = leads?.filter(l => l.reply_category === 'Booked').length || 0;
  const recentMeetingReq = leads?.filter(l => l.reply_category === 'Meeting Request').length || 0;
  const recentInterested = leads?.filter(l => l.reply_category === 'Interested').length || 0;

  console.log(`  📈 Pipeline: ${total} total | ${booked} booked (${total > 0 ? Math.round(booked/total*100) : 0}%)`);
  console.log(`  📬 Recent:   ${leads?.length || 0} new replies`);
  console.log(`     • ${recentBooked} booked`);
  console.log(`     • ${recentMeetingReq} meeting requests`);
  console.log(`     • ${recentInterested} interested`);

  if (leads?.length > 0) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔔 Recent Replies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    leads.slice(0, 10).forEach(lead => {
      const ago = getTimeAgo(lead.replied_at);
      const cat = getCategoryEmoji(lead.reply_category);
      const name = (lead.lead_name || 'Unknown').substring(0, 20);
      const company = (lead.lead_company || lead.lead_email?.split('@')[1] || 'Unknown').substring(0, 20);
      
      console.log(`  ${cat} ${name.padEnd(22)} @ ${company.padEnd(22)} ${ago}`);
    });

    if (leads.length > 10) {
      console.log(`\n  ... and ${leads.length - 10} more`);
    }
  } else {
    console.log(`\n  📭 No new activity in this period`);
  }

  // Quick actions
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  💡 Quick Actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  node gex.js nba       → Next best action
  node gex.js inbox     → Priority inbox
  node gex.js today     → Today's overview
`);
}

function getCategoryEmoji(category) {
  const emojis = {
    'Booked': '✅',
    'Meeting Request': '📅',
    'Interested': '👍',
    'Question': '❓',
    'Referral': '👥',
    'Not Interested': '❌',
    'Later': '⏰'
  };
  return emojis[category] || '📧';
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
