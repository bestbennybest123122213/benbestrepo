#!/usr/bin/env node
/**
 * Scrape Lead Message History for Exact Per-Domain Stats
 * 
 * Goes campaign by campaign, lead by lead, to get exact send data
 * with timestamps and sender emails.
 * 
 * This is slow but gives EXACT data.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const DATA_DIR = path.join(__dirname, '../data');
const PROGRESS_FILE = path.join(DATA_DIR, 'lead-history-progress.json');

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function apiRequest(endpoint, retries = 3) {
  const url = `https://server.smartlead.ai/api/v1${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      
      if (res.status === 429) {
        log(`Rate limited, waiting 30s...`);
        await delay(30000);
        continue;
      }
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      return await res.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await delay(2000 * attempt);
    }
  }
}

async function getCampaigns() {
  log('Fetching campaigns...');
  const campaigns = await apiRequest('/campaigns/');
  return campaigns.filter(c => ['ACTIVE', 'COMPLETED', 'PAUSED'].includes(c.status));
}

async function getCampaignLeads(campaignId) {
  const allLeads = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const leads = await apiRequest(`/campaigns/${campaignId}/leads?offset=${offset}&limit=${limit}`);
    if (!Array.isArray(leads) || leads.length === 0) break;
    allLeads.push(...leads);
    if (leads.length < limit) break;
    offset += limit;
    await delay(200);
  }
  
  return allLeads;
}

async function getLeadMessageHistory(campaignId, leadId) {
  try {
    const history = await apiRequest(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
    return history || [];
  } catch (e) {
    return [];
  }
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return null;
}

async function main() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startTimestamp = startDate.getTime();
  
  log('=== Lead History Scraper ===');
  log(`Collecting data from last 30 days (since ${startDate.toISOString().slice(0, 10)})`);
  
  // Check for existing progress
  let progress = loadProgress();
  let domainSends = progress?.domainSends || {};
  let processedCampaigns = progress?.processedCampaigns || [];
  let totalMessages = progress?.totalMessages || 0;
  
  if (progress) {
    log(`Resuming from checkpoint: ${processedCampaigns.length} campaigns done, ${totalMessages} messages`);
  }
  
  const campaigns = await getCampaigns();
  log(`Found ${campaigns.length} campaigns to process`);
  
  const remainingCampaigns = campaigns.filter(c => !processedCampaigns.includes(c.id));
  log(`Remaining: ${remainingCampaigns.length} campaigns`);
  
  for (let i = 0; i < remainingCampaigns.length; i++) {
    const campaign = remainingCampaigns[i];
    log(`\n[${i + 1}/${remainingCampaigns.length}] Campaign: ${campaign.name} (${campaign.id})`);
    
    try {
      const leads = await getCampaignLeads(campaign.id);
      log(`  Found ${leads.length} leads`);
      
      let campaignMessages = 0;
      
      for (let j = 0; j < leads.length; j++) {
        const lead = leads[j];
        
        if (j > 0 && j % 50 === 0) {
          log(`  Processing lead ${j}/${leads.length}...`);
        }
        
        const history = await getLeadMessageHistory(campaign.id, lead.id);
        
        for (const msg of history) {
          // Only count our outbound messages
          if (msg.type !== 'SENT' && msg.type !== 'OUTBOUND') continue;
          
          const sentAt = new Date(msg.sent_time || msg.created_at || msg.time);
          if (isNaN(sentAt.getTime())) continue;
          
          // Only count messages in last 30 days
          if (sentAt.getTime() < startTimestamp) continue;
          
          const senderEmail = msg.from_email || msg.sender_email || msg.from;
          if (!senderEmail) continue;
          
          const domain = senderEmail.split('@')[1];
          if (!domain) continue;
          
          const dateKey = sentAt.toISOString().slice(0, 10);
          
          if (!domainSends[domain]) {
            domainSends[domain] = {
              domain,
              totalSent: 0,
              byDate: {},
              senders: new Set()
            };
          }
          
          domainSends[domain].totalSent++;
          domainSends[domain].byDate[dateKey] = (domainSends[domain].byDate[dateKey] || 0) + 1;
          domainSends[domain].senders.add(senderEmail);
          
          totalMessages++;
          campaignMessages++;
        }
        
        await delay(100); // Rate limiting
      }
      
      log(`  Processed ${campaignMessages} messages`);
      processedCampaigns.push(campaign.id);
      
      // Save progress every campaign
      saveProgress({
        domainSends: Object.fromEntries(
          Object.entries(domainSends).map(([k, v]) => [k, {
            ...v,
            senders: Array.from(v.senders)
          }])
        ),
        processedCampaigns,
        totalMessages,
        lastUpdated: new Date().toISOString()
      });
      
    } catch (e) {
      log(`  ERROR: ${e.message}`);
    }
    
    await delay(500);
  }
  
  // Calculate final stats
  const results = {
    capturedAt: new Date().toISOString(),
    period: 'last 30 days',
    totalCampaigns: campaigns.length,
    totalMessages,
    domains: Object.values(domainSends).map(d => {
      const sent7d = Object.entries(d.byDate)
        .filter(([date]) => new Date(date) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((sum, [, count]) => sum + count, 0);
      
      const sent14d = Object.entries(d.byDate)
        .filter(([date]) => new Date(date) >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
        .reduce((sum, [, count]) => sum + count, 0);
      
      const sent30d = d.totalSent;
      
      return {
        domain: d.domain,
        sent7d,
        sent14d,
        sent30d,
        senderCount: Array.isArray(d.senders) ? d.senders.length : d.senders.size,
        byDate: d.byDate
      };
    }).sort((a, b) => b.sent30d - a.sent30d)
  };
  
  // Save final results
  const outputPath = path.join(DATA_DIR, `lead-history-exact-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  log('\n=== COMPLETE ===');
  log(`Total messages processed: ${totalMessages}`);
  log(`Total domains: ${results.domains.length}`);
  log(`Saved to: ${outputPath}`);
  
  // Print summary
  console.log('\n=== Domain Stats (EXACT) ===');
  console.log('Domain                          | 30D   | 14D   | 7D    | Senders');
  console.log('-'.repeat(70));
  for (const d of results.domains.slice(0, 20)) {
    const name = d.domain.padEnd(30);
    console.log(`${name} | ${String(d.sent30d).padStart(5)} | ${String(d.sent14d).padStart(5)} | ${String(d.sent7d).padStart(5)} | ${d.senderCount}`);
  }
  
  // Clean up progress file
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
