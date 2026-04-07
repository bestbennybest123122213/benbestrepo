#!/usr/bin/env node
/**
 * Scrape SmartLead Global Analytics for Per-Domain Stats
 * 
 * Explores Global Analytics page to find sender/domain breakdown
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SMARTLEAD_EMAIL = process.env.SMARTLEAD_EMAIL;
const SMARTLEAD_PASSWORD = process.env.SMARTLEAD_PASSWORD;
const DATA_DIR = path.join(__dirname, '../data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'analytics-scrape');

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

async function exploreGlobalAnalytics(page) {
  log('Navigating to Global Analytics...');
  
  // Try different possible URLs
  const analyticsUrls = [
    'https://app.smartlead.ai/app/global-analytics',
    'https://app.smartlead.ai/app/analytics',
    'https://app.smartlead.ai/app/stats'
  ];
  
  for (const url of analyticsUrls) {
    log(`Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(3000);
      
      // Check if we got a valid page (not 404)
      const is404 = await page.evaluate(() => {
        return document.body.innerText.includes("isn't smart enough to exist") || 
               document.body.innerText.includes('404');
      });
      
      if (!is404) {
        log(`Found valid page: ${url}`);
        break;
      }
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  }
  
  // Screenshot the page
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '01-analytics-main.png'), 
    fullPage: true 
  });
  log('Screenshot: 01-analytics-main.png');
  
  // Look for tabs, filters, or breakdowns
  const pageInfo = await page.evaluate(() => {
    const info = {
      url: window.location.href,
      title: document.title,
      tabs: [],
      buttons: [],
      dropdowns: [],
      tables: []
    };
    
    // Find all tab-like elements
    document.querySelectorAll('[role="tab"], [class*="tab"], .q-tab').forEach(el => {
      info.tabs.push(el.innerText?.trim().slice(0, 50));
    });
    
    // Find buttons that might reveal more data
    document.querySelectorAll('button, [role="button"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length < 50) info.buttons.push(text);
    });
    
    // Find dropdowns/selects
    document.querySelectorAll('select, [class*="dropdown"], [class*="select"]').forEach(el => {
      info.dropdowns.push(el.innerText?.trim().slice(0, 100));
    });
    
    // Find tables
    document.querySelectorAll('table').forEach((table, i) => {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText?.trim());
      info.tables.push({ index: i, headers, rowCount: table.querySelectorAll('tr').length });
    });
    
    return info;
  });
  
  log('Page info:');
  console.log(JSON.stringify(pageInfo, null, 2));
  
  // Click on any tab that mentions "sender", "mailbox", "domain", "email"
  const clickedTab = await page.evaluate(() => {
    const keywords = ['sender', 'mailbox', 'domain', 'email', 'account', 'breakdown', 'by'];
    const tabs = document.querySelectorAll('[role="tab"], [class*="tab"], .q-tab, button');
    
    for (const tab of tabs) {
      const text = tab.innerText?.toLowerCase() || '';
      for (const kw of keywords) {
        if (text.includes(kw)) {
          tab.click();
          return text;
        }
      }
    }
    return null;
  });
  
  if (clickedTab) {
    log(`Clicked tab: "${clickedTab}"`);
    await delay(3000);
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '02-after-tab-click.png'), 
      fullPage: true 
    });
    log('Screenshot: 02-after-tab-click.png');
  }
  
  // Look for "View by" or filter options
  const filterClicked = await page.evaluate(() => {
    const filters = document.querySelectorAll('[class*="filter"], [class*="dropdown"], select');
    for (const f of filters) {
      if (f.click) {
        f.click();
        return true;
      }
    }
    return false;
  });
  
  if (filterClicked) {
    await delay(1000);
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '03-filter-opened.png'), 
      fullPage: true 
    });
    log('Screenshot: 03-filter-opened.png');
  }
  
  // Try to find and click on anything that says "by sender" or "by domain"
  const foundSenderView = await page.evaluate(() => {
    const allText = document.body.innerText;
    return {
      hasSender: allText.toLowerCase().includes('sender'),
      hasMailbox: allText.toLowerCase().includes('mailbox'),
      hasDomain: allText.toLowerCase().includes('domain'),
      hasBreakdown: allText.toLowerCase().includes('breakdown'),
      hasPerformance: allText.toLowerCase().includes('performance')
    };
  });
  
  log('Keywords found:');
  console.log(foundSenderView);
  
  // Extract any tables with domain/sender data
  const tableData = await page.evaluate(() => {
    const tables = [];
    document.querySelectorAll('table').forEach((table, i) => {
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.innerText?.trim());
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) tables.push({ index: i, rows: rows.slice(0, 20) });
    });
    return tables;
  });
  
  if (tableData.length > 0) {
    log('Found tables:');
    console.log(JSON.stringify(tableData, null, 2));
  }
  
  return { pageInfo, foundSenderView, tableData };
}

async function navigateViaSidebar(page) {
  log('Trying to navigate via sidebar...');
  
  // Go to app home first
  await page.goto('https://app.smartlead.ai/app/email-campaigns', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(2000);
  
  // Screenshot sidebar
  await page.screenshot({ 
    path: path.join(SCREENSHOTS_DIR, '04-sidebar.png'), 
    fullPage: true 
  });
  
  // Click on Global Analytics in sidebar
  const clicked = await page.evaluate(() => {
    const links = document.querySelectorAll('a, button, [role="button"], [class*="nav"]');
    for (const link of links) {
      const text = link.innerText?.toLowerCase() || '';
      if (text.includes('global analytics') || text.includes('analytics')) {
        link.click();
        return text;
      }
    }
    return null;
  });
  
  if (clicked) {
    log(`Clicked: "${clicked}"`);
    await delay(3000);
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '05-global-analytics.png'), 
      fullPage: true 
    });
    log('Screenshot: 05-global-analytics.png');
    
    // Now explore this page
    return await explorePage(page);
  }
  
  return null;
}

async function explorePage(page) {
  // Get all clickable elements and text
  const pageContent = await page.evaluate(() => {
    return {
      url: window.location.href,
      bodyText: document.body.innerText.slice(0, 5000),
      links: Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.innerText?.trim().slice(0, 50),
        href: a.href
      })).filter(l => l.text).slice(0, 30)
    };
  });
  
  // Save page content for analysis
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'page-content.json'), 
    JSON.stringify(pageContent, null, 2)
  );
  
  return pageContent;
}

async function main() {
  const headless = !process.argv.includes('--visible');
  
  log('Starting browser (headless=' + headless + ')...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  try {
    const page = await browser.newPage();
    
    // Enable console logging from page
    page.on('console', msg => {
      if (msg.type() === 'log') console.log('PAGE:', msg.text());
    });
    
    await login(page);
    
    // Try direct URL first
    let result = await exploreGlobalAnalytics(page);
    
    // If no useful data, try sidebar navigation
    if (!result.tableData || result.tableData.length === 0) {
      log('No tables found, trying sidebar navigation...');
      await navigateViaSidebar(page);
    }
    
    log('\n=== EXPLORATION COMPLETE ===');
    log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);
    log('Check the screenshots to see what views are available.');
    
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
