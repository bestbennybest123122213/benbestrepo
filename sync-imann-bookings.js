#!/usr/bin/env node
/**
 * Sync Imann positive replies from SmartLead API
 * Runs automatically to pull new leads and response times
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function getImannCampaigns() {
  const campaigns = await fetchWithRetry(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
  // Filter for Imann campaigns
  return campaigns.filter(c => 
    c.name.toLowerCase().includes('imann') || 
    c.name.toLowerCase().includes('imman')
  );
}

async function getCampaignStats(campaignId) {
  return await fetchWithRetry(`${BASE_URL}/campaigns/${campaignId}/statistics?api_key=${API_KEY}`);
}

async function getLeadMessages(campaignId, leadId) {
  try {
    const data = await fetchWithRetry(
      `${BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${API_KEY}`
    );
    return data.history || [];
  } catch {
    return [];
  }
}

function calculateResponseTime(messages) {
  // Find first lead reply and our response to it
  const sorted = messages.sort((a, b) => new Date(a.time) - new Date(b.time));
  
  let leadReplyTime = null;
  let ourResponseTime = null;
  
  for (const msg of sorted) {
    if (msg.type === 'REPLY' && !leadReplyTime) {
      leadReplyTime = new Date(msg.time);
    } else if (msg.type === 'SENT' && leadReplyTime && !ourResponseTime) {
      ourResponseTime = new Date(msg.time);
      break;
    }
  }
  
  if (leadReplyTime && ourResponseTime) {
    return Math.round((ourResponseTime - leadReplyTime) / 1000);
  }
  return null;
}

async function syncBookings() {
  const client = initSupabase();
  if (!client) {
    console.error('Failed to initialize Supabase');
    process.exit(1);
  }
  
  console.log('Fetching Imann campaigns...');
  const campaigns = await getImannCampaigns();
  console.log(`Found ${campaigns.length} Imann campaigns`);
  
  const positiveCategories = ['Interested', 'Meeting Request', 'Information Request', 'Meeting Booked', 'Out of Office'];
  let newLeads = 0;
  let updated = 0;
  
  for (const campaign of campaigns) {
    console.log(`\nProcessing: ${campaign.name}`);
    
    const stats = await getCampaignStats(campaign.id);
    const leads = stats.lead_data || [];
    
    for (const lead of leads) {
      // Check if positive reply
      if (!positiveCategories.includes(lead.lead_category)) continue;
      
      const email = lead.lead_email?.toLowerCase();
      if (!email) continue;
      
      // Check if already in database
      const { data: existing } = await client
        .from('imann_positive_replies')
        .select('id, response_time_seconds')
        .eq('email', email)
        .single();
      
      // Get response time if not already have it
      let responseTimeSeconds = existing?.response_time_seconds;
      if (!responseTimeSeconds) {
        const messages = await getLeadMessages(campaign.id, lead.lead_id);
        responseTimeSeconds = calculateResponseTime(messages);
      }
      
      const leadData = {
        email: email,
        name: lead.lead_name || null,
        company: lead.lead_company || null,
        category: lead.lead_category,
        status: lead.lead_category === 'Meeting Booked' ? 'Booked' : 'Scheduling',
        response_time_seconds: responseTimeSeconds,
        lead_response_at: lead.replied_at ? new Date(lead.replied_at).toISOString() : null,
        updated_at: new Date().toISOString()
      };
      
      if (existing) {
        // Update if we have new response time
        if (responseTimeSeconds && !existing.response_time_seconds) {
          await client
            .from('imann_positive_replies')
            .update({ response_time_seconds: responseTimeSeconds, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          updated++;
          console.log(`  Updated RT: ${email}`);
        }
      } else {
        // Insert new lead
        const { error } = await client
          .from('imann_positive_replies')
          .insert(leadData);
        
        if (!error) {
          newLeads++;
          console.log(`  New: ${email} (${lead.lead_category})`);
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`\n✅ Sync complete: ${newLeads} new, ${updated} updated`);
}

// Run
syncBookings().catch(console.error);
