#!/usr/bin/env node
/**
 * Dashboard Data Generator
 * 
 * Generates JSON data file for the visual dashboard.
 * Run this to update dashboard data.
 * 
 * Usage:
 *   node generate-dashboard.js          # Generate data
 *   node generate-dashboard.js --open   # Generate and open dashboard
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const OPEN_BROWSER = args.includes('--open');

const OUTPUT_FILE = './dashboard/dashboard-data.json';

async function generateDashboardData() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Get all positive replies
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) {
    console.error('No leads data');
    return;
  }

  // Process leads
  const processed = leads.map(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    return { ...lead, age_days: age };
  });

  // Age distribution
  const ageDistribution = {
    hot: processed.filter(l => l.age_days <= 3 && l.follow_up_status === 'pending').length,
    warm: processed.filter(l => l.age_days > 3 && l.age_days <= 7 && l.follow_up_status === 'pending').length,
    cooling: processed.filter(l => l.age_days > 7 && l.age_days <= 14 && l.follow_up_status === 'pending').length,
    stale: processed.filter(l => l.age_days > 14 && l.follow_up_status === 'pending').length
  };

  // Top leads (hot + warm)
  const pending = processed.filter(l => l.follow_up_status === 'pending' && l.reply_category !== 'Booked');
  const topLeads = pending
    .sort((a, b) => a.age_days - b.age_days)
    .slice(0, 5)
    .map(lead => ({
      name: lead.lead_name,
      email: lead.lead_email,
      company: lead.lead_company,
      category: lead.reply_category,
      age: lead.age_days,
      urgency: lead.age_days <= 3 ? 'hot' : lead.age_days <= 7 ? 'warm' : 'cool'
    }));

  // Stats
  const pendingCount = pending.length;
  const hotLeads = ageDistribution.hot;
  const meetingRequests = leads.filter(l => l.reply_category === 'Meeting Request').length;
  const meetingsBooked = leads.filter(l => l.reply_category === 'Booked' || l.reply_category === 'Meeting Booked').length;
  
  // Average age of pending leads
  const avgAge = pending.length > 0 
    ? Math.round(pending.reduce((sum, l) => sum + l.age_days, 0) / pending.length)
    : 0;

  // Response time (from thread_messages)
  let responseTime = '-';
  try {
    const { data: msgs } = await client
      .from('thread_messages')
      .select('response_time_seconds')
      .eq('is_our_response', true)
      .not('response_time_seconds', 'is', null)
      .gte('sent_at', sevenDaysAgo);
    
    if (msgs && msgs.length > 0) {
      const validTimes = msgs.map(m => m.response_time_seconds).filter(t => t > 0);
      if (validTimes.length > 0) {
        const avgSeconds = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
        if (avgSeconds < 3600) responseTime = Math.round(avgSeconds / 60) + 'm';
        else if (avgSeconds < 86400) responseTime = Math.round(avgSeconds / 3600 * 10) / 10 + 'h';
        else responseTime = Math.floor(avgSeconds / 86400) + 'd';
      }
    }
  } catch (e) {}

  // LDS (Lead Discovery System) stats
  let ldsStats = { totalLeads: 0, hot: 0, warm: 0, cold: 0, connected: false };
  try {
    const LDS_BRIDGE_PATH = '../lead-discovery-system/backend/gex-bridge.js';
    if (fs.existsSync(require.resolve(LDS_BRIDGE_PATH))) {
      const bridge = require(LDS_BRIDGE_PATH);
      const stats = await bridge.getCombinedStats();
      ldsStats = {
        totalLeads: stats.lds.totalLeads || 0,
        hot: stats.lds.byTier?.hot || 0,
        warm: stats.lds.byTier?.warm || 0,
        cold: stats.lds.byTier?.cold || 0,
        connected: true
      };
    }
  } catch (e) {
    // LDS not available - use defaults
  }

  // Deals and commissions
  let pipelineValue = 0;
  let activeDeals = 0;
  let totalCommission = 0;
  let forecast = 0;

  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      const deals = data.deals || data || [];
      activeDeals = deals.length;
      pipelineValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
      forecast = Math.round(pipelineValue * 0.3); // 30% expected conversion
    }
  } catch (e) {}

  try {
    const commPath = './data/commissions.json';
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      const comms = data.commissions || data || [];
      totalCommission = comms.reduce((sum, c) => sum + (c.commission || c.amount || 0), 0);
    }
  } catch (e) {}

  // Weekly trend data (last 7 days)
  const weeklyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().slice(0, 10);
    const dayLeads = leads.filter(l => {
      if (!l.replied_at) return false;
      return l.replied_at.slice(0, 10) === dateStr;
    });
    
    weeklyTrend.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      count: dayLeads.length
    });
  }

  // Get deals for kanban
  let deals = [];
  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      deals = data.deals || data || [];
    }
  } catch (e) {}

  // Build output
  const dashboardData = {
    generatedAt: new Date().toISOString(),
    
    // Key metrics
    pipelineValue,
    hotLeads,
    responseTime,
    pendingLeads: pendingCount,
    
    // Lead list
    topLeads,
    
    // Age distribution
    ageDistribution,
    
    // Velocity
    avgAge,
    meetingRequests,
    meetingsBooked,
    
    // Revenue
    totalCommission,
    activeDeals,
    forecast,
    
    // Deals for kanban
    deals,
    
    // Weekly trend
    weeklyTrend,
    
    // Lead Discovery System integration
    lds: ldsStats
  };

  // Ensure directory exists
  if (!fs.existsSync('./dashboard')) {
    fs.mkdirSync('./dashboard');
  }

  // Write data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dashboardData, null, 2));
  console.log('✅ Dashboard data generated');
  console.log(`   File: ${OUTPUT_FILE}`);
  console.log(`   Hot leads: ${hotLeads}`);
  console.log(`   Pending: ${pendingCount}`);
  console.log(`   Pipeline: $${pipelineValue.toLocaleString()}`);

  // Open browser if requested
  if (OPEN_BROWSER) {
    const htmlPath = require('path').resolve('./dashboard/index.html');
    try {
      if (process.platform === 'darwin') {
        execSync(`open "${htmlPath}"`);
      } else if (process.platform === 'win32') {
        execSync(`start "${htmlPath}"`);
      } else {
        execSync(`xdg-open "${htmlPath}"`);
      }
      console.log('\n🌐 Opened dashboard in browser');
    } catch (e) {
      console.log(`\n📂 Open in browser: file://${htmlPath}`);
    }
  } else {
    const htmlPath = require('path').resolve('./dashboard/index.html');
    console.log(`\n📂 Open dashboard: file://${htmlPath}`);
    console.log('   Or run: gex dashboard --open');
  }
}

generateDashboardData().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
