// Supabase Integration for Domain Health Dashboard
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const os = require('os');

// Get credentials from macOS Keychain (secure) - only works on macOS
function getFromKeychain(service) {
  // Skip keychain on non-macOS systems
  if (os.platform() !== 'darwin') {
    return null;
  }
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error(`[Supabase] Failed to get ${service} from keychain:`, e.message);
    return null;
  }
}

// Initialize Supabase client
let supabase = null;
let initError = null;

function initSupabase() {
  if (supabase) return supabase;
  
  // Try env vars first, then keychain (macOS only)
  const url = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || getFromKeychain('supabase-service-key');
  
  if (!url || !key) {
    initError = 'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY or store in keychain.';
    console.error('[Supabase]', initError);
    return null;
  }
  
  supabase = createClient(url, key, {
    auth: { persistSession: false }
  });
  
  console.log('[Supabase] Client initialized');
  return supabase;
}

// Ensure tables exist (run once on startup)
async function ensureTables() {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  // Check if domain_snapshots exists by trying to select from it
  const { error } = await client.from('domain_snapshots').select('id').limit(1);
  
  if (error && error.code === '42P01') {
    // Table doesn't exist - need to create via Supabase dashboard
    console.log('[Supabase] Tables not found. Please create them in Supabase dashboard.');
    return { error: 'Tables need to be created. Run the SQL in SETUP.sql in Supabase dashboard.' };
  }
  
  return { success: true };
}

// Save domain snapshot
async function saveDomainSnapshot(domains) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const date = new Date().toISOString().split('T')[0];
  
  const records = domains.map(d => ({
    snapshot_date: date,
    domain: d.domain,
    reputation: d.reputation || null,
    warmup_reply_rate: d.warmupReplyRate || null,
    active_accounts: d.activeAccounts || 0,
    total_accounts: d.totalAccounts || 0,
    daily_capacity: d.dailyCapacity || 0,
    campaign_sends: d.campaignSends || 0,
    campaign_replies: d.campaignReplies || 0,
    bounce_rate: d.bounceRate || null,
    metadata: JSON.stringify(d)
  }));
  
  const { data, error } = await client
    .from('domain_snapshots')
    .upsert(records, { 
      onConflict: 'snapshot_date,domain',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('[Supabase] Failed to save domain snapshots:', error);
    return { error: error.message };
  }
  
  console.log(`[Supabase] Saved ${records.length} domain snapshots for ${date}`);
  return { success: true, count: records.length };
}

// Save campaign snapshot
async function saveCampaignSnapshot(campaigns) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const date = new Date().toISOString().split('T')[0];
  
  const records = campaigns.map(c => ({
    snapshot_date: date,
    campaign_id: c.id?.toString() || c.campaign_id?.toString(),
    campaign_name: c.name || c.campaign_name,
    status: c.status,
    total_leads: c.totalLeads || 0,
    sent: c.sent || 0,
    opened: c.opened || 0,
    replied: c.replied || 0,
    bounced: c.bounced || 0,
    interested: c.interested || 0,
    reply_rate: c.replyRate || null,
    open_rate: c.openRate || null,
    completion_rate: c.completionRate || null,
    metadata: JSON.stringify(c)
  }));
  
  const { data, error } = await client
    .from('campaign_snapshots')
    .upsert(records, { 
      onConflict: 'snapshot_date,campaign_id',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('[Supabase] Failed to save campaign snapshots:', error);
    return { error: error.message };
  }
  
  console.log(`[Supabase] Saved ${records.length} campaign snapshots for ${date}`);
  return { success: true, count: records.length };
}

// Save aggregate snapshot (overall stats)
async function saveAggregateSnapshot(stats) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const date = new Date().toISOString().split('T')[0];
  
  const record = {
    snapshot_date: date,
    total_domains: stats.totalDomains || 0,
    total_accounts: stats.totalAccounts || 0,
    active_accounts: stats.activeAccounts || 0,
    total_campaigns: stats.totalCampaigns || 0,
    daily_capacity: stats.dailyCapacity || 0,
    daily_sent: stats.dailySent || 0,
    avg_warmup_rate: stats.avgWarmupRate || null,
    avg_reputation: stats.avgReputation || null,
    total_leads: stats.totalLeads || 0,
    total_replied: stats.totalReplied || 0,
    total_interested: stats.totalInterested || 0,
    metadata: JSON.stringify(stats)
  };
  
  const { data, error } = await client
    .from('aggregate_snapshots')
    .upsert(record, { 
      onConflict: 'snapshot_date',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('[Supabase] Failed to save aggregate snapshot:', error);
    return { error: error.message };
  }
  
  console.log(`[Supabase] Saved aggregate snapshot for ${date}`);
  return { success: true };
}

// Get domain history
async function getDomainHistory(domain, days = 30) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('domain_snapshots')
    .select('*')
    .eq('domain', domain)
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get domain history:', error);
    return { error: error.message };
  }
  
  return { data };
}

