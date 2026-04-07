#!/usr/bin/env node
/**
 * Real-time Hot Lead Alert System
 * 
 * Checks for new hot leads (Meeting Request, Booked) every 5 minutes
 * and sends instant Telegram alerts for high-priority prospects.
 * 
 * Usage: node realtime-alerts.js [--once]
 * 
 * Priority tiers:
 * - 🔥 CRITICAL: Unity, Udemy, IGN, Naver, Paradox, Atari, etc. (big names)
 * - ⚡ HIGH: Meeting Request or Booked from any company
 * - 📈 MEDIUM: Interested from funded companies
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

// High-priority company keywords (these get instant alerts)
const TIER1_COMPANIES = [
  'unity', 'udemy', 'ign', 'naver', 'paradox', 'atari', 'sega', 'rovio',
  'dream11', 'replit', 'discord', 'spotify', 'netflix', 'amazon', 'google',
  'meta', 'facebook', 'apple', 'microsoft', 'tiktok', 'bytedance', 'tencent',
  'sony', 'nintendo', 'ea', 'activision', 'blizzard', 'ubisoft', 'epic',
  'roblox', 'supercell', 'king', 'zynga', 'scopely', 'playtika'
];

// State file to track last check
const STATE_FILE = path.join(__dirname, '.realtime-alerts-state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading state:', e.message);
  }
  return { lastCheckAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Error saving state:', e.message);
  }
}

function getTier(lead) {
  const company = (lead.lead_company || '').toLowerCase();
  const email = (lead.lead_email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  
  // Check if it's a tier 1 company
  for (const keyword of TIER1_COMPANIES) {
    if (company.includes(keyword) || domain.includes(keyword)) {
      return { tier: 1, label: '🔥 CRITICAL', reason: `Big company: ${keyword}` };
    }
  }
  
  // Meeting Request or Booked = high priority
  const category = (lead.reply_category || '').toLowerCase();
  if (category.includes('meeting') || category.includes('booked')) {
    return { tier: 2, label: '⚡ HIGH', reason: 'Meeting/Booked' };
  }
  
  // Everything else = medium
  return { tier: 3, label: '📈 MEDIUM', reason: 'Interested' };
}

function formatLead(lead, tierInfo) {
  const name = lead.lead_name || lead.lead_email?.split('@')[0] || 'Unknown';
  const company = lead.lead_company || 'Unknown';
  const category = lead.reply_category || 'Unknown';
  const email = lead.lead_email || '';
  
  const categoryEmoji = {
    'Booked': '🎉',
    'Meeting Request': '🤝',
    'Interested': '✨',
    'Information Request': '❓'
  };
  
  const emoji = categoryEmoji[category] || '📧';
  
  return `${tierInfo.label} ${emoji} ${category}

**${name}** @ ${company}
📧 ${email}

${tierInfo.reason}`;
}

async function checkForNewHotLeads() {
  const client = initSupabase();
  if (!client) {
    console.error('Supabase not initialized');
    return [];
  }
  
  const state = loadState();
  const lastCheck = state.lastCheckAt;
  const now = new Date().toISOString();
  
  console.log(`[ALERTS] Checking for new leads since ${lastCheck}`);
  
  // Fetch new positive replies since last check
  const { data: newLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('created_at', lastCheck)
    .in('reply_category', ['Booked', 'Meeting Request', 'Interested'])
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Query error:', error.message);
    return [];
  }
  
  // Update state
  saveState({ lastCheckAt: now, leadsFound: newLeads?.length || 0 });
  
  if (!newLeads || newLeads.length === 0) {
    console.log('[ALERTS] No new hot leads');
    return [];
  }
  
  console.log(`[ALERTS] Found ${newLeads.length} new leads`);
  
  // Deduplicate by email
  const seen = new Set();
  const uniqueLeads = newLeads.filter(lead => {
    const email = (lead.lead_email || '').toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  
  // Score and sort by priority
  const scoredLeads = uniqueLeads.map(lead => ({
    ...lead,
    tierInfo: getTier(lead)
  })).sort((a, b) => a.tierInfo.tier - b.tierInfo.tier);
  
  return scoredLeads;
}

async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');
  
  console.log(`
╔═══════════════════════════════════════════════╗
║  🔔 Real-time Hot Lead Alert System           ║
║  Mode: ${runOnce ? 'Single check' : 'Continuous (5 min interval)'}              ║
╚═══════════════════════════════════════════════╝
`);
  
  const check = async () => {
    try {
      const leads = await checkForNewHotLeads();
      
      if (leads.length > 0) {
        console.log('\n=== NEW HOT LEADS ===\n');
        
        for (const lead of leads) {
          const msg = formatLead(lead, lead.tierInfo);
          console.log(msg);
          console.log('---');
          
          // Output for piping to notification systems
          if (lead.tierInfo.tier <= 2) {
            // Critical or High priority - these should trigger alerts
            console.log(`[ALERT_TRIGGER] Tier ${lead.tierInfo.tier}: ${lead.lead_name} @ ${lead.lead_company} (${lead.reply_category})`);
          }
        }
        
        // Summary
        const critical = leads.filter(l => l.tierInfo.tier === 1).length;
        const high = leads.filter(l => l.tierInfo.tier === 2).length;
        const medium = leads.filter(l => l.tierInfo.tier === 3).length;
        
        console.log(`\n📊 Summary: ${critical} critical, ${high} high, ${medium} medium priority`);
      }
    } catch (e) {
      console.error('[ERROR]', e.message);
    }
  };
  
  await check();
  
  if (!runOnce) {
    console.log('\n[ALERTS] Running in continuous mode (checking every 5 minutes)');
    setInterval(check, 5 * 60 * 1000);
  }
}

// Export for use as module
module.exports = { checkForNewHotLeads, getTier };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
