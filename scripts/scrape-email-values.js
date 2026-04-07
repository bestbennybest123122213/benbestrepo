#!/usr/bin/env node
/**
 * Scrape SmartLead Email Account Health Data
 * 
 * Click on "Email Values between 90-100" link to get sender list
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SMARTLEAD_EMAIL = process.env.SMARTLEAD_EMAIL;
const SMARTLEAD_PASSWORD = process.env.SMARTLEAD_PASSWORD;
const DATA_DIR = path.join(__dirname, '../data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'email-values-scrape');

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

async function clickEmailValueLink(page) {
  log('Looking for Email Values links...');
  
  // Find and click the "Email Values between 90-100" link
  const clicked = await page.evaluate(() => {
    // Look for links with email values text
    const links = document.querySelectorAll('a, [role="link"], [class*="link"]');
    for (const link of links) {
      const text = link.innerText?.toLowerCase() || '';
      if (text.includes('email values') || text.includes('90-100') || text.includes('70-90')) {
        link.click();
        return text;
      }
    }
    
    // Try clicking the number "78" near "Email Values"
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.innerText?.trim() === '78') {
        el.click();
        return '78-number';
      }
    }
    
    // Look for the external link icon
    const externalLinks = document.querySelectorAll('[class*="external"], [class*="launch"], svg');
    for (const link of externalLinks) {
      const parent = link.closest('div, span, a');
      if (parent?.innerText?.includes('90-100')) {
        parent.click();
        return 'external-link';
      }
    }
    
    return null;
  });
  
  log(`Clicked: ${clicked}`);
  await delay(3000);
  
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '01-after-link-click.png'), 
    fullPage: true 
  });
  
  log(`Current URL: ${page.url()}`);
  
  return clicked;
}

async function scrapeEmailAccountsPage(page) {
  log('Scraping email accounts...');
  
  // Check if we're on email accounts page
  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      hasTable: !!document.querySelector('table'),
      tableHeaders: Array.from(document.querySelectorAll('th')).map(th => th.innerText?.trim()).slice(0, 10)
    };
  });
  
  log(`Page: ${pageInfo.url}`);
  log(`Headers: ${pageInfo.tableHeaders.join(', ')}`);
  
  // Extract all email account data
  const accounts = await page.evaluate(() => {
    const data = [];
    const rows = document.querySelectorAll('tr');
    
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 3) continue;
      
      // Look for email in any cell
      for (const cell of cells) {
        const text = cell.innerText?.trim() || '';
        if (text.includes('@') && text.includes('.')) {
          // Found an email
          const email = text.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
          if (email) {
            data.push({
              email,
              rowText: cells.map(c => c.innerText?.trim()).join(' | ')
            });
            break;
          }
        }
      }
    }
    
    return data;
  });
  
  log(`Found ${accounts.length} email accounts`);
  return accounts;
}

async function scrapeSmartDeliveryDomains(page) {
  log('Navigating to SmartDelivery...');
  
  // Click SmartDelivery in sidebar
  await page.evaluate(() => {
    const links = document.querySelectorAll('a, [role="button"]');
    for (const link of links) {
      if (link.innerText?.toLowerCase().includes('smartdelivery')) {
        link.click();
        return true;
      }
    }
    return false;
  });
  
  await delay(3000);
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '02-smartdelivery.png'), 
    fullPage: true 
  });
  
  log(`SmartDelivery URL: ${page.url()}`);
  
  // Extract domain data
  const domains = await page.evaluate(() => {
    const data = [];
    const pageText = document.body.innerText;
    
    // Look for domain patterns with stats
    const lines = pageText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Check if line contains a domain
      if (line.match(/^[a-z0-9-]+\.[a-z]{2,}$/i)) {
        // Get following lines for stats
        const nextLines = lines.slice(i + 1, i + 10).join(' ');
        const numbers = nextLines.match(/\d+/g)?.map(n => parseInt(n)) || [];
        data.push({
          domain: line,
          numbers: numbers.slice(0, 8)
        });
      }
    }
    
    // Also try table parsing
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length > 0) {
          const firstCell = cells[0]?.innerText?.trim() || '';
          if (firstCell.match(/[a-z0-9-]+\.[a-z]{2,}/i) && !firstCell.includes('@')) {
            data.push({
              domain: firstCell.match(/[a-z0-9-]+\.[a-z]{2,}/i)[0],
              values: cells.slice(1).map(c => c.innerText?.trim())
            });
          }
        }
      }
    }
    
    return data;
  });
  
  log(`Found ${domains.length} domains in SmartDelivery`);
  return domains;
}

async function main() {
  const headless = !process.argv.includes('--visible');
  
  log(`Starting browser (headless=${headless})...`);
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
    
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '00-global-analytics.png'), 
      fullPage: true 
    });
    
    // Try clicking on email values link
    await clickEmailValueLink(page);
    
    // Scrape email accounts if we navigated somewhere
    const accounts = await scrapeEmailAccountsPage(page);
    
    // Also check SmartDelivery
    await page.goto('https://app.smartlead.ai/app/global-analytics', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    await delay(2000);
    
    const domains = await scrapeSmartDeliveryDomains(page);
    
    // Save results
    const outputPath = path.join(DATA_DIR, `email-values-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      emailAccounts: accounts,
      domains: domains
    }, null, 2));
    
    log(`Saved to ${outputPath}`);
    log(`Screenshots in: ${SCREENSHOTS_DIR}`);
    
    // Summary
    console.log(`\n=== Results ===`);
    console.log(`Email accounts found: ${accounts.length}`);
    console.log(`Domains found: ${domains.length}`);
    
    if (accounts.length > 0) {
      console.log('\nSample accounts:');
      for (const acc of accounts.slice(0, 5)) {
        console.log(`  ${acc.email}`);
      }
    }
    
    if (domains.length > 0) {
      console.log('\nSample domains:');
      for (const d of domains.slice(0, 5)) {
        console.log(`  ${d.domain}: ${JSON.stringify(d.values || d.numbers)}`);
      }
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