// Get aggregate history
async function getAggregateHistory(days = 30) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('aggregate_snapshots')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get aggregate history:', error);
    return { error: error.message };
  }
  
  return { data };
}

// Get all domains' latest trends
async function getAllDomainsTrend(days = 7) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('domain_snapshots')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get domain trends:', error);
    return { error: error.message };
  }
  
  // Group by domain
  const byDomain = {};
  for (const row of data || []) {
    if (!byDomain[row.domain]) byDomain[row.domain] = [];
    byDomain[row.domain].push(row);
  }
  
  return { data: byDomain };
}

// Get all campaigns' trends
async function getAllCampaignsTrend(days = 30) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('campaign_snapshots')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get campaign trends:', error);
    return { error: error.message };
  }
  
  const byCampaign = {};
  for (const row of data || []) {
    const key = row.campaign_id || row.campaign_name || 'unknown';
    if (!byCampaign[key]) byCampaign[key] = [];
    byCampaign[key].push(row);
  }
  
  return { data: byCampaign };
}

// Get response time stats for a date range
async function getResponseTimeStats(days = 30) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('response_time_daily')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get response time stats:', error);
    return { error: error.message };
  }
  
  return { data };
}

// Get weekly stats grouped by month
async function getWeeklyStatsByMonth(months = ['2025-11', '2025-12', '2026-01', '2026-02']) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const { data, error } = await client
    .from('response_time_weekly')
    .select('*')
    .in('month_year', months)
    .order('week_start', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get weekly stats:', error);
    return { error: error.message };
  }
  
  // Group by month
  const byMonth = {};
  for (const row of data || []) {
    if (!byMonth[row.month_year]) byMonth[row.month_year] = [];
    byMonth[row.month_year].push(row);
  }
  
  return { data: byMonth };
}

// Get conversation threads with messages
async function getConversationThreads(limit = 50, offset = 0) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const { data, error, count } = await client
    .from('conversation_threads')
    .select('*, thread_messages(*)', { count: 'exact' })
    .order('last_activity_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('[Supabase] Failed to get threads:', error);
    return { error: error.message };
  }
  
  return { data, total: count };
}

// Get all positive replies with optional filters
async function getPositiveReplies(options = {}) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const { limit = 100, offset = 0, status = null, category = null, days = 30 } = options;
  
  let query = client
    .from('positive_replies')
    .select('*', { count: 'exact' });
  
  if (status === 'pending') {
    const nowIso = new Date().toISOString();
    query = query.or(`follow_up_status.eq.pending,and(follow_up_status.eq.snoozed,snooze_until.lte.${nowIso})`);
  } else if (status) {
    query = query.eq('follow_up_status', status);
  }
  if (category) {
    query = query.eq('reply_category', category);
  }
  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    query = query.gte('replied_at', startDate.toISOString());
  }
  
  const { data, error, count } = await query
    .order('replied_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('[Supabase] Failed to get positive replies:', error);
    return { error: error.message };
  }
  
  return { data, total: count };
}

// Update positive reply follow-up status
async function updatePositiveReplyStatus(id, status, snoozeUntil = null) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const updatePayload = { follow_up_status: status };
  if (status === 'snoozed') {
    updatePayload.snooze_until = snoozeUntil;
  } else {
    updatePayload.snooze_until = null;
  }

  const { error } = await client
    .from('positive_replies')
    .update(updatePayload)
    .eq('id', id);
  
  if (error) {
    console.error('[Supabase] Failed to update reply status:', error);
    return { error: error.message };
  }
  
  return { success: true };
}

// Get response time averages history
async function getResponseTimeAverages(days = 30) {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await client
    .from('response_time_averages')
    .select('*')
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });
  
  if (error) {
    console.error('[Supabase] Failed to get response time averages:', error);
    return { error: error.message };
  }
  
  return { data };
}

