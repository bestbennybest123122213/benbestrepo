#!/usr/bin/env node
/**
 * Daily Digest Generator
 * 
 * Creates a beautiful, Telegram-formatted daily report with:
 * - Pipeline snapshot (bookings, meetings, hot leads)
 * - Top 5 priority leads to action
 * - Stale leads requiring attention
 * - Revenue opportunity summary
 * 
 * Usage:
 *   node daily-digest.js              # Print to stdout
 *   node daily-digest.js --json       # Output as JSON for programmatic use
 *   node daily-digest.js --telegram   # Format for Telegram (default)
 *   node daily-digest.js --slack      # Format for Slack
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const FORMAT = args.includes('--json') ? 'json' 
             : args.includes('--slack') ? 'slack'
             : 'telegram';

// Revenue assumptions
const AVG_BOOKING_VALUE = 500;
const CONVERSION_RATE = 0.4; // 40% of meetings → deals

async function generateDigest() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Fetch all leads
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching leads:', error.message);
    process.exit(1);
  }

  // Calculate metrics
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetingRequests = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const enterprise = leads.filter(l => l.company_size === 'enterprise');

  // Age buckets for unbooked
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const warm = unbooked.filter(l => {
    const age = getAgeDays(l.replied_at);
    return age > 3 && age <= 7;
  });
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);

  // Revenue calculations
  const currentRevenue = booked.length * AVG_BOOKING_VALUE;
  const potentialFromMeetings = meetingRequests.length * AVG_BOOKING_VALUE;
  const upside = potentialFromMeetings * CONVERSION_RATE;

  // Top priority leads (not booked, scored)
  const priorityLeads = unbooked
    .map(l => ({ ...l, score: calculateScore(l) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Stale leads needing attention
  const staleLeads = stale
    .sort((a, b) => getAgeDays(b.replied_at) - getAgeDays(a.replied_at))
    .slice(0, 5);

  // Recent wins (booked in last 7 days)
  const recentWins = booked
    .filter(l => getAgeDays(l.created_at) <= 7)
    .slice(0, 3);

  const digest = {
    date: today,
    dayOfWeek,
    generatedAt: now.toISOString(),
    summary: {
      total,
      booked: booked.length,
      bookingRate: ((booked.length / total) * 100).toFixed(1),
      meetingRequests: meetingRequests.length,
      interested: interested.length,
      enterprise: enterprise.length,
      hot: hot.length,
      warm: warm.length,
      stale: stale.length
    },
    revenue: {
      current: currentRevenue,
      potential: potentialFromMeetings,
      upside: Math.round(upside)
    },
    priorityLeads,
    staleLeads,
    recentWins
  };

  if (FORMAT === 'json') {
    console.log(JSON.stringify(digest, null, 2));
    return;
  }

  // Format for messaging
  const output = FORMAT === 'slack' 
    ? formatForSlack(digest) 
    : formatForTelegram(digest);
  
  console.log(output);
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function calculateScore(lead) {
  let score = 0;
  
  // Recency (max 50)
  const age = getAgeDays(lead.replied_at);
  if (age <= 3) score += 50;
  else if (age <= 7) score += 35;
  else if (age <= 14) score += 20;
  else if (age <= 21) score += 10;
  
  // Category (max 40)
  if (lead.reply_category === 'Meeting Request') score += 40;
  else if (lead.reply_category === 'Interested') score += 25;
  else if (lead.reply_category === 'Information Request') score += 15;
  
  // Company size (max 30)
  if (lead.company_size === 'enterprise') score += 30;
  else if (lead.company_size === 'midmarket') score += 20;
  else if (lead.company_size === 'smb') score += 10;
  
  // Funding boost
  if (lead.funding_amount && lead.funding_amount > 100000000) score += 20;
  else if (lead.funding_amount && lead.funding_amount > 10000000) score += 10;
  
  return score;
}

function formatForTelegram(d) {
  const lines = [];
  
  // Header
  lines.push(`📊 *Daily Digest* — ${d.dayOfWeek}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');
  
  // Pipeline snapshot
  lines.push(`🎯 *Pipeline Snapshot*`);
  lines.push(`• Total leads: ${d.summary.total}`);
  lines.push(`• ✅ Booked: ${d.summary.booked} (${d.summary.bookingRate}%)`);
  lines.push(`• 🤝 Meeting requests: ${d.summary.meetingRequests}`);
  lines.push(`• 💼 Enterprise: ${d.summary.enterprise}`);
  lines.push('');
  
  // Urgency indicators
  lines.push(`⚡ *Urgency*`);
  if (d.summary.hot > 0) lines.push(`• 🔥 Hot (0-3d): ${d.summary.hot}`);
  if (d.summary.warm > 0) lines.push(`• 🌡️ Warm (4-7d): ${d.summary.warm}`);
  if (d.summary.stale > 0) lines.push(`• ⚠️ Stale (15+d): ${d.summary.stale}`);
  lines.push('');
  
  // Revenue
  lines.push(`💰 *Revenue*`);
  lines.push(`• Current: $${d.revenue.current.toLocaleString()}`);
  lines.push(`• Potential: +$${d.revenue.upside.toLocaleString()}`);
  lines.push('');
  
  // Top 5 priorities
  if (d.priorityLeads.length > 0) {
    lines.push(`🎯 *Top 5 Priorities*`);
    d.priorityLeads.forEach((l, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
      const age = getAgeDays(l.replied_at);
      const ageTag = age <= 3 ? '🔥' : age <= 7 ? '🌡️' : age > 15 ? '⚠️' : '';
      lines.push(`${emoji} ${l.lead_name} @ ${l.lead_company || 'Unknown'} ${ageTag}`);
      lines.push(`   ${l.reply_category} • ${age}d ago • Score: ${l.score}`);
    });
    lines.push('');
  }
  
  // Stale leads needing love
  if (d.staleLeads.length > 0) {
    lines.push(`⏰ *Needs Follow-up*`);
    d.staleLeads.slice(0, 3).forEach(l => {
      const age = getAgeDays(l.replied_at);
      lines.push(`• ${l.lead_name} — ${age} days stale`);
    });
    lines.push('');
  }
  
  // Recent wins
  if (d.recentWins.length > 0) {
    lines.push(`🎉 *Recent Wins*`);
    d.recentWins.forEach(l => {
      lines.push(`• ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
    });
    lines.push('');
  }
  
  // Footer
  lines.push(`_Generated ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}_`);
  
  return lines.join('\n');
}

function formatForSlack(d) {
  const blocks = [];
  
  blocks.push(`*📊 Daily Digest — ${d.dayOfWeek}*`);
  blocks.push('───────────────────');
  blocks.push('');
  blocks.push(`*Pipeline:* ${d.summary.booked}/${d.summary.total} booked (${d.summary.bookingRate}%)`);
  blocks.push(`*Hot:* ${d.summary.hot} 🔥 | *Stale:* ${d.summary.stale} ⚠️`);
  blocks.push(`*Revenue:* $${d.revenue.current.toLocaleString()} (+$${d.revenue.upside.toLocaleString()} potential)`);
  blocks.push('');
  
  if (d.priorityLeads.length > 0) {
    blocks.push('*Top Priorities:*');
    d.priorityLeads.slice(0, 3).forEach((l, i) => {
      blocks.push(`${i + 1}. ${l.lead_name} @ ${l.lead_company} (${l.reply_category})`);
    });
  }
  
  return blocks.join('\n');
}

generateDigest().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
