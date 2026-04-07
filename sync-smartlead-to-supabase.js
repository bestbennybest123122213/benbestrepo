#!/usr/bin/env node
/**
 * SmartLead → Supabase Sync
 * 
 * Scrapes SmartLead data and stores in Supabase for Bull OS.
 * Designed to run daily via cron.
 * 
 * Usage:
 *   node sync-smartlead-to-supabase.js              # Sync today + missing days
 *   node sync-smartlead-to-supabase.js --full       # Full historical sync
 *   node sync-smartlead-to-supabase.js --date 2026-03-01  # Specific date
 *   node sync-smartlead-to-supabase.js --range 2026-02-01 2026-03-01  # Date range
 *   node sync-smartlead-to-supabase.js --monthly    # Sync monthly aggregates
 *   node sync-smartlead-to-supabase.js --replies    # Sync all replies
 */

require('dotenv').config();

const { initSupabase } = require('./lib/supabase');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

// Parse arguments
const args = process.argv.slice(2);
const FULL_SYNC = args.includes('--full');
const MONTHLY_ONLY = args.includes('--monthly');
const REPLIES_ONLY = args.includes('--replies');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

let SPECIFIC_DATE = null;
let DATE_RANGE = null;

const dateIdx = args.indexOf('--date');
if (dateIdx !== -1 && args[dateIdx + 1]) {
  SPECIFIC_DATE = args[dateIdx + 1];
}

const rangeIdx = args.indexOf('--range');
if (rangeIdx !== -1 && args[rangeIdx + 1] && args[rangeIdx + 2]) {
  DATE_RANGE = { start: args[rangeIdx + 1], end: args[rangeIdx + 2] };
}

// =========================================
// LOGGING
// =========================================

function log(msg) {
  if (VERBOSE) console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logAlways(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// =========================================
// API HELPERS
// =========================================

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function apiRequest(endpoint, retries = 3) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 429) {
        log(`Rate limited, waiting ${attempt * 3}s...`);
        await sleep(attempt * 3000);
        continue;
      }
      
      if (res.status === 502 || res.status === 503) {
        log(`API ${res.status}, retry ${attempt}/${retries}...`);
        await sleep(attempt * 2000);
        continue;
      }
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
      }
      
      return await res.json();
    } catch (error) {
      if (attempt === retries) throw error;
      log(`Request failed, retry ${attempt}/${retries}...`);
      await sleep(1000 * attempt);
    }
  }
}

// =========================================
// FETCH DAILY STATS FROM SMARTLEAD
// =========================================

async function fetchDayStats(date) {
  log(`Fetching stats for ${date}...`);
  
  // Fetch day-wise overall stats (just for this one day)
  const dayWiseData = await apiRequest(`/analytics/day-wise-overall-stats?start_date=${date}&end_date=${date}`);
  const days = dayWiseData?.data?.day_wise_stats || dayWiseData?.day_wise_stats || [];
  
  // Sum up metrics (should be just one day)
  let sent = 0, opened = 0, replied = 0, bounced = 0, unsubscribed = 0;
  for (const day of days) {
    const m = day.email_engagement_metrics || {};
    sent += parseInt(m.sent) || 0;
    opened += parseInt(m.opened) || 0;
    replied += parseInt(m.replied) || parseInt(m.reply) || 0;
    bounced += parseInt(m.bounced) || 0;
    unsubscribed += parseInt(m.unsubscribed) || 0;
  }
  
  // Fetch positive replies from category-wise API
  let positive = 0, interested = 0, meetingRequest = 0, booked = 0;
  try {
    const catResponse = await apiRequest(`/analytics/lead/category-wise-response?start_date=${date}&end_date=${date}`);
    if (catResponse?.success && catResponse?.data?.lead_responses_by_category?.leadResponseGrouping) {
      const grouping = catResponse.data.lead_responses_by_category.leadResponseGrouping;
      for (const cat of grouping) {
        if (cat.sentiment_type === 'positive') {
          const count = cat.total_response || 0;
          positive += count;
          
          if (cat.name === 'Interested') interested = count;
          if (cat.name === 'Meeting Request') meetingRequest = count;
          if (cat.name === 'Booked') booked = count;
        }
      }
    }
  } catch (e) {
    log(`Warning: Could not fetch positive replies for ${date}: ${e.message}`);
  }
  
  // Calculate rates
  const replyRate = sent > 0 ? (replied / sent * 100).toFixed(2) : null;
  const positiveRate = replied > 0 ? (positive / replied * 100).toFixed(2) : null;
  const bounceRate = sent > 0 ? (bounced / sent * 100).toFixed(2) : null;
  
  return {
    stat_date: date,
    sent,
    opened,
    replied,
    bounced,
    unsubscribed,
    positive,
    interested,
    meeting_request: meetingRequest,
    booked,
    reply_rate: replyRate,
    positive_rate: positiveRate,
    bounce_rate: bounceRate,
    source: 'api'
  };
}

