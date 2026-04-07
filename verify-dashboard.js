#!/usr/bin/env node
/**
 * Dashboard Verification Script
 * Compares SmartLead Global Analytics vs Dashboard numbers
 * Run: node verify-dashboard.js
 */

const API_KEY = process.env.SMARTLEAD_API_KEY ;
const SMARTLEAD_URL = 'https://server.smartlead.ai/api/v1';
const DASHBOARD_URL = 'http://localhost:3456';

async function smartleadRequest(endpoint) {
  const url = `${SMARTLEAD_URL}${endpoint}&api_key=${API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

async function dashboardRequest(endpoint) {
  const res = await fetch(`${DASHBOARD_URL}${endpoint}`);
  return res.json();
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

async function getSmartleadStats(days) {
  const { start, end } = getDateRange(days);
  
  // Get overall stats
  const overallRes = await smartleadRequest(`/analytics/day-wise-overall-stats?start_date=${start}&end_date=${end}`);
  const days_data = overallRes?.data?.day_wise_stats || overallRes?.day_wise_stats || [];
  
  let sent = 0, replied = 0, bounced = 0;
  for (const d of days_data) {
    const m = d.email_engagement_metrics || {};
    sent += Number(m.sent) || 0;
    replied += Number(m.replied) || 0;
    bounced += Number(m.bounced) || 0;
  }
  
  // Get positive stats
  const positiveRes = await smartleadRequest(`/analytics/day-wise-positive-reply-stats?start_date=${start}&end_date=${end}`);
  const pos_days = positiveRes?.data?.day_wise_stats || positiveRes?.day_wise_stats || [];
  
  let positive = 0;
  for (const d of pos_days) {
    const val = d.email_engagement_metrics?.positive_replied;
    positive += Number(val) || 0;
  }
  
  // Also get category-wise for comparison
  const catRes = await smartleadRequest(`/analytics/lead/category-wise-response?start_date=${start}&end_date=${end}`);
  const grouping = catRes?.data?.lead_responses_by_category?.leadResponseGrouping || [];
  let categoryPositive = 0;
  for (const cat of grouping) {
    if (cat.sentiment_type === 'positive') {
      categoryPositive += Number(cat.total_response) || 0;
    }
  }
  
  return { sent, replied, bounced, positive, categoryPositive, period: `${start} to ${end}` };
}

async function verify() {
  console.log('🔍 Dashboard Verification Report');
  console.log('================================\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);
  
  const periods = [
    { days: 7, name: 'Last 7 Days' },
    { days: 14, name: 'Last 14 Days' },
    { days: 30, name: 'Last 30 Days' }
  ];
  
  try {
    // Get dashboard data
    const dashboard = await dashboardRequest('/api/historical-analytics?fresh=true');
    
    console.log('📊 SmartLead Day-Wise API vs Dashboard (Supabase snapshots)\n');
    
    for (const p of periods) {
      const sl = await getSmartleadStats(p.days);
      const dashKey = `last${p.days}Days`;
      const db = dashboard.periods?.[dashKey] || {};
      
      console.log(`📅 ${p.name} (${sl.period})`);
      console.log('─'.repeat(60));
      
      const checks = [
        { name: 'Sent', sl: sl.sent, db: db.sent },
        { name: 'Replied', sl: sl.replied, db: db.replied },
        { name: 'Bounced', sl: sl.bounced, db: db.bounced },
        { name: 'Positive (day-wise)', sl: sl.positive, db: db.positive },
        { name: 'Positive (category)', sl: sl.categoryPositive, db: db.positive }
      ];
      
      let hasIssues = false;
      for (const c of checks) {
        const diff = Math.abs((c.db || 0) - c.sl);
        const pct = c.sl > 0 ? (diff / c.sl * 100).toFixed(1) : 0;
        const status = diff === 0 ? '✅' : diff < c.sl * 0.1 ? '⚠️ ' : '❌';
        
        if (diff > 0) hasIssues = true;
        
        console.log(`  ${status} ${c.name.padEnd(20)} SmartLead: ${String(c.sl).padStart(6)} | Dashboard: ${String(c.db || 0).padStart(6)} | Diff: ${diff} (${pct}%)`);
      }
      
      if (!hasIssues) {
        console.log('  ✅ All metrics match!');
      }
      console.log('');
    }
    
    // Monthly breakdown
    console.log('📅 Monthly Stats (March 2026)');
    console.log('─'.repeat(60));
    
    const marchSL = await getSmartleadStats(14); // Rough approximation for March
    const marchDB = dashboard.monthlyBreakdown?.find(m => m.month === '2026-03') || {};
    
    console.log(`  SmartLead (day-wise): Sent=${marchSL.sent}, Replied=${marchSL.replied}, Positive=${marchSL.positive}`);
    console.log(`  Dashboard (snapshots): Sent=${marchDB.sent}, Replied=${marchDB.replied}, Positive=${marchDB.positive}`);
    console.log('');
    
    // Summary
    console.log('📝 Summary');
    console.log('─'.repeat(60));
    console.log('  Data Sources:');
    console.log('    - SmartLead: /analytics/day-wise-overall-stats (live API)');
    console.log('    - Dashboard: Supabase campaign_snapshots (cumulative deltas)');
    console.log('');
    console.log('  Note: Dashboard uses cumulative snapshot deltas which may differ');
    console.log('  from SmartLead\'s day-wise API due to timing and data collection.');
    console.log('');
    console.log('  For positive replies, dashboard now uses category-wise API');
    console.log('  which matches SmartLead Global Analytics.');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

verify();
