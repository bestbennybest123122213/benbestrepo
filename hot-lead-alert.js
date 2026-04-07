#!/usr/bin/env node
/**
 * Hot Lead Alert System
 * Checks for new positive replies and sends alerts
 * Designed to be run frequently (every 5-15 min) to catch hot leads fast
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const STATE_FILE = './alert-state.json';
const { leads } = require('./enriched-leads.json');

// High-value categories that warrant immediate alert
const HOT_CATEGORIES = ['Meeting Request', 'Interested', 'Booked'];

// Enterprise domains that are extra hot
const ENTERPRISE_DOMAINS = [
  'stillfront.com', 'dream11.com', 'naver.com', 'paradoxinteractive.com',
  'weedmaps.com', 'unity.com', 'unity3d.com', 'wallapop.com', 'udemy.com',
  'replit.com', 'ign.com', 'complex.com', 'rovio.com', 'preply.com', 'omio.com',
  'roblox.com', 'discord.com', 'supercell.com', 'king.com', 'zynga.com'
];

// Load previous state
let state = { lastChecked: null, alertedLeads: [] };
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) {
  // Fresh start
}

const lastChecked = state.lastChecked ? new Date(state.lastChecked) : new Date(0);
const alertedIds = new Set(state.alertedLeads);

// Find new hot leads since last check
const newHotLeads = leads.filter(lead => {
  // Must be hot category
  if (!HOT_CATEGORIES.includes(lead.reply_category)) return false;
  
  // Must not be already alerted
  if (alertedIds.has(lead.id)) return false;
  
  // Must be recent (within last 24 hours or since last check)
  const replyTime = new Date(lead.replied_at);
  const isRecent = replyTime > lastChecked || 
    (Date.now() - replyTime.getTime()) < 24 * 60 * 60 * 1000;
  
  return isRecent;
});

// Prioritize new leads
const prioritized = newHotLeads.map(lead => {
  const domain = lead.lead_email.split('@')[1];
  const isEnterprise = ENTERPRISE_DOMAINS.some(d => domain.includes(d)) || lead.tier === 'enterprise';
  const age = Math.floor((Date.now() - new Date(lead.replied_at)) / (1000 * 60 * 60));
  
  let urgency = 'normal';
  if (lead.reply_category === 'Meeting Request' && isEnterprise) urgency = 'critical';
  else if (lead.reply_category === 'Meeting Request') urgency = 'high';
  else if (isEnterprise) urgency = 'high';
  
  return {
    ...lead,
    urgency,
    isEnterprise,
    age_hours: age
  };
});

// Sort by urgency
const urgencyOrder = { critical: 0, high: 1, normal: 2 };
prioritized.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

// Output
if (prioritized.length === 0) {
  console.log('No new hot leads since last check.');
} else {
  console.log(`\n🚨 ${prioritized.length} NEW HOT LEADS!\n`);
  
  prioritized.forEach((lead, i) => {
    const emoji = lead.urgency === 'critical' ? '🔴' : lead.urgency === 'high' ? '🟠' : '🟡';
    const enterprise = lead.isEnterprise ? ' [ENTERPRISE]' : '';
    
    console.log(`${emoji} ${i + 1}. ${lead.lead_company}${enterprise}`);
    console.log(`   ${lead.lead_name} <${lead.lead_email}>`);
    console.log(`   Category: ${lead.reply_category} | Age: ${lead.age_hours}h`);
    console.log(`   Campaign: ${lead.campaign_name}`);
    console.log('');
  });
  
  // Generate Telegram-friendly alert
  console.log('=== TELEGRAM ALERT FORMAT ===\n');
  
  let alert = `🚨 *${prioritized.length} NEW HOT LEADS*\n\n`;
  
  prioritized.slice(0, 5).forEach((lead, i) => {
    const emoji = lead.urgency === 'critical' ? '🔴' : lead.urgency === 'high' ? '🟠' : '🟡';
    const enterprise = lead.isEnterprise ? ' ⭐' : '';
    alert += `${emoji} *${lead.lead_company}*${enterprise}\n`;
    alert += `${lead.lead_name} - ${lead.reply_category}\n`;
    alert += `${lead.age_hours}h old\n\n`;
  });
  
  if (prioritized.length > 5) {
    alert += `_+${prioritized.length - 5} more..._\n\n`;
  }
  
  alert += `Run \`node gex.js rank\` for full list`;
  
  console.log(alert);
  
  // Update state
  const newAlertedIds = prioritized.map(l => l.id);
  state.alertedLeads = [...state.alertedLeads, ...newAlertedIds];
}

// Save state
state.lastChecked = new Date().toISOString();
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`\n✅ State saved. Last checked: ${state.lastChecked}`);
