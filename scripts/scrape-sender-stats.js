#!/usr/bin/env node
/**
 * Scrape SmartLead Global Analytics - Sending Account Stats
 * 
 * Gets per-sender/email stats with date filtering
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SMARTLEAD_EMAIL = process.env.SMARTLEAD_EMAIL;
const SMARTLEAD_PASSWORD = process.env.SMARTLEAD_PASSWORD;
const DATA_DIR = path.join(__dirname, '../data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'sender-stats-scrape');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

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

async function clearFiltersAndSetDate(page, days) {
  log(`Setting date range to last ${days} days...`);
  
  // Click the date picker
  const dateClicked = await page.evaluate(() => {
    const dateElements = document.querySelectorAll('[class*="date"], [class*="calendar"], input[type="date"]');
    for (const el of dateElements) {
      if (el.click) {
        el.click();
        return true;
      }
    }
    // Try clicking on any element with date format
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = el.innerText?.trim() || '';
      if (/\d{4}\/\d{2}\/\d{2}/.test(text) && text.length < 30) {
        el.click();
        return text;
      }
    }
    return false;
  });
  
  log(`Date picker clicked: ${dateClicked}`);
  await delay(1000);
  
  // Screenshot
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, `01-date-picker-${days}d.png`), 
    fullPage: true 
  });
}

async function selectAllCampaigns(page) {
  log('Selecting all campaigns...');
  
  // Click the Filter button
  await page.evaluate(() => {
    const filterBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.innerText?.toLowerCase().includes('filter')
    );
    if (filterBtn) filterBtn.click();
  });
  
  await delay(1000);
  
  // Click "Client" instead of "Campaigns" to get all data
  const clientClicked = await page.evaluate(() => {
    const labels = document.querySelectorAll('label, [role="radio"], input[type="radio"]');
    for (const label of labels) {
      if (label.innerText?.toLowerCase().includes('client') || 
          label.nextSibling?.textContent?.includes('Client')) {
        label.click();
        return true;
      }
    }
    // Also try clicking text that says "Client"
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.innerText?.trim() === 'Client') {
        el.click();
        return true;
      }
    }
    return false;
  });
  
  log(`Client filter selected: ${clientClicked}`);
  await delay(500);
  
  // Click Apply
  await page.evaluate(() => {
    const applyBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.innerText?.toLowerCase().includes('apply')
    );
    if (applyBtn) applyBtn.click();
  });
  
  await delay(2000);
  
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '02-after-filter.png'), 
    fullPage: true 
  });
}

async function scrapeSenderTable(page) {
  log('Scraping sender account table...');
  
  // Scroll down to make sure table is visible
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await delay(1000);
  
  // Click on "Email Deliverability Report" tab if not active
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"], [class*="tab"]');
    for (const tab of tabs) {
      if (tab.innerText?.includes('Email Deliverability')) {
        tab.click();
        break;
      }
    }
  });
  await delay(1000);
  
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '03-deliverability-tab.png'), 
    fullPage: true 
  });
  
  // Extract table data
  const tableData = await page.evaluate(() => {
    const results = [];
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText?.trim());
      
      // Check if this is the sender account table
      if (headers.some(h => h?.includes('Sending Account') || h?.includes('Sender'))) {
        const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText?.trim());
          if (cells.length >= 2 && cells[0] && !cells[0].includes('Deleted')) {
            results.push({
              account: cells[0],
              sent: parseInt(cells[1]?.replace(/,/g, '')) || 0,
              opened: parseInt(cells[2]?.replace(/,/g, '')) || 0,
              replied: parseInt(cells[3]?.replace(/,/g, '')) || 0,
              clicked: parseInt(cells[4]?.replace(/,/g, '')) || 0,
              bounced: parseInt(cells[5]?.replace(/,/g, '')) || 0,
              unsubscribed: parseInt(cells[6]?.replace(/,/g, '')) || 0
            });
          }
        }
      }
    }
    
    return results;
  });
  
  log(`Found ${tableData.length} sender accounts`);
  
  // Check if we need to paginate
  const hasMorePages = await page.evaluate(() => {
    const pagination = document.querySelector('[class*="pagination"], [class*="pager"]');
    const nextBtn = document.querySelector('[class*="next"], [aria-label="Next"]');
    return !!pagination || !!nextBtn;
  });
  
  if (hasMorePages) {
    log('Pagination detected - scrolling/clicking for more data...');
    // TODO: Implement pagination
  }
  
  return tableData;
}

async function checkSmartDelivery(page) {
  log('Checking SmartDelivery page...');
  
  // Navigate to SmartDelivery
  await page.evaluate(() => {
    const links = document.querySelectorAll('a, [role="button"]');
    for (const link of links) {
      if (link.innerText?.toLowerCase().includes('smartdelivery') ||
          link.innerText?.toLowerCase().includes('delivery')) {
        link.click();
        return true;
      }
    }
    return false;
  });
  
  await delay(3000);
  
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '04-smartdelivery.png'), 
    fullPage: true 
  });
  
  // Check for domain table
  const domainData = await page.evaluate(() => {
    const results = [];
    const pageText = document.body.innerText;
    
    // Look for domain stats table
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        const text = cells[0]?.innerText?.trim() || '';
        
        // Check if first cell looks like a domain
        if (text.includes('.com') || text.includes('.io') || text.includes('.ai')) {
          const numbers = cells.slice(1).map(c => parseInt(c.innerText?.replace(/,/g, '')) || 0);
          results.push({
            domain: text.split(/\s/)[0],
            values: numbers
          });
        }
      }
    }
    
    return results;
  });
  
  log(`SmartDelivery found ${domainData.length} domains`);
  return domainData;
}

async function main() {
  const headless = !process.argv.includes('--visible');
  const days = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1]) || 30;
  
  log(`Starting browser (headless=${headless}, days=${days})...`);
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  try {
    const page = await browser.newPage();
    
    await login(page);
    
    // Go to Global Analytics
    await page.goto('https://app.smartlead.ai/app/global-analytics', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await delay(3000);
    
    // Select all campaigns (Client view)
    await selectAllCampaigns(page);
    
    // Set date range
    await clearFiltersAndSetDate(page, days);
    
    // Scrape sender table
    const senderData = await scrapeSenderTable(page);
    
    // Check SmartDelivery
    const domainData = await checkSmartDelivery(page);
    
    // Aggregate by domain
    const domainStats = {};
    for (const sender of senderData) {
      const email = sender.account;
      const domain = email.split('@')[1] || 'unknown';
      
      if (!domainStats[domain]) {
        domainStats[domain] = {
          domain,
          accounts: [],
          sent: 0,
          opened: 0,
          replied: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0
        };
      }
      
      domainStats[domain].accounts.push(email);
      domainStats[domain].sent += sender.sent;
      domainStats[domain].opened += sender.opened;
      domainStats[domain].replied += sender.replied;
      domainStats[domain].clicked += sender.clicked;
      domainStats[domain].bounced += sender.bounced;
      domainStats[domain].unsubscribed += sender.unsubscribed;
    }
    
    // Save results
    const outputPath = path.join(DATA_DIR, `sender-stats-${days}d-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      days,
      senderAccounts: senderData,
      domainStats: Object.values(domainStats)
    }, null, 2));
    
    log(`Saved to ${outputPath}`);
    
    // Print summary
    console.log(`\n=== Sender Stats (${days} days) ===`);
    console.log(`Total sender accounts: ${senderData.length}`);
    console.log(`Total domains: ${Object.keys(domainStats).length}`);
    
    const sorted = Object.values(domainStats).sort((a, b) => b.sent - a.sent);
    console.log('\nTop domains by sent:');
    for (const d of sorted.slice(0, 10)) {
      console.log(`  ${d.domain}: ${d.sent} sent, ${d.replied} replied, ${d.bounced} bounced`);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
