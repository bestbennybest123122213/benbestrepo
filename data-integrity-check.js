#!/usr/bin/env node
/**
 * Data Integrity Checker
 * Automatically verifies all dashboard numbers match SmartLead API
 * Run daily to catch discrepancies before they're noticed
 */

// Use built-in fetch (Node 18+)

const API_KEY = process.env.SMARTLEAD_API_KEY ;
const DASHBOARD_URL = 'http://localhost:3456';
const SMARTLEAD_URL = 'https://server.smartlead.ai/api/v1';

async function apiRequest(endpoint) {
  const res = await fetch(`${SMARTLEAD_URL}${endpoint}&api_key=${API_KEY}`);
  return res.json();
}

async function dashboardRequest(endpoint) {
  const res = await fetch(`${DASHBOARD_URL}${endpoint}`);
  return res.json();
}

async function runChecks() {
  console.log('🔍 Running Data Integrity Checks...\n');
  const issues = [];
  
  try {
    // Get dashboard data
    const dashboard = await dashboardRequest('/api/campaign-analytics-v2?force=true');
    
    // Get all campaigns from SmartLead directly
    const campaigns = await apiRequest('/campaigns?');
    const nonDraft = campaigns.filter(c => c.status !== 'DRAFTED' && !c.parent_campaign_id);
    
    // Calculate totals from SmartLead campaigns
    let slTotalSent = 0;
    let slTotalReplied = 0;
    let slTotalPositive = 0;
    let slTotalContacted = 0;
    
    for (const c of nonDraft) {
      const analytics = await apiRequest(`/campaigns/${c.id}/analytics?`);
      slTotalSent += parseInt(analytics.sent_count) || 0;
      slTotalReplied += parseInt(analytics.reply_count) || 0;
      slTotalPositive += parseInt(analytics.campaign_lead_stats?.interested) || 0;
      slTotalContacted += parseInt(analytics.unique_sent_count) || 0;
    }
    
    // Compare totals
    const checks = [
      {
        name: 'Total Sent',
        dashboard: dashboard.ericFramework.totalSent,
        smartlead: slTotalSent,
        tolerance: 0
      },
      {
        name: 'Total Positive',
        dashboard: dashboard.ericFramework.totalPositive,
        smartlead: slTotalPositive,
        tolerance: 0
      },
      {
        name: 'Total Replied',
        dashboard: dashboard.ericFramework.totalReplied,
        smartlead: slTotalReplied,
        tolerance: 0
      },
      {
        name: 'Total Contacted',
        dashboard: dashboard.monthlyStats.totals.contacted,
        smartlead: slTotalContacted,
        tolerance: 0
      },
      {
        name: 'Campaign Count',
        dashboard: dashboard.campaigns.length,
        smartlead: nonDraft.length,
        tolerance: 0
      }
    ];
    
    // Run checks
    for (const check of checks) {
      const diff = Math.abs(check.dashboard - check.smartlead);
      const status = diff <= check.tolerance ? '✅' : '❌';
      console.log(`${status} ${check.name}: Dashboard=${check.dashboard}, SmartLead=${check.smartlead}`);
      
      if (diff > check.tolerance) {
        issues.push({
          name: check.name,
          dashboard: check.dashboard,
          smartlead: check.smartlead,
          diff: diff
        });
      }
    }
    
    // Check recent data (yesterday)
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0];
    const yesterdayStats = dashboard.timeBasedStats.yesterday;
    
    console.log(`\n📅 Yesterday (${yesterday}):`);
    console.log(`   Sent: ${yesterdayStats.sent}`);
    console.log(`   Replied: ${yesterdayStats.replied}`);
    console.log(`   Positive: ${yesterdayStats.positive}`);
    
    if (yesterdayStats.sent === 0 && new Date().getDay() !== 0 && new Date().getDay() !== 1) {
      issues.push({ name: 'Yesterday Sent is 0 (not weekend)', value: 0 });
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    if (issues.length === 0) {
      console.log('✅ All checks passed! Data integrity verified.');
    } else {
      console.log(`❌ ${issues.length} issue(s) found:`);
      issues.forEach(i => console.log(`   - ${i.name}: diff=${i.diff || 'N/A'}`));
    }
    
    return { success: issues.length === 0, issues };
    
  } catch (err) {
    console.error('Error running checks:', err.message);
    return { success: false, error: err.message };
  }
}

// Run if called directly
if (require.main === module) {
  runChecks().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runChecks };
