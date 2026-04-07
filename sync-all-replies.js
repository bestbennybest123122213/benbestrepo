#!/usr/bin/env node
/**
 * Sync All Replies from SmartLead to Supabase
 * 
 * FIXED VERSION - processes incrementally, saves as it goes, with timeouts
 * 
 * Usage:
 *   node sync-all-replies.js           # Full sync (all campaigns)
 *   node sync-all-replies.js --quick   # Quick sync (active campaigns only, limited pagination)
 *   node sync-all-replies.js --campaign=123  # Single campaign sync
 * 
 * Tables populated:
 * - all_replies: Every reply ever received
 * - positive_replies: Only interested/booked replies
 * - response_time_averages: Daily aggregated stats
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

// Parse args
const args = process.argv.slice(2);
const QUICK_MODE = args.includes('--quick');
const SINGLE_CAMPAIGN = args.find(a => a.startsWith('--campaign='))?.split('=')[1];

// Config
const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout per API call
const MAX_STATS_PER_CAMPAIGN = QUICK_MODE ? 500 : 10000; // Limit in quick mode

// Supabase setup
function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// SmartLead API helpers with timeout
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCampaigns() {
  return fetchWithTimeout(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
}

async function getCampaignStatistics(campaignId, limit = 100, offset = 0) {
  return fetchWithTimeout(`${BASE_URL}/campaigns/${campaignId}/statistics?api_key=${API_KEY}&limit=${limit}&offset=${offset}`);
}

// Positive reply categories
const POSITIVE_CATEGORIES = ['Interested', 'Meeting Booked', 'Booked', 'Meeting Request', 'Information Request', 'Demo Request'];

// Process and SAVE a single campaign's replies immediately
async function processCampaignReplies(campaign, totals) {
  const startTime = Date.now();
  
  try {
    // Fetch statistics with pagination (but with limits)
    let allStats = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore && allStats.length < MAX_STATS_PER_CAMPAIGN) {
      const statsResponse = await getCampaignStatistics(campaign.id, limit, offset);
      const stats = Array.isArray(statsResponse) ? statsResponse : (statsResponse.data || []);
      const total = parseInt(statsResponse.total_stats || stats.length);
      
      allStats = allStats.concat(stats);
      offset += limit;
      hasMore = offset < total && allStats.length < MAX_STATS_PER_CAMPAIGN;
      
      if (hasMore) await new Promise(r => setTimeout(r, 50)); // Rate limit
    }
    
    // Filter leads that have replied
    const repliedLeads = allStats.filter(s => 
      (s.reply_time !== null) || 
      (s.lead_category && 
       s.lead_category !== 'Not Replied' && 
       s.lead_category !== null &&
       !s.lead_category.includes('Bounce'))
    );
    
    if (repliedLeads.length === 0) {
      process.stdout.write('.');
      return;
    }
    
    const allReplies = [];
    const positiveReplies = [];
    
    for (const lead of repliedLeads) {
      const replyTime = lead.reply_time ? new Date(lead.reply_time) : new Date(lead.sent_time);
      const sentTime = lead.sent_time ? new Date(lead.sent_time) : null;
      
      let responseTimeSeconds = null;
      if (lead.reply_time && lead.sent_time) {
        responseTimeSeconds = Math.floor((new Date(lead.reply_time) - new Date(lead.sent_time)) / 1000);
      }
      
      const replyRecord = {
        campaign_id: String(campaign.id),
        campaign_name: campaign.name,
        lead_id: lead.stats_id,
        lead_email: lead.lead_email,
        lead_name: lead.lead_name,
        lead_company: null,
        reply_category: lead.lead_category,
        reply_text: null,
        replied_at: replyTime.toISOString(),
        our_email: null,
        our_sent_at: sentTime ? sentTime.toISOString() : null,
        response_time_seconds: responseTimeSeconds,
        smartlead_stats_id: lead.stats_id
      };
      
      allReplies.push(replyRecord);
      totals.allReplies.push(replyRecord); // For final stats
      
      if (POSITIVE_CATEGORIES.includes(lead.lead_category)) {
        positiveReplies.push({
          ...replyRecord,
          follow_up_status: 'pending'
        });
        totals.positiveCount++;
      }
    }
    
    // SAVE IMMEDIATELY - don't accumulate
    if (allReplies.length > 0) {
      const { error } = await supabase
        .from('all_replies')
        .upsert(allReplies, { 
          onConflict: 'campaign_id,lead_id,replied_at',
          ignoreDuplicates: false 
        });
      
      if (error) {
        console.error(`\n❌ ${campaign.name}: ${error.message}`);
      } else {
        totals.savedAll += allReplies.length;
      }
    }
    
    if (positiveReplies.length > 0) {
      const { error } = await supabase
        .from('positive_replies')
        .upsert(positiveReplies, { 
          onConflict: 'campaign_id,lead_id,replied_at',
          ignoreDuplicates: false 
        });
      
      if (!error) {
        totals.savedPositive += positiveReplies.length;
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ ${campaign.name.substring(0, 30).padEnd(30)} | ${repliedLeads.length} replies | ${elapsed}s`);
    
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`\n⏱️ ${campaign.name}: Timeout`);
    } else {
      console.error(`\n❌ ${campaign.name}: ${err.message}`);
    }
  }
}

// Main sync function
async function syncAllReplies() {
  const mode = QUICK_MODE ? '⚡ QUICK' : '🔄 FULL';
  console.log(`${mode} Reply Sync - SmartLead → Supabase\n`);
  
  // Get campaigns
  const campaigns = await getCampaigns();
  let targetCampaigns;
  
  if (SINGLE_CAMPAIGN) {
    targetCampaigns = campaigns.filter(c => String(c.id) === SINGLE_CAMPAIGN);
    if (targetCampaigns.length === 0) {
      console.error(`Campaign ${SINGLE_CAMPAIGN} not found`);
      process.exit(1);
    }
  } else if (QUICK_MODE) {
    // Quick mode: only ACTIVE campaigns
    targetCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
  } else {
    // Full mode: active + completed
    targetCampaigns = campaigns.filter(c => 
      c.status === 'ACTIVE' || c.status === 'COMPLETED'
    );
  }
  
  // Skip follow-up child campaigns
  targetCampaigns = targetCampaigns.filter(c => 
    !(c.name === 'Follow up' && c.parent_campaign_id)
  );
  
  console.log(`Processing ${targetCampaigns.length} campaigns...\n`);
  
  const totals = {
    allReplies: [],
    positiveCount: 0,
    savedAll: 0,
    savedPositive: 0
  };
  
  for (const campaign of targetCampaigns) {
    await processCampaignReplies(campaign, totals);
    await new Promise(r => setTimeout(r, 100)); // Brief pause between campaigns
  }
  
  // Calculate and save response time averages
  const today = new Date().toISOString().split('T')[0];
  const withResponseTime = totals.allReplies.filter(r => r.response_time_seconds && r.response_time_seconds > 0);
  
  const avg = withResponseTime.length > 0 
    ? Math.round(withResponseTime.reduce((a, b) => a + b.response_time_seconds, 0) / withResponseTime.length)
    : 0;
  
  const sortedTimes = withResponseTime.map(r => r.response_time_seconds).sort((a, b) => a - b);
  const median = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;
  
  const averagesRecord = {
    snapshot_date: today,
    avg_overall_seconds: avg,
    avg_our_response_seconds: null,
    avg_their_response_seconds: avg,
    total_conversations: totals.allReplies.length,
    total_messages: totals.allReplies.length,
    fastest_response_seconds: sortedTimes[0] || 0,
    slowest_response_seconds: sortedTimes[sortedTimes.length - 1] || 0,
    median_response_seconds: median
  };
  
  await supabase
    .from('response_time_averages')
    .upsert([averagesRecord], { onConflict: 'snapshot_date' });
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SYNC COMPLETE');
  console.log('='.repeat(50));
  console.log(`Total replies:    ${totals.savedAll}`);
  console.log(`Positive replies: ${totals.savedPositive}`);
  console.log(`Avg response:     ${formatTime(avg)}`);
  console.log(`Median response:  ${formatTime(median)}`);
  
  // Category breakdown
  if (totals.allReplies.length > 0) {
    const byCategory = {};
    for (const r of totals.allReplies) {
      if (POSITIVE_CATEGORIES.includes(r.reply_category)) {
        byCategory[r.reply_category] = (byCategory[r.reply_category] || 0) + 1;
      }
    }
    if (Object.keys(byCategory).length > 0) {
      console.log('\n🎯 Positive by category:');
      for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${cat}: ${count}`);
      }
    }
  }
}

function formatTime(seconds) {
  if (!seconds) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

// Run
syncAllReplies().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
