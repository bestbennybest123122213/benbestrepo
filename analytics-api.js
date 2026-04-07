#!/usr/bin/env node
/**
 * Analytics API
 * 
 * Provides rich analytics data for the dashboard:
 * - Pipeline metrics
 * - Time-series data
 * - Segment breakdowns
 * - Trend analysis
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function getPipelineAnalytics() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
  const getWeek = (d) => {
    const date = new Date(d);
    const onejan = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  };

  // === FUNNEL DATA ===
  const funnel = {
    total: leads.length,
    replied: leads.length, // All are positive replies
    interested: leads.filter(l => ['Interested', 'Meeting Request', 'Booked'].includes(l.reply_category)).length,
    meetings: leads.filter(l => ['Meeting Request', 'Booked'].includes(l.reply_category)).length,
    booked: leads.filter(l => l.reply_category === 'Booked').length
  };

  // === CATEGORY BREAKDOWN ===
  const categories = {
    'Meeting Request': leads.filter(l => l.reply_category === 'Meeting Request').length,
    'Interested': leads.filter(l => l.reply_category === 'Interested').length,
    'Information Request': leads.filter(l => l.reply_category === 'Information Request').length,
    'Booked': leads.filter(l => l.reply_category === 'Booked').length
  };

  // === AGE DISTRIBUTION ===
  const ageDistribution = {
    hot: leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked').length,
    warm: leads.filter(l => getAge(l) > 3 && getAge(l) <= 7 && l.reply_category !== 'Booked').length,
    cool: leads.filter(l => getAge(l) > 7 && getAge(l) <= 14 && l.reply_category !== 'Booked').length,
    stale: leads.filter(l => getAge(l) > 14 && getAge(l) <= 30 && l.reply_category !== 'Booked').length,
    cold: leads.filter(l => getAge(l) > 30 && l.reply_category !== 'Booked').length
  };

  // === TIER BREAKDOWN ===
  const tiers = {
    enterprise: 0,
    midMarket: 0,
    smb: 0
  };
  
  leads.filter(l => l.reply_category !== 'Booked').forEach(l => {
    const info = getCompanyInfo(l.lead_email);
    if (info?.tier === 'enterprise') tiers.enterprise++;
    else if (info?.tier === 'mid-market') tiers.midMarket++;
    else tiers.smb++;
  });

  // === WEEKLY TREND ===
  const weeklyData = {};
  leads.forEach(l => {
    if (!l.replied_at) return;
    const week = getWeek(l.replied_at);
    if (!weeklyData[week]) {
      weeklyData[week] = { replies: 0, booked: 0 };
    }
    weeklyData[week].replies++;
    if (l.reply_category === 'Booked') weeklyData[week].booked++;
  });

  const weeks = Object.keys(weeklyData).sort().slice(-8);
  const weeklyTrend = {
    labels: weeks.map(w => `W${w}`),
    replies: weeks.map(w => weeklyData[w].replies),
    booked: weeks.map(w => weeklyData[w].booked)
  };

  // === DAILY RESPONSES (last 7 days) ===
  const dailyData = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    dailyData[key] = 0;
  }
  
  leads.forEach(l => {
    if (!l.replied_at) return;
    const key = l.replied_at.slice(0, 10);
    if (dailyData[key] !== undefined) dailyData[key]++;
  });

  const dailyTrend = {
    labels: Object.keys(dailyData).map(d => dayNames[new Date(d).getDay()]),
    values: Object.values(dailyData)
  };

  // === KEY METRICS ===
  const metrics = {
    total: leads.length,
    booked: funnel.booked,
    bookingRate: ((funnel.booked / leads.length) * 100).toFixed(1),
    meetings: categories['Meeting Request'],
    meetingConversionRate: (funnel.booked / (categories['Meeting Request'] + funnel.booked) * 100).toFixed(1),
    hot: ageDistribution.hot,
    stale: ageDistribution.stale + ageDistribution.cold,
    enterprise: tiers.enterprise,
    avgAge: leads.filter(l => l.reply_category !== 'Booked')
      .reduce((sum, l) => sum + getAge(l), 0) / (leads.length - funnel.booked) || 0
  };

  // === VELOCITY METRICS ===
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const velocity = {
    fastResponseRate: ((ageDistribution.hot / unbooked.length) * 100).toFixed(1),
    staleRate: (((ageDistribution.stale + ageDistribution.cold) / unbooked.length) * 100).toFixed(1),
    targetFastRate: 80,
    targetStaleRate: 20
  };

  return {
    funnel,
    categories,
    ageDistribution,
    tiers,
    weeklyTrend,
    dailyTrend,
    metrics,
    velocity,
    timestamp: new Date().toISOString()
  };
}

// API endpoint handler
async function handleRequest() {
  try {
    const analytics = await getPipelineAnalytics();
    console.log(JSON.stringify(analytics, null, 2));
    return analytics;
  } catch (error) {
    console.error('Error:', error.message);
    return { error: error.message };
  }
}

module.exports = { getPipelineAnalytics };

if (require.main === module) {
  handleRequest();
}
