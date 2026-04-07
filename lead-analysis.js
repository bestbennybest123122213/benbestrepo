#!/usr/bin/env node
/**
 * Lead Analysis - Pattern Recognition
 * 
 * Analyzes lead data to identify patterns and insights.
 * Run overnight to generate strategic recommendations.
 * 
 * Usage:
 *   node lead-analysis.js              # Full analysis
 *   node lead-analysis.js --export     # Save to file
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const EXPORT = args.includes('--export');

async function analyzeLeads() {
  const client = initSupabase();
  if (!client) {
    console.log('Database not available');
    return;
  }

  const now = Date.now();

  // Get all leads
  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  if (!leads || leads.length === 0) {
    console.log('No leads to analyze');
    return;
  }

  // Analysis categories
  const analysis = {
    totalLeads: leads.length,
    byCategory: {},
    byCompanyType: {},
    byDayOfWeek: {},
    byResponseTime: { fast: 0, medium: 0, slow: 0, none: 0 },
    topPerformingCampaigns: {},
    verticalBreakdown: {},
    conversionPatterns: []
  };

  // Known gaming companies for vertical detection
  const gamingKeywords = ['game', 'gaming', 'studio', 'play', 'mobile', 'esport', 'stillfront', 'paradox', 'unity', 'dream11'];
  const techKeywords = ['ai', 'tech', 'software', 'saas', 'app', 'digital'];
  const eduKeywords = ['edu', 'learn', 'school', 'course', 'academy'];

  leads.forEach(lead => {
    // By category
    const cat = lead.reply_category || 'Unknown';
    analysis.byCategory[cat] = (analysis.byCategory[cat] || 0) + 1;

    // By day of week
    if (lead.replied_at) {
      const day = new Date(lead.replied_at).toLocaleDateString('en-US', { weekday: 'long' });
      analysis.byDayOfWeek[day] = (analysis.byDayOfWeek[day] || 0) + 1;
    }

    // By campaign
    if (lead.campaign_name) {
      analysis.topPerformingCampaigns[lead.campaign_name] = 
        (analysis.topPerformingCampaigns[lead.campaign_name] || 0) + 1;
    }

    // Vertical detection
    const companyText = `${lead.lead_company || ''} ${lead.lead_email || ''}`.toLowerCase();
    let vertical = 'Other';
    if (gamingKeywords.some(k => companyText.includes(k))) vertical = 'Gaming';
    else if (techKeywords.some(k => companyText.includes(k))) vertical = 'Tech/AI';
    else if (eduKeywords.some(k => companyText.includes(k))) vertical = 'Education';
    
    analysis.verticalBreakdown[vertical] = (analysis.verticalBreakdown[vertical] || 0) + 1;

    // Response time analysis
    if (lead.response_time_seconds) {
      const hours = lead.response_time_seconds / 3600;
      if (hours < 4) analysis.byResponseTime.fast++;
      else if (hours < 24) analysis.byResponseTime.medium++;
      else analysis.byResponseTime.slow++;
    } else {
      analysis.byResponseTime.none++;
    }
  });

  // Calculate conversion rates by category
  const bookedCategories = ['Booked', 'Meeting Booked'];
  const totalBooked = leads.filter(l => bookedCategories.includes(l.reply_category)).length;
  const meetingRequests = leads.filter(l => l.reply_category === 'Meeting Request').length;
  const interested = leads.filter(l => l.reply_category === 'Interested').length;

  // Find patterns
  const patterns = [];

  // Day of week pattern
  const sortedDays = Object.entries(analysis.byDayOfWeek).sort((a, b) => b[1] - a[1]);
  if (sortedDays.length > 0) {
    patterns.push(`Best response day: ${sortedDays[0][0]} (${sortedDays[0][1]} leads)`);
  }

  // Vertical pattern
  const sortedVerticals = Object.entries(analysis.verticalBreakdown).sort((a, b) => b[1] - a[1]);
  if (sortedVerticals.length > 0) {
    patterns.push(`Top vertical: ${sortedVerticals[0][0]} (${sortedVerticals[0][1]} leads, ${Math.round(sortedVerticals[0][1]/leads.length*100)}%)`);
  }

  // Response time pattern
  const fastRate = Math.round(analysis.byResponseTime.fast / leads.length * 100);
  if (fastRate < 20) {
    patterns.push(`⚠️ Only ${fastRate}% of leads get fast response (<4h). Target: 80%`);
  }

  // Booking rate
  const bookingRate = meetingRequests > 0 ? Math.round(totalBooked / meetingRequests * 100) : 0;
  if (bookingRate < 40) {
    patterns.push(`⚠️ Booking rate is ${bookingRate}%. Many meeting requests not converting.`);
  }

  // Generate report
  let report = `
╔═══════════════════════════════════════════════════════════════════════════╗
║  🔍 LEAD ANALYSIS REPORT                                                  ║
║  Generated: ${new Date().toLocaleString()}
╚═══════════════════════════════════════════════════════════════════════════╝

📊 OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Total leads analyzed: ${analysis.totalLeads}
   Meetings booked: ${totalBooked}
   Meeting requests: ${meetingRequests}
   Interested: ${interested}

📈 BY CATEGORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(analysis.byCategory)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => `   ${cat.padEnd(20)} ${count} (${Math.round(count/leads.length*100)}%)`)
  .join('\n')}

🏢 BY VERTICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(analysis.verticalBreakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([v, count]) => `   ${v.padEnd(20)} ${count} (${Math.round(count/leads.length*100)}%)`)
  .join('\n')}

📅 BY DAY OF WEEK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(analysis.byDayOfWeek)
  .sort((a, b) => b[1] - a[1])
  .map(([day, count]) => `   ${day.padEnd(12)} ${'█'.repeat(Math.round(count/Math.max(...Object.values(analysis.byDayOfWeek))*20))} ${count}`)
  .join('\n')}

⏱️ RESPONSE TIME DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Fast (<4h):     ${analysis.byResponseTime.fast} (${Math.round(analysis.byResponseTime.fast/leads.length*100)}%)
   Medium (4-24h): ${analysis.byResponseTime.medium} (${Math.round(analysis.byResponseTime.medium/leads.length*100)}%)
   Slow (>24h):    ${analysis.byResponseTime.slow} (${Math.round(analysis.byResponseTime.slow/leads.length*100)}%)
   No data:        ${analysis.byResponseTime.none}

💡 KEY PATTERNS & INSIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${patterns.map(p => `   • ${p}`).join('\n')}

🎯 RECOMMENDATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Generate recommendations based on patterns
  const recommendations = [];

  if (sortedVerticals[0] && sortedVerticals[0][0] === 'Gaming') {
    recommendations.push('Gaming is your top vertical. Focus outreach on game studios and mobile publishers.');
  }

  if (bookingRate < 40) {
    recommendations.push('Improve meeting request follow-up. Run "gex book --send" daily.');
  }

  if (fastRate < 20) {
    recommendations.push('Response time is critical. Check "gex hb" multiple times daily.');
  }

  const staleLeads = leads.filter(l => {
    const age = l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age > 14 && l.follow_up_status === 'pending';
  }).length;

  if (staleLeads > 50) {
    recommendations.push(`${staleLeads} stale leads. Consider reactivation campaign with "gex reactivate".`);
  }

  report += '\n' + recommendations.map((r, i) => `   ${i + 1}. ${r}`).join('\n');
  report += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  if (EXPORT) {
    const filename = `./lead-analysis-${new Date().toISOString().slice(0, 10)}.md`;
    fs.writeFileSync(filename, report);
    console.log(`Saved to ${filename}`);
  } else {
    console.log(report);
  }
}

analyzeLeads().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
