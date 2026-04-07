#!/usr/bin/env node
/**
 * SmartLead UI Scraper (DEPRECATED)
 * 
 * This file is DEPRECATED. The official SmartLead CLI is now used instead.
 * This wrapper exists for backwards compatibility.
 * 
 * Use the CLI-based version instead:
 *   node scrape-global-analytics.js       # Full analytics
 *   node smartlead-cli-sync.js            # Comprehensive sync
 * 
 * Or the GEX commands:
 *   node gex.js global-analytics
 *   node gex.js cli-sync
 */

console.log('⚠️  scrape-ui.js is DEPRECATED - using CLI-based approach instead');
console.log('');

// Redirect to CLI-based global analytics
const { execSync } = require('child_process');
const path = require('path');

try {
  execSync(`node ${path.join(__dirname, 'scrape-global-analytics.js')} ${process.argv.slice(2).join(' ')}`, {
    stdio: 'inherit',
    cwd: __dirname
  });
} catch (err) {
  console.error('Failed to run CLI-based scraper:', err.message);
  process.exit(1);
}
