#!/usr/bin/env node
/**
 * Scrape SmartLead Domains Page for Historical Stats
 * 
 * Gets 30D, 14D, 7D sends per domain from SmartLead UI
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SMARTLEAD_EMAIL = process.env.SMARTLEAD_EMAIL;
const SMARTLEAD_PASSWORD = process.env.SMARTLEAD_PASSWORD;
const DATA_DIR = path.join(__dirname, '../data');

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function login(page) {
  log('Navigating to SmartLead login...');
  await page.goto('https://app.smartlead.ai/login', { waitUntil: 'networkidle2', timeout: 60000 });
  
  if (page.url().includes('/app/')) {
    log('Already logged in');
    return true;
  }
  
  log('Logging in...');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', SMARTLEAD_EMAIL, { delay: 30 });
  await page.type('input[type="password"]', SMARTLEAD_PASSWORD, { delay: 30 });
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
  log('Login successful');
  return true;
}

async function navigateToDomainsPage(page) {
  log('Looking for SmartDelivery or Warmup in sidebar...');
  
  // First go to app home
  await page.goto('https://app.smartlead.ai/app/email-accounts', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(2000);
  
  // Click SmartDelivery in sidebar
  const clickResult = await page.evaluate(() => {
    const sidebar = document.querySelector('[class*="sidebar"], nav, aside');
    const allLinks = document.querySelectorAll('a, button, [role="button"], [class*="nav-item"]');
    
    for (const link of allLinks) {
      const text = link.innerText?.toLowerCase() || '';
      if (text.includes('smartdelivery') || text.includes('smart delivery') || text.includes('delivery')) {
        link.click();
        return { clicked: text };
      }
    }
    
    // Try warmup
    for (const link of allLinks) {
      const text = link.innerText?.toLowerCase() || '';
      if (text.includes('warmup')) {
        link.click();
        return { clicked: text };
      }
    }
    
    return { clicked: null, available: [...allLinks].map(l => l.innerText?.slice(0, 30)).filter(t => t).slice(0, 20) };
  });
  
  log('Click result: ' + JSON.stringify(clickResult));
  await delay(3000);
  
  // Screenshot current page
  await page.screenshot({ path: path.join(DATA_DIR, 'after-nav.png'), fullPage: true });
  log('Screenshot saved: after-nav.png');
  
  // Log current URL
  log('Current URL: ' + page.url());
  
  return clickResult;
}

async function scrapeDomainStats(page) {
  // Extract domain data from the current page
  const domainData = await page.evaluate(() => {
    const domains = [];
    const pageText = document.body.innerText;
    
    // Look for domain rows with stats
    // Format: domain.com | lifetime | 30d | 14d | 7d | ...
    const lines = pageText.split('\n');
    
    for (const line of lines) {
      // Match domain followed by numbers
      const match = line.match(/([a-z0-9][a-z0-9-]*\.[a-z]{2,})\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)/i);
      if (match) {
        domains.push({
          domain: match[1].toLowerCase(),
          lifetimeSent: parseInt(match[2].replace(/,/g, '')) || 0,
          sent30d: parseInt(match[3].replace(/,/g, '')) || 0,
          sent14d: parseInt(match[4].replace(/,/g, '')) || 0,
          sent7d: parseInt(match[5].replace(/,/g, '')) || 0
        });
      }
    }
    
    // Also try table rows
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length >= 5) {
          const firstText = cells[0]?.innerText?.trim() || '';
          const domainMatch = firstText.match(/^([a-z0-9][a-z0-9-]*\.[a-z]{2,})/i);
          if (domainMatch) {
            const numbers = cells.slice(1).map(c => parseInt(c.innerText?.replace(/,/g, '')) || 0);
            if (numbers.some(n => n > 0)) {
              domains.push({
                domain: domainMatch[1].toLowerCase(),
                lifetimeSent: numbers[0] || 0,
                sent30d: numbers[1] || 0,
                sent14d: numbers[2] || 0,
                sent7d: numbers[3] || 0
              });
            }
          }
        }
      }
    }
    
    // Deduplicate
    const seen = new Set();
    return domains.filter(d => {
      if (seen.has(d.domain)) return false;
      seen.add(d.domain);
      return true;
    });
  });
  
  return domainData;
}

async function main() {
  const headless = !process.argv.includes('--visible');
  
  log('Starting browser...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  try {
    const page = await browser.newPage();
    
    await login(page);
    await navigateToDomainsPage(page);
    
    let domainData = await scrapeDomainStats(page);
    
    if (domainData.length === 0) {
      // Try other pages
      const pagesToTry = [
        'https://app.smartlead.ai/app/smart-servers',
        'https://app.smartlead.ai/app/smartservers',
        'https://app.smartlead.ai/app/warmup',
        'https://app.smartlead.ai/app/domains'
      ];
      
      for (const url of pagesToTry) {
        log('Trying: ' + url);
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
          await delay(2000);
          await page.screenshot({ path: path.join(DATA_DIR, 'try-' + url.split('/').pop() + '.png'), fullPage: true });
          domainData = await scrapeDomainStats(page);
          if (domainData.length > 0) break;
        } catch (e) {
          log('Error: ' + e.message);
        }
      }
    }
    
    // Save results
    const outputPath = path.join(DATA_DIR, `domain-history-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      domains: domainData
    }, null, 2));
    
    log(`Saved to ${outputPath}`);
    
    // Print summary
    console.log('\n=== Domain History ===');
    for (const d of domainData.slice(0, 10)) {
      console.log(`${d.domain}: 7D=${d.sent7d}, 14D=${d.sent14d}, 30D=${d.sent30d}, Lifetime=${d.lifetimeSent}`);
    }
    
    if (domainData.length === 0) {
      console.log('\nNo domains found. Check screenshots in data/ folder.');
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
