#!/usr/bin/env node
/**
 * Response Time Automator
 * Monitor for new positive replies and alert instantly
 * 
 * Usage:
 *   node response-alert.js           # Check for new replies since last check
 *   node response-alert.js --watch   # Continuous monitoring (every 5 min)
 *   node response-alert.js --test    # Test alert system
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const STATE_FILE = path.join(__dirname, 'data', 'response-alert-state.json');

// Priority categories that need fast response
const HOT_CATEGORIES = ['Interested', 'Meeting Request', 'Information Request'];

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { lastCheck: null, alertedIds: [] };
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getNewReplies(since) {
  const query = supabase
    .from('all_replies')
    .select('*')
    .in('reply_category', HOT_CATEGORIES)
    .order('replied_at', { ascending: false });
  
  if (since) {
    query.gt('replied_at', since);
  } else {
    // First run: get last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    query.gt('replied_at', yesterday.toISOString());
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching replies:', error);
    return [];
  }
  
  return data || [];
}

function formatAlert(reply) {
  const company = reply.lead_company || extractCompanyFromEmail(reply.lead_email);
  const name = reply.lead_name || 'Unknown';
  const category = reply.reply_category;
  const time = new Date(reply.replied_at).toLocaleString();
  
  return `
🚨 NEW ${category.toUpperCase()} REPLY

From: ${name}
Company: ${company}
Email: ${reply.lead_email}
Time: ${time}

Campaign: ${reply.campaign_name}

${reply.reply_text ? `Message preview: "${reply.reply_text.substring(0, 200)}..."` : ''}

⚡ RESPOND NOW for best conversion rate
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function extractCompanyFromEmail(email) {
  if (!email) return 'Unknown';
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';
  const company = domain.split('.')[0];
  return company.charAt(0).toUpperCase() + company.slice(1);
}

async function checkForNewReplies() {
  const state = loadState();
  const replies = await getNewReplies(state.lastCheck);
  
  // Filter out already alerted
  const newReplies = replies.filter(r => !state.alertedIds.includes(r.id));
  
  if (newReplies.length === 0) {
    console.log('✅ No new hot replies since last check');
    return [];
  }
  
  console.log(`\n🔔 ${newReplies.length} NEW HOT ${newReplies.length === 1 ? 'REPLY' : 'REPLIES'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  for (const reply of newReplies) {
    console.log(formatAlert(reply));
    state.alertedIds.push(reply.id);
  }
  
  // Keep only last 1000 alerted IDs to prevent file growth
  if (state.alertedIds.length > 1000) {
    state.alertedIds = state.alertedIds.slice(-500);
  }
  
  state.lastCheck = new Date().toISOString();
  saveState(state);
  
  return newReplies;
}

async function watchMode() {
  console.log('👀 Response Alert - Watch Mode');
  console.log('Checking for new replies every 5 minutes...');
  console.log('Press Ctrl+C to stop\n');
  
  // Initial check
  await checkForNewReplies();
  
  // Check every 5 minutes
  setInterval(async () => {
    console.log(`\n[${new Date().toLocaleTimeString()}] Checking...`);
    await checkForNewReplies();
  }, 5 * 60 * 1000);
}

async function testAlert() {
  console.log('🧪 Testing alert system...\n');
  
  const testReply = {
    id: 'test-123',
    lead_name: 'Test User',
    lead_email: 'test@example.com',
    lead_company: 'Test Company',
    reply_category: 'Interested',
    replied_at: new Date().toISOString(),
    campaign_name: 'Test Campaign',
    reply_text: 'This is a test message to verify the alert system is working correctly.'
  };
  
  console.log(formatAlert(testReply));
  console.log('\n✅ Alert system working correctly');
}

async function showStats() {
  const state = loadState();
  const { data } = await supabase
    .from('all_replies')
    .select('reply_category, replied_at')
    .in('reply_category', HOT_CATEGORIES)
    .gte('replied_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  console.log('\n📊 RESPONSE ALERT STATS (Last 7 Days)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const byCategory = {};
  for (const r of data || []) {
    byCategory[r.reply_category] = (byCategory[r.reply_category] || 0) + 1;
  }
  
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(20)} ${count}`);
  }
  
  console.log(`\n  Last check: ${state.lastCheck ? new Date(state.lastCheck).toLocaleString() : 'Never'}`);
  console.log(`  Alerts sent: ${state.alertedIds?.length || 0}`);
  console.log('');
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--watch')) {
  watchMode();
} else if (args.includes('--test')) {
  testAlert();
} else if (args.includes('--stats')) {
  showStats();
} else {
  checkForNewReplies();
}
