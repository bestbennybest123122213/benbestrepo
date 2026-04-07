#!/usr/bin/env node
/**
 * PULSE - Ultra-fast status in one line
 * Perfect for quick checks and cron jobs
 * 
 * NOW WITH OFFLINE FALLBACK - works when Supabase is down!
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
  return {
    status: lead.status,
    conversation_date: lead.lead_response ? parseDate(lead.lead_response) : null,
    meeting_date: lead.meeting_date ? parseDate(lead.meeting_date) : null
  };
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(' ')[0].split('/');
  if (parts.length !== 3) return null;
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return new Date(year, parts[0] - 1, parts[1]).toISOString();
}

async function getLeads() {
  const client = initSupabase();
  
  if (client) {
    try {
      const { data: leads } = await client
        .from('imann_positive_replies')
        .select('status, conversation_date, meeting_date');

      if (leads && leads.length > 0) {
        return { leads, offline: false };
      }
    } catch (e) {
      // Network error - fall through to cache
    }
  }

  // Fallback to cache
  const cached = loadCachedLeads();
  if (cached) {
    return { leads: cached.map(transformCachedLead), offline: true };
  }
  
  return { leads: null, offline: false };
}

async function pulse() {
  const result = await getLeads();
  
  if (!result.leads) { 
    console.log('❌ No data (Supabase down, no cache)'); 
    return; 
  }

  const leads = result.leads;
  const offline = result.offline;
  const now = Date.now();
  
  const stats = {
    total: leads.length,
    booked: leads.filter(l => l.status === 'Booked' || (l.status && l.status.toLowerCase() === 'booked')).length,
    scheduling: leads.filter(l => l.status === 'Scheduling' || (l.status && l.status.toLowerCase() === 'scheduling')).length,
    hot: leads.filter(l => {
      if (!l.conversation_date) return false;
      return (now - new Date(l.conversation_date).getTime()) < 3 * 24 * 60 * 60 * 1000;
    }).length,
    stale: leads.filter(l => {
      const isScheduling = l.status === 'Scheduling' || (l.status && l.status.toLowerCase() === 'scheduling');
      if (!isScheduling || !l.conversation_date) return false;
      return (now - new Date(l.conversation_date).getTime()) > 14 * 24 * 60 * 60 * 1000;
    }).length
  };

  // One line output
  const rate = stats.total > 0 ? ((stats.booked / stats.total) * 100).toFixed(1) : '0.0';
  const alerts = [];
  if (stats.hot > 0) alerts.push(`🔥${stats.hot} hot`);
  if (stats.scheduling > 5) alerts.push(`🤝${stats.scheduling} scheduling`);
  if (stats.stale > 20) alerts.push(`⚠️${stats.stale} stale`);
  
  const offlineTag = offline ? ' [OFFLINE]' : '';
  const alertStr = alerts.length > 0 ? ` | ${alerts.join(' | ')}` : '';

  console.log(`📊 ${stats.total} leads | ✅ ${stats.booked} booked (${rate}%)${alertStr}${offlineTag}`);
}

pulse().catch(err => console.log('❌ Error:', err.message));
