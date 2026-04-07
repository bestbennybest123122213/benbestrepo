#!/usr/bin/env node
/**
 * SmartLead Sync System
 * 
 * Synchronizes data between SmartLead and local database:
 * - Campaigns
 * - Leads
 * - Replies
 * - Statistics
 * 
 * Usage:
 *   node smartlead-sync.js full      # Full sync
 *   node smartlead-sync.js campaigns # Campaigns only
 *   node smartlead-sync.js replies   # Positive replies
 *   node smartlead-sync.js stats     # Update statistics
 *   node smartlead-sync.js watch     # Continuous sync (every 5 min)
 */

require('dotenv').config();
const fs = require('fs');
const { SmartLeadAPI } = require('./lib/smartlead-api');
const { initSupabase } = require('./lib/supabase');

const SYNC_STATE_FILE = 'sync-state.json';
const SYNC_LOG_FILE = 'sync-log.json';

class SmartLeadSync {
  constructor() {
    this.api = new SmartLeadAPI();
    this.supabase = initSupabase();
    this.state = this.loadState();
    this.log = [];
  }

  loadState() {
    try {
      if (fs.existsSync(SYNC_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      lastFullSync: null,
      lastCampaignSync: null,
      lastReplySync: null,
      lastStatsSync: null,
      campaignIds: [],
      syncedLeads: 0,
      syncedReplies: 0
    };
  }

  saveState() {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  logEvent(type, message, data = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      type,
      message,
      ...data
    };
    this.log.push(event);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  saveLog() {
    // Append to existing log
    let existingLog = [];
    try {
      if (fs.existsSync(SYNC_LOG_FILE)) {
        existingLog = JSON.parse(fs.readFileSync(SYNC_LOG_FILE, 'utf8'));
      }
    } catch (e) {}
    
    const combined = [...existingLog, ...this.log].slice(-1000); // Keep last 1000 entries
    fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(combined, null, 2));
  }

  // ==================== SYNC METHODS ====================

  /**
   * Sync all campaigns from SmartLead
   */
  async syncCampaigns() {
    this.logEvent('sync', 'Starting campaign sync...');
    
    try {
      let offset = 0;
      const limit = 100;
      let allCampaigns = [];
      
      // Paginate through all campaigns
      while (true) {
        const response = await this.api.getCampaigns({ limit, offset });
        const campaigns = response.data || response;
        
        if (!campaigns || campaigns.length === 0) break;
        
        allCampaigns = [...allCampaigns, ...campaigns];
        
        if (campaigns.length < limit) break;
        offset += limit;
      }

      this.logEvent('sync', `Found ${allCampaigns.length} campaigns`);
      
      // Store campaign IDs for stats sync
      this.state.campaignIds = allCampaigns.map(c => c.id);
      this.state.lastCampaignSync = new Date().toISOString();
      this.saveState();

      return allCampaigns;
    } catch (error) {
      this.logEvent('error', `Campaign sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync positive replies from SmartLead to Supabase
   */
  async syncPositiveReplies() {
    this.logEvent('sync', 'Starting positive replies sync...');
    
    if (!this.supabase) {
      this.logEvent('error', 'Supabase not initialized');
      return;
    }

    try {
      // Get existing replies to avoid duplicates
      const { data: existingReplies } = await this.supabase
        .from('positive_replies')
        .select('lead_email, replied_at');
      
      const existingEmails = new Set(existingReplies?.map(r => r.lead_email) || []);
      
      let newReplies = 0;
      let updatedReplies = 0;
      
      // Get replies from each campaign
      for (const campaignId of this.state.campaignIds.slice(0, 50)) { // Limit to 50 campaigns
        try {
          const replies = await this.api.getCampaignReplies(campaignId, { 
            sentiment: 'positive',
            limit: 100 
          });
          
          const replyData = replies.data || replies;
          if (!replyData || !Array.isArray(replyData)) continue;
          
          for (const reply of replyData) {
            const email = reply.email || reply.lead_email;
            if (!email) continue;
            
            const replyRecord = {
              lead_email: email,
              lead_name: reply.name || reply.lead_name || null,
              lead_company: reply.company || reply.lead_company || null,
              reply_category: this.categorizeReply(reply),
              replied_at: reply.replied_at || reply.created_at || new Date().toISOString(),
              campaign_id: campaignId.toString(),
              campaign_name: reply.campaign_name || null,
              reply_text: reply.text || reply.body || null,
              sentiment: reply.sentiment || 'positive'
            };
            
            if (existingEmails.has(email)) {
              // Update existing
              const { error } = await this.supabase
                .from('positive_replies')
                .update({
                  ...replyRecord,
                  updated_at: new Date().toISOString()
                })
                .eq('lead_email', email);
              
              if (!error) updatedReplies++;
            } else {
              // Insert new
              const { error } = await this.supabase
                .from('positive_replies')
                .insert({
                  ...replyRecord,
                  created_at: new Date().toISOString()
                });
              
              if (!error) {
                newReplies++;
                existingEmails.add(email);
              }
            }
          }
        } catch (err) {
          // Skip campaigns that fail
          continue;
        }
        
        // Rate limiting - small delay between campaigns
        await this.sleep(200);
      }
      
      this.state.syncedReplies += newReplies;
      this.state.lastReplySync = new Date().toISOString();
      this.saveState();
      
      this.logEvent('sync', `Replies sync complete: ${newReplies} new, ${updatedReplies} updated`);
      
      return { new: newReplies, updated: updatedReplies };
    } catch (error) {
      this.logEvent('error', `Reply sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Categorize reply based on content
   */
  categorizeReply(reply) {
    const text = (reply.text || reply.body || '').toLowerCase();
    
    if (text.includes('book') || text.includes('schedule') || text.includes('calendar') || 
        text.includes('meeting') || text.includes('call') || text.includes('chat')) {
      return 'Meeting Request';
    }
    if (text.includes('interested') || text.includes('tell me more') || text.includes('love to')) {
      return 'Interested';
    }
    if (text.includes('info') || text.includes('details') || text.includes('learn more')) {
      return 'Information Request';
    }
    if (text.includes('booked') || text.includes('confirmed') || text.includes('see you')) {
      return 'Booked';
    }
    
    return reply.category || 'Interested';
  }

  /**
   * Sync campaign statistics
   */
  async syncStats() {
    this.logEvent('sync', 'Starting statistics sync...');
    
    const stats = {
      campaigns: [],
      totals: {
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        leads: 0
      }
    };

    try {
      for (const campaignId of this.state.campaignIds.slice(0, 30)) { // Limit to 30
        try {
          const campaignStats = await this.api.getCampaignStats(campaignId);
          
          if (campaignStats) {
            stats.campaigns.push({
              id: campaignId,
              ...campaignStats
            });
            
            stats.totals.sent += campaignStats.sent || 0;
            stats.totals.opened += campaignStats.opened || 0;
            stats.totals.replied += campaignStats.replied || 0;
            stats.totals.bounced += campaignStats.bounced || 0;
            stats.totals.leads += campaignStats.leads || 0;
          }
        } catch (err) {
          continue;
        }
        
        await this.sleep(200);
      }

      this.state.lastStatsSync = new Date().toISOString();
      this.saveState();
      
      // Save stats to file
      fs.writeFileSync('campaign-stats-cache.json', JSON.stringify(stats, null, 2));
      
      this.logEvent('sync', `Stats sync complete: ${stats.campaigns.length} campaigns`);
      
      return stats;
    } catch (error) {
      this.logEvent('error', `Stats sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Full sync - everything
   */
  async fullSync() {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔄 SMARTLEAD FULL SYNC                                                  ║
║  Synchronizing all data from SmartLead                                   ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

    const startTime = Date.now();

    try {
      // 1. Sync campaigns
      console.log('\n📦 Step 1: Syncing campaigns...');
      const campaigns = await this.syncCampaigns();
      
      // 2. Sync positive replies
      console.log('\n📧 Step 2: Syncing positive replies...');
      const replies = await this.syncPositiveReplies();
      
      // 3. Sync statistics
      console.log('\n📊 Step 3: Syncing statistics...');
      const stats = await this.syncStats();

      this.state.lastFullSync = new Date().toISOString();
      this.saveState();
      this.saveLog();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`
═══════════════════════════════════════════════════════════════════════════
✅ SYNC COMPLETE (${duration}s)
═══════════════════════════════════════════════════════════════════════════

  Campaigns:     ${campaigns.length}
  New replies:   ${replies.new}
  Updated:       ${replies.updated}
  Stats synced:  ${stats.campaigns.length}

  Next sync: Run again or use 'watch' mode
`);

      return { campaigns, replies, stats };
    } catch (error) {
      this.saveLog();
      console.error(`\n❌ Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Watch mode - continuous sync
   */
  async watch(intervalMinutes = 5) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  👁️  SMARTLEAD WATCH MODE                                                ║
║  Syncing every ${intervalMinutes} minutes. Press Ctrl+C to stop.                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

    // Initial sync
    await this.fullSync();

    // Schedule recurring syncs
    setInterval(async () => {
      console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Running scheduled sync...`);
      try {
        await this.syncPositiveReplies();
        await this.syncStats();
        console.log('✅ Sync complete');
      } catch (error) {
        console.error(`❌ Sync error: ${error.message}`);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Check sync status
   */
  showStatus() {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 SYNC STATUS                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

  Last full sync:     ${this.state.lastFullSync || 'Never'}
  Last campaign sync: ${this.state.lastCampaignSync || 'Never'}
  Last reply sync:    ${this.state.lastReplySync || 'Never'}
  Last stats sync:    ${this.state.lastStatsSync || 'Never'}

  Campaigns tracked:  ${this.state.campaignIds.length}
  Total synced leads: ${this.state.syncedReplies}
`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI
async function main() {
  const sync = new SmartLeadSync();
  const command = process.argv[2] || 'status';

  try {
    switch (command) {
      case 'full':
        await sync.fullSync();
        break;
      case 'campaigns':
        await sync.syncCampaigns();
        break;
      case 'replies':
        await sync.syncPositiveReplies();
        break;
      case 'stats':
        await sync.syncStats();
        break;
      case 'watch':
        const interval = parseInt(process.argv[3]) || 5;
        await sync.watch(interval);
        break;
      case 'status':
        sync.showStatus();
        break;
      case 'health':
        const health = await sync.api.checkHealth();
        console.log('\n📡 SmartLead API Health:');
        console.log(JSON.stringify(health, null, 2));
        break;
      default:
        console.log(`
SmartLead Sync - Synchronize data from SmartLead

Commands:
  full       Full sync (campaigns + replies + stats)
  campaigns  Sync campaigns only
  replies    Sync positive replies to Supabase
  stats      Update campaign statistics
  watch [n]  Continuous sync every n minutes (default: 5)
  status     Show sync status
  health     Check API health
        `);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { SmartLeadSync };

if (require.main === module) {
  main();
}
