#!/usr/bin/env node
/**
 * Weekly Performance Report Generator
 * 
 * Generates a comprehensive weekly report for business review.
 * Tracks pipeline health, response times, conversion rates, and trends.
 * 
 * Usage:
 *   node weekly-report.js              # Current week report
 *   node weekly-report.js --last       # Last week's report
 *   node weekly-report.js --export     # Save to file
 *   node weekly-report.js --telegram   # Telegram-formatted output
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const LAST_WEEK = args.includes('--last');
const EXPORT = args.includes('--export');
const TELEGRAM = args.includes('--telegram');

async function generateReport() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const now = new Date();
  
  // Calculate week boundaries
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  let weekStart, weekEnd;
  if (LAST_WEEK) {
    weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - mondayOffset);
    weekEnd.setHours(0, 0, 0, 0);
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 7);
  } else {
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
  }

  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();
  const weekLabel = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + 
                    ' - ' + 
                    new Date(weekEnd.getTime() - 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // 1. New replies this week
  const { data: weekReplies } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', weekStartIso)
    .lt('replied_at', weekEndIso);

  const newRepliesCount = weekReplies?.length || 0;
  const repliesByCategory = {};
  (weekReplies || []).forEach(r => {
    const cat = r.reply_category || 'Unknown';
    repliesByCategory[cat] = (repliesByCategory[cat] || 0) + 1;
  });

  // 2. Meetings booked this week
  const bookedCount = repliesByCategory['Booked'] || repliesByCategory['Meeting Booked'] || 0;
  const meetingRequestCount = repliesByCategory['Meeting Request'] || 0;

  // 3. Response time stats
  const { data: responseTimes } = await client
    .from('thread_messages')
    .select('response_time_seconds')
    .eq('is_our_response', true)
    .not('response_time_seconds', 'is', null)
    .gte('sent_at', weekStartIso)
    .lt('sent_at', weekEndIso);

  let avgResponseTime = 0;
  let fastResponses = 0;
  const validTimes = (responseTimes || []).map(m => m.response_time_seconds).filter(t => t > 0);
  if (validTimes.length > 0) {
    avgResponseTime = Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
    fastResponses = validTimes.filter(t => t < 14400).length; // Under 4 hours
  }
  const fastResponseRate = validTimes.length > 0 ? Math.round((fastResponses / validTimes.length) * 100) : 0;

  // 4. Pipeline snapshot
  const { data: allPending } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked');

  const pendingCount = allPending?.length || 0;
  const nowMs = Date.now();
  const hotLeads = (allPending || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age <= 3;
  }).length;
  const warmLeads = (allPending || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age > 3 && age <= 7;
  }).length;
  const staleLeads = pendingCount - hotLeads - warmLeads;

  // 5. Deals from file
  let dealsValue = 0;
  let dealsCount = 0;
  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const deals = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      if (Array.isArray(deals)) {
        dealsCount = deals.length;
        dealsValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
      } else if (deals.deals && Array.isArray(deals.deals)) {
        dealsCount = deals.deals.length;
        dealsValue = deals.deals.reduce((sum, d) => sum + (d.value || 0), 0);
      }
    }
  } catch (e) {}

  // 6. Commissions from file
  let totalCommission = 0;
  try {
    const commPath = './data/commissions.json';
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      const comms = Array.isArray(data) ? data : (data.commissions || []);
      totalCommission = comms.reduce((sum, c) => sum + (c.commission || c.amount || 0), 0);
    }
  } catch (e) {}

  // 7. Week-over-week comparison (previous week)
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = weekStart;

  const { data: prevReplies } = await client
    .from('positive_replies')
    .select('id')
    .gte('replied_at', prevWeekStart.toISOString())
    .lt('replied_at', prevWeekEnd.toISOString());

  const prevRepliesCount = prevReplies?.length || 0;
  const replyTrend = prevRepliesCount > 0 
    ? Math.round(((newRepliesCount - prevRepliesCount) / prevRepliesCount) * 100)
    : (newRepliesCount > 0 ? 100 : 0);

  // Format helpers
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '—';
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600 * 10) / 10}h`;
    return `${Math.floor(seconds / 86400)}d ${Math.round((seconds % 86400) / 3600)}h`;
  };

  const trendEmoji = (val) => val > 0 ? '📈' : val < 0 ? '📉' : '➡️';

  // Build report
  if (TELEGRAM) {
    // Compact Telegram format
    let report = `📊 *Weekly Report* (${weekLabel})\n\n`;
    report += `*Activity*\n`;
    report += `• New replies: ${newRepliesCount} ${trendEmoji(replyTrend)} ${replyTrend >= 0 ? '+' : ''}${replyTrend}%\n`;
    report += `• Meetings booked: ${bookedCount}\n`;
    report += `• Meeting requests: ${meetingRequestCount}\n\n`;
    report += `*Response Time*\n`;
    report += `• Average: ${formatTime(avgResponseTime)}\n`;
    report += `• Fast (<4h): ${fastResponseRate}%\n\n`;
    report += `*Pipeline*\n`;
    report += `• Hot (0-3d): ${hotLeads}\n`;
    report += `• Warm (4-7d): ${warmLeads}\n`;
    report += `• Stale: ${staleLeads}\n`;
    report += `• Total pending: ${pendingCount}\n\n`;
    report += `*Deals*\n`;
    report += `• Active: ${dealsCount} ($${dealsValue.toLocaleString()})\n`;
    report += `• Historical commission: $${totalCommission.toLocaleString()}`;
    
    return report;
  }

  // Full console format
  let report = `
╔═══════════════════════════════════════════════════════════════════════════╗
║  📊 WEEKLY PERFORMANCE REPORT                                             ║
║  ${weekLabel.padEnd(71)}║
╚═══════════════════════════════════════════════════════════════════════════╝

📬 ACTIVITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   New replies:        ${newRepliesCount} ${trendEmoji(replyTrend)} ${replyTrend >= 0 ? '+' : ''}${replyTrend}% vs last week
   Meetings booked:    ${bookedCount}
   Meeting requests:   ${meetingRequestCount}
   Other interested:   ${repliesByCategory['Interested'] || 0}

⏱️  RESPONSE TIME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Average:            ${formatTime(avgResponseTime)} ${avgResponseTime > 14400 ? '⚠️ (target: <4h)' : '✅'}
   Fast responses:     ${fastResponseRate}% under 4 hours
   Total responses:    ${validTimes.length}

📊 PIPELINE HEALTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔴 Hot (0-3 days):   ${hotLeads} leads
   🟡 Warm (4-7 days):  ${warmLeads} leads
   ⚪ Stale (8+ days):  ${staleLeads} leads
   ━━━━━━━━━━━━━━━━━━━━
   Total pending:      ${pendingCount} leads

💰 DEALS & REVENUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Active deals:       ${dealsCount}
   Pipeline value:     $${dealsValue.toLocaleString()}
   Historical comm:    $${totalCommission.toLocaleString()}

🎯 KEY INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Add insights based on data
  const insights = [];
  
  if (avgResponseTime > 86400) {
    insights.push('   ⚠️  Response time is over 1 day. Focus on faster follow-ups.');
  } else if (avgResponseTime > 14400) {
    insights.push('   ⚠️  Response time is over 4 hours. Aim for same-day responses.');
  } else if (avgResponseTime > 0) {
    insights.push('   ✅ Response time is good. Keep it up.');
  }

  if (hotLeads === 0 && warmLeads === 0) {
    insights.push('   ℹ️  No hot/warm leads. Focus on lead generation.');
  } else if (hotLeads > 0) {
    insights.push(`   🔥 ${hotLeads} hot leads need immediate attention.`);
  }

  if (staleLeads > 50) {
    insights.push(`   ⚠️  ${staleLeads} stale leads. Consider reactivation campaign.`);
  }

  if (replyTrend < -20) {
    insights.push('   📉 Replies down significantly. Check outreach volume.');
  } else if (replyTrend > 20) {
    insights.push('   📈 Replies up. Capitalize on momentum.');
  }

  if (insights.length === 0) {
    insights.push('   ✅ Pipeline looks healthy. Stay consistent.');
  }

  report += '\n' + insights.join('\n');
  report += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  report += `\nGenerated: ${now.toLocaleString('en-GB')}`;

  return report;
}

async function main() {
  try {
    const report = await generateReport();
    
    if (EXPORT) {
      const filename = `./weekly-report-${new Date().toISOString().slice(0, 10)}.md`;
      fs.writeFileSync(filename, report);
      console.log(`Saved to ${filename}`);
    } else {
      console.log(report);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
