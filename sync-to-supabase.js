#!/usr/bin/env node
// Sync current SmartLead data to Supabase
// Run: node sync-to-supabase.js
// Or via cron: 0 0 * * * cd /path/to/domain-health-dashboard && node sync-to-supabase.js

require('dotenv').config();
const supabase = require('./lib/supabase');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

async function apiRequest(endpoint) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getEmailAccounts() {
  const accounts = await apiRequest('/email-accounts/');
  return accounts.filter(a => a.type !== 'WARMUP_POOL');
}

async function getCampaigns() {
  const campaigns = await apiRequest('/campaigns/');
  return campaigns.filter(c => c.status === 'ACTIVE' && !c.parent_campaign_id);
}

async function getCampaignAnalytics(campaignId) {
  try {
    return await apiRequest(`/campaigns/${campaignId}/analytics`);
  } catch (e) {
    console.error(`Failed to get analytics for campaign ${campaignId}:`, e.message);
    return null;
  }
}

async function sync() {
  console.log(`[${new Date().toISOString()}] Starting Supabase sync...`);
  
  // Initialize Supabase
  const client = supabase.initSupabase();
  if (!client) {
    console.error('Failed to initialize Supabase client');
    process.exit(1);
  }
  
  try {
    // 1. Get all email accounts
    console.log('Fetching email accounts...');
    const accounts = await getEmailAccounts();
    console.log(`Found ${accounts.length} email accounts`);
    
    // 2. Aggregate by domain
    const domainMap = {};
    for (const account of accounts) {
      const domain = account.from_email?.split('@')[1];
      if (!domain) continue;
      
      if (!domainMap[domain]) {
        domainMap[domain] = {
          domain,
          accounts: [],
          totalAccounts: 0,
          activeAccounts: 0,
          dailyCapacity: 0,
          warmupRates: [],
          reputation: null
        };
      }
      
      domainMap[domain].accounts.push(account);
      domainMap[domain].totalAccounts++;
      
      if (account.warmup_details?.status === 'ACTIVE') {
        domainMap[domain].activeAccounts++;
        if (account.warmup_details?.reply_rate) {
          domainMap[domain].warmupRates.push(parseFloat(account.warmup_details.reply_rate));
        }
      }
      
      // Add daily capacity (messages_per_day)
      domainMap[domain].dailyCapacity += account.message_per_day || 0;
    }
    
    // Calculate averages
    const domains = Object.values(domainMap).map(d => {
      d.warmupReplyRate = d.warmupRates.length > 0 
        ? d.warmupRates.reduce((a, b) => a + b, 0) / d.warmupRates.length 
        : null;
      d.reputation = d.warmupReplyRate ? Math.min(100, d.warmupReplyRate * 1.05) : null;
      delete d.accounts;
      delete d.warmupRates;
      return d;
    });
    
    console.log(`Aggregated ${domains.length} domains`);
    
    // 3. Get campaigns and their analytics
    console.log('Fetching campaigns...');
    const campaigns = await getCampaigns();
    console.log(`Found ${campaigns.length} active campaigns`);
    
    const campaignData = [];
    let totalLeads = 0, totalReplied = 0, totalInterested = 0;
    
    for (const campaign of campaigns) {
      const analytics = await getCampaignAnalytics(campaign.id);
      if (!analytics) continue;
      
      const leadStats = analytics.campaign_lead_stats || {};
      const data = {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalLeads: parseInt(leadStats.total) || 0,
        sent: parseInt(analytics.sent_count) || 0,
        opened: parseInt(analytics.open_count) || 0,
        replied: parseInt(analytics.reply_count) || 0,
        bounced: parseInt(analytics.bounce_count) || 0,
        interested: parseInt(leadStats.interested) || 0,
        replyRate: null,
        openRate: null,
        completionRate: null
      };
      
      if (data.totalLeads > 0) {
        data.replyRate = (data.replied / data.totalLeads) * 100;
        data.completionRate = ((parseInt(leadStats.completed) || 0) / data.totalLeads) * 100;
      }
      if (data.sent > 0) {
        data.openRate = (data.opened / data.sent) * 100;
      }
      
      campaignData.push(data);
      totalLeads += data.totalLeads;
      totalReplied += data.replied;
      totalInterested += data.interested;
    }
    
    // 4. Calculate aggregates
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter(a => a.warmup_details?.status === 'ACTIVE').length;
    const dailyCapacity = domains.reduce((sum, d) => sum + d.dailyCapacity, 0);
    const warmupRates = domains.filter(d => d.warmupReplyRate).map(d => d.warmupReplyRate);
    const avgWarmupRate = warmupRates.length > 0 
      ? warmupRates.reduce((a, b) => a + b, 0) / warmupRates.length 
      : null;
    const reputations = domains.filter(d => d.reputation).map(d => d.reputation);
    const avgReputation = reputations.length > 0 
      ? reputations.reduce((a, b) => a + b, 0) / reputations.length 
      : null;
    
    const aggregates = {
      totalDomains: domains.length,
      totalAccounts,
      activeAccounts,
      totalCampaigns: campaignData.length,
      dailyCapacity,
      dailySent: 0, // Would need today's stats
      avgWarmupRate,
      avgReputation,
      totalLeads,
      totalReplied,
      totalInterested
    };
    
    // 5. Save to Supabase
    console.log('Saving to Supabase...');
    
    const domainResult = await supabase.saveDomainSnapshot(domains);
    if (domainResult.error) {
      console.error('Domain snapshot error:', domainResult.error);
    } else {
      console.log(`✓ Saved ${domainResult.count} domain snapshots`);
    }
    
    const campaignResult = await supabase.saveCampaignSnapshot(campaignData);
    if (campaignResult.error) {
      console.error('Campaign snapshot error:', campaignResult.error);
    } else {
      console.log(`✓ Saved ${campaignResult.count} campaign snapshots`);
    }
    
    const aggregateResult = await supabase.saveAggregateSnapshot(aggregates);
    if (aggregateResult.error) {
      console.error('Aggregate snapshot error:', aggregateResult.error);
    } else {
      console.log('✓ Saved aggregate snapshot');
    }
    
    console.log(`[${new Date().toISOString()}] Sync complete!`);
    
  } catch (e) {
    console.error('Sync failed:', e);
    process.exit(1);
  }
}

sync();
