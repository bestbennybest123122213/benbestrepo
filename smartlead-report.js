#!/usr/bin/env node
/**
 * Smartlead Campaign Report
 * 
 * Shows: All Campaigns → Time-Based Performance → Month-by-Month
 * With proper totals (not averages of percentages)
 */

const { execSync } = require('child_process');

// Helper to run smartlead CLI
function sl(cmd) {
  try {
    const result = execSync(`smartlead ${cmd}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`Error running: smartlead ${cmd}`);
    return null;
  }
}

// Get date range
const today = new Date().toISOString().slice(0, 10);
const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('📊 SMARTLEAD CAMPAIGN REPORT');
  console.log('═'.repeat(100) + '\n');

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: ALL CAMPAIGNS
  // ═══════════════════════════════════════════════════════════════
  
  console.log('🎯 ALL CAMPAIGNS\n');
  
  const campaigns = sl('campaigns list');
  if (!campaigns) return;
  
  // Filter to main campaigns (not follow-ups which have parent_campaign_id)
  const mainCampaigns = campaigns.filter(c => !c.parent_campaign_id);
  const activeCampaigns = mainCampaigns.filter(c => c.status === 'ACTIVE' || c.status === 'STARTED');
  
  console.log(`Total: ${mainCampaigns.length} campaigns (${activeCampaigns.length} active)\n`);
  
  // Get stats for each campaign
  const campaignStats = [];
  process.stdout.write('Fetching campaign stats');
  
  for (const c of mainCampaigns) {
    process.stdout.write('.');
    const stats = sl(`stats campaign --id ${c.id}`);
    if (stats) {
      campaignStats.push({
        name: c.name.slice(0, 50),
        status: c.status,
        leads: stats.campaign_lead_stats?.total || 0,
        contacted: (stats.campaign_lead_stats?.completed || 0) + (stats.campaign_lead_stats?.inprogress || 0),
        notContacted: stats.campaign_lead_stats?.notStarted || 0,
        blocked: stats.campaign_lead_stats?.blocked || 0,
        sent: stats.sent_count || 0,
        replies: stats.reply_count || 0,
        bounces: stats.bounce_count || 0,
        interested: stats.campaign_lead_stats?.interested || 0
      });
    }
  }
  console.log(' done!\n');
  
  // Calculate totals
  const totals = {
    leads: 0,
    contacted: 0,
    notContacted: 0,
    blocked: 0,
    sent: 0,
    replies: 0,
    bounces: 0,
    interested: 0
  };
  
  for (const s of campaignStats) {
    totals.leads += s.leads;
    totals.contacted += s.contacted;
    totals.notContacted += s.notContacted;
    totals.blocked += s.blocked;
    totals.sent += s.sent;
    totals.replies += s.replies;
    totals.bounces += s.bounces;
    totals.interested += s.interested;
  }
  
  // Print table header
  const header = 'Campaign'.padEnd(52) + 
    'Status'.padEnd(10) + 
    'Leads'.padStart(8) + 
    'Contacted'.padStart(11) + 
    'Sent'.padStart(8) + 
    'Replies'.padStart(9) + 
    'Reply%'.padStart(8) + 
    'Positive'.padStart(10) + 
    'Pos%'.padStart(7) + 
    'Bounce'.padStart(8) + 
    'Ratio'.padStart(12);
  
  console.log('─'.repeat(145));
  console.log(header);
  console.log('─'.repeat(145));
  
  // Print each campaign
  for (const s of campaignStats) {
    const replyRate = s.contacted > 0 ? (s.replies / s.contacted * 100).toFixed(2) : '0.00';
    const posRate = s.replies > 0 ? (s.interested / s.replies * 100).toFixed(1) : '0.0';
    const bounceRate = s.sent > 0 ? (s.bounces / s.sent * 100).toFixed(2) : '0.00';
    const ratio = s.interested > 0 ? `1:${Math.round(s.leads / s.interested)}` : '-';
    
    console.log(
      s.name.padEnd(52) +
      s.status.padEnd(10) +
      String(s.leads).padStart(8) +
      String(s.contacted).padStart(11) +
      String(s.sent).padStart(8) +
      String(s.replies).padStart(9) +
      (replyRate + '%').padStart(8) +
      String(s.interested).padStart(10) +
      (posRate + '%').padStart(7) +
      String(s.bounces).padStart(8) +
      ratio.padStart(12)
    );
  }
  
  // Print totals row
  console.log('─'.repeat(145));
  
  const totalReplyRate = totals.contacted > 0 ? (totals.replies / totals.contacted * 100).toFixed(2) : '0.00';
  const totalPosRate = totals.replies > 0 ? (totals.interested / totals.replies * 100).toFixed(1) : '0.0';
  const totalBounceRate = totals.sent > 0 ? (totals.bounces / totals.sent * 100).toFixed(2) : '0.00';
  const totalRatio = totals.interested > 0 ? `1:${Math.round(totals.leads / totals.interested)}` : '-';
  
  console.log(
    '⭐ TOTALS'.padEnd(52) +
    ''.padEnd(10) +
    String(totals.leads).padStart(8) +
    String(totals.contacted).padStart(11) +
    String(totals.sent).padStart(8) +
    String(totals.replies).padStart(9) +
    (totalReplyRate + '%').padStart(8) +
    String(totals.interested).padStart(10) +
    (totalPosRate + '%').padStart(7) +
    String(totals.bounces).padStart(8) +
    totalRatio.padStart(12)
  );
  console.log('─'.repeat(145));
  
  console.log(`\nContacts breakdown: Added: ${totals.leads} | Contacted: ${totals.contacted} | Not contacted: ${totals.notContacted} | Blocked: ${totals.blocked}`);
  console.log(`Reply Rate: ${totals.replies} / ${totals.contacted} contacted = ${totalReplyRate}%`);
  console.log(`Positive Rate: ${totals.interested} / ${totals.replies} replies = ${totalPosRate}%`);
  console.log(`Bounce Rate: ${totals.bounces} / ${totals.sent} sent = ${totalBounceRate}%`);
  console.log(`Ratio: Need to add ${totalRatio.replace('1:', '')} leads to get 1 positive response`);

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: TIME-BASED PERFORMANCE
  // ═══════════════════════════════════════════════════════════════
  
  console.log('\n\n' + '═'.repeat(100));
  console.log('📈 TIME-BASED PERFORMANCE');
  console.log('═'.repeat(100) + '\n');
  
  // Get overall stats for different periods
  const periods = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 180 days', days: 180 }
  ];
  
  console.log('Period'.padEnd(20) + 'Sent'.padStart(10) + 'Replies'.padStart(10) + 'Reply%'.padStart(10) + 'Positive'.padStart(10) + 'Pos%'.padStart(10) + 'Bounce'.padStart(10) + 'Bounce%'.padStart(10));
  console.log('─'.repeat(90));
  
  for (const p of periods) {
    const from = new Date(Date.now() - p.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const overall = sl(`analytics overall --from ${from} --to ${today}`);
    const categories = sl(`analytics lead-categories --from ${from} --to ${today}`);
    
    if (overall && categories) {
      const stats = overall.data?.overall_stats || {};
      const positive = (categories.data?.lead_responses_by_category?.leadResponseGrouping || [])
        .filter(c => c.sentiment_type === 'positive')
        .reduce((sum, c) => sum + c.total_response, 0);
      
      const replyRate = stats.sent > 0 ? (stats.replied / stats.sent * 100).toFixed(2) : '0.00';
      const posRate = stats.replied > 0 ? (positive / stats.replied * 100).toFixed(1) : '0.0';
      const bounceRate = stats.sent > 0 ? (stats.bounced / stats.sent * 100).toFixed(2) : '0.00';
      
      console.log(
        p.label.padEnd(20) +
        String(stats.sent || 0).padStart(10) +
        String(stats.replied || 0).padStart(10) +
        (replyRate + '%').padStart(10) +
        String(positive).padStart(10) +
        (posRate + '%').padStart(10) +
        String(stats.bounced || 0).padStart(10) +
        (bounceRate + '%').padStart(10)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: MONTH-BY-MONTH
  // ═══════════════════════════════════════════════════════════════
  
  console.log('\n\n' + '═'.repeat(100));
  console.log('📅 MONTH-BY-MONTH BREAKDOWN');
  console.log('═'.repeat(100) + '\n');
  
  // Generate last 6 months
  const months = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() - i;
    const d = new Date(year, month, 1);
    const firstDay = d.toISOString().slice(0, 10);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    months.push({ label, from: firstDay, to: lastDay });
  }
  
  console.log('Month'.padEnd(15) + 'Sent'.padStart(10) + 'Replies'.padStart(10) + 'Reply%'.padStart(10) + 'Positive'.padStart(10) + 'Pos%'.padStart(10) + 'Bounce'.padStart(10) + 'Bounce%'.padStart(10));
  console.log('─'.repeat(85));
  
  for (const m of months) {
    const overall = sl(`analytics overall --from ${m.from} --to ${m.to}`);
    const categories = sl(`analytics lead-categories --from ${m.from} --to ${m.to}`);
    
    if (overall && categories) {
      const stats = overall.data?.overall_stats || {};
      const positive = (categories.data?.lead_responses_by_category?.leadResponseGrouping || [])
        .filter(c => c.sentiment_type === 'positive')
        .reduce((sum, c) => sum + c.total_response, 0);
      
      const replyRate = stats.sent > 0 ? (stats.replied / stats.sent * 100).toFixed(2) : '0.00';
      const posRate = stats.replied > 0 ? (positive / stats.replied * 100).toFixed(1) : '0.0';
      const bounceRate = stats.sent > 0 ? (stats.bounced / stats.sent * 100).toFixed(2) : '0.00';
      
      console.log(
        m.label.padEnd(15) +
        String(stats.sent || 0).padStart(10) +
        String(stats.replied || 0).padStart(10) +
        (replyRate + '%').padStart(10) +
        String(positive).padStart(10) +
        (posRate + '%').padStart(10) +
        String(stats.bounced || 0).padStart(10) +
        (bounceRate + '%').padStart(10)
      );
    }
  }
  
  console.log('\n' + '═'.repeat(100) + '\n');
}

main().catch(console.error);
