#!/usr/bin/env node
/**
 * Auto-register webhooks for all active campaigns
 * Run hourly to catch new campaigns
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API_KEY = process.env.SMARTLEAD_API_KEY;
const WEBHOOK_URL = 'https://bull-os-production.up.railway.app/api/smartlead-webhook';

async function registerWebhooks() {
  console.log(`[${new Date().toISOString()}] Checking webhooks for all campaigns...`);
  
  // Get all campaigns
  const res = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${API_KEY}`);
  if (!res.ok) {
    console.error('Failed to fetch campaigns:', res.status);
    return;
  }
  
  const campaigns = await res.json();
  const active = campaigns.filter(c => c.status === 'ACTIVE');
  
  console.log(`Found ${active.length} active campaigns`);
  
  let registered = 0;
  let alreadySet = 0;
  let errors = 0;
  
  for (const campaign of active) {
    try {
      // Check current webhook
      const whRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${campaign.id}/webhook?api_key=${API_KEY}`);
      const wh = await whRes.json();
      
      if (wh && wh.url === WEBHOOK_URL) {
        alreadySet++;
        continue;
      }
      
      // Register webhook
      const regRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${campaign.id}/webhook?api_key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          event_types: ['EMAIL_REPLIED']
        })
      });
      
      if (regRes.ok) {
        console.log(`✅ Registered webhook for: ${campaign.name}`);
        registered++;
      } else {
        console.error(`❌ Failed to register for ${campaign.name}:`, await regRes.text());
        errors++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e) {
      console.error(`Error processing ${campaign.name}:`, e.message);
      errors++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Already set: ${alreadySet}`);
  console.log(`Newly registered: ${registered}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total active: ${active.length}`);
}

registerWebhooks().catch(console.error);
