#!/usr/bin/env node
/**
 * Today - Quick daily overview
 * 
 * The fastest way to see what needs attention today.
 * Single command for daily kickoff.
 * 
 * NOW WITH OFFLINE FALLBACK - works when Supabase is down!
 * 
 * Usage:
 *   node today.js
 *   node today.js --quiet   # One-liner output
 *   node today.js --offline # Force offline mode
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

const CACHE_FILE = path.join(__dirname, 'data', 'positive-replies-processed.json');

function loadCachedLeads() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data.leads || [];
  } catch (e) {
    return null;
  }
}

function transformCachedLead(lead) {
  // Transform cached format to match Supabase format
  return {
    lead_name: lead.name,
    lead_email: lead.email,
    lead_company: lead.company,
    reply_category: lead.category,
    replied_at: lead.lead_response ? parseDate(lead.lead_response) : null,
    status: lead.status
  };
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Handle formats like "12/01/2025 10:05" or "12/01/25"
  const parts = dateStr.split(' ')[0].split('/');
  if (parts.length !== 3) return null;
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return new Date(year, parts[0] - 1, parts[1]).toISOString();
}

async function getLeads(forceOffline = false) {
  if (forceOffline) {
    const cached = loadCachedLeads();
    if (cached) {
      return { leads: cached.map(transformCachedLead), offline: true };
    }
    return { leads: [], offline: true };
  }

  const client = initSupabase();
  if (!client) {
    // Try offline fallback
    const cached = loadCachedLeads();
    if (cached) {
      return { leads: cached.map(transformCachedLead), offline: true };
    }
    return { leads: null, error: 'Database not initialized and no cache available' };
  }

  try {
    const { data: leads, error } = await client
      .from('positive_replies')
      .select('*')
      .order('replied_at', { ascending: false });

    if (error) {
      // Try offline fallback
      const cached = loadCachedLeads();
      if (cached) {
        return { leads: cached.map(transformCachedLead), offline: true };
      }
      return { leads: null, error: error.message };
    }

    return { leads, offline: false };
  } catch (e) {
    // Network error - try offline fallback
    const cached = loadCachedLeads();
    if (cached) {
      return { leads: cached.map(transformCachedLead), offline: true };
    }
    return { leads: null, error: e.message };
  }
}

async function main() {
  const isQuiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  const forceOffline = process.argv.includes('--offline') || process.argv.includes('-o');

  const result = await getLeads(forceOffline);

  if (result.error) {
    console.error('❌ Error:', result.error);
    console.error('   Run: node gex.js version to check configuration');
    process.exit(1);
  }

  const leads = result.leads;
  const offlineMode = result.offline;

  if (!leads || leads.length === 0) {
    console.log('📭 No leads in pipeline yet');
    if (offlineMode) {
      console.log('   (Offline mode - no cached data available)');
    } else {
      console.log('   Run: node gex.js sync to import leads');
    }
    process.exit(0);
  }

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const booked = leads.filter(l => l.reply_category === 'Booked' || (l.status && l.status.toLowerCase() === 'booked'));
  const unbooked = leads.filter(l => l.reply_category !== 'Booked' && (!l.status || l.status.toLowerCase() !== 'booked'));
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3);
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 15);

  // Due today (sequence triggers)
  const sequenceDays = [0, 3, 7, 14, 21, 30];
  const dueToday = unbooked.filter(l => sequenceDays.includes(getAgeDays(l.replied_at)));

  // Health score
  const staleRate = unbooked.length > 0 ? stale.length / unbooked.length : 0;
  let healthScore = 100;
  if (staleRate > 0.5) healthScore -= 30;
  if (hot.length < 3) healthScore -= 20;
  healthScore = Math.max(0, healthScore);
  const healthEmoji = healthScore >= 70 ? '🟢' : healthScore >= 50 ? '🟡' : healthScore >= 30 ? '🟠' : '🔴';

  // Top priority
  const topPriority = unbooked
    .sort((a, b) => {
      const scoreA = (getAgeDays(a.replied_at) <= 3 ? 50 : 0) + (a.reply_category === 'Meeting Request' ? 30 : 0);
      const scoreB = (getAgeDays(b.replied_at) <= 3 ? 50 : 0) + (b.reply_category === 'Meeting Request' ? 30 : 0);
      return scoreB - scoreA;
    })[0];

  // Quick one-liner mode
  if (isQuiet) {
    const pct = ((booked.length / leads.length) * 100).toFixed(0);
    const offlineTag = offlineMode ? ' [OFFLINE]' : '';
    console.log(`${healthEmoji} ${booked.length}/${leads.length} booked (${pct}%) | 🔥 ${hot.length} hot | 📬 ${dueToday.length} due | ⚠️ ${stale.length} stale${offlineTag}`);
    process.exit(0);
  }

  const offlineBanner = offlineMode ? '\n  ⚡ OFFLINE MODE - using cached data\n' : '';

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 ${dayName.toUpperCase().padEnd(58)}     ║
╚══════════════════════════════════════════════════════════════════════════╝
${offlineBanner}
  ${healthEmoji} Health: ${healthScore}/100  |  📊 ${booked.length}/${leads.length} booked (${((booked.length / leads.length) * 100).toFixed(0)}%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔥 Hot: ${hot.length}  |  📬 Due today: ${dueToday.length}  |  ⚠️ Stale: ${stale.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (topPriority) {
    console.log(`
  🎯 TOP PRIORITY: ${topPriority.lead_name} @ ${topPriority.lead_company || 'Unknown'}
     ${topPriority.reply_category} | ${getAgeDays(topPriority.replied_at)}d ago
     📧 ${topPriority.lead_email}`);
  }

  if (dueToday.length > 0) {
    console.log(`
  📬 DUE TODAY:`);
    dueToday.slice(0, 5).forEach(l => {
      console.log(`     • ${l.lead_name} (Day ${getAgeDays(l.replied_at)})`);
    });
    if (dueToday.length > 5) console.log(`     • +${dueToday.length - 5} more`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  💰 Revenue: $${(booked.length * 500).toLocaleString()}  |  📈 Potential: +$${(unbooked.filter(l => l.reply_category === 'Meeting Request').length * 200).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Quick commands:
    node gex.js nba     → Next best action
    node gex.js inbox   → Priority inbox
    node gex.js fast    → Hot lead responses

`);
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
