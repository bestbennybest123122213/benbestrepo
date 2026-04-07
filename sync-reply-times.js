#!/usr/bin/env node
/**
 * Sync Reply Times to Supabase
 * 
 * Tracks response times - how fast we reply to leads after they respond.
 * Uses SmartLead statistics endpoint with email_status=replied filter.
 * 
 * Features:
 * - Fetches all replied leads from SmartLead
 * - Calculates response times for each conversation
 * - Stores in Supabase for historical tracking
 * - Computes daily and weekly aggregates
 * 
 * Usage:
 *   node sync-reply-times.js           # Normal sync
 *   node sync-reply-times.js --full    # Full resync (all campaigns)
 *   node sync-reply-times.js --verify  # Verify data only
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

const delay = ms => new Promise(r => setTimeout(r, ms));

// CLI args
const args = process.argv.slice(2);
const FULL_SYNC = args.includes('--full');
const VERIFY_ONLY = args.includes('--verify');

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  Retry ${i + 1}/${retries}...`);
      await delay(1000 * (i + 1));
    }
  }
}

async function getAllCampaigns() {
  const data = await fetchWithRetry(`${BASE_URL}/campaigns/?api_key=${API_KEY}`);
  return data.filter(c => c.status === 'ACTIVE' || c.status === 'COMPLETED');
}

async function getRepliedStats(campaignId) {
  const allReplies = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const data = await fetchWithRetry(
      `${BASE_URL}/campaigns/${campaignId}/statistics?api_key=${API_KEY}&email_status=replied&limit=${limit}&offset=${offset}`
    );
    
    if (!data.data || data.data.length === 0) break;
    allReplies.push(...data.data);
    
    offset += limit;
    if (offset >= parseInt(data.total_stats)) break;
    
    await delay(100);
  }
  
  return allReplies;
}

async function getLeadId(campaignId, email) {
  // Search through leads to find by email
  const limit = 100;
  let offset = 0;
  const maxSearch = 5000;
  
  while (offset < maxSearch) {
    const data = await fetchWithRetry(
      `${BASE_URL}/campaigns/${campaignId}/leads?api_key=${API_KEY}&limit=${limit}&offset=${offset}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    for (const l of data.data) {
      if (l.lead.email === email) {
        return { leadId: l.lead.id, leadData: l };
      }
    }
    
    offset += limit;
    if (offset >= data.total_leads) break;
    await delay(50);
  }
  
  return null;
}

async function getMessageHistory(campaignId, leadId) {
  try {
    const data = await fetchWithRetry(
      `${BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${API_KEY}`
    );
    return data.history || [];
  } catch (err) {
    return [];
  }
}

function calculateOurResponseTimes(messages) {
  const sorted = [...messages].sort((a, b) => 
    new Date(a.time) - new Date(b.time)
  );
  
  const responses = [];
  let lastTheirMessage = null;
  
  for (const msg of sorted) {
    if (msg.type === 'REPLY') {
      lastTheirMessage = msg;
    } else if (msg.type === 'SENT' && lastTheirMessage) {
      const theirTime = new Date(lastTheirMessage.time);
      const ourTime = new Date(msg.time);
      const diffSeconds = Math.floor((ourTime - theirTime) / 1000);
      
      // Ignore negative or extremely long (>30 days)
      if (diffSeconds > 0 && diffSeconds < 86400 * 30) {
        responses.push({
          their_time: lastTheirMessage.time,
          their_stats_id: lastTheirMessage.stats_id,
          our_time: msg.time,
          our_stats_id: msg.stats_id,
          response_seconds: diffSeconds,
          day_of_week: ourTime.getDay(), // 0=Sun, 6=Sat
          hour_of_day: ourTime.getHours()
        });
      }
      lastTheirMessage = null;
    }
  }
  
  return responses;
}

function categorizeTime(seconds) {
  if (seconds <= 300) return 'under_5min';
  if (seconds <= 900) return 'under_15min';
  if (seconds <= 3600) return 'under_1hr';
  if (seconds <= 10800) return 'under_3hr';
  if (seconds <= 86400) return 'under_24hr';
  return 'over_24hr';
}

function getWeekOfMonth(date) {
  const d = new Date(date);
  return Math.ceil(d.getDate() / 7);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

async function verifyData() {
  console.log('\n[VERIFY] Checking SmartLead data...\n');
  
  const campaigns = await getAllCampaigns();
  let totalReplies = 0;
  let totalInterested = 0;
  
  console.log('Campaign'.padEnd(45) + ' | Replies | Interested');
  console.log('-'.repeat(70));
  
  for (const c of campaigns) {
    const analytics = await fetchWithRetry(`${BASE_URL}/campaigns/${c.id}/analytics?api_key=${API_KEY}`);
    const replies = parseInt(analytics.reply_count) || 0;
    const interested = analytics.campaign_lead_stats?.interested || 0;
    
    totalReplies += replies;
    totalInterested += interested;
    
    if (replies > 0) {
      console.log(c.name.substring(0, 44).padEnd(45) + ' | ' + String(replies).padStart(7) + ' | ' + String(interested).padStart(10));
    }
    await delay(100);
  }
  
  console.log('-'.repeat(70));
  console.log('TOTAL'.padEnd(45) + ' | ' + String(totalReplies).padStart(7) + ' | ' + String(totalInterested).padStart(10));
  console.log('\n[VERIFY] Complete');
}

async function syncReplies() {
  console.log('[Reply Sync] Starting...');
  console.log(`[Reply Sync] Mode: ${FULL_SYNC ? 'Full sync' : 'Normal'}`);
  
  const client = initSupabase();
  if (!client) {
    console.error('[Reply Sync] Failed to init Supabase');
    return;
  }
  
  // Test table access
  const { error: testErr } = await client.from('conversation_threads').select('id').limit(1);
  if (testErr) {
    console.error('\n❌ Tables not found! Please create them in Supabase:');
    console.error('   Run the SQL from REPLY_TRACKING_SCHEMA.sql in Supabase dashboard');
    console.error('   URL: https://supabase.com/dashboard/project/rwhqshjmngkyremwandx/sql/new\n');
    return;
  }
  
  const campaigns = await getAllCampaigns();
  console.log(`[Reply Sync] Found ${campaigns.length} campaigns`);
  
  const allResponseTimes = [];
  let totalThreads = 0;
  let totalMessages = 0;
  let processedLeads = 0;
  
  // Positive reply categories to track
  const positiveCategories = ['Meeting Request', 'Booked', 'Interested', 'Information Request', 'Subsequence', null];
  
  for (const campaign of campaigns) {
    console.log(`\n[Campaign] ${campaign.name.substring(0, 50)} (ID: ${campaign.id})`);
    
    // Get replied leads via statistics endpoint
    const repliedStats = await getRepliedStats(campaign.id);
    console.log(`  Total replied: ${repliedStats.length}`);
    
    if (repliedStats.length === 0) continue;
    
    // Filter for positive/relevant categories
    const relevantReplies = repliedStats.filter(r => 
      positiveCategories.includes(r.lead_category)
    );
    console.log(`  Relevant for tracking: ${relevantReplies.length}`);
    
    // Process (limit per campaign to avoid rate limits)
    const toProcess = FULL_SYNC ? relevantReplies : relevantReplies.slice(0, 30);
    let processed = 0;
    
    for (const reply of toProcess) {
      processed++;
      if (processed % 10 === 0) {
        console.log(`    Processing ${processed}/${toProcess.length}...`);
      }
      
      // Find lead ID
      const leadInfo = await getLeadId(campaign.id, reply.lead_email);
      if (!leadInfo) {
        continue;
      }
      
      const { leadId, leadData } = leadInfo;
      
      // Get message history
      const messages = await getMessageHistory(campaign.id, leadId);
      if (messages.length === 0) continue;
      
      // Calculate our response times
      const ourResponses = calculateOurResponseTimes(messages);
      
      // Upsert thread
      const threadData = {
        campaign_id: String(campaign.id),
        campaign_name: campaign.name,
        lead_id: String(leadId),
        lead_email: reply.lead_email,
        lead_name: reply.lead_name || `${leadData.lead.first_name || ''} ${leadData.lead.last_name || ''}`.trim(),
        lead_company: leadData.lead.company_name,
        status: reply.lead_category,
        first_contact_at: messages.find(m => m.type === 'SENT')?.time,
        first_reply_at: messages.find(m => m.type === 'REPLY')?.time,
        last_activity_at: messages[messages.length - 1]?.time,
        total_messages: messages.length,
        our_messages: messages.filter(m => m.type === 'SENT').length,
        their_messages: messages.filter(m => m.type === 'REPLY').length,
        updated_at: new Date().toISOString()
      };
      
      const { data: thread, error: threadErr } = await client
        .from('conversation_threads')
        .upsert(threadData, { onConflict: 'campaign_id,lead_id' })
        .select('id')
        .single();
      
      if (threadErr) {
        console.error(`    Error for ${reply.lead_email}:`, threadErr.message);
        continue;
      }
      
      totalThreads++;
      processedLeads++;
      
      // Store messages
      for (const msg of messages) {
        const respInfo = ourResponses.find(r => r.our_stats_id === msg.stats_id);
        
        const msgData = {
          thread_id: thread?.id,
          stats_id: msg.stats_id,
          type: msg.type,
          from_email: msg.from,
          to_email: msg.to,
          subject: msg.subject,
          sent_at: msg.time,
          is_our_response: !!respInfo,
          response_time_seconds: respInfo?.response_seconds || null,
          metadata: {
            email_seq_number: msg.email_seq_number,
            open_count: msg.open_count,
            click_count: msg.click_count,
            day_of_week: respInfo?.day_of_week,
            hour_of_day: respInfo?.hour_of_day
          }
        };
        
        if (respInfo) {
          allResponseTimes.push({
            seconds: respInfo.response_seconds,
            time: respInfo.our_time,
            campaign: campaign.name,
            lead: reply.lead_email,
            day_of_week: respInfo.day_of_week,
            hour_of_day: respInfo.hour_of_day
          });
        }
        
        await client.from('thread_messages').upsert(msgData, { onConflict: 'stats_id' });
        totalMessages++;
      }
      
      await delay(100);
    }
  }
  
  console.log(`\n[Reply Sync] Summary:`);
  console.log(`  Threads processed: ${totalThreads}`);
  console.log(`  Messages stored: ${totalMessages}`);
  console.log(`  Response times found: ${allResponseTimes.length}`);
  
  // Update daily aggregate
  if (allResponseTimes.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const buckets = {
      under_5min: 0,
      under_15min: 0,
      under_1hr: 0,
      under_3hr: 0,
      under_24hr: 0,
      over_24hr: 0
    };
    
    let totalSeconds = 0;
    for (const rt of allResponseTimes) {
      buckets[categorizeTime(rt.seconds)]++;
      totalSeconds += rt.seconds;
    }
    
    const avgSeconds = Math.floor(totalSeconds / allResponseTimes.length);
    
    // Sort for median
    const sorted = allResponseTimes.map(r => r.seconds).sort((a, b) => a - b);
    const medianSeconds = sorted[Math.floor(sorted.length / 2)];
    
    await client.from('response_time_daily').upsert({
      snapshot_date: today,
      ...buckets,
      total_responses: allResponseTimes.length,
      avg_response_seconds: avgSeconds,
      median_response_seconds: medianSeconds,
      week_of_month: getWeekOfMonth(today),
      month_year: today.substring(0, 7)
    }, { onConflict: 'snapshot_date' });
    
    // Update weekly aggregate
    const weekStart = getWeekStart(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    await client.from('response_time_weekly').upsert({
      week_start: weekStart,
      week_end: weekEnd.toISOString().split('T')[0],
      week_number: getWeekOfMonth(today),
      month_year: today.substring(0, 7),
      ...buckets,
      total_responses: allResponseTimes.length,
      avg_response_seconds: avgSeconds
    }, { onConflict: 'week_start' });
    
    console.log(`\n[Reply Sync] Stats for ${today}:`);
    console.log(`  Average response: ${Math.floor(avgSeconds / 60)} min`);
    console.log(`  Median response: ${Math.floor(medianSeconds / 60)} min`);
    console.log(`  Distribution:`);
    console.log(`    ⚡ Under 5 min:   ${buckets.under_5min}`);
    console.log(`    🕐 Under 15 min:  ${buckets.under_15min}`);
    console.log(`    ⏰ Under 1 hour:  ${buckets.under_1hr}`);
    console.log(`    🕑 Under 3 hours: ${buckets.under_3hr}`);
    console.log(`    📅 Under 24 hours: ${buckets.under_24hr}`);
    console.log(`    ⚠️  Over 24 hours: ${buckets.over_24hr}`);
  }
  
  console.log('\n[Reply Sync] Complete!');
}

// Main
if (require.main === module) {
  if (VERIFY_ONLY) {
    verifyData().catch(console.error);
  } else {
    syncReplies().catch(console.error);
  }
}

module.exports = { syncReplies, verifyData };
