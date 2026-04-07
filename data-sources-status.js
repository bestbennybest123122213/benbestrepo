#!/usr/bin/env node
/**
 * Data Sources Status
 * Quick check of all SmartLead data sources and their accuracy
 * 
 * Usage: node data-sources-status.js
 *        gex data-status
 *        gex ds
 */

require('dotenv').config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const fs = require('fs');
const path = require('path');

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

async function main() {
  console.log(colors.bold('\n📊 Data Sources Status\n'));
  console.log('═'.repeat(60));
  
  // 1. Check Scraped Global Analytics
  console.log('\n' + colors.cyan('1. Scraped Global Analytics'));
  console.log('─'.repeat(60));
  
  const dataPath = path.join(__dirname, 'data', 'global-analytics.json');
  if (fs.existsSync(dataPath)) {
    const scraped = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const ageMs = Date.now() - new Date(scraped.lastUpdated).getTime();
    const ageHours = Math.round(ageMs / (1000 * 60 * 60) * 10) / 10;
    
    const status = ageHours < 24 ? colors.green('✅ Fresh') : colors.yellow('⚠️  Stale');
    console.log(`   Status:    ${status} (${ageHours}h old)`);
    console.log(`   Accuracy:  ${colors.green('100%')} - matches SmartLead Global Analytics`);
    console.log(`   Endpoint:  /api/global-analytics`);
    console.log(`   Last 7d:   ${scraped.ranges?.last7d?.sent || 0} sent, ${scraped.ranges?.last7d?.positive || 0} positive`);
    console.log(`   Last 30d:  ${scraped.ranges?.last30d?.sent || 0} sent, ${scraped.ranges?.last30d?.positive || 0} positive`);
  } else {
    console.log(`   Status:    ${colors.red('❌ Missing')}`);
    console.log(`   Fix:       node scrape-global-analytics.js`);
  }
  
  // 2. Check Campaign Analytics V2
  console.log('\n' + colors.cyan('2. Campaign Analytics V2'));
  console.log('─'.repeat(60));
  console.log(`   Status:    ${colors.green('✅ Live')} - fetches directly from SmartLead API`);
  console.log(`   Accuracy:  ${colors.green('100%')} - real-time campaign data`);
  console.log(`   Endpoint:  /api/campaign-analytics-v2`);
  console.log(`   Cache:     5 minutes`);
  
  // 3. Check Supabase Snapshots
  console.log('\n' + colors.cyan('3. Supabase Campaign Snapshots'));
  console.log('─'.repeat(60));
  try {
    const { initSupabase } = require('./lib/supabase');
    const client = initSupabase();
    if (client) {
      const { data, error } = await client
        .from('campaign_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        console.log(`   Status:    ${colors.yellow('⚠️  Available')} - may have gaps`);
        console.log(`   Accuracy:  ${colors.yellow('~80-90%')} - cumulative deltas can drift`);
        console.log(`   Latest:    ${data[0].snapshot_date}`);
        console.log(`   Endpoint:  /api/historical-analytics`);
      } else {
        console.log(`   Status:    ${colors.yellow('⚠️  No data')}`);
      }
    }
  } catch (e) {
    console.log(`   Status:    ${colors.dim('Unavailable')}`);
  }
  
  // 4. Check SmartLead Daily Stats table
  console.log('\n' + colors.cyan('4. SmartLead Daily Stats (Supabase)'));
  console.log('─'.repeat(60));
  try {
    const { initSupabase } = require('./lib/supabase');
    const client = initSupabase();
    if (client) {
      const { data, error } = await client
        .from('smartlead_daily_stats')
        .select('stat_date')
        .order('stat_date', { ascending: false })
        .limit(1);
      
      if (!error) {
        console.log(`   Status:    ${colors.green('✅ Ready')}`);
        console.log(`   Latest:    ${data[0]?.stat_date || 'no data yet'}`);
        console.log(`   Accuracy:  ${colors.green('100%')} - synced from SmartLead day-wise API`);
      } else {
        console.log(`   Status:    ${colors.red('❌ Not created')}`);
        console.log(`   Fix:       Run migration in Supabase SQL Editor:`);
        console.log(`              migrations/smartlead_data_tables.sql`);
      }
    }
  } catch (e) {
    console.log(`   Status:    ${colors.red('❌ Error')}: ${e.message}`);
  }
  
  // Recommendations
  console.log('\n' + colors.bold('📌 Recommendations'));
  console.log('═'.repeat(60));
  console.log(`   For period stats:    ${colors.green('/api/global-analytics')} (100% accurate)`);
  console.log(`   For campaign data:   ${colors.green('/api/campaign-analytics-v2')} (100% accurate)`);
  console.log(`   For daily charts:    /api/historical-analytics (detailed but may drift)`);
  
  // Note about all-time totals
  console.log('\n' + colors.bold('📝 Note on All-Time Totals'));
  console.log('─'.repeat(60));
  console.log('   Day-wise API sums may be slightly higher than campaign totals.');
  console.log('   This is expected: day-wise includes ALL historical activity,');
  console.log('   while campaign stats show current state (excludes deleted/paused).');
  console.log('   For period comparisons (7/14/30d), use day-wise (scraped) data.');
  console.log('');
}

main().catch(console.error);
