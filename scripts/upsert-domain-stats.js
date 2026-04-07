#!/usr/bin/env node
// Upsert domain stats from JSON file to Supabase

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get credentials from macOS Keychain
function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error(`Failed to get ${service} from keychain:`, e.message);
    return null;
  }
}

async function main() {
  const dataFile = process.argv[2] || path.join(__dirname, '../data/domain-stats-2026-03-16.json');
  
  if (!fs.existsSync(dataFile)) {
    console.error('Data file not found:', dataFile);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  console.log(`Loaded ${data.domains.length} domains from ${dataFile}`);
  
  // Initialize Supabase
  const url = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
  const key = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');
  
  if (!url || !key) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  console.log('Supabase client initialized');
  
  const date = new Date().toISOString().split('T')[0];
  
  // Transform to domain_snapshots format
  const records = data.domains.map(d => ({
    snapshot_date: date,
    domain: d.domain,
    reputation: d.score || null,
    warmup_reply_rate: d.warmupReplyRate || null,
    active_accounts: d.activeAccounts || 0,
    total_accounts: d.totalAccounts || 0,
    daily_capacity: 0, // Not in this data
    campaign_sends: d.lifetimeSent || 0,
    campaign_replies: d.lifetimeReplies || 0,
    bounce_rate: d.bounceRate || null,
    metadata: JSON.stringify({
      provider: d.provider,
      sent30d: d.sent30d,
      sent14d: d.sent14d,
      sent7d: d.sent7d,
      bounce: d.bounce,
      replyRate: d.replyRate,
      score: d.score,
      capturedAt: data.capturedAt
    })
  }));
  
  console.log(`Upserting ${records.length} records to domain_snapshots...`);
  
  const { data: result, error } = await supabase
    .from('domain_snapshots')
    .upsert(records, { 
      onConflict: 'snapshot_date,domain',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('Error upserting:', error);
    process.exit(1);
  }
  
  console.log(`✅ Successfully upserted ${records.length} domain records for ${date}`);
  
  // Also save aggregate stats
  const totals = {
    totalDomains: data.domains.length,
    totalAccounts: data.domains.reduce((sum, d) => sum + (d.totalAccounts || 0), 0),
    activeAccounts: data.domains.reduce((sum, d) => sum + (d.activeAccounts || 0), 0),
    totalSent: data.domains.reduce((sum, d) => sum + (d.lifetimeSent || 0), 0),
    totalReplies: data.domains.reduce((sum, d) => sum + (d.lifetimeReplies || 0), 0),
    totalBounce: data.domains.reduce((sum, d) => sum + (d.bounce || 0), 0),
    avgWarmupRate: data.domains.reduce((sum, d) => sum + (d.warmupReplyRate || 0), 0) / data.domains.length,
    avgScore: data.domains.reduce((sum, d) => sum + (d.score || 0), 0) / data.domains.length
  };
  
  console.log('\n📊 Summary:');
  console.log(`   Domains: ${totals.totalDomains}`);
  console.log(`   Accounts: ${totals.activeAccounts}/${totals.totalAccounts}`);
  console.log(`   Lifetime Sent: ${totals.totalSent.toLocaleString()}`);
  console.log(`   Lifetime Replies: ${totals.totalReplies.toLocaleString()} (${(totals.totalReplies/totals.totalSent*100).toFixed(2)}%)`);
  console.log(`   Bounces: ${totals.totalBounce.toLocaleString()} (${(totals.totalBounce/totals.totalSent*100).toFixed(2)}%)`);
  console.log(`   Avg Warmup Rate: ${totals.avgWarmupRate.toFixed(1)}%`);
  console.log(`   Avg Score: ${totals.avgScore.toFixed(1)}/100`);
}

main().catch(console.error);