// =========================================
// SAVE TO SUPABASE
// =========================================

async function saveDailyStats(client, stats) {
  const { data, error } = await client
    .from('smartlead_daily_stats')
    .upsert(stats, { 
      onConflict: 'stat_date',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error(`Failed to save stats for ${stats.stat_date}:`, error.message);
    return false;
  }
  
  log(`Saved stats for ${stats.stat_date}: sent=${stats.sent}, replied=${stats.replied}, positive=${stats.positive}`);
  return true;
}

async function logScrape(client, type, startTime, success, recordsProcessed, errorMsg = null) {
  const endTime = Date.now();
  await client.from('smartlead_scrape_log').insert({
    scrape_type: type,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success,
    records_processed: recordsProcessed,
    error_message: errorMsg,
    duration_ms: endTime - startTime
  });
}

// =========================================
// GET MISSING DATES
// =========================================

async function getMissingDates(client, startDate, endDate) {
  // Get all dates we already have
  const { data, error } = await client
    .from('smartlead_daily_stats')
    .select('stat_date')
    .gte('stat_date', startDate)
    .lte('stat_date', endDate);
  
  if (error) {
    console.error('Failed to check existing dates:', error.message);
    return [];
  }
  
  const existingDates = new Set(data.map(d => d.stat_date));
  
  // Generate all dates in range
  const allDates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (!existingDates.has(dateStr)) {
      allDates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return allDates;
}

// =========================================
// SYNC MONTHLY AGGREGATES
// =========================================

async function syncMonthlyAggregates(client) {
  logAlways('📅 Syncing monthly aggregates...');
  
  // Get all daily stats grouped by month
  const { data, error } = await client
    .from('smartlead_daily_stats')
    .select('stat_date, sent, opened, replied, bounced, positive');
  
  if (error) {
    console.error('Failed to fetch daily stats:', error.message);
    return 0;
  }
  
  // Group by month
  const monthlyData = {};
  for (const row of data) {
    const month = row.stat_date.substring(0, 7); // '2026-03'
    if (!monthlyData[month]) {
      monthlyData[month] = { sent: 0, opened: 0, replied: 0, bounced: 0, positive: 0, dates: [] };
    }
    monthlyData[month].sent += row.sent || 0;
    monthlyData[month].opened += row.opened || 0;
    monthlyData[month].replied += row.replied || 0;
    monthlyData[month].bounced += row.bounced || 0;
    monthlyData[month].positive += row.positive || 0;
    monthlyData[month].dates.push(row.stat_date);
  }
  
  // Upsert monthly aggregates
  let count = 0;
  for (const [month, stats] of Object.entries(monthlyData)) {
    const replyRate = stats.sent > 0 ? (stats.replied / stats.sent * 100).toFixed(2) : null;
    const positiveRate = stats.replied > 0 ? (stats.positive / stats.replied * 100).toFixed(2) : null;
    const bounceRate = stats.sent > 0 ? (stats.bounced / stats.sent * 100).toFixed(2) : null;
    
    const startDate = stats.dates.sort()[0];
    const endDate = stats.dates.sort().reverse()[0];
    
    const { error: upsertError } = await client
      .from('smartlead_monthly_stats')
      .upsert({
        year_month: month,
        sent: stats.sent,
        opened: stats.opened,
        replied: stats.replied,
        bounced: stats.bounced,
        positive: stats.positive,
        reply_rate: replyRate,
        positive_rate: positiveRate,
        bounce_rate: bounceRate,
        start_date: startDate,
        end_date: endDate
      }, { onConflict: 'year_month' });
    
    if (!upsertError) count++;
  }
  
  logAlways(`✅ Updated ${count} monthly aggregates`);
  return count;
}

// =========================================
// SYNC REPLIES
// =========================================

async function syncReplies(client) {
  logAlways('📬 Syncing replies...');
  
  // Get all campaigns
  const campaigns = await apiRequest('/campaigns?');
  const activeCampaigns = campaigns.filter(c => c.status !== 'DRAFTED' && !c.parent_campaign_id);
  
  let totalReplies = 0;
  let newReplies = 0;
  
  for (const campaign of activeCampaigns) {
    log(`Fetching replies for campaign ${campaign.id} (${campaign.name})...`);
    
    try {
      // Get all leads with replies
      const leads = await apiRequest(`/campaigns/${campaign.id}/leads?offset=0&limit=10000`);
      
      for (const lead of leads || []) {
        if (!lead.reply_count || lead.reply_count === 0) continue;
        
        totalReplies++;
        
        // Check if we already have this lead's replies
        const { data: existing } = await client
          .from('smartlead_replies')
          .select('id')
          .eq('smartlead_lead_id', lead.id)
          .limit(1);
        
        if (existing && existing.length > 0) continue;
        
        // Get reply details
        const isPositive = ['Interested', 'Meeting Request', 'Information Request', 'Booked']
          .includes(lead.lead_category);
        
        const { error } = await client
          .from('smartlead_replies')
          .insert({
            smartlead_lead_id: lead.id,
            smartlead_campaign_id: campaign.id,
            email: lead.email,
            first_name: lead.first_name,
            last_name: lead.last_name,
            company: lead.company_name,
            reply_date: lead.reply_time || new Date().toISOString(),
            category: lead.lead_category,
            sentiment: lead.reply_sentiment_label || (isPositive ? 'positive' : 'neutral'),
            is_positive: isPositive,
            campaign_name: campaign.name,
            raw_data: lead
          });
        
        if (!error) newReplies++;
      }
      
      await sleep(500); // Rate limiting
    } catch (e) {
      console.error(`Error fetching replies for campaign ${campaign.id}:`, e.message);
    }
  }
  
  logAlways(`✅ Synced ${newReplies} new replies (${totalReplies} total checked)`);
  return newReplies;
}

// =========================================
// MAIN SYNC
// =========================================

async function main() {
  const startTime = Date.now();
  logAlways('🚀 Starting SmartLead → Supabase sync...');
  
  if (!API_KEY) {
    console.error('❌ SMARTLEAD_API_KEY not set');
    process.exit(1);
  }
  
  const client = initSupabase();
  if (!client) {
    console.error('❌ Failed to initialize Supabase');
    process.exit(1);
  }
  
  let recordsProcessed = 0;
  
  try {
    // Handle monthly-only mode
    if (MONTHLY_ONLY) {
      recordsProcessed = await syncMonthlyAggregates(client);
      await logScrape(client, 'monthly', startTime, true, recordsProcessed);
      return;
    }
    
    // Handle replies-only mode
    if (REPLIES_ONLY) {
      recordsProcessed = await syncReplies(client);
      await logScrape(client, 'replies', startTime, true, recordsProcessed);
      return;
    }
    
    // Determine date range to sync
    let datesToSync = [];
    
    if (SPECIFIC_DATE) {
      datesToSync = [SPECIFIC_DATE];
    } else if (DATE_RANGE) {
      // Get all dates in range (including existing - for re-sync)
      const current = new Date(DATE_RANGE.start);
      const end = new Date(DATE_RANGE.end);
      while (current <= end) {
        datesToSync.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    } else if (FULL_SYNC) {
      // Sync from Nov 2025 (when data starts) to today
      const startDate = '2025-11-01';
      const endDate = new Date().toISOString().split('T')[0];
      datesToSync = await getMissingDates(client, startDate, endDate);
      logAlways(`📅 Full sync: ${datesToSync.length} days to sync`);
    } else {
      // Default: sync today + any missing days in last 30
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      datesToSync = await getMissingDates(client, thirtyDaysAgo.toISOString().split('T')[0], today);
      
      // Always include today (for updates)
      if (!datesToSync.includes(today)) {
        datesToSync.push(today);
      }
      
      logAlways(`📅 Syncing ${datesToSync.length} days (missing + today)`);
    }
    
    // Sort dates
    datesToSync.sort();
    
    // Sync each day
    for (const date of datesToSync) {
      try {
        const stats = await fetchDayStats(date);
        const saved = await saveDailyStats(client, stats);
        if (saved) recordsProcessed++;
        await sleep(500); // Rate limiting between days
      } catch (e) {
        console.error(`Failed to sync ${date}:`, e.message);
      }
    }
    
    // Update monthly aggregates
    await syncMonthlyAggregates(client);
    
    // Log success
    await logScrape(client, FULL_SYNC ? 'full' : 'daily', startTime, true, recordsProcessed);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logAlways(`✅ Sync complete: ${recordsProcessed} days synced in ${duration}s`);
    
  } catch (e) {
    console.error('❌ Sync failed:', e.message);
    await logScrape(client, FULL_SYNC ? 'full' : 'daily', startTime, false, recordsProcessed, e.message);
    process.exit(1);
  }
}

main();
