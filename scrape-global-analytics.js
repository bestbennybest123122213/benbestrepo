#!/usr/bin/env node
/**
 * SmartLead Global Analytics (CLI-Based)
 * 
 * Fetches global analytics data using the official SmartLead CLI
 * and stores as JSON for the domain-health-dashboard.
 * 
 * Usage: node scrape-global-analytics.js [--verbose]
 * 
 * Output: data/global-analytics.json
 */

require('dotenv').config();

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ===========================================
// LOGGING
// ===========================================

function log(msg) {
  if (VERBOSE) console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logAlways(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ===========================================
// CLI HELPERS
// ===========================================

function runCliCommand(command, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`Running: ${command}`);
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 90000, // 90 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, FORCE_COLOR: '0' }
      });
      return JSON.parse(output);
    } catch (err) {
      if (attempt === retries) {
        log(`CLI command failed after ${retries} attempts: ${err.message}`);
        throw err;
      }
      log(`Attempt ${attempt} failed, retrying...`);
      // Sleep before retry
      execSync('sleep 2');
    }
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

function getDateRange(daysBack) {
  const end = new Date();
  const start = new Date();
  
  if (daysBack === 1) {
    // Special case: "yesterday" = just yesterday (1 day back)
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else {
    // "Last X Days" = X days inclusive of today
    start.setDate(start.getDate() - daysBack + 1);
  }
  
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
}

function getMonthRange(year, month) {
  const startMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${startMonth}-01`;
  
  // Last day of month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${startMonth}-${String(lastDay).padStart(2, '0')}`;
  
  return { startDate, endDate };
}

function getMonthsToScrape() {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Start from Nov 2025 (first month with data)
  let year = 2025;
  let month = 11;
  
  while (year < currentYear || (year === currentYear && month <= currentMonth)) {
    months.push({ year, month });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  
  return months;
}

// ===========================================
// DATA FETCHERS (CLI-based)
// ===========================================

/**
 * Fetch overall stats for a date range using CLI
 * Uses multiple CLI commands to get comprehensive data:
 * - analytics overall: sent, opened, replied, bounced
 * - analytics lead-categories: positive replies (Meeting Request + Interested)
 */
function fetchOverallStats(startDate, endDate) {
  log(`Fetching stats: ${startDate} to ${endDate}`);
  
  let sent = 0, opened = 0, replied = 0, bounced = 0, positive = 0;
  
  // 1. Get overall stats from CLI
  try {
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
  } catch (e) {
    log(`Warning: analytics overall failed: ${e.message}`);
    
    // Fallback: Use daily stats and aggregate
    try {
      const daily = runCliCommand(
        `smartlead analytics daily --from ${startDate} --to ${endDate} --format json`
      );
      
      const days = daily?.data?.day_wise_stats || [];
      for (const day of days) {
        const m = day.email_engagement_metrics || {};
        sent += parseInt(m.sent) || 0;
        opened += parseInt(m.opened) || 0;
        replied += parseInt(m.replied) || 0;
        bounced += parseInt(m.bounced) || 0;
      }
    } catch (e2) {
      log(`Warning: daily fallback also failed: ${e2.message}`);
    }
  }
  
  // 2. Get positive replies (Meeting Request + Interested)
  try {
    const categories = runCliCommand(
      `smartlead analytics lead-categories --from ${startDate} --to ${endDate} --format json`
    );
    
    if (categories?.success && categories?.data?.lead_responses_by_category?.leadResponseGrouping) {
      const grouping = categories.data.lead_responses_by_category.leadResponseGrouping;
      // Only count Meeting Request + Interested to match UI
      const POSITIVE_CATEGORIES = ['Meeting Request', 'Interested'];
      for (const cat of grouping) {
        if (POSITIVE_CATEGORIES.includes(cat.name)) {
          positive += cat.total_response || 0;
        }
      }
    }
  } catch (e) {
    log(`Warning: lead-categories failed: ${e.message}`);
    
    // Fallback: Use daily-replies-sent
    try {
      const replies = runCliCommand(
        `smartlead analytics daily-replies-sent --from ${startDate} --to ${endDate} --format json`
      );
      
      const days = replies?.data?.day_wise_stats || [];
      for (const day of days) {
        const m = day.email_engagement_metrics || {};
        positive += parseInt(m.positive_replied) || 0;
      }
    } catch (e2) {
      log(`Warning: daily-replies fallback also failed: ${e2.message}`);
    }
  }
  
  return { sent, replied, positive, bounced, opened };
}

// ===========================================
// MAIN SCRAPER
// ===========================================

async function scrapeGlobalAnalytics() {
  const startTime = Date.now();
  logAlways('🚀 Starting SmartLead Global Analytics fetch (CLI-based)...');
  
  const result = {
    lastUpdated: new Date().toISOString(),
    source: 'smartlead-cli',
    scrapeDurationMs: 0,
    ranges: {},
    monthly: {}
  };
  
  // ===========================================
  // FETCH RELATIVE DATE RANGES
  // ===========================================
  
  const ranges = [
    { key: 'yesterday', days: 1 },
    { key: 'last3d', days: 3 },
    { key: 'last7d', days: 7 },
    { key: 'last14d', days: 14 },
    { key: 'last30d', days: 30 },
    { key: 'last60d', days: 60 },
    { key: 'last90d', days: 90 },
    { key: 'last120d', days: 120 }
  ];
  
  logAlways(`📊 Fetching ${ranges.length} date ranges...`);
  
  for (const range of ranges) {
    const { startDate, endDate } = getDateRange(range.days);
    log(`  ${range.key}: ${startDate} to ${endDate}`);
    
    try {
      const stats = fetchOverallStats(startDate, endDate);
      result.ranges[range.key] = {
        ...stats,
        dateRange: { start: startDate, end: endDate }
      };
      log(`  ✓ ${range.key}: sent=${stats.sent}, replied=${stats.replied}, positive=${stats.positive}, bounced=${stats.bounced}`);
    } catch (e) {
      console.error(`  ✗ ${range.key}: ${e.message}`);
      result.ranges[range.key] = {
        sent: 0, replied: 0, positive: 0, bounced: 0,
        error: e.message,
        dateRange: { start: startDate, end: endDate }
      };
    }
  }
  
  // ===========================================
  // FETCH MONTHLY DATA
  // ===========================================
  
  const months = getMonthsToScrape();
  logAlways(`📅 Fetching ${months.length} monthly periods...`);
  
  for (const { year, month } of months) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const { startDate, endDate } = getMonthRange(year, month);
    log(`  ${monthKey}: ${startDate} to ${endDate}`);
    
    try {
      const stats = fetchOverallStats(startDate, endDate);
      result.monthly[monthKey] = {
        ...stats,
        dateRange: { start: startDate, end: endDate }
      };
      log(`  ✓ ${monthKey}: sent=${stats.sent}, replied=${stats.replied}, positive=${stats.positive}, bounced=${stats.bounced}`);
    } catch (e) {
      console.error(`  ✗ ${monthKey}: ${e.message}`);
      result.monthly[monthKey] = {
        sent: 0, replied: 0, positive: 0, bounced: 0,
        error: e.message,
        dateRange: { start: startDate, end: endDate }
      };
    }
  }
  
  // ===========================================
  // COMPUTE TOTALS
  // ===========================================
  
  const allTime = Object.values(result.monthly).reduce((acc, m) => {
    acc.sent += m.sent || 0;
    acc.replied += m.replied || 0;
    acc.positive += m.positive || 0;
    acc.bounced += m.bounced || 0;
    return acc;
  }, { sent: 0, replied: 0, positive: 0, bounced: 0 });
  
  result.allTime = allTime;
  
  // Calculate rates for ranges
  for (const key of Object.keys(result.ranges)) {
    const r = result.ranges[key];
    if (r.sent > 0) {
      r.replyRate = ((r.replied / r.sent) * 100).toFixed(2);
      r.positiveRate = ((r.positive / r.sent) * 100).toFixed(2);
      r.bounceRate = ((r.bounced / r.sent) * 100).toFixed(2);
    }
  }
  
  // Calculate rates for months
  for (const key of Object.keys(result.monthly)) {
    const m = result.monthly[key];
    if (m.sent > 0) {
      m.replyRate = ((m.replied / m.sent) * 100).toFixed(2);
      m.positiveRate = ((m.positive / m.sent) * 100).toFixed(2);
      m.bounceRate = ((m.bounced / m.sent) * 100).toFixed(2);
    }
  }
  
  result.scrapeDurationMs = Date.now() - startTime;
  
  // ===========================================
  // SAVE TO FILE
  // ===========================================
  
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outputPath = path.join(dataDir, 'global-analytics.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  logAlways(`✅ Done! Fetched in ${(result.scrapeDurationMs / 1000).toFixed(1)}s`);
  logAlways(`📁 Saved to: ${outputPath}`);
  
  // Print summary
  logAlways('\n📊 Summary:');
  logAlways(`   Last 7 days:  ${result.ranges.last7d?.sent?.toLocaleString() || 0} sent, ${result.ranges.last7d?.positive || 0} positive`);
  logAlways(`   Last 30 days: ${result.ranges.last30d?.sent?.toLocaleString() || 0} sent, ${result.ranges.last30d?.positive || 0} positive`);
  logAlways(`   All time:     ${allTime.sent.toLocaleString()} sent, ${allTime.positive} positive`);
  
  return result;
}

// ===========================================
// RUN
// ===========================================

if (require.main === module) {
  scrapeGlobalAnalytics()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Fetch failed:', err);
      process.exit(1);
    });
}

module.exports = { scrapeGlobalAnalytics, fetchOverallStats, getDateRange, getMonthRange };
