#!/usr/bin/env node
/**
 * Heartbeat Check - Comprehensive status for Clawdbot heartbeats
 * 
 * Checks everything in one call:
 * 1. New positive replies
 * 2. Leads needing urgent follow-up
 * 3. Critical alerts
 * 
 * Returns a single line for easy parsing, or nothing if all is well.
 * 
 * Usage:
 *   node heartbeat-check.js         # Quick check, output only if action needed
 *   node heartbeat-check.js --full  # Always output full status
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const FULL_MODE = args.includes('--full');
const STATE_FILE = path.join(__dirname, '.heartbeat-state.json');

async function heartbeatCheck() {
  const client = initSupabase();
  if (!client) {
    console.error('DB not initialized');
    process.exit(1);
  }

  // Load state
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    state = { lastCheck: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  }

  const alerts = [];
  const now = Date.now();

  // 1. Check for new positive replies
  const { data: newReplies } = await client
    .from('positive_replies')
    .select('lead_name, lead_email, reply_category, lead_company')
    .gte('created_at', state.lastCheck)
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false })
    .limit(10);

  if (newReplies && newReplies.length > 0) {
    const booked = newReplies.filter(r => r.reply_category === 'Booked').length;
    const meetings = newReplies.filter(r => r.reply_category === 'Meeting Request').length;
    
    if (booked > 0) {
      alerts.push(`🎉 ${booked} NEW BOOKING${booked > 1 ? 'S' : ''}!`);
    }
    if (meetings > 0) {
      alerts.push(`📅 ${meetings} new meeting request${meetings > 1 ? 's' : ''}`);
    }
    const others = newReplies.length - booked - meetings;
    if (others > 0) {
      alerts.push(`✨ ${others} new positive repl${others > 1 ? 'ies' : 'y'}`);
    }
  }

  // 2. Check for urgent leads (0-3 days old, not booked)
  const { data: urgentLeads } = await client
    .from('positive_replies')
    .select('lead_name, lead_email, reply_category, lead_company, replied_at')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (urgentLeads) {
    const critical = urgentLeads.filter(l => {
      if (!l.replied_at) return false;
      const age = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age <= 1;
    });
    
    const warning = urgentLeads.filter(l => {
      if (!l.replied_at) return false;
      const age = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 2 && age <= 3;
    });

    if (critical.length > 0) {
      alerts.push(`🔴 ${critical.length} lead${critical.length > 1 ? 's' : ''} need IMMEDIATE response`);
    }
    if (warning.length > 0) {
      alerts.push(`🟠 ${warning.length} lead${warning.length > 1 ? 's' : ''} need response TODAY`);
    }
  }

  // Save state
  fs.writeFileSync(STATE_FILE, JSON.stringify({ 
    lastCheck: new Date().toISOString(),
    lastAlerts: alerts.length
  }));

  // Output
  if (FULL_MODE) {
    console.log('📊 HEARTBEAT STATUS');
    console.log('━'.repeat(40));
    if (alerts.length === 0) {
      console.log('✅ All clear - no urgent items');
    } else {
      alerts.forEach(a => console.log(a));
    }
    console.log('━'.repeat(40));
    console.log(`Checked: ${new Date().toISOString()}`);
    return;
  }

  // Quick mode - only output if there are alerts
  if (alerts.length > 0) {
    console.log(alerts.join(' | '));
    process.exit(1); // Non-zero exit = action needed
  }
  // Silent if no alerts
}

heartbeatCheck().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
