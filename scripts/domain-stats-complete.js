#!/usr/bin/env node
/**
 * Complete Domain Stats - 7D, 14D, 30D, Lifetime
 * 
 * Combines:
 * - Exact lifetime stats from mailbox-statistics API
 * - Day-wise overall totals from analytics API
 * - Domain capacity for proportional distribution
 * 
 * SENDS: Calculated using domain proportion of overall day-wise stats
 * REPLIES: From mailbox-statistics (lifetime exact, time-periods proportional)
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
        await delay(30000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await delay(2000 * attempt);
    }
  }
}

async function getDayWiseStats(days) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  
  const start = startDate.toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);
  
  const data = await apiRequest(`/analytics/day-wise-overall-stats?start_date=${start}&end_date=${end}`);
  
  const stats = { sent: 0, replied: 0, bounced: 0 };
  if (data.data?.day_wise_stats) {
    for (const day of data.data.day_wise_stats) {
      stats.sent += day.email_engagement_metrics?.sent || 0;
      stats.replied += day.email_engagement_metrics?.replied || 0;
      stats.bounced += day.email_engagement_metrics?.bounced || 0;
    }
  }
  return stats;
}

async function getMailboxStats() {
  const campaigns = await apiRequest('/campaigns/');
  const activeCampaigns = campaigns.filter(c => 
    ['ACTIVE', 'COMPLETED', 'PAUSED', 'STOPPED'].includes(c.status)
  );
  
  const senderStats = {};
  
  for (let i = 0; i < activeCampaigns.length; i++) {
    const campaign = activeCampaigns[i];
    if ((i + 1) % 10 === 0) log(`Mailbox stats: ${i + 1}/${activeCampaigns.length}`);
    
    try {
      const mailboxRes = await apiRequest(`/campaigns/${campaign.id}/mailbox-statistics`);
      const stats = mailboxRes?.data || mailboxRes || [];
      
      for (const stat of stats) {
        const email = stat.from_email;
        if (!email) continue;
        
        if (!senderStats[email]) {
          senderStats[email] = {
            email,
            domain: email.split('@')[1],
            sent: 0, replied: 0, bounced: 0, opened: 0
          };
        }
        
        senderStats[email].sent += parseInt(stat.sent_count) || 0;
        senderStats[email].replied += parseInt(stat.reply_count) || 0;
        senderStats[email].bounced += parseInt(stat.bounce_count) || 0;
        senderStats[email].opened += parseInt(stat.open_count) || 0;
      }
    } catch (e) {}
    
    await delay(250);
  }
  
  // Aggregate by domain
  const domainStats = {};
  for (const sender of Object.values(senderStats)) {
    const d = sender.domain;
    if (!domainStats[d]) {
      domainStats[d] = { domain: d, senderCount: 0, sent: 0, replied: 0, bounced: 0, opened: 0 };
    }
    domainStats[d].senderCount++;
    domainStats[d].sent += sender.sent;
    domainStats[d].replied += sender.replied;
    domainStats[d].bounced += sender.bounced;
    domainStats[d].opened += sender.opened;
  }
  
  return Object.values(domainStats);
}

async function getEmailAccountCapacity() {
  let allAccounts = [];
  let offset = 0;
  
  while (true) {
    const accounts = await apiRequest(`/email-accounts?offset=${offset}&limit=100`);
    if (!Array.isArray(accounts) || accounts.length === 0) break;
    allAccounts = allAccounts.concat(accounts);
    if (accounts.length < 100) break;
    offset += 100;
    await delay(200);
  }
  
  const domains = {};
  let totalCapacity = 0;
  
  for (const acc of allAccounts) {
    const email = acc.from_email || acc.username;
    const domain = email?.split('@')[1] || 'unknown';
    const capacity = parseInt(acc.message_per_day) || 0;
    
    if (!domains[domain]) {
      domains[domain] = { capacity: 0, accounts: 0 };
    }
    domains[domain].capacity += capacity;
    domains[domain].accounts++;
    totalCapacity += capacity;
  }
  
  // Calculate proportions
  for (const d of Object.values(domains)) {
    d.proportion = totalCapacity > 0 ? d.capacity / totalCapacity : 0;
  }
  
  return { domains, totalCapacity };
}

async function main() {
  log('=== Complete Domain Stats (7D, 14D, 30D, Lifetime) ===');
  
  // Get day-wise totals for each period
  log('Fetching day-wise stats...');
  const [stats7d, stats14d, stats30d] = await Promise.all([
    getDayWiseStats(7),
    getDayWiseStats(14),
    getDayWiseStats(30)
  ]);
  
  log(`Overall totals - 7D: ${stats7d.sent} sent | 14D: ${stats14d.sent} sent | 30D: ${stats30d.sent} sent`);
  
  // Get domain capacity proportions
  log('Fetching domain capacities...');
  const { domains: capacityData } = await getEmailAccountCapacity();
  
  // Get exact lifetime stats per domain
  log('Fetching mailbox statistics (this takes ~1 min)...');
  const lifetimeStats = await getMailboxStats();
  
  // Calculate totals for proportion reference
  const lifetimeTotals = lifetimeStats.reduce((acc, d) => ({
    sent: acc.sent + d.sent,
    replied: acc.replied + d.replied,
    bounced: acc.bounced + d.bounced
  }), { sent: 0, replied: 0, bounced: 0 });
  
  log(`Lifetime totals: ${lifetimeTotals.sent} sent, ${lifetimeTotals.replied} replied`);
  
  // Build final stats per domain
  const results = lifetimeStats.map(domain => {
    const capacity = capacityData[domain.domain];
    const proportion = capacity?.proportion || 0;
    
    // Calculate time-period sends using capacity proportion
    const sent7d = Math.round(stats7d.sent * proportion);
    const sent14d = Math.round(stats14d.sent * proportion);
    const sent30d = Math.round(stats30d.sent * proportion);
    
    // Calculate time-period replies proportionally based on lifetime distribution
    const domainReplyRatio = lifetimeTotals.replied > 0 ? domain.replied / lifetimeTotals.replied : 0;
    const replied7d = Math.round(stats7d.replied * domainReplyRatio);
    const replied14d = Math.round(stats14d.replied * domainReplyRatio);
    const replied30d = Math.round(stats30d.replied * domainReplyRatio);
    
    // Bounce calculation
    const domainBounceRatio = lifetimeTotals.bounced > 0 ? domain.bounced / lifetimeTotals.bounced : 0;
    const bounced7d = Math.round(stats7d.bounced * domainBounceRatio);
    const bounced14d = Math.round(stats14d.bounced * domainBounceRatio);
    const bounced30d = Math.round(stats30d.bounced * domainBounceRatio);
    
    return {
      domain: domain.domain,
      senderCount: domain.senderCount,
      
      // Lifetime (EXACT from mailbox-statistics)
      lifetime: {
        sent: domain.sent,
        replied: domain.replied,
        bounced: domain.bounced,
        replyRate: domain.sent > 0 ? ((domain.replied / domain.sent) * 100).toFixed(2) : '0.00',
        bounceRate: domain.sent > 0 ? ((domain.bounced / domain.sent) * 100).toFixed(2) : '0.00'
      },
      
      // 30 days (proportional estimate)
      d30: {
        sent: sent30d,
        replied: replied30d,
        bounced: bounced30d,
        replyRate: sent30d > 0 ? ((replied30d / sent30d) * 100).toFixed(2) : '0.00',
        bounceRate: sent30d > 0 ? ((bounced30d / sent30d) * 100).toFixed(2) : '0.00'
      },
      
      // 14 days (proportional estimate)
      d14: {
        sent: sent14d,
        replied: replied14d,
        bounced: bounced14d,
        replyRate: sent14d > 0 ? ((replied14d / sent14d) * 100).toFixed(2) : '0.00',
        bounceRate: sent14d > 0 ? ((bounced14d / sent14d) * 100).toFixed(2) : '0.00'
      },
      
      // 7 days (proportional estimate)
      d7: {
        sent: sent7d,
        replied: replied7d,
        bounced: bounced7d,
        replyRate: sent7d > 0 ? ((replied7d / sent7d) * 100).toFixed(2) : '0.00',
        bounceRate: sent7d > 0 ? ((bounced7d / sent7d) * 100).toFixed(2) : '0.00'
      }
    };
  }).sort((a, b) => b.lifetime.sent - a.lifetime.sent);
  
  // Save results
  const outputPath = path.join(DATA_DIR, `domain-stats-complete-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    methodology: {
      lifetime: 'EXACT from campaign mailbox-statistics API',
      timePeriods: 'Proportional estimate using domain capacity ratio applied to day-wise totals'
    },
    overallTotals: {
      d7: stats7d,
      d14: stats14d,
      d30: stats30d,
      lifetime: lifetimeTotals
    },
    domains: results
  }, null, 2));
  
  log(`Saved to: ${outputPath}`);
  
  // Print comprehensive report
  console.log('\n' + '='.repeat(120));
  console.log('DOMAIN PERFORMANCE REPORT - All Time Periods');
  console.log('='.repeat(120));
  console.log('Note: Lifetime = EXACT | 30D/14D/7D = Proportional estimates based on domain capacity');
  console.log('='.repeat(120));
  
  console.log('\n--- LIFETIME (EXACT) ---');
  console.log('Domain                          | Sent    | Reply | Reply% | Bounce | Bounce%');
  console.log('-'.repeat(85));
  for (const d of results) {
    const name = d.domain.padEnd(30);
    const bounceFlag = parseFloat(d.lifetime.bounceRate) > 3 ? '🔴' : parseFloat(d.lifetime.bounceRate) > 2 ? '🟠' : '🟢';
    console.log(`${name} | ${String(d.lifetime.sent).padStart(7)} | ${String(d.lifetime.replied).padStart(5)} | ${d.lifetime.replyRate.padStart(6)}% | ${String(d.lifetime.bounced).padStart(6)} | ${d.lifetime.bounceRate.padStart(6)}% ${bounceFlag}`);
  }
  
  console.log('\n--- LAST 30 DAYS (Estimated) ---');
  console.log('Domain                          | Sent    | Reply | Reply% | Bounce | Bounce%');
  console.log('-'.repeat(85));
  for (const d of results) {
    const name = d.domain.padEnd(30);
    const bounceFlag = parseFloat(d.d30.bounceRate) > 3 ? '🔴' : parseFloat(d.d30.bounceRate) > 2 ? '🟠' : '🟢';
    console.log(`${name} | ${String(d.d30.sent).padStart(7)} | ${String(d.d30.replied).padStart(5)} | ${d.d30.replyRate.padStart(6)}% | ${String(d.d30.bounced).padStart(6)} | ${d.d30.bounceRate.padStart(6)}% ${bounceFlag}`);
  }
  
  console.log('\n--- LAST 14 DAYS (Estimated) ---');
  console.log('Domain                          | Sent    | Reply | Reply% | Bounce | Bounce%');
  console.log('-'.repeat(85));
  for (const d of results) {
    const name = d.domain.padEnd(30);
    const bounceFlag = parseFloat(d.d14.bounceRate) > 3 ? '🔴' : parseFloat(d.d14.bounceRate) > 2 ? '🟠' : '🟢';
    console.log(`${name} | ${String(d.d14.sent).padStart(7)} | ${String(d.d14.replied).padStart(5)} | ${d.d14.replyRate.padStart(6)}% | ${String(d.d14.bounced).padStart(6)} | ${d.d14.bounceRate.padStart(6)}% ${bounceFlag}`);
  }
  
  console.log('\n--- LAST 7 DAYS (Estimated) ---');
  console.log('Domain                          | Sent    | Reply | Reply% | Bounce | Bounce%');
  console.log('-'.repeat(85));
  for (const d of results) {
    const name = d.domain.padEnd(30);
    const bounceFlag = parseFloat(d.d7.bounceRate) > 3 ? '🔴' : parseFloat(d.d7.bounceRate) > 2 ? '🟠' : '🟢';
    console.log(`${name} | ${String(d.d7.sent).padStart(7)} | ${String(d.d7.replied).padStart(5)} | ${d.d7.replyRate.padStart(6)}% | ${String(d.d7.bounced).padStart(6)} | ${d.d7.bounceRate.padStart(6)}% ${bounceFlag}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('='.repeat(120));
  console.log(`Total domains: ${results.length}`);
  console.log(`\nOverall stats:`);
  console.log(`  Lifetime: ${lifetimeTotals.sent} sent | ${lifetimeTotals.replied} replied (${(lifetimeTotals.replied/lifetimeTotals.sent*100).toFixed(2)}%) | ${lifetimeTotals.bounced} bounced (${(lifetimeTotals.bounced/lifetimeTotals.sent*100).toFixed(2)}%)`);
  console.log(`  30 days:  ${stats30d.sent} sent | ${stats30d.replied} replied (${(stats30d.replied/stats30d.sent*100).toFixed(2)}%) | ${stats30d.bounced} bounced (${(stats30d.bounced/stats30d.sent*100).toFixed(2)}%)`);
  console.log(`  14 days:  ${stats14d.sent} sent | ${stats14d.replied} replied (${(stats14d.replied/stats14d.sent*100).toFixed(2)}%) | ${stats14d.bounced} bounced (${(stats14d.bounced/stats14d.sent*100).toFixed(2)}%)`);
  console.log(`  7 days:   ${stats7d.sent} sent | ${stats7d.replied} replied (${(stats7d.replied/stats7d.sent*100).toFixed(2)}%) | ${stats7d.bounced} bounced (${(stats7d.bounced/stats7d.sent*100).toFixed(2)}%)`);
  
  // Problem domains
  const problemDomains = results.filter(d => parseFloat(d.lifetime.bounceRate) > 3);
  if (problemDomains.length > 0) {
    console.log('\n🚨 HIGH BOUNCE DOMAINS (>3%):');
    for (const d of problemDomains) {
      console.log(`   ${d.domain}: ${d.lifetime.bounceRate}% bounce`);
    }
  } else {
    console.log('\n✅ All domains have healthy bounce rates (<3%)');
  }
  
  // Top performers
  const topDomains = results.filter(d => parseFloat(d.lifetime.replyRate) > 2 && d.lifetime.sent > 100);
  if (topDomains.length > 0) {
    console.log('\n🌟 TOP PERFORMERS (>2% reply, >100 sent):');
    for (const d of topDomains) {
      console.log(`   ${d.domain}: ${d.lifetime.replyRate}% reply`);
    }
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
