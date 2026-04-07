#!/usr/bin/env node
/**
 * Capture Domain Stats from SmartLead API
 * 
 * Fetches email account data and aggregates by domain.
 * Stores daily snapshots to Supabase for historical tracking.
 * 
 * Usage:
 *   node capture-domain-stats.js           # Capture and save to Supabase
 *   node capture-domain-stats.js --json    # Output JSON only
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'domain-config.json');

// Load domain configuration
function loadDomainConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.log('[DOMAIN-STATS] Warning: Could not load domain config:', e.message);
  }
  return { providers: {}, domains: {}, providerDetection: { rules: [] } };
}

// Detect provider based on domain and account type
function detectProvider(domain, accountType, accountCount, domainConfig) {
  // Check explicit domain config first
  if (domainConfig.domains[domain]) {
    return domainConfig.domains[domain].provider;
  }
  
  // Check TLD-based rules
  const rules = domainConfig.providerDetection?.rules || [];
  for (const rule of rules) {
    if (rule.tld && domain.endsWith(rule.tld)) {
      return rule.provider;
    }
  }
  
  // Check account type rules
  if (accountType === 'GMAIL') {
    return 'google';
  }
  
  // SMTP with 10+ accounts was Hypertide (now disconnected)
  // SMTP with fewer accounts is Zapmail
  if (accountType === 'SMTP' || accountType === 'IMAP') {
    return accountCount >= 10 ? 'hypertide' : 'zapmail';
  }
  
  return 'unknown';
}

// Check if domain is disconnected/deleted
function isDomainDisconnected(domain, domainConfig) {
  const config = domainConfig.domains[domain];
  if (config && config.status === 'disconnected') {
    return true;
  }
  const provider = config?.provider || detectProvider(domain, 'SMTP', 0, domainConfig);
  const providerConfig = domainConfig.providers[provider];
  return providerConfig?.status === 'disconnected';
}

// Get Supabase credentials from keychain
function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) { return null; }
}

async function getAllEmailAccounts() {
  let allAccounts = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const res = await fetch(`https://server.smartlead.ai/api/v1/email-accounts?offset=${offset}&limit=${limit}&api_key=${API_KEY}`);
    const accounts = await res.json();
    if (!Array.isArray(accounts) || accounts.length === 0) break;
    allAccounts = allAccounts.concat(accounts);
    console.log(`[DOMAIN-STATS] Fetched ${allAccounts.length} accounts...`);
    if (accounts.length < limit) break;
    offset += limit;
    await new Promise(r => setTimeout(r, 200)); // Rate limit
  }
  return allAccounts;
}

async function getCampaignMailboxStats() {
  // Get all campaigns
  const campaignsRes = await fetch(`https://server.smartlead.ai/api/v1/campaigns/?api_key=${API_KEY}`);
  const campaigns = await campaignsRes.json();
  
  const mailboxStats = {};
  const activeCampaigns = campaigns.filter(c => ['ACTIVE', 'COMPLETED', 'PAUSED'].includes(c.status));
  
  for (let i = 0; i < activeCampaigns.length; i++) {
    const campaign = activeCampaigns[i];
    console.log(`[DOMAIN-STATS] Processing campaign ${i + 1}/${activeCampaigns.length}...`);
    
    try {
      const res = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${campaign.id}/mailbox-statistics?api_key=${API_KEY}`);
      const data = await res.json();
      const stats = data?.data || data || [];
      
      for (const stat of stats) {
        const email = stat.from_email;
        if (!email) continue;
        const domain = email.split('@')[1] || 'unknown';
        
        if (!mailboxStats[domain]) {
          mailboxStats[domain] = { sent: 0, replies: 0, bounced: 0 };
        }
        mailboxStats[domain].sent += parseInt(stat.sent_count) || 0;
        mailboxStats[domain].replies += parseInt(stat.reply_count) || 0;
        mailboxStats[domain].bounced += parseInt(stat.bounce_count) || 0;
      }
    } catch (e) {
      // Skip failed campaigns
    }
    
    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }
  
  return mailboxStats;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const quickMode = process.argv.includes('--quick');
  
  // Load domain configuration
  const domainConfig = loadDomainConfig();
  console.log(`[DOMAIN-STATS] Loaded config: ${Object.keys(domainConfig.domains).length} configured domains`);
  
  console.log(`[DOMAIN-STATS] ${quickMode ? '⚡ QUICK MODE - ' : ''}Fetching email accounts...`);
  const accounts = await getAllEmailAccounts();
  console.log(`[DOMAIN-STATS] Got ${accounts.length} accounts`);
  
  let mailboxStats = {};
  if (!quickMode) {
    console.log('[DOMAIN-STATS] Fetching campaign mailbox stats for lifetime data...');
    mailboxStats = await getCampaignMailboxStats();
  } else {
    console.log('[DOMAIN-STATS] Quick mode: skipping campaign mailbox stats (using account data only)');
  }
  
  // Aggregate by domain
  const domains = {};
  
  // First pass: count accounts per domain for provider detection
  const domainAccountCounts = {};
  for (const acc of accounts) {
    const email = acc.from_email || acc.username;
    const domain = email?.split('@')[1] || 'unknown';
    domainAccountCounts[domain] = (domainAccountCounts[domain] || 0) + 1;
  }
  
  for (const acc of accounts) {
    const email = acc.from_email || acc.username;
    const domain = email?.split('@')[1] || 'unknown';
    const type = acc.type || 'UNKNOWN';
    
    // Use new provider detection
    const provider = detectProvider(domain, type, domainAccountCounts[domain], domainConfig);
    const isDisconnected = isDomainDisconnected(domain, domainConfig);
    const domainConfigEntry = domainConfig.domains[domain] || {};
    
    if (!domains[domain]) {
      domains[domain] = {
        domain,
        provider,
        status: isDisconnected ? 'disconnected' : 'active',
        statusNote: isDisconnected ? (domainConfigEntry.finalCheckNote || 'Deleted by Provider') : null,
        deletedAt: domainConfigEntry.deletedAt || null,
        sentToday: 0,
        lifetimeSent: mailboxStats[domain]?.sent || 0,
        lifetimeReplies: mailboxStats[domain]?.replies || 0,
        lifetimeBounced: mailboxStats[domain]?.bounced || 0,
        totalAccounts: 0,
        activeAccounts: 0,
        warmupReplyTotal: 0,
        warmupActiveCount: 0,
        totalCapacity: 0
      };
    }
    
    domains[domain].sentToday += parseInt(acc.daily_sent_count) || 0;
    domains[domain].totalAccounts++;
    domains[domain].totalCapacity += parseInt(acc.message_per_day) || 0;
    
    if (acc.warmup_details?.status === 'ACTIVE') {
      domains[domain].activeAccounts++;
      domains[domain].warmupActiveCount++;
      domains[domain].warmupReplyTotal += parseInt(acc.warmup_details?.reply_rate) || 0;
    }
  }
  
  // Calculate final stats
  const domainList = Object.values(domains).map(d => {
    const sent = d.lifetimeSent || 0;
    return {
      domain: d.domain,
      provider: d.provider,
      status: d.status || 'active',
      statusNote: d.statusNote || null,
      deletedAt: d.deletedAt || null,
      sentToday: d.sentToday,
      lifetimeSent: sent,
      lifetimeReplies: d.lifetimeReplies,
      replyRate: sent > 0 ? ((d.lifetimeReplies / sent) * 100).toFixed(2) : '0.00',
      bounce: d.lifetimeBounced,
      bounceRate: sent > 0 ? ((d.lifetimeBounced / sent) * 100).toFixed(2) : '0.00',
      warmupReplyRate: d.warmupActiveCount > 0 ? Math.round(d.warmupReplyTotal / d.warmupActiveCount) : 0,
      activeAccounts: d.activeAccounts,
      totalAccounts: d.totalAccounts,
      dailyCapacity: d.totalCapacity,
      score: d.status === 'disconnected' ? 0 : calculateScore(d)
    };
  }).sort((a, b) => {
    // Active domains first, then by sentToday
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.sentToday - a.sentToday;
  });
  
  // Separate active and disconnected domains
  const activeDomains = domainList.filter(d => d.status === 'active');
  const disconnectedDomains = domainList.filter(d => d.status === 'disconnected');
  
  // Calculate summary (only active domains count toward performance)
  const summary = {
    capturedAt: new Date().toISOString(),
    totalDomains: domainList.length,
    activeDomains: activeDomains.length,
    disconnectedDomains: disconnectedDomains.length,
    totalAccounts: activeDomains.reduce((s, d) => s + d.totalAccounts, 0),
    activeAccounts: activeDomains.reduce((s, d) => s + d.activeAccounts, 0),
    sentToday: activeDomains.reduce((s, d) => s + d.sentToday, 0),
    lifetimeSent: activeDomains.reduce((s, d) => s + d.lifetimeSent, 0),
    lifetimeReplies: activeDomains.reduce((s, d) => s + d.lifetimeReplies, 0),
    dailyCapacity: activeDomains.reduce((s, d) => s + d.dailyCapacity, 0),
    providers: {
      hypertide: summarizeProvider(domainList.filter(d => d.provider === 'hypertide'), true),
      google: summarizeProvider(domainList.filter(d => d.provider === 'google')),
      zapmail: summarizeProvider(domainList.filter(d => d.provider === 'zapmail'))
    }
  };
  
  // Log disconnected domains warning
  if (disconnectedDomains.length > 0) {
    console.log(`[DOMAIN-STATS] ⚠️ ${disconnectedDomains.length} disconnected domains excluded from active stats:`);
    disconnectedDomains.forEach(d => console.log(`  - ${d.domain} (${d.provider}): ${d.statusNote || 'Deleted'}`));
  }
  
  const output = { summary, domains: domainList };
  
  if (jsonOnly) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  // Save to file
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `domain-stats-${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
  console.log(`[DOMAIN-STATS] Saved to ${filePath}`);
  
  // Upsert to Supabase
  console.log('[DOMAIN-STATS] Upserting to Supabase...');
  const url = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
  const key = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');
  
  if (!url || !key) {
    console.log('[DOMAIN-STATS] No Supabase credentials, skipping database save');
    return;
  }
  
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  
  const records = domainList.map(d => ({
    snapshot_date: date,
    domain: d.domain,
    reputation: d.score,
    warmup_reply_rate: d.warmupReplyRate,
    active_accounts: d.activeAccounts,
    total_accounts: d.totalAccounts,
    daily_capacity: d.dailyCapacity,
    campaign_sends: d.lifetimeSent,
    campaign_replies: d.lifetimeReplies,
    bounce_rate: parseFloat(d.bounceRate),
    metadata: JSON.stringify({
      provider: d.provider,
      status: d.status,
      statusNote: d.statusNote,
      deletedAt: d.deletedAt,
      sentToday: d.sentToday,
      replyRate: d.replyRate,
      bounce: d.bounce,
      lastChecked: new Date().toISOString()
    })
  }));
  
  const { error } = await supabase
    .from('domain_snapshots')
    .upsert(records, { onConflict: 'snapshot_date,domain', ignoreDuplicates: false });
  
  if (error) {
    console.error('[DOMAIN-STATS] Supabase error:', error.message);
  } else {
    console.log(`[DOMAIN-STATS] ✅ Successfully captured stats for ${domainList.length} domains`);
  }
  
  // Print summary
  console.log(`[DOMAIN-STATS] Summary: ${summary.sentToday} sent today, ${summary.lifetimeSent} lifetime, ${summary.lifetimeReplies} replies across ${summary.totalDomains} domains`);
  console.log('[DOMAIN-STATS] Done!');
}

function calculateScore(d) {
  let score = 70; // Base score
  
  // Warmup rate bonus (0-15 points)
  const warmupRate = d.warmupActiveCount > 0 ? d.warmupReplyTotal / d.warmupActiveCount : 0;
  score += Math.min(15, warmupRate / 100 * 15);
  
  // Reply rate bonus (0-10 points)
  const replyRate = d.lifetimeSent > 0 ? (d.lifetimeReplies / d.lifetimeSent) * 100 : 0;
  score += Math.min(10, replyRate * 5);
  
  // Bounce penalty (-10 to 0)
  const bounceRate = d.lifetimeSent > 0 ? (d.lifetimeBounced / d.lifetimeSent) * 100 : 0;
  score -= Math.min(10, bounceRate * 5);
  
  // Activity bonus (0-5 points)
  if (d.sentToday > 0) score += 5;
  
  return Math.round(Math.max(0, Math.min(100, score)));
}

function summarizeProvider(domains, isDisconnected = false) {
  const activeDomains = isDisconnected ? [] : domains.filter(d => d.status === 'active');
  const allDomains = domains;
  
  return {
    domains: allDomains.length,
    activeDomains: activeDomains.length,
    disconnected: isDisconnected || domains.some(d => d.status === 'disconnected'),
    accounts: allDomains.reduce((s, d) => s + d.totalAccounts, 0),
    activeAccounts: activeDomains.reduce((s, d) => s + d.totalAccounts, 0),
    sentToday: activeDomains.reduce((s, d) => s + d.sentToday, 0),
    lifetimeSent: allDomains.reduce((s, d) => s + d.lifetimeSent, 0),
    lifetimeReplies: allDomains.reduce((s, d) => s + d.lifetimeReplies, 0),
    replyRate: allDomains.length > 0 ? 
      (allDomains.reduce((s, d) => s + d.lifetimeSent, 0) > 0 ?
        ((allDomains.reduce((s, d) => s + d.lifetimeReplies, 0) / allDomains.reduce((s, d) => s + d.lifetimeSent, 0)) * 100).toFixed(2) : '0.00') : '0.00',
    status: isDisconnected ? 'disconnected' : 'active'
  };
}

main().catch(e => {
  console.error('[DOMAIN-STATS] Error:', e);
  process.exit(1);
});
