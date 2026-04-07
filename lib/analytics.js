// Analytics functions for lead gen data

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

let supabase = null;
function getClient() {
  if (!supabase && supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  }
  return supabase;
}

// Get campaign performance comparison
async function getCampaignPerformance() {
  const client = getClient();
  if (!client) return { error: 'No database connection' };

  // Get all replies grouped by campaign
  const { data, error } = await client
    .from('all_replies')
    .select('campaign_id, campaign_name, reply_category');

  if (error) return { error: error.message };

  // Group by campaign
  const campaigns = {};
  for (const r of data || []) {
    const key = r.campaign_id;
    if (!campaigns[key]) {
      campaigns[key] = {
        id: r.campaign_id,
        name: r.campaign_name,
        totalReplies: 0,
        positive: 0,
        meetingRequests: 0,
        booked: 0,
        interested: 0,
        infoRequests: 0,
        notInterested: 0,
        outOfOffice: 0,
        other: 0
      };
    }
    
    campaigns[key].totalReplies++;
    
    // Categorize
    const cat = r.reply_category || '';
    if (cat.includes('Meeting') || cat === 'Booked') {
      campaigns[key].positive++;
      if (cat === 'Meeting Request') campaigns[key].meetingRequests++;
      if (cat === 'Booked') campaigns[key].booked++;
    } else if (cat === 'Interested') {
      campaigns[key].positive++;
      campaigns[key].interested++;
    } else if (cat === 'Information Request') {
      campaigns[key].positive++;
      campaigns[key].infoRequests++;
    } else if (cat === 'Not Interested') {
      campaigns[key].notInterested++;
    } else if (cat === 'Out Of Office') {
      campaigns[key].outOfOffice++;
    } else {
      campaigns[key].other++;
    }
  }

  // Convert to array and calculate rates
  const result = Object.values(campaigns).map(c => ({
    ...c,
    positiveRate: c.totalReplies > 0 ? (c.positive / c.totalReplies * 100).toFixed(1) : 0,
    type: c.name?.toLowerCase().includes('hypertide') ? 'hypertide' : 
          c.name?.toLowerCase().includes('google') ? 'google' : 'other'
  }));

  // Sort by positive count
  result.sort((a, b) => b.positive - a.positive);

  return { data: result };
}

// Get response time by campaign
async function getResponseTimeByCampaign() {
  const client = getClient();
  if (!client) return { error: 'No database connection' };

  const { data, error } = await client
    .from('all_replies')
    .select('campaign_id, campaign_name, response_time_seconds')
    .not('response_time_seconds', 'is', null);

  if (error) return { error: error.message };

  // Group by campaign
  const campaigns = {};
  for (const r of data || []) {
    const key = r.campaign_id;
    if (!campaigns[key]) {
      campaigns[key] = {
        id: r.campaign_id,
        name: r.campaign_name,
        responseTimes: []
      };
    }
    if (r.response_time_seconds > 0) {
      campaigns[key].responseTimes.push(r.response_time_seconds);
    }
  }

  // Calculate stats
  const result = Object.values(campaigns).map(c => {
    const times = c.responseTimes;
    const sorted = times.sort((a, b) => a - b);
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    
    return {
      id: c.id,
      name: c.name,
      count: times.length,
      avgSeconds: Math.round(avg),
      medianSeconds: median,
      fastestSeconds: sorted[0] || 0,
      slowestSeconds: sorted[sorted.length - 1] || 0
    };
  });

  result.sort((a, b) => a.medianSeconds - b.medianSeconds);
  return { data: result };
}

module.exports = {
  getCampaignPerformance,
  getResponseTimeByCampaign
};