// Get reply summary stats
async function getReplySummary() {
  const client = initSupabase();
  if (!client) return { error: initError };
  
  // Get counts by category
  const { data: all, error: allErr } = await client
    .from('all_replies')
    .select('reply_category', { count: 'exact', head: false });
  
  if (allErr) {
    console.error('[Supabase] Failed to get reply summary:', allErr);
    return { error: allErr.message };
  }
  
  // Count by category
  const byCategory = {};
  for (const row of all || []) {
    const cat = row.reply_category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  
  // Get positive by status
  const { data: positive, error: posErr } = await client
    .from('positive_replies')
    .select('follow_up_status', { count: 'exact', head: false });
  
  const byStatus = {};
  for (const row of positive || []) {
    const stat = row.follow_up_status || 'pending';
    byStatus[stat] = (byStatus[stat] || 0) + 1;
  }
  
  return { 
    data: {
      totalReplies: all?.length || 0,
      positiveReplies: positive?.length || 0,
      byCategory,
      byStatus
    }
  };
}

// Get follow-up funnel stats
async function getFollowUpFunnel() {
  const client = initSupabase();
  if (!client) return { error: initError };

  const { data, error } = await client
    .from('positive_replies')
    .select('follow_up_status, reply_category');

  if (error) return { error: error.message };

  const funnel = {
    pending: 0,
    contacted: 0,
    meeting_scheduled: 0,
    closed: 0,
    lost: 0,
    snoozed: 0
  };

  for (const r of data || []) {
    const status = r.follow_up_status || 'pending';
    if (funnel.hasOwnProperty(status)) {
      funnel[status]++;
    } else {
      funnel.pending++;
    }
  }

  return { data: funnel };
}

// Get curated leads from Supabase (SINGLE SOURCE OF TRUTH)
async function getCuratedLeads() {
  const client = initSupabase();
  if (!client) return { error: initError };

  try {
    const { data, error, count } = await client
      .from('curated_leads')
      .select('*', { count: 'exact' })
      .order('lead_response', { ascending: false });
    
    if (error) throw error;

    // Transform to match expected format
    const leads = (data || []).map(l => ({
      id: l.id,
      email: l.email,
      name: l.name,
      company: l.company,
      domain: l.domain || l.email?.split('@')[1],
      category: l.category || 'Interested',
      status: l.status,
      conv_month: l.conv_month,
      conv_year: l.conv_year,
      conv_date: l.conv_date,
      lead_response: l.lead_response,
      response_time: l.response_time,
      ert: l.ert,
      ert_seconds: l.ert_seconds,
      meeting_date: l.meeting_date,
      notes: l.notes,
      source: l.source,
      campaign_name: l.campaign_name,
      mailbox: l.mailbox
    }));

    return {
      data: {
        leads,
        total: count || leads.length,
        fetchedAt: new Date().toISOString()
      }
    };
  } catch (e) {
    console.error('[Supabase] Failed to get curated leads:', e);
    return { error: e.message };
  }
}

// Get follow-up response time stats (for dashboard)
// businessHoursOnly: filter to messages where the lead's message was sent Mon-Fri 9-17 ET
async function getFollowUpResponseStats(businessHoursOnly = false) {
  const client = initSupabase();
  if (!client) return { error: initError };

  try {
    // Get all messages with response times
    const { data: messages, error } = await client
      .from('thread_messages')
      .select('thread_id, type, sent_at, response_time_seconds, is_our_response')
      .not('response_time_seconds', 'is', null)
      .order('thread_id')
      .order('sent_at');
    
    if (error) throw error;

    // Filter for business hours if requested
    let filteredMessages = messages || [];
    if (businessHoursOnly) {
      filteredMessages = filteredMessages.filter(m => {
        if (!m.sent_at) return false;
        const date = new Date(m.sent_at);
        const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat
        // Convert to ET (UTC-5, roughly - not accounting for DST)
        const etHour = (date.getUTCHours() - 5 + 24) % 24;
        // Mon-Fri (1-5), 9 AM - 5 PM ET
        return dayOfWeek >= 1 && dayOfWeek <= 5 && etHour >= 9 && etHour < 17;
      });
    }

    // Group by thread
    const threads = {};
    for (const m of filteredMessages) {
      if (!threads[m.thread_id]) threads[m.thread_id] = [];
      threads[m.thread_id].push(m);
    }

    let firstResponses = [];
    let followUps = [];

    for (const tid of Object.keys(threads)) {
      const ourResponses = threads[tid].filter(m => m.is_our_response);
      if (ourResponses.length > 0) {
        firstResponses.push(ourResponses[0].response_time_seconds);
      }
      if (ourResponses.length > 1) {
        followUps.push(...ourResponses.slice(1).map(m => m.response_time_seconds));
      }
    }

    const avg = arr => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : 0;
    const median = arr => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a,b) => a-b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    return {
      data: {
        first: {
          avg_seconds: avg(firstResponses),
          median_seconds: median(firstResponses),
          count: firstResponses.length
        },
        followUp: {
          avg_seconds: avg(followUps),
          median_seconds: median(followUps),
          count: followUps.length
        }
      }
    };
  } catch (e) {
    console.error('[Supabase] Failed to get follow-up stats:', e);
    return { error: e.message };
  }
}

// ===========================================
// SINGLE CONSOLIDATED EXPORT
// ===========================================
module.exports = {
  // Core
  initSupabase,
  ensureTables,
  
  // Snapshots (write)
  saveDomainSnapshot,
  saveCampaignSnapshot,
  saveAggregateSnapshot,
  
  // History (read)
  getDomainHistory,
  getAggregateHistory,
  getAllDomainsTrend,
  getAllCampaignsTrend,
  
  // Response times
  getResponseTimeStats,
  getWeeklyStatsByMonth,
  getResponseTimeAverages,
  
  // Threads & Replies
  getConversationThreads,
  getPositiveReplies,
  updatePositiveReplyStatus,
  getReplySummary,
  getFollowUpFunnel,
  getFollowUpResponseStats,
  getCuratedLeads
};
