#!/usr/bin/env node
/**
 * Scrape SmartLead Global Analytics - OLD VERSION
 * 
 * The old version might have per-sender stats with date filtering
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SMARTLEAD_EMAIL = process.env.SMARTLEAD_EMAIL;
const SMARTLEAD_PASSWORD = process.env.SMARTLEAD_PASSWORD;
const DATA_DIR = path.join(__dirname, '../data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'sender-scrape-v2');

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

async function switchToOldVersion(page) {
  log('Switching to Old Version...');
  
  // Click "Old Version" button
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a, [role="button"]');
    for (const btn of buttons) {
      if (btn.innerText?.toLowerCase().includes('old version')) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  
  log(`Old Version clicked: ${clicked}`);
  await delay(3000);
  
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '01-old-version.png'), 
    fullPage: true 
  });
  
  return clicked;
}

async function setDateRange(page, days) {
  log(`Setting date range to ${days} days...`);
  
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = today.toISOString().slice(0, 10);
  
  log(`Date range: ${startStr} to ${endStr}`);
  
  // Click on the date display to open picker
  await page.evaluate(() => {
    // Look for date-like text or calendar icon
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const text = el.innerText?.trim() || '';
      // Click on date range display
      if (/\d{4}[\/-]\d{2}[\/-]\d{2}.*\d{4}[\/-]\d{2}[\/-]\d{2}/.test(text) && text.length < 50) {
        el.click();
        return 'date-display';
      }
    }
    // Try calendar icon
    const icons = document.querySelectorAll('[class*="calendar"], [class*="date"], .q-icon');
    for (const icon of icons) {
      if (icon.click) {
        icon.click();
        return 'icon';
      }
    }
    return null;
  });
  
  await delay(1500);
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '02-date-picker-open.png'), 
    fullPage: true 
  });
  
  // Try to select "Last 30 Days" preset if available
  const presetClicked = await page.evaluate((days) => {
    const presets = document.querySelectorAll('[class*="preset"], [class*="range"], button, li');
    for (const preset of presets) {
      const text = preset.innerText?.toLowerCase() || '';
      if ((days === 30 && (text.includes('30 days') || text.includes('last month'))) ||
          (days === 14 && text.includes('14 days')) ||
          (days === 7 && (text.includes('7 days') || text.includes('last week')))) {
        preset.click();
        return text;
      }
    }
    return null;
  }, days);
  
  if (presetClicked) {
    log(`Clicked preset: "${presetClicked}"`);
  }
  
  await delay(2000);
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '03-after-date-set.png'), 
    fullPage: true 
  });
}

async function clearCampaignFilter(page) {
  log('Clearing campaign filter...');
  
  // Click Filter button
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.innerText?.toLowerCase().trim() === 'filter') {
        btn.click();
        return true;
      }
    }
    return false;
  });
  
  await delay(1000);
  
  // Look for "Clear" or select "All" campaigns
  const cleared = await page.evaluate(() => {
    // Try to clear existing filter
    const clearBtns = document.querySelectorAll('[class*="clear"], [class*="close"], .q-chip__icon');
    for (const btn of clearBtns) {
      btn.click();
    }
    
    // Click "Client" radio to get all data
    const radios = document.querySelectorAll('input[type="radio"], [role="radio"]');
    for (const radio of radios) {
      const label = radio.closest('label') || radio.parentElement;
      if (label?.innerText?.toLowerCase().includes('client')) {
        radio.click();
        return 'client';
      }
    }
    
    return 'attempted-clear';
  });
  
  log(`Filter action: ${cleared}`);
  await delay(500);
  
  // Click Apply
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.innerText?.toLowerCase().includes('apply')) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  
  await delay(2000);
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '04-after-filter-clear.png'), 
    fullPage: true 
  });
}

async function scrapeAllSenderData(page) {
  log('Scraping sender data...');
  
  // Scroll to see table
  await page.evaluate(() => window.scrollTo(0, 800));
  await delay(500);
  
  // Click "Email Deliverability Report" tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[role="tab"], [class*="tab"]');
    for (const tab of tabs) {
      if (tab.innerText?.includes('Deliverability')) {
        tab.click();
        return true;
      }
    }
    return false;
  });
  
  await delay(1500);
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '05-deliverability-tab.png'), 
    fullPage: true 
  });
  
  // Get all sender rows from table
  const allSenders = [];
  let pageNum = 1;
  let hasMore = true;
  
  while (hasMore && pageNum <= 20) { // Max 20 pages
    log(`Scraping page ${pageNum}...`);
    
    const pageData = await page.evaluate(() => {
      const rows = [];
      const table = document.querySelector('table');
      if (!table) return { rows: [], hasNext: false };
      
      const trs = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length >= 2) {
          const account = cells[0]?.innerText?.trim();
          if (account && !account.includes('Deleted') && account.includes('@')) {
            rows.push({
              account,
              sent: parseInt(cells[1]?.innerText?.replace(/,/g, '')) || 0,
              opened: parseInt(cells[2]?.innerText?.replace(/,/g, '')) || 0,
              replied: parseInt(cells[3]?.innerText?.replace(/,/g, '')) || 0,
              clicked: parseInt(cells[4]?.innerText?.replace(/,/g, '')) || 0,
              bounced: parseInt(cells[5]?.innerText?.replace(/,/g, '')) || 0,
              unsubscribed: parseInt(cells[6]?.innerText?.replace(/,/g, '')) || 0
            });
          }
        }
      }
      
      // Check for next page
      const nextBtn = document.querySelector('[aria-label="Next"], [class*="next"]:not([disabled]), .q-btn:has(.q-icon)');
      const hasNext = nextBtn && !nextBtn.disabled;
      
      return { rows, hasNext };
    });
    
    allSenders.push(...pageData.rows);
    log(`Page ${pageNum}: found ${pageData.rows.length} senders`);
    
    if (!pageData.hasNext || pageData.rows.length === 0) {
      hasMore = false;
    } else {
      // Click next page
      await page.evaluate(() => {
        const nextBtn = document.querySelector('[aria-label="Next"], [class*="next"]:not([disabled])');
        if (nextBtn) nextBtn.click();
      });
      await delay(1500);
      pageNum++;
    }
  }
  
  return allSenders;
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
    
    // Try old version first
    await switchToOldVersion(page);
    
    // Clear filters
    await clearCampaignFilter(page);
    
    // Set date range
    await setDateRange(page, days);
    
    // Scrape data
    const senderData = await scrapeAllSenderData(page);
    
    // Aggregate by domain
    const domainStats = {};
    for (const sender of senderData) {
      const domain = sender.account.split('@')[1] || 'unknown';
      
      if (!domainStats[domain]) {
        domainStats[domain] = {
          domain,
          accountCount: 0,
          sent: 0,
          opened: 0,
          replied: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0
        };
      }
      
      domainStats[domain].accountCount++;
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
      period: `${days} days`,
      totalAccounts: senderData.length,
      totalDomains: Object.keys(domainStats).length,
      senderAccounts: senderData,
      domainStats: Object.values(domainStats).sort((a, b) => b.sent - a.sent)
    }, null, 2));
    
    log(`Saved to ${outputPath}`);
    
    // Print summary
    console.log(`\n=== Sender Stats (${days} days) ===`);
    console.log(`Total sender accounts: ${senderData.length}`);
    console.log(`Total domains: ${Object.keys(domainStats).length}`);
    
    if (Object.keys(domainStats).length > 0) {
      console.log('\nDomain breakdown:');
      for (const d of Object.values(domainStats).sort((a, b) => b.sent - a.sent)) {
        const replyRate = d.sent > 0 ? ((d.replied / d.sent) * 100).toFixed(2) : '0.00';
        const bounceRate = d.sent > 0 ? ((d.bounced / d.sent) * 100).toFixed(2) : '0.00';
        console.log(`  ${d.domain}: ${d.sent} sent, ${d.replied} replied (${replyRate}%), ${d.bounced} bounced (${bounceRate}%)`);
      }
    } else {
      console.log('\nNo sender data found. Check screenshots for debugging.');
    }
    
    log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
