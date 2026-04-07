#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

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

async function searchAllCampaignsForEmail(email, campaigns) {
  for (const camp of campaigns) {
    // Full pagination search
    let offset = 0;
    while (offset < 10000) {
      const url = `${BASE_URL}/campaigns/${camp.id}/leads?api_key=${API_KEY}&limit=100&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const leads = data.data || [];
      
      const match = leads.find(l => l.lead?.email?.toLowerCase() === email.toLowerCase());
      if (match) {
        return { campaignId: camp.id, campaignName: camp.name, leadId: match.lead.id };
      }
      
      if (leads.length < 100) break;
      offset += 100;
      await new Promise(r => setTimeout(r, 20));
    }
  }
  return null;
}

async function getMessageHistory(campaignId, leadId) {
  const url = `${BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  // Get all campaigns
  const campsRes = await fetch(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
  const campaigns = await campsRes.json();
  console.log('Searching', campaigns.length, 'campaigns\n');

  // Get missing emails
  const { data: missing } = await supabase
    .from('positive_replies')
    .select('id, lead_email')
    .is('response_time_seconds', null);
  
  const uniqueEmails = [...new Set(missing.map(m => m.lead_email))];
  console.log('Searching for', uniqueEmails.length, 'unique emails...\n');

  let found = 0, notFound = 0;

  for (const email of uniqueEmails) {
    process.stdout.write(`Searching ${email}... `);
    
    const result = await searchAllCampaignsForEmail(email, campaigns);
    
    if (result) {
      console.log('FOUND in', result.campaignName.substring(0, 30));
      
      // Get message history
      const history = await getMessageHistory(result.campaignId, result.leadId);
      if (history?.history) {
        const messages = history.history;
        
        // Find REPLY -> SENT pairs
        for (let i = 0; i < messages.length; i++) {
          if (messages[i].type === 'REPLY') {
            const replyTime = new Date(messages[i].time);
            const nextSent = messages.slice(i + 1).find(m => m.type === 'SENT');
            
            if (nextSent) {
              const responseSeconds = Math.floor((new Date(nextSent.time) - replyTime) / 1000);
              
              // Update ALL records for this email
              const { error } = await supabase
                .from('positive_replies')
                .update({
                  response_time_seconds: responseSeconds,
                  replied_at: replyTime.toISOString(),
                  our_sent_at: nextSent.time
                })
                .eq('lead_email', email)
                .is('response_time_seconds', null);
              
              if (!error) {
                found++;
                console.log(`  ✓ Updated: ${(responseSeconds/3600).toFixed(1)}h response time`);
              }
              break;
            }
          }
        }
      }
    } else {
      console.log('NOT FOUND');
      notFound++;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n=== DONE ===');
  console.log('Found & updated:', found);
  console.log('Not found:', notFound);
  
  // Final count
  const { count } = await supabase.from('positive_replies').select('*', { count: 'exact', head: true }).not('response_time_seconds', 'is', null);
  console.log('Total with response time:', count, '/ 242');
}

main().catch(console.error);
