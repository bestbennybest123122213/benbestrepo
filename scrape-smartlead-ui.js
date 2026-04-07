#!/usr/bin/env node
/**
 * SmartLead UI Scraper (DEPRECATED - CLI-Based)
 * 
 * This script has been migrated to use the official SmartLead CLI
 * instead of Puppeteer browser automation.
 * 
 * Usage:
 *   node scrape-smartlead-ui.js           # Full sync
 *   node scrape-smartlead-ui.js --quick   # Time-based only
 * 
 * Output:
 *   data/manual-ui-scrape-YYYY-MM-DD.json
 *   data/monthly-ui-scraped.json (full mode only)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// Parse arguments
const args = process.argv.slice(2);
const quickMode = args.includes('--quick');

// ===========================================
// CLI HELPERS
// ===========================================

function runCliCommand(command) {
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    return JSON.parse(output);
  } catch (err) {
    log(`CLI Error: ${err.message}`);
    return null;
  }
}

// ===========================================
// DATE HELPERS
// ===========================================

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return { start: formatDate(start), end: formatDate(end) };
}

// ===========================================
// DATA FETCHERS
// ===========================================

function fetchStatsForRange(startDate, endDate) {
  let sent = 0, opened = 0, replied = 0, bounced = 0, positive = 0;
  
  const overall = runCliCommand(
    `smartlead analytics overall --from ${startDate} --to ${endDate} --format json`
  );
  
  if (overall?.success && overall?.data?.overall_stats) {
    const stats = overall.data.overall_stats;
    sent = parseInt(stats.sent) || 0;
    opened = parseInt(stats.opened) || 0;
    replied = parseInt(stats.replied) || 0;
    bounced = parseInt(stats.bounced) || 0;
  }
  
  const categories = runCliCommand(
    `smartlead analytics lead-categories --from ${startDate} --to ${endDate} --format json`
  );
  
  if (categories?.success && categories?.data?.lead_responses_by_category?.leadResponseGrouping) {
    const grouping = categories.data.lead_responses_by_category.leadResponseGrouping;
    const POSITIVE_CATEGORIES = ['Meeting Request', 'Interested'];
    for (const cat of grouping) {
      if (POSITIVE_CATEGORIES.includes(cat.name)) {
        positive += cat.total_response || 0;
      }
    }
  }
  
  return { sent, opened, replied, bounced, positive };
}

// ===========================================
// MAIN SCRAPER
// ===========================================

async function scrapeGlobalAnalytics() {
  log('🚀 SmartLead Analytics (CLI-based)...');
  log(`Mode: ${quickMode ? 'quick' : 'full'}`);
  
  const timestamp = new Date().toISOString();
  const dateStr = formatDate(new Date());
  
  // Period configurations matching original scraper
  const PERIODS = [
    { label: 'Last 7 Days', days: 7, key: 'last_7_days' },
    { label: 'Last 14 Days', days: 14, key: 'last_14_days' },
    { label: 'Last 30 Days', days: 30, key: 'last_30_days' },
    { label: 'Last 60 Days', days: 60, key: 'last_60_days' },
    { label: 'Last 90 Days', days: 90, key: 'last_90_days' },
    { label: 'Last 120 Days', days: 120, key: 'last_120_days' }
  ];
  
  const results = {};
  
  for (const period of PERIODS) {
    log(`  📊 Fetching ${period.label}...`);
    const { start, end } = getDateRange(period.days);
    const stats = fetchStatsForRange(start, end);
    
    results[period.key] = {
      period: `${start} - ${end}`,
      label: period.label,
      ...stats
    };
    
    log(`    ✓ Sent: ${stats.sent}, Replied: ${stats.replied}, Positive: ${stats.positive}`);
  }
  
  // Save results
  const output = {
    scraped_at: timestamp,
    source: 'SmartLead CLI (official)',
    method: 'smartlead-cli',
    ranges: results
  };
  
  const outputPath = path.join(DATA_DIR, `manual-ui-scrape-${dateStr}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  log(`💾 Saved to: ${outputPath}`);
  
  // Monthly data (full mode only)
  if (!quickMode) {
    log('📅 Fetching monthly data...');
    
    const months = {};
    const now = new Date();
    
    // Start from November 2025
    let year = 2025;
    let month = 11;
    
    while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      
      log(`  📊 Fetching ${monthKey}...`);
      const stats = fetchStatsForRange(startDate, endDate);
      months[monthKey] = stats;
      
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    
    const monthlyPath = path.join(DATA_DIR, 'monthly-ui-scraped.json');
    const monthlyOutput = {
      scrapedAt: timestamp,
      source: 'SmartLead CLI (official)',
      method: 'smartlead-cli',
      months
    };
    fs.writeFileSync(monthlyPath, JSON.stringify(monthlyOutput, null, 2));
    log(`💾 Saved monthly to: ${monthlyPath}`);
  }
  
  // Print summary
  log('\n📊 Summary:');
  log(`   Last 7d:  ${results.last_7_days.sent.toLocaleString()} sent, ${results.last_7_days.positive} positive`);
  log(`   Last 30d: ${results.last_30_days.sent.toLocaleString()} sent, ${results.last_30_days.positive} positive`);
  log('✅ Done!');
  
  return output;
}

// Run
if (require.main === module) {
  scrapeGlobalAnalytics()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeGlobalAnalytics };
