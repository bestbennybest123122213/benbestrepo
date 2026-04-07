#!/usr/bin/env node
/**
 * Smartlead CLI Campaign Sync
 * 
 * Fetches campaign data via Smartlead CLI and saves to JSON for API
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to run smartlead CLI
function sl(cmd) {
  try {
    const result = execSync(`smartlead ${cmd}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`Error running: smartlead ${cmd}`, e.message);
    return null;
  }
}

async function syncCampaigns() {
  console.log('[CLI-CAMPAIGNS] Starting sync...');
  const today = new Date().toISOString().slice(0, 10);
  
  // Get all campaigns
  const campaigns = sl('campaigns list');
  if (!campaigns) {
    console.error('[CLI-CAMPAIGNS] Failed to fetch campaigns');
    process.exit(1);
  }
  
  // Filter to main campaigns (not follow-ups)
  const mainCampaigns = campaigns.filter(c => !c.parent_campaign_id);
  console.log(`[CLI-CAMPAIGNS] Found ${mainCampaigns.length} main campaigns`);
  
  // Get stats for each campaign
  const campaignStats = [];
  for (const c of mainCampaigns) {
    process.stdout.write('.');
    const stats = sl(`stats campaign --id ${c.id}`);
    if (stats) {
      campaignStats.push({
        id: c.id,
        name: c.name,
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
  console.log(' done!');
  
  // Calculate totals
  const totals = campaignStats.reduce((acc, s) => ({
    leads: acc.leads + s.leads,
    contacted: acc.contacted + s.contacted,
    notContacted: acc.notContacted + s.notContacted,
    blocked: acc.blocked + s.blocked,
    sent: acc.sent + s.sent,
    replies: acc.replies + s.replies,
    bounces: acc.bounces + s.bounces,
    interested: acc.interested + s.interested
  }), { leads: 0, contacted: 0, notContacted: 0, blocked: 0, sent: 0, replies: 0, bounces: 0, interested: 0 });
  
  // Calculate rates
  totals.replyRate = totals.contacted > 0 ? (totals.replies / totals.contacted * 100) : 0;
  totals.positiveRate = totals.replies > 0 ? (totals.interested / totals.replies * 100) : 0;
  totals.bounceRate = totals.sent > 0 ? (totals.bounces / totals.sent * 100) : 0;
  totals.ratio = totals.interested > 0 ? Math.round(totals.leads / totals.interested) : null;
  
  // Add calculated fields to each campaign
  for (const s of campaignStats) {
    s.replyRate = s.contacted > 0 ? (s.replies / s.contacted * 100) : 0;
    s.positiveRate = s.replies > 0 ? (s.interested / s.replies * 100) : 0;
    s.bounceRate = s.sent > 0 ? (s.bounces / s.sent * 100) : 0;
    s.ratio = s.interested > 0 ? Math.round(s.leads / s.interested) : null;
  }
  
  // Time-based performance
  console.log('[CLI-CAMPAIGNS] Fetching time-based stats...');
  const periods = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 180 days', days: 180 }
  ];
  
  const timeBased = [];
  for (const p of periods) {
    const from = new Date(Date.now() - p.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const overall = sl(`analytics overall --from ${from} --to ${today}`);
    const categories = sl(`analytics lead-categories --from ${from} --to ${today}`);
    
    if (overall && categories) {
      const stats = overall.data?.overall_stats || {};
      const positive = (categories.data?.lead_responses_by_category?.leadResponseGrouping || [])
        .filter(c => c.sentiment_type === 'positive')
        .reduce((sum, c) => sum + c.total_response, 0);
      
      timeBased.push({
        label: p.label,
        days: p.days,
        sent: stats.sent || 0,
        replied: stats.replied || 0,
        positive,
        bounced: stats.bounced || 0,
        replyRate: stats.sent > 0 ? (stats.replied / stats.sent * 100) : 0,
        positiveRate: stats.replied > 0 ? (positive / stats.replied * 100) : 0,
        bounceRate: stats.sent > 0 ? (stats.bounced / stats.sent * 100) : 0
      });
    }
  }
  
  // Month-by-month
  console.log('[CLI-CAMPAIGNS] Fetching monthly stats...');
  const now = new Date();
  const monthly = [];
  for (let i = 0; i < 6; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() - i;
    const d = new Date(year, month, 1);
    const firstDay = d.toISOString().slice(0, 10);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    
    const overall = sl(`analytics overall --from ${firstDay} --to ${lastDay}`);
    const categories = sl(`analytics lead-categories --from ${firstDay} --to ${lastDay}`);
    
    if (overall && categories) {
      const stats = overall.data?.overall_stats || {};
      const positive = (categories.data?.lead_responses_by_category?.leadResponseGrouping || [])
        .filter(c => c.sentiment_type === 'positive')
        .reduce((sum, c) => sum + c.total_response, 0);
      
      monthly.push({
        label,
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        sent: stats.sent || 0,
        replied: stats.replied || 0,
        positive,
        bounced: stats.bounced || 0,
        replyRate: stats.sent > 0 ? (stats.replied / stats.sent * 100) : 0,
        positiveRate: stats.replied > 0 ? (positive / stats.replied * 100) : 0,
        bounceRate: stats.sent > 0 ? (stats.bounced / stats.sent * 100) : 0
      });
    }
  }
  
  // Save to file
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'smartlead-cli',
    campaigns: campaignStats,
    totals,
    timeBased,
    monthly,
    summary: {
      totalCampaigns: mainCampaigns.length,
      activeCampaigns: mainCampaigns.filter(c => c.status === 'ACTIVE' || c.status === 'STARTED').length,
      totalLeads: totals.leads,
      totalContacted: totals.contacted,
      totalReplies: totals.replies,
      totalPositive: totals.interested,
      overallRatio: totals.ratio
    }
  };
  
  const outPath = path.join(__dirname, 'data', 'cli-campaigns.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[CLI-CAMPAIGNS] Saved to ${outPath}`);
  console.log(`[CLI-CAMPAIGNS] Summary: ${output.summary.totalCampaigns} campaigns, ${output.summary.totalPositive} positive replies, ratio 1:${output.summary.overallRatio}`);
}

syncCampaigns().catch(console.error);
