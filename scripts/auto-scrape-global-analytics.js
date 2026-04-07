#!/usr/bin/env node
/**
 * Automated Global Analytics Scraper
 * Uses Clawdbot browser control to scrape SmartLead Performance Metrics
 * for multiple date ranges (7d, 14d, 30d, 60d, 90d)
 * 
 * Usage:
 *   node auto-scrape-global-analytics.js           # Full scrape all periods
 *   node auto-scrape-global-analytics.js --quick   # Only 7d and 30d
 *   node auto-scrape-global-analytics.js --test    # Test mode (7d only)
 * 
 * Author: Clawdbot COO
 * Created: March 16, 2026
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const log = (msg) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, `auto-scrape-${new Date().toISOString().split('T')[0]}.log`), line + '\n');
};

// Date range configurations
function getDateRanges(mode = 'full') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let periods;
  if (mode === 'test') {
    periods = [{ key: 'last_7_days', days: 7 }];
  } else if (mode === 'quick') {
    periods = [
      { key: 'last_7_days', days: 7 },
      { key: 'last_30_days', days: 30 }
    ];
  } else {
    periods = [
      { key: 'last_7_days', days: 7 },
      { key: 'last_14_days', days: 14 },
      { key: 'last_30_days', days: 30 },
      { key: 'last_60_days', days: 60 },
      { key: 'last_90_days', days: 90 }
    ];
  }
  
  return periods.map(p => {
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(endDate.getDate() - p.days + 1);
    
    return {
      key: p.key,
      days: p.days,
      startDate,
      endDate,
      startDay: startDate.getDate(),
      endDay: endDate.getDate(),
      startMonth: startDate.toLocaleString('en-US', { month: 'long' }),
      endMonth: endDate.toLocaleString('en-US', { month: 'long' }),
      startYear: startDate.getFullYear(),
      endYear: endDate.getFullYear()
    };
  });
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Execute browser action via Clawdbot CLI
function browserAction(action, params = {}) {
  const args = [`--action=${action}`, '--profile=clawd'];
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      args.push(`--${key}=${JSON.stringify(value)}`);
    }
  }
  
  try {
    const result = execSync(`clawdbot browser ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: 60000
    });
    return JSON.parse(result);
  } catch (error) {
    log(`Browser action failed: ${error.message}`);
    return null;
  }
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main scraper class
class GlobalAnalyticsScraper {
  constructor(targetId) {
    this.targetId = targetId;
    this.results = {};
  }
  
  async navigate(url) {
    log(`Navigating to: ${url}`);
    return browserAction('navigate', { targetId: this.targetId, targetUrl: url });
  }
  
  async snapshot() {
    return browserAction('snapshot', { targetId: this.targetId, compact: true });
  }
  
  async click(ref) {
    return browserAction('act', {
      targetId: this.targetId,
      request: { kind: 'click', ref }
    });
  }
  
  async evaluate(code) {
    return browserAction('act', {
      targetId: this.targetId,
      request: { kind: 'evaluate', fn: code }
    });
  }
  
  async setDateRange(range) {
    log(`Setting date range: ${range.key} (${formatDate(range.startDate)} to ${formatDate(range.endDate)})`);
    
    // JavaScript to set date range using the documented method
    const setDateScript = `
      (async function() {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        
        // 1. Open date picker
        const dateFilter = document.querySelector('.global-analytics-date-filter');
        if (!dateFilter) {
          const datePattern = /\\d{4}-\\d{2}-\\d{2}\\s*-\\s*\\d{4}-\\d{2}-\\d{2}/;
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            const text = el.innerText?.trim();
            if (text && datePattern.test(text) && text.length < 30) {
              el.click();
              break;
            }
          }
        } else {
          dateFilter.click();
        }
        await delay(2000);
        
        // 2. Check if picker opened
        const picker = document.querySelector('.q-date');
        if (!picker) return { error: 'Date picker did not open' };
        
        // 3. Check header state
        const header = document.querySelector('.q-date__header-title')?.innerText || '';
        const hasRange = /\\d+\\s*days?/i.test(header);
        
        // 4. Navigate to start month
        const targetStartMonth = '${range.startMonth}';
        const targetEndMonth = '${range.endMonth}';
        const startDay = ${range.startDay};
        const endDay = ${range.endDay};
        
        async function navigateToMonth(monthName) {
          let attempts = 0;
          while (attempts < 12) {
            const nav = document.querySelectorAll('.q-date__navigation button');
            const currentMonth = nav[1]?.innerText;
            if (currentMonth === monthName) return true;
            
            // Determine direction
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
            const currentIdx = months.indexOf(currentMonth);
            const targetIdx = months.indexOf(monthName);
            
            if (targetIdx < currentIdx) {
              nav[0].click(); // Previous month
            } else {
              nav[2].click(); // Next month
            }
            await delay(500);
            attempts++;
          }
          return false;
        }
        
        // Navigate to start month
        await navigateToMonth(targetStartMonth);
        
        // 5. Get day buttons and click start date
        let buttons = Array.from(document.querySelectorAll('.q-date .q-date__calendar-item button'));
        
        // If existing range, click to clear first
        if (hasRange) {
          const startBtn = buttons.find(b => parseInt(b.textContent.trim()) === startDay);
          if (startBtn) {
            startBtn.click();
            await delay(500);
          }
        }
        
        // Click start date
        buttons = Array.from(document.querySelectorAll('.q-date .q-date__calendar-item button'));
        const startBtn = buttons.find(b => parseInt(b.textContent.trim()) === startDay);
        if (startBtn) {
          startBtn.click();
          await delay(500);
        }
        
        // Navigate to end month if different
        if (targetEndMonth !== targetStartMonth) {
          await navigateToMonth(targetEndMonth);
        }
        
        // Click end date
        buttons = Array.from(document.querySelectorAll('.q-date .q-date__calendar-item button'));
        const endBtn = buttons.find(b => parseInt(b.textContent.trim()) === endDay);
        if (endBtn) {
          endBtn.click();
          await delay(500);
        }
        
        // 6. Click Apply
        const applyBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.toLowerCase().includes('apply'));
        if (applyBtn) {
          applyBtn.click();
          await delay(3000);
        }
        
        // 7. Verify
        const newDateFilter = document.querySelector('.global-analytics-date-filter')?.innerText || 
          Array.from(document.querySelectorAll('*'))
            .find(el => /\\d{4}-\\d{2}-\\d{2}\\s*-\\s*\\d{4}-\\d{2}-\\d{2}/.test(el.innerText?.trim()))?.innerText;
        
        return { 
          success: true, 
          dateRange: newDateFilter,
          expectedStart: '${formatDate(range.startDate)}',
          expectedEnd: '${formatDate(range.endDate)}'
        };
      })();
    `;
    
    const result = await this.evaluate(setDateScript);
    if (result?.error) {
      log(`Date range setting failed: ${result.error}`);
      return false;
    }
    
    log(`Date range set: ${JSON.stringify(result)}`);
    await sleep(2000); // Wait for data to load
    return true;
  }
  
  async extractMetrics() {
    log('Extracting metrics from page...');
    
    const extractScript = `
      (function() {
        const metrics = {
          timestamp: new Date().toISOString(),
          dateRange: null,
          summary: {},
          providers: [],
          campaigns: {},
          responses: {}
        };
        
        // Get date range
        const dateFilter = document.querySelector('.global-analytics-date-filter')?.innerText ||
          Array.from(document.querySelectorAll('*'))
            .find(el => /\\d{4}-\\d{2}-\\d{2}\\s*-\\s*\\d{4}-\\d{2}-\\d{2}/.test(el.innerText?.trim()))?.innerText;
        metrics.dateRange = dateFilter?.trim();
        
        // Extract summary metrics from the top cards
        const paragraphs = document.querySelectorAll('main p, main span');
        let currentMetric = null;
        
        paragraphs.forEach(p => {
          const text = p.innerText?.trim();
          if (!text) return;
          
          // Look for metric labels
          if (text === 'Emails Sent') currentMetric = 'emailsSent';
          else if (text === 'Opened') currentMetric = 'opened';
          else if (text === 'Replied') currentMetric = 'replied';
          else if (text === 'Positive Reply') currentMetric = 'positiveReply';
          else if (text === 'Bounced') currentMetric = 'bounced';
          else if (currentMetric && /^\\d+$/.test(text)) {
            metrics.summary[currentMetric] = parseInt(text);
            currentMetric = null;
          }
        });
        
        // Extract rates
        const ratePatterns = [
          { key: 'openRate', pattern: /([\\d.]+)%\\s*Open Rate/i },
          { key: 'replyRate', pattern: /([\\d.]+)%\\s*Reply Rate/i },
          { key: 'positiveReplyRate', pattern: /([\\d.]+)%\\s*Positive Reply Rate/i },
          { key: 'bounceRate', pattern: /([\\d.]+)%\\s*Bounce Rate/i }
        ];
        
        const mainText = document.querySelector('main')?.innerText || '';
        ratePatterns.forEach(({ key, pattern }) => {
          const match = mainText.match(pattern);
          if (match) {
            metrics.summary[key] = parseFloat(match[1]);
          }
        });
        
        // Extract leads count
        const leadsMatch = mainText.match(/(\\d+)\\s*Leads/);
        if (leadsMatch) {
          metrics.summary.leads = parseInt(leadsMatch[1]);
        }
        
        // Extract email provider stats
        const providerRows = document.querySelectorAll('table tr');
        providerRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const provider = cells[0]?.innerText?.trim();
            if (provider === 'GMAIL' || provider === 'OUTLOOK') {
              metrics.providers.push({
                provider,
                sent: parseInt(cells[2]?.innerText?.trim()) || 0,
                openRate: parseFloat(cells[3]?.innerText?.trim()) || 0,
                replyRate: parseFloat(cells[4]?.innerText?.trim()) || 0,
                bounceRate: parseFloat(cells[5]?.innerText?.trim()) || 0
              });
            }
          }
        });
        
        // Extract campaign stats
        const statsMatch = mainText.match(/Total Campaigns.*?(\\d+)/);
        if (statsMatch) {
          metrics.campaigns.total = parseInt(statsMatch[1]);
        }
        
        const activeMatch = mainText.match(/Active.*?(\\d+)/);
        if (activeMatch) {
          metrics.campaigns.active = parseInt(activeMatch[1]);
        }
        
        const pausedMatch = mainText.match(/Paused.*?(\\d+)/);
        if (pausedMatch) {
          metrics.campaigns.paused = parseInt(pausedMatch[1]);
        }
        
        const completedMatch = mainText.match(/Completed.*?(\\d+)/);
        if (completedMatch) {
          metrics.campaigns.completed = parseInt(completedMatch[1]);
        }
        
        // Extract response analysis
        const positiveMatch = mainText.match(/Positive \\((\\d+)\\)/);
        const neutralMatch = mainText.match(/Neutral \\((\\d+)\\)/);
        const negativeMatch = mainText.match(/Negative \\((\\d+)\\)/);
        
        if (positiveMatch) metrics.responses.positive = parseInt(positiveMatch[1]);
        if (neutralMatch) metrics.responses.neutral = parseInt(neutralMatch[1]);
        if (negativeMatch) metrics.responses.negative = parseInt(negativeMatch[1]);
        
        return metrics;
      })();
    `;
    
    const result = await this.evaluate(extractScript);
    return result;
  }
  
  async scrapeAllPeriods(ranges) {
    log(`Starting scrape for ${ranges.length} date ranges`);
    
    // Navigate to Performance Metrics page first
    await this.navigate('https://app.smartlead.ai/app/analytics-v2/performance-metrics');
    await sleep(3000);
    
    for (const range of ranges) {
      log(`\n--- Processing ${range.key} ---`);
      
      // Set date range
      const dateSet = await this.setDateRange(range);
      if (!dateSet) {
        log(`Failed to set date range for ${range.key}, skipping...`);
        continue;
      }
      
      // Wait for data to load
      await sleep(2000);
      
      // Extract metrics
      const metrics = await this.extractMetrics();
      if (metrics) {
        metrics.periodKey = range.key;
        metrics.periodDays = range.days;
        metrics.expectedDateRange = {
          start: formatDate(range.startDate),
          end: formatDate(range.endDate)
        };
        this.results[range.key] = metrics;
        log(`Extracted metrics for ${range.key}: ${metrics.summary.emailsSent || 0} emails sent`);
      }
      
      // Small delay between periods
      await sleep(1000);
    }
    
    return this.results;
  }
  
  saveResults() {
    const today = new Date().toISOString().split('T')[0];
    const filename = `global-analytics-${today}.json`;
    const filepath = path.join(DATA_DIR, filename);
    
    const output = {
      scrapedAt: new Date().toISOString(),
      periods: this.results
    };
    
    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    log(`Results saved to: ${filepath}`);
    
    // Also save as latest
    const latestPath = path.join(DATA_DIR, 'global-analytics-latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(output, null, 2));
    log(`Latest results saved to: ${latestPath}`);
    
    return filepath;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--test') ? 'test' : args.includes('--quick') ? 'quick' : 'full';
  
  log(`=== Global Analytics Scraper Started (mode: ${mode}) ===`);
  
  // Get browser tabs
  const tabsResult = browserAction('tabs');
  if (!tabsResult?.tabs) {
    log('ERROR: Could not get browser tabs. Is the browser running?');
    process.exit(1);
  }
  
  // Find SmartLead tab or use first page tab
  let targetId = tabsResult.tabs.find(t => 
    t.type === 'page' && t.url?.includes('smartlead')
  )?.targetId;
  
  if (!targetId) {
    targetId = tabsResult.tabs.find(t => t.type === 'page')?.targetId;
  }
  
  if (!targetId) {
    log('ERROR: No suitable browser tab found');
    process.exit(1);
  }
  
  log(`Using tab: ${targetId}`);
  
  const ranges = getDateRanges(mode);
  const scraper = new GlobalAnalyticsScraper(targetId);
  
  try {
    await scraper.scrapeAllPeriods(ranges);
    scraper.saveResults();
    
    log('\n=== Scrape Complete ===');
    log(`Periods scraped: ${Object.keys(scraper.results).length}`);
    
    // Print summary
    for (const [key, data] of Object.entries(scraper.results)) {
      log(`  ${key}: ${data.summary?.emailsSent || 'N/A'} sent, ${data.summary?.replied || 'N/A'} replied`);
    }
    
  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
