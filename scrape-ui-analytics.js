#!/usr/bin/env node
/**
 * SmartLead Global Analytics UI Scraper (New Version)
 * 
 * Uses browser automation to scrape the NEW version of Global Analytics
 * which shows different (higher) numbers than the API.
 * 
 * Usage: 
 *   node scrape-ui-analytics.js              # Scrape default periods
 *   node scrape-ui-analytics.js --all        # Scrape all periods including 90d, 120d
 *   node scrape-ui-analytics.js --verbose    # Show debug output
 * 
 * Output: data/global-analytics-ui.json
 * 
 * Note: Requires SmartLead session cookie or will attempt browser login
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const SCRAPE_ALL = process.argv.includes('--all');

// Clawdbot browser control URL (when running via Clawdbot)
const CLAWDBOT_BROWSER = process.env.CLAWDBOT_BROWSER_URL || null;

function log(msg) {
  if (VERBOSE) console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logAlways(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/**
 * Date range configurations matching SmartLead UI
 * The UI uses specific date calculations
 */
function getDateRanges() {
  const today = new Date();
  const ranges = {};
  
  // Helper to format date as YYYY-MM-DD
  const fmt = (d) => d.toISOString().split('T')[0];
  
  // Helper to subtract days
  const subDays = (d, n) => {
    const result = new Date(d);
    result.setDate(result.getDate() - n);
    return result;
  };
  
  // SmartLead "Last X Days" = today minus (X-1) days to today
  // E.g., Last 7 Days on Mar 14 = Mar 8 to Mar 14
  
  ranges.last7d = {
    days: 7,
    start: fmt(subDays(today, 6)),
    end: fmt(today)
  };
  
  ranges.last14d = {
    days: 14,
    start: fmt(subDays(today, 13)),
    end: fmt(today)
  };
  
  ranges.last30d = {
    days: 30,
    start: fmt(subDays(today, 29)),
    end: fmt(today)
  };
  
  ranges.last60d = {
    days: 60,
    start: fmt(subDays(today, 59)),
    end: fmt(today)
  };
  
  if (SCRAPE_ALL) {
    ranges.last90d = {
      days: 90,
      start: fmt(subDays(today, 89)),
      end: fmt(today)
    };
    
    ranges.last120d = {
      days: 120,
      start: fmt(subDays(today, 119)),
      end: fmt(today)
    };
  }
  
  return ranges;
}

/**
 * Parse metrics from SmartLead Global Analytics page snapshot
 * Extracts: sent, opened, replied, positive, bounced
 */
function parseMetricsFromSnapshot(snapshot) {
  const metrics = {
    sent: 0,
    opened: 0,
    replied: 0,
    positive: 0,
    bounced: 0
  };
  
  // Look for patterns in snapshot text
  // The UI shows: "54141" under "Emails Sent", etc.
  
  // Extract numbers following specific labels
  const patterns = {
    sent: /Emails Sent.*?"(\d+)"/i,
    opened: /Opened.*?"(\d+)"/i,
    replied: /Replied.*?"(\d+)"/i,
    positive: /Positive Reply.*?"(\d+)"/i,
    bounced: /Bounced.*?"(\d+)"/i
  };
  
  const snapshotText = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = snapshotText.match(pattern);
    if (match) {
      metrics[key] = parseInt(match[1], 10);
    }
  }
  
  return metrics;
}

/**
 * Parse additional metrics (lead stats, providers, etc.)
 */
function parseAdditionalMetrics(snapshot) {
  const additional = {
    totalLeadsActive: 0,
    responseCategories: {},
    providers: {}
  };
  
  const text = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  
  // Total leads contacted
  const leadsMatch = text.match(/Total Leads \(Active\) Contacted.*?"?(\d+)"?/i);
  if (leadsMatch) additional.totalLeadsActive = parseInt(leadsMatch[1], 10);
  
  // Response categories
  const categories = ['Meeting Request', 'Interested', 'Booked', 'Information Request', 'Out Of Office'];
  for (const cat of categories) {
    const catMatch = text.match(new RegExp(`${cat}.*?(\\d+)\\s*\\(([\\d.]+)%\\)`, 'i'));
    if (catMatch) {
      additional.responseCategories[cat.toLowerCase().replace(/\s+/g, '_')] = {
        count: parseInt(catMatch[1], 10),
        percentage: parseFloat(catMatch[2])
      };
    }
  }
  
  // Provider stats
  const gmailMatch = text.match(/GMAIL.*?(\d+).*?([\d.]+)%.*?([\d.]+)%.*?([\d.]+)%/i);
  if (gmailMatch) {
    additional.providers.gmail = {
      sent: parseInt(gmailMatch[1], 10),
      openRate: parseFloat(gmailMatch[2]),
      replyRate: parseFloat(gmailMatch[3]),
      bounceRate: parseFloat(gmailMatch[4])
    };
  }
  
  const outlookMatch = text.match(/OUTLOOK.*?(\d+).*?([\d.]+)%.*?([\d.]+)%.*?([\d.]+)%/i);
  if (outlookMatch) {
    additional.providers.outlook = {
      sent: parseInt(outlookMatch[1], 10),
      openRate: parseFloat(outlookMatch[2]),
      replyRate: parseFloat(outlookMatch[3]),
      bounceRate: parseFloat(outlookMatch[4])
    };
  }
  
  return additional;
}

