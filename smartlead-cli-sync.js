#!/usr/bin/env node
/**
 * Smartlead CLI Sync for BULL OS Dashboard
 * 
 * Fetches performance data from Smartlead CLI and saves to JSON files
 * for the Time-Based Performance and Month-by-Month Performance sections.
 * 
 * Usage:
 *   node smartlead-cli-sync.js                # Run full sync
 *   node smartlead-cli-sync.js --test         # Preview without writing
 *   node smartlead-cli-sync.js --time-only    # Only time-based stats
 *   node smartlead-cli-sync.js --monthly-only # Only monthly stats
 *   node smartlead-cli-sync.js --finalize     # Finalize previous month (for 1st of month cron)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(__dirname, 'logs', 'cli-sync.log');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

// Parse arguments
const args = process.argv.slice(2);
const TEST_MODE = args.includes('--test');
const TIME_ONLY = args.includes('--time-only');
const MONTHLY_ONLY = args.includes('--monthly-only');
const FINALIZE_MODE = args.includes('--finalize');

// Logging
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // Ignore log write errors
  }
}

// Date helpers
function formatDate(date) {
  // Use local date parts to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastBusinessDay(fromDate = new Date()) {
  const date = new Date(fromDate);
  // Move to previous day
  date.setDate(date.getDate() - 1);
  
  // Skip weekends
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  
  return date;
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function getMonthRange(year, month) {
  // month is 0-indexed (0=Jan, 11=Dec)
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0); // Last day of month
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Run CLI command and parse JSON
function runCliCommand(command) {
  log(`Running: ${command}`);
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return JSON.parse(output);
  } catch (err) {
    log(`CLI Error: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Fetch data from Smartlead CLI
// Per bull-os-smartlead-cli-automation.md - ONLY 3 CLI calls needed:
async function fetchSmartleadData(fromDate, toDate) {
  const from = formatDate(fromDate);
  const to = formatDate(toDate);
  
  log(`Fetching data from ${from} to ${to}`);
  
  // Command 1: daily-sent → sent, replied, unique_lead_reached (leads contacted)
  const dailySent = runCliCommand(
    `smartlead analytics daily-sent --from ${from} --to ${to} --timezone UTC --format json`
  );
  
  // Command 2: daily → bounced (NOT daily-sent, which gives wrong bounce count)
  const daily = runCliCommand(
    `smartlead analytics daily --from ${from} --to ${to} --format json`
  );
  
  // Command 3: daily-replies-sent → positive_replied
  const dailyReplies = runCliCommand(
    `smartlead analytics daily-replies-sent --from ${from} --to ${to} --timezone UTC --format json`
  );
  
  // NOTE: Removed lead-stats call - use unique_lead_reached from daily-sent instead
  // Per documentation: unique_lead_reached gives exact match with UI
  
  return {
    dailySent: dailySent?.data?.day_wise_stats || [],
    daily: daily?.data?.day_wise_stats || [],
    dailyReplies: dailyReplies?.data?.day_wise_stats || []
  };
}

// Parse a value that could be string or number
function parseValue(val) {
  if (val === null || val === undefined) return 0;
  return parseInt(val) || 0;
}

// Sum metrics from day-wise data for a specific date range
function sumMetricsForRange(data, startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  // Build date lookup from "1 Mar" format to actual date
  // We need to handle year rollover properly
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Determine the year range we're working with
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  function parseDateStr(dateStr) {
    // Format: "1 Mar" or "15 Mar"
    const parts = dateStr.split(' ');
    if (parts.length !== 2) return null;
    const day = parseInt(parts[0]);
    const monthIdx = months.indexOf(parts[1]);
    if (monthIdx === -1) return null;
    
    // Try both years (for year-spanning ranges)
    // Start with endYear, check if it fits in range
    for (let yr = endYear; yr >= startYear; yr--) {
      const candidate = new Date(yr, monthIdx, day);
      if (candidate >= start && candidate <= end) {
        return candidate;
      }
    }
    // If nothing fits, just return endYear version (for filtering)
    return new Date(endYear, monthIdx, day);
  }
  
  let sent = 0, replied = 0, bounced = 0, positive = 0, contacted = 0;
  
  // Process dailySent data
  for (const day of data.dailySent) {
    const dayDate = parseDateStr(day.date);
    if (!dayDate) continue;
    if (dayDate >= start && dayDate <= end) {
      const m = day.email_engagement_metrics || {};
      sent += parseValue(m.sent);
      replied += parseValue(m.replied);
      contacted += parseValue(m.unique_lead_reached);
    }
  }
  
  // Process daily data for bounced
  for (const day of data.daily) {
    const dayDate = parseDateStr(day.date);
    if (!dayDate) continue;
    if (dayDate >= start && dayDate <= end) {
      const m = day.email_engagement_metrics || {};
      bounced += parseValue(m.bounced);
    }
  }
  
  // Process dailyReplies data for positive
  for (const day of data.dailyReplies) {
    const dayDate = parseDateStr(day.date);
    if (!dayDate) continue;
    if (dayDate >= start && dayDate <= end) {
      const m = day.email_engagement_metrics || {};
      positive += parseValue(m.positive_replied);
    }
  }
  
  return { sent, replied, bounced, positive, contacted };
}

// Calculate percentage change
function calcChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous * 100);
}

// Fetch lead stats for accurate unique leads contacted
// Per SMARTLEAD-CLI-GUIDE.md: lead-stats gives exact match with UI (2,278 = 2,278)
function fetchLeadStats(fromDate, toDate) {
  const from = formatDate(fromDate);
  const to = formatDate(toDate);
  try {
    const result = runCliCommand(
      `smartlead analytics lead-stats --from ${from} --to ${to} --format json`
    );
    return result?.data?.lead_stats?.count?.total || 0;
  } catch (err) {
    log(`Error fetching lead-stats for ${from} to ${to}: ${err.message}`, 'WARN');
    return 0;
  }
}

// Build time-based performance data
function buildTimeBasedData(data, today) {
  const windows = [
    { label: 'Last Business Day', days: 0, isBusinessDay: true },
    { label: 'Last 3 Days', days: 3 },
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 14 Days', days: 14 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'Last 60 Days', days: 60 },
    { label: 'Last 90 Days', days: 90 },
    { label: 'Last 120 Days', days: 120 },
  ];
  
  const results = [];
  
  for (const window of windows) {
    let currentStart, currentEnd, prevStart, prevEnd;
    
    if (window.isBusinessDay) {
      // Last business day
      currentEnd = getLastBusinessDay(today);
      currentStart = new Date(currentEnd);
      // Previous business day
      prevEnd = getLastBusinessDay(currentEnd);
      prevStart = new Date(prevEnd);
    } else {
      // Rolling window: "Last N Days" means from (today - N + 1) to today
      currentEnd = new Date(today);
      currentStart = subtractDays(today, window.days - 1);
      // Previous period: same length, ending the day before current starts
      prevEnd = subtractDays(currentStart, 1);
      prevStart = subtractDays(prevEnd, window.days - 1);
    }
    
    const current = sumMetricsForRange(data, currentStart, currentEnd);
    const prev = sumMetricsForRange(data, prevStart, prevEnd);
    
    // Per SMARTLEAD-CLI-GUIDE.md: use lead-stats for accurate contacts (verified: 2,278 = 2,278)
    // unique_lead_reached from daily-sent is buggy (returns same as sent)
    log(`  Fetching lead-stats for ${window.label}...`);
    const currentContacted = fetchLeadStats(currentStart, currentEnd);
    const prevContacted = fetchLeadStats(prevStart, prevEnd);
    current.contacted = currentContacted;
    prev.contacted = prevContacted;
    
    // Calculate rates
    // IMPORTANT: Reply rate = replied / contacted (unique leads), NOT replied / sent (emails)
    // This matches Smartlead's methodology and Sparky's programming
    const replyRate = current.contacted > 0 ? (current.replied / current.contacted * 100) : 0;
    const positiveRate = current.replied > 0 ? (current.positive / current.replied * 100) : 0;
    const bounceRate = current.sent > 0 ? (current.bounced / current.sent * 100) : 0;
    
    // Calculate changes
    const trends = {
      sent: calcChange(current.sent, prev.sent),
      replied: calcChange(current.replied, prev.replied),
      positive: calcChange(current.positive, prev.positive),
      bounced: calcChange(current.bounced, prev.bounced),
      contacted: calcChange(current.contacted, prev.contacted),
    };
    
    results.push({
      label: window.label,
      dateRange: {
        start: formatDate(currentStart),
        end: formatDate(currentEnd),
      },
      current: {
        ...current,
        replyRate: replyRate.toFixed(2),
        positiveRate: positiveRate.toFixed(2),
        bounceRate: bounceRate.toFixed(2),
      },
      previous: prev,
      trends: {
        sent: trends.sent.toFixed(1),
        replied: trends.replied.toFixed(1),
        positive: trends.positive.toFixed(1),
        bounced: trends.bounced.toFixed(1),
        contacted: trends.contacted.toFixed(1),
      },
    });
  }
  
  return results;
}

// Build monthly performance data
function buildMonthlyData(data, today) {
  const months = [];
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  // Start from November 2025
  const startYear = 2025;
  const startMonth = 10; // November (0-indexed)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  let year = startYear;
  let month = startMonth;
  
  while (year < currentYear || (year === currentYear && month <= currentMonth)) {
    const { start, end } = getMonthRange(year, month);
    
    // For current month, use today as end date
    const effectiveEnd = (year === currentYear && month === currentMonth) 
      ? today 
      : end;
    
    const metrics = sumMetricsForRange(data, start, effectiveEnd);
    
    // Per SMARTLEAD-CLI-GUIDE.md: use lead-stats for accurate contacts
    log(`  Fetching lead-stats for ${monthNames[month]} ${year}...`);
    metrics.contacted = fetchLeadStats(start, effectiveEnd);
    
    // Calculate rates
    // IMPORTANT: Reply rate = replied / contacted (unique leads), NOT replied / sent (emails)
    const replyRate = metrics.contacted > 0 ? (metrics.replied / metrics.contacted * 100) : 0;
    const positiveRate = metrics.replied > 0 ? (metrics.positive / metrics.replied * 100) : 0;
    const bounceRate = metrics.sent > 0 ? (metrics.bounced / metrics.sent * 100) : 0;
    
    months.push({
      label: `${monthNames[month]} ${year}`,
      year,
      month: month + 1,
      isCurrent: year === currentYear && month === currentMonth,
      isFinalized: !(year === currentYear && month === currentMonth),
      dateRange: {
        start: formatDate(start),
        end: formatDate(effectiveEnd),
      },
      metrics: {
        ...metrics,
        replyRate: replyRate.toFixed(2),
        positiveRate: positiveRate.toFixed(2),
        bounceRate: bounceRate.toFixed(2),
      },
    });
    
    // Move to next month
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  
  // Calculate month-over-month trends
  for (let i = 1; i < months.length; i++) {
    const current = months[i].metrics;
    const prev = months[i - 1].metrics;
    
    months[i].trends = {
      sent: calcChange(current.sent, prev.sent).toFixed(1),
      replied: calcChange(current.replied, prev.replied).toFixed(1),
      positive: calcChange(current.positive, prev.positive).toFixed(1),
      bounced: calcChange(current.bounced, prev.bounced).toFixed(1),
      contacted: calcChange(current.contacted, prev.contacted).toFixed(1),
    };
  }
  
  // Calculate totals - sum events but get unique contacts separately
  const totals = months.reduce((acc, m) => {
    acc.sent += m.metrics.sent;
    acc.replied += m.metrics.replied;
    acc.bounced += m.metrics.bounced;
    acc.positive += m.metrics.positive;
    // DON'T sum contacted - it would double-count leads across months
    return acc;
  }, { sent: 0, replied: 0, bounced: 0, positive: 0 });
  
  // Get TRUE unique contacts for the full period (no double-counting)
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  log(`  Fetching lead-stats for TOTAL (${firstMonth.dateRange.start} to ${lastMonth.dateRange.end})...`);
  totals.contacted = fetchLeadStats(
    new Date(firstMonth.dateRange.start), 
    new Date(lastMonth.dateRange.end)
  );
  
  // IMPORTANT: Reply rate = replied / contacted (unique leads)
  totals.replyRate = totals.contacted > 0 ? (totals.replied / totals.contacted * 100).toFixed(2) : '0.00';
  totals.positiveRate = totals.replied > 0 ? (totals.positive / totals.replied * 100).toFixed(2) : '0.00';
  totals.bounceRate = totals.sent > 0 ? (totals.bounced / totals.sent * 100).toFixed(2) : '0.00';
  
  return { months, totals };
}

// Main sync function
async function main() {
  const startTime = Date.now();
  log('='.repeat(60));
  log(`Smartlead CLI Sync started ${TEST_MODE ? '(TEST MODE)' : ''}`);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    // Fetch 240 days of data (to cover 120 days + 120 days comparison period)
    const fetchStart = subtractDays(today, 240);
    const data = await fetchSmartleadData(fetchStart, today);
    
    log(`Fetched ${data.dailySent.length} days of daily-sent data`);
    log(`Fetched ${data.daily.length} days of daily data`);
    log(`Fetched ${data.dailyReplies.length} days of daily-replies data`);
    
    // Build time-based data
    if (!MONTHLY_ONLY) {
      log('Building time-based performance data...');
      const timeBasedData = buildTimeBasedData(data, today);
      
      if (TEST_MODE) {
        console.log('\n=== TIME-BASED PERFORMANCE (preview) ===');
        console.log(JSON.stringify(timeBasedData, null, 2));
      } else {
        const timePath = path.join(DATA_DIR, 'cli-time-based.json');
        fs.writeFileSync(timePath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          source: 'smartlead-cli',
          windows: timeBasedData,
        }, null, 2));
        log(`Saved time-based data to ${timePath}`);
      }
    }
    
    // Build monthly data
    if (!TIME_ONLY) {
      log('Building monthly performance data...');
      const monthlyData = buildMonthlyData(data, today);
      
      if (TEST_MODE) {
        console.log('\n=== MONTHLY PERFORMANCE (preview) ===');
        console.log(JSON.stringify(monthlyData, null, 2));
      } else {
        const monthlyPath = path.join(DATA_DIR, 'cli-monthly.json');
        fs.writeFileSync(monthlyPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          source: 'smartlead-cli',
          ...monthlyData,
        }, null, 2));
        log(`Saved monthly data to ${monthlyPath}`);
      }
    }
    
    const elapsed = Date.now() - startTime;
    log(`Sync completed in ${elapsed}ms`);
    
    // Return summary for programmatic use
    return {
      success: true,
      elapsed,
      testMode: TEST_MODE,
    };
    
  } catch (err) {
    log(`Sync failed: ${err.message}`, 'ERROR');
    log(err.stack, 'ERROR');
    process.exit(1);
  }
}

// Run
main().then(result => {
  if (!TEST_MODE) {
    log(`Final result: ${JSON.stringify(result)}`);
  }
}).catch(err => {
  console.error(err);
  process.exit(1);
});
