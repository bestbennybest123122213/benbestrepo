#!/usr/bin/env node
/**
 * Get EXACT Per-Domain Stats from Campaign Mailbox Statistics
 * 
 * This aggregates mailbox-statistics from ALL campaigns to get
 * precise per-sender, per-domain totals.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const DATA_DIR = path.join(__dirname, '../data');

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

async function main() {
  log('=== Exact Per-Domain Stats Scraper ===');
  
  // Get all campaigns
  const campaigns = await apiRequest('/campaigns/');
  const activeCampaigns = campaigns.filter(c => 
    ['ACTIVE', 'COMPLETED', 'PAUSED', 'STOPPED'].includes(c.status)
  );
  log(`Found ${activeCampaigns.length} campaigns with potential data`);
  
  // Aggregate sender stats
  const senderStats = {};
  let totalCampaignsWithData = 0;
  
  for (let i = 0; i < activeCampaigns.length; i++) {
    const campaign = activeCampaigns[i];
    
    if ((i + 1) % 10 === 0 || i === 0) {
      log(`Processing campaign ${i + 1}/${activeCampaigns.length}: ${campaign.name.slice(0, 40)}`);
    }
    
    try {
      const mailboxRes = await apiRequest(`/campaigns/${campaign.id}/mailbox-statistics`);
      const stats = mailboxRes?.data || mailboxRes || [];
      
      if (stats.length > 0) {
        totalCampaignsWithData++;
        
        for (const stat of stats) {
          const email = stat.from_email;
          if (!email) continue;
          
          if (!senderStats[email]) {
            senderStats[email] = {
              email,
              domain: email.split('@')[1],
              campaigns: [],
              sent: 0,
              opened: 0,
              replied: 0,
              clicked: 0,
              bounced: 0,
              unsubscribed: 0
            };
          }
          
          senderStats[email].campaigns.push(campaign.id);
          senderStats[email].sent += parseInt(stat.sent_count) || 0;
          senderStats[email].opened += parseInt(stat.open_count) || 0;
          senderStats[email].replied += parseInt(stat.reply_count) || 0;
          senderStats[email].clicked += parseInt(stat.click_count) || 0;
          senderStats[email].bounced += parseInt(stat.bounce_count) || 0;
          senderStats[email].unsubscribed += parseInt(stat.unsubscribed_count) || 0;
        }
      }
    } catch (e) {
      log(`  Error on campaign ${campaign.id}: ${e.message}`);
    }
    
    await delay(300); // Rate limiting
  }
  
  log(`\nProcessed ${totalCampaignsWithData} campaigns with mailbox data`);
  log(`Found ${Object.keys(senderStats).length} unique sender emails`);
  
  // Aggregate by domain
  const domainStats = {};
  
  for (const sender of Object.values(senderStats)) {
    const domain = sender.domain;
    
    if (!domainStats[domain]) {
      domainStats[domain] = {
        domain,
        senders: [],
        sent: 0,
        opened: 0,
        replied: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0
      };
    }
    
    domainStats[domain].senders.push(sender.email);
    domainStats[domain].sent += sender.sent;
    domainStats[domain].opened += sender.opened;
    domainStats[domain].replied += sender.replied;
    domainStats[domain].clicked += sender.clicked;
    domainStats[domain].bounced += sender.bounced;
    domainStats[domain].unsubscribed += sender.unsubscribed;
  }
  
  // Calculate rates and sort
  const domainList = Object.values(domainStats).map(d => ({
    domain: d.domain,
    senderCount: d.senders.length,
    sent: d.sent,
    opened: d.opened,
    replied: d.replied,
    clicked: d.clicked,
    bounced: d.bounced,
    unsubscribed: d.unsubscribed,
    replyRate: d.sent > 0 ? ((d.replied / d.sent) * 100).toFixed(2) : '0.00',
    bounceRate: d.sent > 0 ? ((d.bounced / d.sent) * 100).toFixed(2) : '0.00',
    openRate: d.sent > 0 ? ((d.opened / d.sent) * 100).toFixed(2) : '0.00'
  })).sort((a, b) => b.sent - a.sent);
  
  // Save results
  const outputPath = path.join(DATA_DIR, `domain-stats-exact-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    source: 'campaign-mailbox-statistics',
    note: 'EXACT lifetime stats per domain across all campaigns',
    totalCampaigns: activeCampaigns.length,
    campaignsWithData: totalCampaignsWithData,
    totalSenders: Object.keys(senderStats).length,
    totalDomains: domainList.length,
    domains: domainList,
    senders: Object.values(senderStats).sort((a, b) => b.sent - a.sent)
  }, null, 2));
  
  log(`\nSaved to: ${outputPath}`);
  
  // Print summary
  console.log('\n' + '='.repeat(90));
  console.log('EXACT DOMAIN STATS (Lifetime across all campaigns)');
  console.log('='.repeat(90));
  console.log('Domain                          | Sent    | Reply | Reply% | Bounce | Bounce% | Senders');
  console.log('-'.repeat(90));
  
  for (const d of domainList) {
    const name = d.domain.padEnd(30);
    const sent = String(d.sent).padStart(7);
    const replied = String(d.replied).padStart(5);
    const replyPct = d.replyRate.padStart(6);
    const bounced = String(d.bounced).padStart(6);
    const bouncePct = d.bounceRate.padStart(7);
    const senders = String(d.senderCount).padStart(7);
    
    // Color code bounce rate
    const bounceWarning = parseFloat(d.bounceRate) > 3 ? '🔴' : parseFloat(d.bounceRate) > 2 ? '🟠' : '🟢';
    
    console.log(`${name} | ${sent} | ${replied} | ${replyPct}% | ${bounced} | ${bouncePct}% ${bounceWarning} | ${senders}`);
  }
  
  // Summary stats
  const totals = domainList.reduce((acc, d) => ({
    sent: acc.sent + d.sent,
    replied: acc.replied + d.replied,
    bounced: acc.bounced + d.bounced
  }), { sent: 0, replied: 0, bounced: 0 });
  
  console.log('-'.repeat(90));
  console.log(`TOTALS: ${totals.sent} sent | ${totals.replied} replied (${(totals.replied/totals.sent*100).toFixed(2)}%) | ${totals.bounced} bounced (${(totals.bounced/totals.sent*100).toFixed(2)}%)`);
  
  // Identify problem domains
  const problemDomains = domainList.filter(d => parseFloat(d.bounceRate) > 3 && d.sent > 100);
  if (problemDomains.length > 0) {
    console.log('\n🚨 HIGH BOUNCE DOMAINS (>3% bounce, >100 sent):');
    for (const d of problemDomains) {
      console.log(`   ${d.domain}: ${d.bounceRate}% bounce (${d.bounced}/${d.sent})`);
    }
  }
  
  // Identify best performing domains
  const bestDomains = domainList.filter(d => parseFloat(d.replyRate) > 2 && d.sent > 100);
  if (bestDomains.length > 0) {
    console.log('\n🌟 TOP PERFORMING DOMAINS (>2% reply, >100 sent):');
    for (const d of bestDomains) {
      console.log(`   ${d.domain}: ${d.replyRate}% reply (${d.replied}/${d.sent})`);
    }
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
