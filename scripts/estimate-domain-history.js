#!/usr/bin/env node
/**
 * Estimate Historical Domain Stats
 * 
 * Uses SmartLead day-wise overall stats + domain activity proportions
 * to estimate 7D/14D/30D sends per domain
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const DATA_DIR = path.join(__dirname, '../data');

function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) { return null; }
}

async function getDayWiseStats(days) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  
  const start = startDate.toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);
  
  const res = await fetch(`https://server.smartlead.ai/api/v1/analytics/day-wise-overall-stats?start_date=${start}&end_date=${end}&api_key=${API_KEY}`);
  const data = await res.json();
  
  if (data.data?.day_wise_stats) {
    return data.data.day_wise_stats.reduce((sum, day) => {
      return sum + (day.email_engagement_metrics?.sent || 0);
    }, 0);
  }
  return 0;
}

async function getDomainProportions() {
  // Get current domain activity from email accounts
  let allAccounts = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const res = await fetch(`https://server.smartlead.ai/api/v1/email-accounts?offset=${offset}&limit=${limit}&api_key=${API_KEY}`);
    const accounts = await res.json();
    if (!Array.isArray(accounts) || accounts.length === 0) break;
    allAccounts = allAccounts.concat(accounts);
    if (accounts.length < limit) break;
    offset += limit;
  }
  
  // Aggregate by domain using message_per_day (capacity) as proxy for activity
  const domains = {};
  let totalCapacity = 0;
  
  for (const acc of allAccounts) {
    const email = acc.from_email || acc.username;
    const domain = email?.split('@')[1] || 'unknown';
    const capacity = parseInt(acc.message_per_day) || 0;
    
    if (!domains[domain]) {
      domains[domain] = {
        domain,
        provider: acc.type === 'GMAIL' ? 'google' : 'hypertide',
        capacity: 0,
        accounts: 0
      };
    }
    
    domains[domain].capacity += capacity;
    domains[domain].accounts++;
    totalCapacity += capacity;
  }
  
  // Calculate proportions
  for (const d of Object.values(domains)) {
    d.proportion = totalCapacity > 0 ? d.capacity / totalCapacity : 0;
  }
  
  return { domains: Object.values(domains), totalCapacity };
}

async function main() {
  console.log('Fetching overall stats...');
  
  // Get day-wise stats for different periods
  const [sent7d, sent14d, sent30d] = await Promise.all([
    getDayWiseStats(7),
    getDayWiseStats(14),
    getDayWiseStats(30)
  ]);
  
  console.log(`Overall stats: 7D=${sent7d}, 14D=${sent14d}, 30D=${sent30d}`);
  
  // Get domain proportions
  console.log('Calculating domain proportions...');
  const { domains, totalCapacity } = await getDomainProportions();
  
  console.log(`Found ${domains.length} domains with total capacity ${totalCapacity}`);
  
  // Calculate estimated sends per domain
  const results = domains.map(d => ({
    domain: d.domain,
    provider: d.provider,
    accounts: d.accounts,
    capacity: d.capacity,
    proportion: d.proportion,
    sent7d: Math.round(sent7d * d.proportion),
    sent14d: Math.round(sent14d * d.proportion),
    sent30d: Math.round(sent30d * d.proportion)
  })).sort((a, b) => b.capacity - a.capacity);
  
  // Save to file
  const outputPath = path.join(DATA_DIR, `domain-history-estimated-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    method: 'proportional-estimate',
    totals: { sent7d, sent14d, sent30d },
    domains: results
  }, null, 2));
  
  console.log(`\nSaved to ${outputPath}`);
  
  // Update the domain stats file with estimates
  const statsPath = path.join(DATA_DIR, `domain-stats-${new Date().toISOString().slice(0, 10)}.json`);
  if (fs.existsSync(statsPath)) {
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    
    for (const domain of stats.domains) {
      const estimate = results.find(r => r.domain === domain.domain);
      if (estimate) {
        domain.sent7d = estimate.sent7d;
        domain.sent14d = estimate.sent14d;
        domain.sent30d = estimate.sent30d;
      }
    }
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log('Updated domain stats file with estimates');
  }
  
  // Update Supabase
  console.log('Updating Supabase...');
  const url = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
  const key = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');
  
  if (url && key) {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const date = new Date().toISOString().split('T')[0];
    
    for (const domain of results) {
      const metadata = JSON.stringify({
        provider: domain.provider,
        sent7d: domain.sent7d,
        sent14d: domain.sent14d,
        sent30d: domain.sent30d,
        estimationMethod: 'proportional'
      });
      
      await supabase
        .from('domain_snapshots')
        .update({ metadata })
        .eq('snapshot_date', date)
        .eq('domain', domain.domain);
    }
    
    console.log('✅ Supabase updated');
  }
  
  // Print summary
  console.log('\n=== Estimated Domain Sends ===');
  console.log('Domain                          | 7D    | 14D   | 30D   | Accounts');
  console.log('-'.repeat(70));
  for (const d of results.slice(0, 15)) {
    const name = d.domain.padEnd(30);
    console.log(`${name} | ${String(d.sent7d).padStart(5)} | ${String(d.sent14d).padStart(5)} | ${String(d.sent30d).padStart(5)} | ${d.accounts}`);
  }
  
  console.log('\nNote: These are ESTIMATES based on domain capacity proportions.');
  console.log('Actual historical data will be accurate after 30 days of daily tracking.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