/**
 * Main scraping function
 * This is designed to be called from Clawdbot with browser access
 */
async function scrapeUIAnalytics() {
  logAlways('🌐 SmartLead UI Scraper (New Version)');
  logAlways('⚠️  This script requires Clawdbot browser automation');
  logAlways('');
  logAlways('To run: Ask Clawdbot to scrape SmartLead Global Analytics');
  logAlways('Or use the pre-scraped data in data/global-analytics-ui.json');
  
  // Check for existing UI data
  const uiDataPath = path.join(__dirname, 'data', 'global-analytics-ui.json');
  if (fs.existsSync(uiDataPath)) {
    const data = JSON.parse(fs.readFileSync(uiDataPath, 'utf8'));
    const lastUpdated = new Date(data.lastUpdated);
    const hoursAgo = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
    
    logAlways(`📊 Existing UI data found (${hoursAgo.toFixed(1)}h old):`);
    
    if (data.ranges) {
      for (const [key, range] of Object.entries(data.ranges)) {
        logAlways(`   ${key}: ${range.sent?.toLocaleString() || 0} sent, ${range.positive || 0} positive`);
      }
    }
    
    if (hoursAgo < 24) {
      logAlways('');
      logAlways('✅ Data is fresh (< 24h). Use --force to re-scrape.');
      return data;
    }
  }
  
  logAlways('');
  logAlways('🔧 To scrape fresh data, use Clawdbot:');
  logAlways('   "Scrape SmartLead Global Analytics New Version"');
  
  return null;
}

/**
 * Merge API data with UI-scraped data
 * Prefers UI data for metrics that differ (sent, replied, positive)
 */
function mergeWithAPIData(uiData, apiData) {
  const merged = { ...apiData };
  
  if (!uiData?.ranges) return merged;
  
  // Override API ranges with UI data where available
  for (const [key, uiRange] of Object.entries(uiData.ranges)) {
    if (merged.ranges?.[key]) {
      merged.ranges[key] = {
        ...merged.ranges[key],
        ...uiRange,
        source: 'ui-scrape'
      };
    } else if (merged.ranges) {
      merged.ranges[key] = {
        ...uiRange,
        source: 'ui-scrape'
      };
    }
  }
  
  merged.uiMetrics = uiData.uiMetrics;
  merged.lastUIUpdate = uiData.lastUpdated;
  
  return merged;
}

/**
 * Apply UI data to dashboard API responses
 * Call this from server.js to override API data with accurate UI data
 */
function applyUIData(apiResponse) {
  const uiDataPath = path.join(__dirname, 'data', 'global-analytics-ui.json');
  
  if (!fs.existsSync(uiDataPath)) {
    return apiResponse;
  }
  
  try {
    const uiData = JSON.parse(fs.readFileSync(uiDataPath, 'utf8'));
    
    // Map UI range keys to API period names
    const rangeMap = {
      'last7d': 'Last 7 Days',
      'last14d': 'Last 14 Days',
      'last30d': 'Last 30 Days',
      'last60d': 'Last 60 Days',
      'last90d': 'Last 90 Days',
      'last120d': 'Last 120 Days'
    };
    
    if (apiResponse.timeBasedStats && uiData.ranges) {
      for (const [uiKey, uiRange] of Object.entries(uiData.ranges)) {
        const periodName = rangeMap[uiKey];
        if (periodName && apiResponse.timeBasedStats[periodName]) {
          apiResponse.timeBasedStats[periodName] = {
            ...apiResponse.timeBasedStats[periodName],
            sent: uiRange.sent,
            replied: uiRange.replied,
            positive: uiRange.positive,
            bounced: uiRange.bounced,
            opened: uiRange.opened,
            source: 'ui-scrape'
          };
        }
      }
    }
    
    return apiResponse;
  } catch (e) {
    console.error('Error applying UI data:', e.message);
    return apiResponse;
  }
}

// Export functions for use by server and other scripts
module.exports = {
  scrapeUIAnalytics,
  parseMetricsFromSnapshot,
  parseAdditionalMetrics,
  mergeWithAPIData,
  applyUIData,
  getDateRanges
};

// Run if called directly
if (require.main === module) {
  scrapeUIAnalytics()
    .then(data => {
      if (data) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
