#!/usr/bin/env node
/**
 * Generate daily report for Jan
 * Summarizes key metrics, positive replies, and campaign performance
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return 'N/A';
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + 'h';
  return (seconds / 86400).toFixed(1) + 'd';
}

async function generateReport() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Get positive replies summary
  const { data: allReplies } = await supabase
    .from('positive_replies')
    .select('*');

  const { data: pendingReplies } = await supabase
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false });

  const { data: recentReplies } = await supabase
    .from('positive_replies')
    .select('*')
    .gte('replied_at', yesterday)
    .order('replied_at', { ascending: false });

  // Get response time averages
  const { data: responseTimeData } = await supabase
    .from('response_time_averages')
    .select('*')
    .eq('snapshot_date', today)
    .single();

  // Count by category
  const byCategory = {};
  for (const r of allReplies || []) {
    const cat = r.reply_category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // Count pending by category
  const pendingByCategory = {};
  for (const r of pendingReplies || []) {
    const cat = r.reply_category || 'Unknown';
    pendingByCategory[cat] = (pendingByCategory[cat] || 0) + 1;
  }

  // Get hot leads (most urgent to follow up)
  const hotLeads = (pendingReplies || [])
    .filter(r => r.reply_category === 'Booked' || r.reply_category === 'Meeting Request')
    .slice(0, 10);

  // Build report
  let report = `
📊 **DAILY LEAD GEN REPORT**
📅 ${today}

━━━━━━━━━━━━━━━━━━━━━━

🎯 **POSITIVE REPLIES SUMMARY**
• Total positive: ${allReplies?.length || 0}
• Pending follow-up: ${pendingReplies?.length || 0}
• New since yesterday: ${recentReplies?.length || 0}

📋 **BY CATEGORY (Total)**
`;

  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    const emoji = cat === 'Booked' ? '🎉' :
                  cat === 'Meeting Request' ? '📅' :
                  cat === 'Information Request' ? '❓' : '✨';
    report += `${emoji} ${cat}: ${count}\n`;
  }

  report += `
⏳ **PENDING BY CATEGORY**
`;

  for (const [cat, count] of Object.entries(pendingByCategory).sort((a, b) => b[1] - a[1])) {
    report += `• ${cat}: ${count}\n`;
  }

  if (responseTimeData) {
    report += `
⏱️ **RESPONSE TIMES**
• Average: ${formatTime(responseTimeData.avg_their_response_seconds)}
• Median: ${formatTime(responseTimeData.median_response_seconds)}
• Fastest: ${formatTime(responseTimeData.fastest_response_seconds)}
• Slowest: ${formatTime(responseTimeData.slowest_response_seconds)}
`;
  }

  if (hotLeads.length > 0) {
    report += `
🔥 **HOT LEADS TO FOLLOW UP**
`;
    for (const lead of hotLeads) {
      const daysAgo = Math.floor((Date.now() - new Date(lead.replied_at)) / (1000 * 60 * 60 * 24));
      const urgency = daysAgo === 0 ? '🔴' : daysAgo <= 1 ? '🟠' : daysAgo <= 3 ? '🟡' : '⚪';
      report += `${urgency} ${lead.lead_name || 'Unknown'} (${lead.lead_email})
   ${lead.reply_category} • ${daysAgo === 0 ? 'Today' : daysAgo + 'd ago'}
   ${(lead.campaign_name || '').substring(0, 40)}...\n\n`;
    }
  }

  report += `
━━━━━━━━━━━━━━━━━━━━━━

📍 **QUICK ACTIONS**
• Dashboard: http://localhost:3456
• Export pending: http://localhost:3456/api/replies/export?status=pending

💪 Keep closing!
`;

  return report;
}

// Run if called directly
if (require.main === module) {
  generateReport().then(report => {
    console.log(report);
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { generateReport };
