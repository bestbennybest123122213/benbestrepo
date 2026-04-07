#!/usr/bin/env node
/**
 * Daily Morning Brief Generator
 * Sends a summary to Jan at 8 AM Warsaw time
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function generateMorningBrief() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterday.toISOString();

  // 1. New positive replies in last 24h
  const { data: newReplies, error: repliesErr } = await client
    .from('positive_replies')
    .select('id, lead_email, lead_name, lead_company, reply_category, replied_at, response_time_seconds')
    .gte('replied_at', yesterdayIso)
    .order('replied_at', { ascending: false });
  
  if (repliesErr) console.error('Replies error:', repliesErr.message);

  // 2. Pending leads waiting >24h
  const over24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count: waitingCount, error: waitingErr } = await client
    .from('positive_replies')
    .select('id', { count: 'exact', head: true })
    .eq('follow_up_status', 'pending')
    .lte('replied_at', over24hIso);

  if (waitingErr) console.error('Waiting error:', waitingErr.message);

  // 3. Hottest leads (Booked or Meeting Request, most recent)
  const { data: hotLeads, error: hotErr } = await client
    .from('positive_replies')
    .select('id, lead_email, lead_name, lead_company, reply_category, replied_at')
    .in('reply_category', ['Booked', 'Meeting Request', 'Interested'])
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false })
    .limit(5);

  if (hotErr) console.error('Hot leads error:', hotErr.message);

  // 4. Response time stats (last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { data: recentMessages, error: msgErr } = await client
    .from('thread_messages')
    .select('response_time_seconds')
    .eq('is_our_response', true)
    .not('response_time_seconds', 'is', null)
    .gte('sent_at', sevenDaysAgo.toISOString());

  let avgResponseTime = 0;
  if (!msgErr && recentMessages?.length > 0) {
    const validTimes = recentMessages
      .map(m => m.response_time_seconds)
      .filter(t => t > 0);
    if (validTimes.length > 0) {
      avgResponseTime = Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
    }
  }

  // 5. Domain health check
  let domainsWarning = 0;
  try {
    const { data: accounts, error: accErr } = await client
      .from('email_accounts')
      .select('warmup_reputation')
      .not('warmup_reputation', 'is', null);
    
    if (!accErr && accounts) {
      domainsWarning = accounts.filter(a => 
        a.warmup_reputation && parseFloat(a.warmup_reputation) < 70
      ).length;
    }
  } catch (e) {
    console.error('Domain check error:', e.message);
  }

  // Format time helper
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600 * 10) / 10}h`;
    return `${Math.floor(seconds / 86400)}d ${Math.round((seconds % 86400) / 3600)}h`;
  };

  // Build the brief
  const newCount = newReplies?.length || 0;
  const hotCount = hotLeads?.length || 0;
  const waiting = waitingCount || 0;

  let brief = `☀️ **Morning Brief** — ${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}\n\n`;

  // New leads section
  if (newCount > 0) {
    brief += `🆕 **${newCount} new replies** in last 24h\n`;
    const categories = {};
    newReplies.forEach(r => {
      const cat = r.reply_category || 'Unknown';
      categories[cat] = (categories[cat] || 0) + 1;
    });
    Object.entries(categories).forEach(([cat, count]) => {
      brief += `   • ${cat}: ${count}\n`;
    });
    brief += '\n';
  } else {
    brief += `🆕 No new replies in last 24h\n\n`;
  }

  // Hot leads (deduplicated by email)
  if (hotCount > 0) {
    const seenEmails = new Set();
    const uniqueHotLeads = (hotLeads || []).filter(lead => {
      const email = (lead.lead_email || '').toLowerCase();
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });
    
    brief += `🔥 **Top ${uniqueHotLeads.length} Hot Leads:**\n`;
    uniqueHotLeads.forEach((lead, i) => {
      const name = lead.lead_name || lead.lead_email?.split('@')[0] || 'Unknown';
      const company = lead.lead_company ? ` @ ${lead.lead_company}` : '';
      const cat = lead.reply_category || 'Interested';
      const emoji = cat === 'Booked' ? '📅' : cat === 'Meeting Request' ? '🤝' : '👀';
      brief += `${i + 1}. ${emoji} ${name}${company} (${cat})\n`;
    });
    brief += '\n';
  }

  // Stats
  brief += `📊 **Stats:**\n`;
  brief += `   • Avg response time (7d): ${formatTime(avgResponseTime)}`;
  if (avgResponseTime > 14400) brief += ' ⚠️';
  brief += '\n';
  brief += `   • Waiting >24h: ${waiting}`;
  if (waiting > 50) brief += ' 🔴';
  else if (waiting > 20) brief += ' 🟡';
  brief += '\n';
  
  if (domainsWarning > 0) {
    brief += `   • Domains <70% reputation: ${domainsWarning} ⚠️\n`;
  }

  brief += `\n🎯 **Focus:** Respond to hot leads first, clear the backlog.`;

  return brief;
}

// Run and output
async function main() {
  try {
    const brief = await generateMorningBrief();
    console.log(brief);
    return brief;
  } catch (error) {
    console.error('Morning brief error:', error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { generateMorningBrief };

// Run if called directly
if (require.main === module) {
  main();
}
