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

async function findLeadInCampaign(campaignId, email) {
  let offset = 0;
  while (offset < 2000) {
    const url = `${BASE_URL}/campaigns/${campaignId}/leads?api_key=${API_KEY}&limit=100&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const leads = data.data || [];
    
    const match = leads.find(l => l.lead?.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.lead.id;
    
    if (leads.length < 100) break;
    offset += 100;
    await new Promise(r => setTimeout(r, 30));
  }
  return null;
}

async function main() {
  const { data: missing } = await supabase
    .from('positive_replies')
    .select('*')
    .is('response_time_seconds', null);

  console.log(`Processing ${missing.length} positive replies...\n`);

  let filled = 0, noResponse = 0, notFound = 0;

  for (let i = 0; i < missing.length; i++) {
    const r = missing[i];
    process.stdout.write(`\r${i+1}/${missing.length} | ✓${filled} | ○${noResponse} | ✗${notFound}  `);

    // Find numeric lead ID
    const leadId = await findLeadInCampaign(r.campaign_id, r.lead_email);
    if (!leadId) { notFound++; continue; }

    // Get message history
    const histUrl = `${BASE_URL}/campaigns/${r.campaign_id}/leads/${leadId}/message-history?api_key=${API_KEY}`;
    const histRes = await fetch(histUrl);
    if (!histRes.ok) { notFound++; continue; }
    
    const hist = await histRes.json();
    const messages = hist.history || [];
    
    // Find all REPLY -> SENT pairs
    for (let j = 0; j < messages.length; j++) {
      if (messages[j].type === 'REPLY') {
        const replyTime = new Date(messages[j].time);
        // Find next SENT after this reply
        const nextSent = messages.slice(j + 1).find(m => m.type === 'SENT');
        
        if (nextSent) {
          const sentTime = new Date(nextSent.time);
          const responseSeconds = Math.floor((sentTime - replyTime) / 1000);
          
          // Update this reply's response time
          await supabase
            .from('positive_replies')
            .update({
              response_time_seconds: responseSeconds,
              replied_at: replyTime.toISOString(),
              our_sent_at: sentTime.toISOString()
            })
            .eq('id', r.id);
          
          filled++;
        } else {
          noResponse++;
        }
        break; // Only process first reply for this record
      }
    }
    
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Filled: ${filled}`);
  console.log(`   No response yet: ${noResponse}`);
  console.log(`   Not found: ${notFound}`);
}

main().catch(console.error);
