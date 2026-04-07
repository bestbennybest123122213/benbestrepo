#!/usr/bin/env node
/**
 * Bull BRO Thread Sync CLI
 * Fetches full conversation threads from SmartLead
 * 
 * Usage:
 *   node sync-threads.js              # Sync all replied leads
 *   node sync-threads.js --email X    # Sync specific lead
 *   node sync-threads.js --limit 50   # Limit number of leads
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

// Parse args
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
};
const LIMIT = parseInt(getArg('limit') || '100');
const SPECIFIC_EMAIL = getArg('email');

async function fetchAPI(endpoint) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

async function getMessageHistory(campaignId, leadId) {
  const data = await fetchAPI(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
  // Response is { history: [...] }
  return data?.history || (Array.isArray(data) ? data : []);
}

async function findLeadInCampaign(campaignId, email) {
  // Try COMPLETED status first (where replied leads usually are)
  for (const status of ['COMPLETED', 'REPLIED', 'INTERESTED', '']) {
    const query = status ? `?status=${status}&limit=200` : '?limit=500';
    const data = await fetchAPI(`/campaigns/${campaignId}/leads${query}`);
    const leads = data?.data || [];
    const found = leads.find(l => l.lead?.email === email);
    if (found) {
      return { ...found.lead, campaign_lead_map_id: found.campaign_lead_map_id };
    }
  }
  
  // Fallback: search by email globally
  const searchData = await fetchAPI(`/leads?email=${encodeURIComponent(email)}`);
  if (searchData?.id) {
    return searchData;
  }
  
  return null;
}

async function syncThreads() {
  console.log('🐂 Bull BRO Thread Sync\n');
  
  // Get campaigns
  const campaigns = await fetchAPI('/campaigns');
  const campaignList = campaigns?.data || campaigns || [];
  console.log(`📋 Found ${campaignList.length} campaigns\n`);
  
  let synced = 0;
  const threads = {};
  
  for (const campaign of campaignList) {
    // Get statistics to find replied leads
    const stats = await fetchAPI(`/campaigns/${campaign.id}/statistics?limit=100`);
    const leads = stats?.data || [];
    
    const replied = leads.filter(l => l.reply_time);
    if (replied.length === 0) continue;
    
    console.log(`📧 ${campaign.name}: ${replied.length} replies`);
    
    for (const lead of replied) {
      if (SPECIFIC_EMAIL && lead.lead_email !== SPECIFIC_EMAIL) continue;
      if (synced >= LIMIT) break;
      
      // Find full lead record to get lead ID
      const fullLead = await findLeadInCampaign(campaign.id, lead.lead_email);
      
      if (fullLead?.id) {
        // Get message history
        const history = await getMessageHistory(campaign.id, fullLead.id);
        
        if (history.length > 0) {
          // Format thread
          const thread = history.map(m => ({
            from: m.type === 'SENT' ? 'Imman' : lead.lead_name || lead.lead_email,
            date: m.time || m.sent_time,
            subject: m.subject,
            body: (m.email_body || m.body || m.text || '').replace(/<[^>]*>/g, ' ').trim()
          }));
          
          // Extract reply text (messages from lead - type REPLY or RECEIVED)
          const leadReplies = history.filter(m => m.type === 'REPLY' || m.type === 'RECEIVED');
          const replyText = leadReplies.map(m => (m.email_body || m.body || m.text || '').replace(/<[^>]*>/g, ' ').trim()).filter(Boolean).join('\n\n---\n\n');
          
          // Update database
          const { error } = await supabase
            .from('bull_bro_inbox')
            .upsert({
              smartlead_id: lead.lead_email + '-' + campaign.id,
              email: lead.lead_email,
              first_name: lead.lead_name?.split(' ')[0] || '',
              company: fullLead.company_name || fullLead.company || '',
              campaign_name: campaign.name,
              reply_text: replyText.substring(0, 4000) || 'No reply text found',
              reply_category: lead.lead_category || 'Unknown',
              reply_date: lead.reply_time
            }, { onConflict: 'smartlead_id' });
          
          if (!error) {
            synced++;
            console.log(`  ✅ ${lead.lead_name || lead.lead_email}: ${history.length} messages, reply: ${replyText.substring(0, 50)}...`);
            
            // Store full thread
            threads[lead.lead_email] = {
              lead: lead.lead_name,
              campaign: campaign.name,
              category: lead.lead_category,
              messages: thread
            };
          }
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 150));
    }
    
    if (synced >= LIMIT) break;
  }
  
  console.log(`\n✅ Synced ${synced} threads with full message history`);
  
  // Save threads to file for reference
  const fs = require('fs');
  fs.writeFileSync(
    require('path').join(__dirname, 'threads-cache.json'),
    JSON.stringify(threads, null, 2)
  );
  console.log('💾 Saved to threads-cache.json');
  
  // Show stats
  const { count } = await supabase.from('bull_bro_inbox').select('*', { count: 'exact', head: true });
  const { data: withText } = await supabase.from('bull_bro_inbox').select('id').not('reply_text', 'is', null).not('reply_text', 'like', 'Replied to:%');
  console.log(`\n📬 Total: ${count} | With full text: ${withText?.length || 0}`);
}

syncThreads().catch(console.error);
