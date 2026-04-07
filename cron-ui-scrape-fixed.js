#!/usr/bin/env node
/**
 * SmartLead Analytics Sync (CLI-Based)
 * 
 * Replaces the old Puppeteer-based UI scraper with the official SmartLead CLI.
 * This is faster, more reliable, and doesn't require browser automation.
 * 
 * Usage:
 *   node cron-ui-scrape-fixed.js           # Full sync (all periods + monthly)
 *   node cron-ui-scrape-fixed.js --quick   # Time-based only (faster)
 *   node cron-ui-scrape-fixed.js --test    # Test mode (preview, don't save)
 * 
 * Output files:
 *   data/manual-ui-scrape-YYYY-MM-DD.json  # Time-based stats (backwards compat)
 *   data/monthly-ui-scraped.json           # Monthly stats (backwards compat)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// Parse arguments
const args = process.argv.slice(2);
const quickMode = args.includes('--quick');
const testMode = args.includes('--test');

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
  return {
    start: formatDate(start),
    end: formatDate(end)
  };
}

function getYesterdayRange() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    start: formatDate(yesterday),
    end: formatDate(yesterday)
  };
}

// ===========================================
// DATA FETCHERS
// ===========================================

function fetchStatsForRange(startDate, endDate) {
  let sent = 0, opened = 0, replied = 0, bounced = 0, positive = 0;
  
  // Get overall stats
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
  
  // Get positive replies from lead categories
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
// SCRAPE TIME-BASED STATS
// ===========================================

async function scrapeTimeBasedStats() {
  log('Fetching time-based stats via CLI...');
  
  const DATE_RANGES = [
    { key: 'yesterday', label: 'Yesterday', range: getYesterdayRange() },
    { key: 'last_3_days', label: 'Last 3 Days', range: getDateRange(3) },
    { key: 'last_7_days', label: 'Last 7 Days', range: getDateRange(7) },
    { key: 'last_14_days', label: 'Last 14 Days', range: getDateRange(14) },
    { key: 'last_30_days', label: 'Last 30 Days', range: getDateRange(30) },
    { key: 'last_60_days', label: 'Last 60 Days', range: getDateRange(60) },
    { key: 'last_90_days', label: 'Last 90 Days', range: getDateRange(90) },
    { key: 'last_120_days', label: 'Last 120 Days', range: getDateRange(120) }
  ];
  
  const results = {};
  
  for (const range of DATE_RANGES) {
    log(`  Fetching ${range.label}...`);
    const stats = fetchStatsForRange(range.range.start, range.range.end);
    
    results[range.key] = {
      period: `${range.range.start} - ${range.range.end}`,
      label: range.label,
      ...stats
    };
    
    log(`    Sent: ${stats.sent}, Replied: ${stats.replied}, Positive: ${stats.positive}`);
  }
  
  return results;
}

// ===========================================
// SCRAPE MONTHLY STATS
// ===========================================

async function scrapeMonthlyStats() {
  log('Fetching monthly stats via CLI...');
  
  const months = {};
  const now = new Date();
  
  // Start from November 2025
  let year = 2025;
  let month = 11;
  
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    
    // Last day of month
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    log(`  Fetching ${monthKey}...`);
    const stats = fetchStatsForRange(startDate, endDate);
    
    months[monthKey] = stats;
    log(`    Sent: ${stats.sent}, Replied: ${stats.replied}, Positive: ${stats.positive}`);
    
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  
  return months;
}

// ===========================================
// MAIN
// ===========================================

async function main() {
  log('Starting SmartLead Analytics Sync (CLI-based)...');
  log(`Mode: ${testMode ? 'TEST' : quickMode ? 'quick' : 'full'}`);
  
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toISOString().split('T')[0];
  
  // Fetch time-based stats
  const ranges = await scrapeTimeBasedStats();
  
  if (!testMode) {
    // Save time-based data (backwards compatible filename)
    const timeBasedData = {
      scraped_at: timestamp,
      source: 'SmartLead CLI (official)',
      method: 'smartlead-cli',
      ranges
    };
    
    const timeBasedPath = path.join(DATA_DIR, `manual-ui-scrape-${dateStr}.json`);
    fs.writeFileSync(timeBasedPath, JSON.stringify(timeBasedData, null, 2));
    log(`Saved time-based data to ${timeBasedPath}`);
    
    // Fetch monthly stats if not quick mode
    if (!quickMode) {
      const monthlyPath = path.join(DATA_DIR, 'monthly-ui-scraped.json');
      
      // Load existing monthly data
      let existingMonths = {};
      if (fs.existsSync(monthlyPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));
          existingMonths = existing.months || {};
        } catch (e) {
          log(`Could not load existing monthly data: ${e.message}`);
        }
      }
      
      const currentMonthData = await scrapeMonthlyStats();
      const mergedMonths = { ...existingMonths, ...currentMonthData };
      
      const monthlyData = {
        scrapedAt: timestamp,
        source: 'SmartLead CLI (official)',
        method: 'smartlead-cli',
        months: mergedMonths
      };
      
      fs.writeFileSync(monthlyPath, JSON.stringify(monthlyData, null, 2));
      log(`Updated monthly data`);
    }
  } else {
    log('\nTEST MODE - Data not saved');
    log('Results:');
    console.log(JSON.stringify(ranges, null, 2));
  }
  
  log('Sync complete!');
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
