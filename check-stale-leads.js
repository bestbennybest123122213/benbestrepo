#!/usr/bin/env node
/**
 * Check for stale leads that need follow-up
 * Alert for leads pending > 3 days, critical for > 7 days
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

async function checkStaleLeads() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all pending positive replies
  const { data: pending, error } = await supabase
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: true });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  // Categorize by staleness
  const critical = []; // > 7 days - HOT leads going cold!
  const warning = [];  // > 3 days - Need attention
  const recent = [];   // < 3 days - OK for now

  for (const lead of pending || []) {
    const repliedAt = new Date(lead.replied_at);
    const daysAgo = Math.floor((now - repliedAt) / (1000 * 60 * 60 * 24));
    
    if (daysAgo > 7 && (lead.reply_category === 'Booked' || lead.reply_category === 'Meeting Request')) {
      critical.push({ ...lead, daysAgo });
    } else if (daysAgo > 3) {
      warning.push({ ...lead, daysAgo });
    } else {
      recent.push({ ...lead, daysAgo });
    }
  }

  console.log('🔍 STALE LEAD CHECK\n');
  console.log(`Total pending: ${pending?.length || 0}`);
  console.log(`Recent (< 3d): ${recent.length}`);
  console.log(`Warning (3-7d): ${warning.length}`);
  console.log(`Critical (> 7d): ${critical.length}`);

  if (critical.length > 0) {
    console.log('\n🚨 CRITICAL - HOT LEADS GOING COLD!\n');
    console.log('These are Booked/Meeting Request leads > 7 days old:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const lead of critical.slice(0, 10)) {
      console.log(`\n🔴 ${lead.lead_name || 'Unknown'} (${lead.lead_email})`);
      console.log(`   ${lead.reply_category} • ${lead.daysAgo} days ago!`);
      console.log(`   Campaign: ${(lead.campaign_name || '').substring(0, 50)}`);
    }
    
    if (critical.length > 10) {
      console.log(`\n   ... and ${critical.length - 10} more critical leads`);
    }
  }

  if (warning.length > 0 && critical.length === 0) {
    console.log('\n⚠️ WARNING - LEADS NEED ATTENTION\n');
    console.log('These leads are 3-7 days old without follow-up:');
    
    for (const lead of warning.slice(0, 5)) {
      console.log(`\n🟠 ${lead.lead_name || 'Unknown'} (${lead.lead_email})`);
      console.log(`   ${lead.reply_category} • ${lead.daysAgo} days ago`);
    }
  }

  if (critical.length === 0 && warning.length === 0) {
    console.log('\n✅ All leads are being followed up within 3 days!');
  }

  return {
    total: pending?.length || 0,
    recent: recent.length,
    warning: warning.length,
    critical: critical.length,
    criticalLeads: critical.slice(0, 10),
    warningLeads: warning.slice(0, 10)
  };
}

// Run if called directly
if (require.main === module) {
  checkStaleLeads().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { checkStaleLeads };
