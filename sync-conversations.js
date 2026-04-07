#!/usr/bin/env node
/**
 * Sync Full Conversation History from SmartLead to Supabase
 * 
 * This fetches the COMPLETE message history for each lead that has replied,
 * allowing us to calculate accurate response times.
 * 
 * Tables populated:
 * - conversation_threads: One row per lead conversation
 * - thread_messages: Every message in each thread (sent & received)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

// Config
const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

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

// SmartLead API helpers
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }
  return response.json();
}

async function getCampaigns() {
  return fetchJson(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
}

async function getCampaignStatistics(campaignId, limit = 100, offset = 0) {
  return fetchJson(`${BASE_URL}/campaigns/${campaignId}/statistics?api_key=${API_KEY}&limit=${limit}&offset=${offset}`);
}

async function getCampaignLeads(campaignId, limit = 100, offset = 0) {
  return fetchJson(`${BASE_URL}/campaigns/${campaignId}/leads?api_key=${API_KEY}&limit=${limit}&offset=${offset}`);
}

async function getMessageHistory(campaignId, leadId) {
  try {
    return fetchJson(`${BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${API_KEY}`);
  } catch (e) {
    console.error(`   Failed to get history for lead ${leadId}: ${e.message}`);
    return null;
  }
}

// Calculate response times from message history
function calculateResponseTimes(messages) {
  const responses = [];
  
  // Sort by time
  const sorted = [...messages].sort((a, b) => new Date(a.time) - new Date(b.time));
  
  // Find pairs: REPLY followed by our SENT (manual response)
  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    
    // If this is a REPLY from the lead
    if (msg.type === 'REPLY') {
      const replyTime = new Date(msg.time);
      
      // Look for our next SENT message (must be after this reply)
      for (let j = i + 1; j < sorted.length; j++) {
        const nextMsg = sorted[j];
        
        // If it's another REPLY, they replied again before we did
        if (nextMsg.type === 'REPLY') break;
        
        // If it's our SENT response
        if (nextMsg.type === 'SENT') {
          const ourResponseTime = new Date(nextMsg.time);
          const responseSeconds = Math.floor((ourResponseTime - replyTime) / 1000);
          
          // Only count if it's a manual reply (no email_seq_number or different from the reply's)
          // Manual replies won't have email_seq_number or it will be the same as the triggering reply
          const isManualReply = !nextMsg.email_seq_number || 
                                nextMsg.email_seq_number === msg.email_seq_number;
          
          if (isManualReply && responseSeconds > 0) {
            responses.push({
              lead_replied_at: msg.time,
              our_response_at: nextMsg.time,
              response_time_seconds: responseSeconds,
              is_first_response: responses.length === 0,
              lead_message_preview: (msg.email_body || '').replace(/<[^>]*>/g, '').substring(0, 100),
              our_message_preview: (nextMsg.email_body || '').replace(/<[^>]*>/g, '').substring(0, 100)
            });
          }
          break;
        }
      }
    }
  }
  
  return responses;
}

// Process a single campaign
async function processCampaign(campaign) {
  console.log(`\n📧 ${campaign.name}`);
  
  try {
    // Get all leads with their IDs first
    let allLeads = [];
    let leadsOffset = 0;
    const limit = 100;
    
    while (true) {
      const leadsResponse = await getCampaignLeads(campaign.id, limit, leadsOffset);
      const leads = Array.isArray(leadsResponse) ? leadsResponse : (leadsResponse.data || []);
      const total = parseInt(leadsResponse.total_leads || leads.length);
      
      allLeads = allLeads.concat(leads);
      leadsOffset += limit;
      
      if (leadsOffset >= total || leads.length < limit) break;
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Build email -> lead ID map
    const emailToLeadId = new Map();
    for (const leadEntry of allLeads) {
      if (leadEntry.lead && leadEntry.lead.email && leadEntry.lead.id) {
        emailToLeadId.set(leadEntry.lead.email.toLowerCase(), {
          id: leadEntry.lead.id,
          name: `${leadEntry.lead.first_name || ''} ${leadEntry.lead.last_name || ''}`.trim(),
          company: leadEntry.lead.company_name || null
        });
      }
    }
    
    // Get all statistics to find replied leads
    let allStats = [];
    let offset = 0;
    
    while (true) {
      const statsResponse = await getCampaignStatistics(campaign.id, limit, offset);
      const stats = Array.isArray(statsResponse) ? statsResponse : (statsResponse.data || []);
      const total = parseInt(statsResponse.total_stats || stats.length);
      
      allStats = allStats.concat(stats);
      offset += limit;
      
      if (offset >= total || stats.length < limit) break;
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Track ALL leads that replied (regardless of category)
    // We want to measure response time for every back-and-forth
    const repliedStats = allStats.filter(s => {
      // Has replied (has reply_time or has a category that's not "Not Replied")
      return s.reply_time !== null || 
        (s.lead_category && 
         s.lead_category !== 'Not Replied' && 
         !s.lead_category.includes('Bounce'));
    });
    
    console.log(`   ${allStats.length} total leads, ${repliedStats.length} replied`);
    
    if (repliedStats.length === 0) return { threads: 0, messages: 0 };
    
    let threadCount = 0;
    let messageCount = 0;
    let skippedNoId = 0;
    
    // Process each replied lead
    for (let i = 0; i < repliedStats.length; i++) {
      const stat = repliedStats[i];
      
      // Progress indicator
      if ((i + 1) % 10 === 0 || i === repliedStats.length - 1) {
        process.stdout.write(`\r   Processing ${i + 1}/${repliedStats.length}...`);
      }
      
      // Get lead ID from email map
      const leadInfo = emailToLeadId.get(stat.lead_email?.toLowerCase());
      if (!leadInfo || !leadInfo.id) {
        skippedNoId++;
        continue;
      }
      
      // Get full message history using proper lead ID
      const history = await getMessageHistory(campaign.id, leadInfo.id);
      if (!history || !history.history || history.history.length === 0) continue;
      
      const messages = history.history;
      
      // Calculate response times
      const responseTimes = calculateResponseTimes(messages);
      
      // Find first reply from lead
      const firstReply = messages.find(m => m.type === 'REPLY');
      const lastMessage = messages[messages.length - 1];
      
      // Count messages
      const ourMessages = messages.filter(m => m.type === 'SENT').length;
      const theirMessages = messages.filter(m => m.type === 'REPLY').length;
      
      // Calculate average response time
      let avgResponseSeconds = null;
      let firstResponseSeconds = null;
      
      if (responseTimes.length > 0) {
        const totalSeconds = responseTimes.reduce((sum, r) => sum + r.response_time_seconds, 0);
        avgResponseSeconds = Math.floor(totalSeconds / responseTimes.length);
        firstResponseSeconds = responseTimes[0].response_time_seconds;
      }
      
      // Upsert thread (without optional columns that may not exist yet)
      const threadData = {
        campaign_id: String(campaign.id),
        campaign_name: campaign.name,
        lead_id: String(leadInfo.id),
        lead_email: stat.lead_email,
        lead_name: leadInfo.name || stat.lead_name || null,
        lead_company: leadInfo.company || null,
        status: stat.lead_category || 'Replied',
        first_contact_at: messages[0]?.time || null,
        first_reply_at: firstReply?.time || null,
        last_activity_at: lastMessage?.time || null,
        total_messages: messages.length,
        our_messages: ourMessages,
        their_messages: theirMessages,
        // Store response time data in metadata for now
        // Add avg_response_seconds, first_response_seconds, response_count columns later
        updated_at: new Date().toISOString()
      };
      
      const { data: thread, error: threadError } = await supabase
        .from('conversation_threads')
        .upsert(threadData, { onConflict: 'campaign_id,lead_id' })
        .select('id')
        .single();
      
      if (threadError) {
        console.error(`\n   Thread upsert error: ${threadError.message}`);
        continue;
      }
      
      threadCount++;
      
      // Upsert messages
      for (const msg of messages) {
        const isOurMessage = msg.type === 'SENT';
        
        // Find if this message has a response time associated
        let responseTimeSeconds = null;
        if (isOurMessage) {
          const rt = responseTimes.find(r => r.our_response_at === msg.time);
          if (rt) responseTimeSeconds = rt.response_time_seconds;
        }
        
        const msgData = {
          thread_id: thread.id,
          stats_id: msg.stats_id,
          type: msg.type,
          from_email: msg.from,
          to_email: msg.to,
          subject: msg.subject || null,
          sent_at: msg.time,
          is_our_response: isOurMessage,
          response_time_seconds: responseTimeSeconds,
          metadata: {
            email_seq_number: msg.email_seq_number || null,
            message_id: msg.message_id || null
          }
        };
        
        // Use insert - check if exists first to avoid duplicates
        // Use thread_id + sent_at + type as unique key (stats_id is reused by SmartLead)
        const { data: existing } = await supabase
          .from('thread_messages')
          .select('id')
          .eq('thread_id', thread.id)
          .eq('sent_at', msg.time)
          .eq('type', msg.type)
          .single();
        
        if (!existing) {
          // Make stats_id unique by appending type
          msgData.stats_id = msg.stats_id + '-' + msg.type;
          const { error } = await supabase.from('thread_messages').insert(msgData);
          if (error && !error.message.includes('duplicate')) {
            console.error('Insert error:', error.message);
          }
        }
        
        messageCount++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }
    
    if (skippedNoId > 0) {
      console.log(`\n   ⚠️  Skipped ${skippedNoId} leads (no ID match)`);
    }
    console.log(`   ✅ Synced ${threadCount} threads, ${messageCount} messages`);
    return { threads: threadCount, messages: messageCount };
    
  } catch (err) {
    console.error(`\n   Error: ${err.message}`);
    return { threads: 0, messages: 0 };
  }
}

// Main sync function
async function syncConversations() {
  console.log('🔄 Syncing Full Conversation History from SmartLead');
  console.log('='.repeat(60));
  
  const campaigns = await getCampaigns();
  const activeCampaigns = campaigns.filter(c => 
    c.status === 'ACTIVE' || c.status === 'COMPLETED' || c.status === 'PAUSED'
  ).filter(c => c.name !== 'Follow up' || !c.parent_campaign_id);
  
  console.log(`Found ${activeCampaigns.length} campaigns to process`);
  
  let totalThreads = 0;
  let totalMessages = 0;
  
  for (const campaign of activeCampaigns) {
    const { threads, messages } = await processCampaign(campaign);
    totalThreads += threads;
    totalMessages += messages;
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Sync Complete:');
  console.log(`   Total threads: ${totalThreads}`);
  console.log(`   Total messages: ${totalMessages}`);
  
  // Skip aggregates for now - table may not exist yet
  // await calculateAggregates();
  console.log('\n💡 Run the migration SQL to add response time columns, then re-run sync.');
}

// Calculate weekly/monthly aggregates
async function calculateAggregates() {
  console.log('\n📈 Calculating response time aggregates...');
  
  // Get all threads with response times
  const { data: threads, error } = await supabase
    .from('conversation_threads')
    .select('*')
    .not('first_response_seconds', 'is', null);
  
  if (error || !threads) {
    console.error('Failed to fetch threads:', error?.message);
    return;
  }
  
  // Group by week and month
  const weeklyStats = {};
  const monthlyStats = {};
  
  for (const thread of threads) {
    const date = new Date(thread.first_reply_at);
    const weekKey = getWeekKey(date);
    const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
    
    // Initialize
    if (!weeklyStats[weekKey]) {
      weeklyStats[weekKey] = { responses: [], firstResponses: [] };
    }
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { responses: [], firstResponses: [] };
    }
    
    // Add first response time
    if (thread.first_response_seconds) {
      weeklyStats[weekKey].firstResponses.push(thread.first_response_seconds);
      monthlyStats[monthKey].firstResponses.push(thread.first_response_seconds);
    }
    
    // Add average response time
    if (thread.avg_response_seconds) {
      weeklyStats[weekKey].responses.push(thread.avg_response_seconds);
      monthlyStats[monthKey].responses.push(thread.avg_response_seconds);
    }
  }
  
  // Store aggregates
  for (const [week, stats] of Object.entries(weeklyStats)) {
    const avg = stats.responses.length > 0 ? 
      Math.floor(stats.responses.reduce((a, b) => a + b, 0) / stats.responses.length) : null;
    const avgFirst = stats.firstResponses.length > 0 ?
      Math.floor(stats.firstResponses.reduce((a, b) => a + b, 0) / stats.firstResponses.length) : null;
    
    await supabase.from('response_time_aggregates').upsert({
      period_type: 'week',
      period_key: week,
      response_count: stats.responses.length,
      first_response_count: stats.firstResponses.length,
      avg_response_seconds: avg,
      avg_first_response_seconds: avgFirst,
      updated_at: new Date().toISOString()
    }, { onConflict: 'period_type,period_key' });
  }
  
  for (const [month, stats] of Object.entries(monthlyStats)) {
    const avg = stats.responses.length > 0 ?
      Math.floor(stats.responses.reduce((a, b) => a + b, 0) / stats.responses.length) : null;
    const avgFirst = stats.firstResponses.length > 0 ?
      Math.floor(stats.firstResponses.reduce((a, b) => a + b, 0) / stats.firstResponses.length) : null;
    
    await supabase.from('response_time_aggregates').upsert({
      period_type: 'month',
      period_key: month,
      response_count: stats.responses.length,
      first_response_count: stats.firstResponses.length,
      avg_response_seconds: avg,
      avg_first_response_seconds: avgFirst,
      updated_at: new Date().toISOString()
    }, { onConflict: 'period_type,period_key' });
  }
  
  console.log(`   Stored ${Object.keys(weeklyStats).length} weekly aggregates`);
  console.log(`   Stored ${Object.keys(monthlyStats).length} monthly aggregates`);
}

function getWeekKey(date) {
  // Get ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Run
syncConversations().catch(console.error);
