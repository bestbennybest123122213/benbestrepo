#!/usr/bin/env node
/**
 * SmartLead UI Scrape Cron v2 (DEPRECATED - Now uses CLI)
 * 
 * This file redirects to the CLI-based cron-ui-scrape-fixed.js
 * The Puppeteer-based scraper is no longer used.
 * 
 * Usage:
 *   node cron-ui-scrape-v2.js           # Full sync
 *   node cron-ui-scrape-v2.js --quick   # Time-based only
 */

console.log('⚠️  cron-ui-scrape-v2.js is DEPRECATED - redirecting to CLI-based version');
console.log('');

const { execSync } = require('child_process');
const path = require('path');

try {
  execSync(`node ${path.join(__dirname, 'cron-ui-scrape-fixed.js')} ${process.argv.slice(2).join(' ')}`, {
    stdio: 'inherit',
    cwd: __dirname
  });
} catch (err) {
  console.error('Failed to run CLI-based scraper:', err.message);
  process.exit(1);
}
