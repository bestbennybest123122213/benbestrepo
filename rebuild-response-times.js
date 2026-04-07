#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

const POSITIVE_CATEGORIES = ['Meeting Request', 'Booked', 'Meeting Booked', 'Interested', 'Information Request', 'Demo Request'];

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) { return null; }
}

const supabase = createClient(
  getFromKeychain('supabase-url'),
  getFromKeychain('supabase-service-key'),
  { auth: { persistSession: false } }
);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function getAllPositiveLeads() {
  const campaigns = await fetchJson(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
  const allPositive = [];
  
  console.log(`Scanning ${campaigns.length} campaigns for positive replies...\n`);
  
  for (const camp of campaigns) {
    let offset = 0;
    let campPositive = 0;
    
    while (offset < 10000) {
      const stats = await fetchJson(`${BASE_URL}/campaigns/${camp.id}/statistics?api_key=${API_KEY}&limit=100&offset=${offset}`);
      if (!stats) break;
      const data = stats.data || stats;
      if (!Array.isArray(data) || data.length === 0) break;
      
      const positive = data.filter(s => 
        s.lead_category && POSITIVE_CATEGORIES.some(cat => 
          s.lead_category.toLowerCase().includes(cat.toLowerCase())
        )
      );
      
      positive.forEach(p => {
        allPositive.push({
          campaignId: camp.id,
          campaignName: camp.name,
          email: p.lead_email,
          name: p.lead_name,
          category: p.lead_category,
          replyTime: p.reply_time,
          statsId: p.stats_id
        });
      });
      
      campPositive += positive.length;
      if (data.length < 100) break;
      offset += 100;
      await new Promise(r => setTimeout(r, 30));
    }
    
    if (campPositive > 0) {
      console.log(`${camp.name.substring(0, 40)}: ${campPositive} positive`);
    }
  }
  
  return allPositive;
}

async function getLeadIdByEmail(campaignId, email) {
  let offset = 0;
  while (offset < 10000) {
    const data = await fetchJson(`${BASE_URL}/campaigns/${campaignId}/leads?api_key=${API_KEY}&limit=100&offset=${offset}`);
    if (!data?.data) break;
    const match = data.data.find(l => l.lead?.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.lead.id;
    if (data.data.length < 100) break;
    offset += 100;
    await new Promise(r => setTimeout(r, 20));
  }
  return null;
}

async function main() {
  // Get all positive leads from SmartLead
  const positiveLeads = await getAllPositiveLeads();
  console.log(`\nTotal positive leads found: ${positiveLeads.length}`);
  
  // Process each and get response times
  let processed = 0, withResponseTime = 0, noResponse = 0, errors = 0;
  
  console.log('\nProcessing message histories...\n');
  
  for (const lead of positiveLeads) {
    processed++;
    process.stdout.write(`\r${processed}/${positiveLeads.length} | ✓${withResponseTime} | ○${noResponse} | ✗${errors}`);
    
    // Get numeric lead ID
    const leadId = await getLeadIdByEmail(lead.campaignId, lead.email);
    if (!leadId) { errors++; continue; }
    
    // Get message history
    const history = await fetchJson(`${BASE_URL}/campaigns/${lead.campaignId}/leads/${leadId}/message-history?api_key=${API_KEY}`);
    if (!history?.history) { errors++; continue; }
    
    const messages = history.history;
    
    // Find REPLY -> SENT pairs and calculate response times
    const responseTimes = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].type === 'REPLY') {
        const replyTime = new Date(messages[i].time);
        const nextSent = messages.slice(i + 1).find(m => m.type === 'SENT');
        
        if (nextSent) {
          const sentTime = new Date(nextSent.time);
          responseTimes.push({
            replyAt: replyTime.toISOString(),
            responseAt: sentTime.toISOString(),
            responseSeconds: Math.floor((sentTime - replyTime) / 1000)
          });
        }
      }
    }
    
    if (responseTimes.length > 0) {
      // Upsert to Supabase
      const { error } = await supabase.from('positive_replies').upsert({
        campaign_id: lead.campaignId.toString(),
        campaign_name: lead.campaignName,
        lead_email: lead.email,
        lead_name: lead.name,
        reply_category: lead.category,
        replied_at: responseTimes[0].replyAt,
        our_sent_at: responseTimes[0].responseAt,
        response_time_seconds: responseTimes[0].responseSeconds,
        follow_up_status: 'pending'
      }, { onConflict: 'lead_email,campaign_id' });
      
      if (!error) withResponseTime++;
      else errors++;
    } else {
      noResponse++;
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n\n=== DONE ===');
  console.log(`Processed: ${processed}`);
  console.log(`With response time: ${withResponseTime}`);
  console.log(`No response yet: ${noResponse}`);
  console.log(`Errors: ${errors}`);
  
  // Final count
  const { count } = await supabase.from('positive_replies').select('*', { count: 'exact', head: true }).not('response_time_seconds', 'is', null);
  console.log(`\nTotal in DB with response time: ${count}`);
}

main().catch(console.error);
