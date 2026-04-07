#!/usr/bin/env node
/**
 * Check for new positive replies since last check
 * Use in heartbeat to alert for new interested leads
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// State file to track last check
const STATE_FILE = path.join(__dirname, '.last-reply-check.json');

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

async function checkNewReplies() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Load last check time
  let lastCheck = null;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    lastCheck = new Date(state.lastCheck);
  } catch (e) {
    // First run - check last hour
    lastCheck = new Date(Date.now() - 60 * 60 * 1000);
  }

  // Query for new positive replies
  const { data: newReplies, error } = await supabase
    .from('positive_replies')
    .select('*')
    .gte('created_at', lastCheck.toISOString())
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('Error checking replies:', error.message);
    process.exit(1);
  }

  // Save new check time
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastCheck: new Date().toISOString() }));

  if (newReplies && newReplies.length > 0) {
    console.log(`\n🔔 NEW POSITIVE REPLIES (${newReplies.length}):\n`);
    
    for (const r of newReplies) {
      const emoji = r.reply_category === 'Booked' ? '🎉' :
                    r.reply_category === 'Meeting Request' ? '📅' :
                    r.reply_category === 'Information Request' ? '❓' : '✨';
      console.log(`${emoji} ${r.lead_name || 'Unknown'} (${r.lead_email})`);
      console.log(`   Category: ${r.reply_category}`);
      console.log(`   Campaign: ${(r.campaign_name || '').substring(0, 50)}`);
      console.log('');
    }

    // Summary for notifications
    const booked = newReplies.filter(r => r.reply_category === 'Booked').length;
    const meetings = newReplies.filter(r => r.reply_category === 'Meeting Request').length;
    const info = newReplies.filter(r => r.reply_category === 'Information Request').length;
    const interested = newReplies.filter(r => r.reply_category === 'Interested').length;

    console.log('📊 Summary:');
    if (booked > 0) console.log(`   🎉 Booked: ${booked}`);
    if (meetings > 0) console.log(`   📅 Meeting Requests: ${meetings}`);
    if (info > 0) console.log(`   ❓ Info Requests: ${info}`);
    if (interested > 0) console.log(`   ✨ Interested: ${interested}`);
    
    return { hasNew: true, count: newReplies.length, data: newReplies };
  } else {
    console.log('No new positive replies since last check.');
    return { hasNew: false, count: 0 };
  }
}

// Run if called directly
if (require.main === module) {
  checkNewReplies().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { checkNewReplies };
