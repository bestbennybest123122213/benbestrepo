#!/usr/bin/env node
/**
 * Domain Stats Scraper
 * Uses Smartlead date picker automation to collect stats for multiple time periods
 * 
 * Usage: node scripts/scrape-domain-stats.js
 * 
 * Outputs: data/domain-stats-scraped-YYYY-MM-DD.json
 */

const fs = require('fs');
const path = require('path');

// Domain classification
const HYPER_DOMAINS = [
  'getitssimannntv.com',
  'goitssimannntv.com', 
  'helloitssimannntv.com',
  'myitssimannntv.com',
  'proitssimannntv.com',
  'smartitssimannntv.com',
  'useitssimannntv.com',
  'teamitssimannntv.com'
];

function classifyDomain(email) {
  const domain = email.split('@')[1];
  if (!domain) return { domain: 'unknown', type: 'unknown' };
  
  const isHyper = HYPER_DOMAINS.some(hd => domain === hd);
  return {
    domain,
    type: isHyper ? 'hyper' : 'google'
  };
}

function aggregateByDomain(mailboxData) {
  const domains = {};
  
  for (const row of mailboxData) {
    const { domain, type } = classifyDomain(row.email);
    
    if (!domains[domain]) {
      domains[domain] = {
        domain,
        type,
        mailboxes: 0,
        sent: 0,
        replied: 0
      };
    }
    
    domains[domain].mailboxes++;
    domains[domain].sent += row.sent || 0;
    domains[domain].replied += row.replied || 0;
  }
  
  // Calculate percentages
  for (const d of Object.values(domains)) {
    d.replyRate = d.sent > 0 ? ((d.replied / d.sent) * 100).toFixed(2) : '0.00';
  }
  
  return Object.values(domains);
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  
  return {
    startMonth: start.toLocaleString('en-US', { month: 'long' }),
    startDay: start.getDate(),
    startYear: start.getFullYear(),
    endMonth: end.toLocaleString('en-US', { month: 'long' }),
    endDay: end.getDate(),
    endYear: end.getFullYear(),
    label: `${days}d`
  };
}

// Time periods to scrape
const TIME_PERIODS = [7, 14, 30, 60, 90];

// Browser automation commands (to be executed via clawd browser)
function generateBrowserCommands(days) {
  const range = getDateRange(days);
  
  return {
    period: range.label,
    days,
    range,
    commands: [
      '// Open date picker',
      `document.querySelector('.global-analytics-date-filter').click();`,
      '// WAIT 2000ms',
      '',
      '// Navigate to start month if needed',
      `// Current month check and navigation`,
      '',
      '// Click start day (SINGLE CLICK)',
      `var buttons = Array.from(document.querySelectorAll('.q-date .q-date__calendar-item button'));`,
      `buttons.find(b => b.textContent.trim() === '${range.startDay}').click();`,
      '// WAIT 500ms',
      '',
      '// Navigate to end month if different',
      '',
      '// Click end day (SINGLE CLICK)', 
      `buttons = Array.from(document.querySelectorAll('.q-date .q-date__calendar-item button'));`,
      `buttons.find(b => b.textContent.trim() === '${range.endDay}').click();`,
      '// WAIT 500ms',
      '',
      '// Apply',
      `Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('apply')).click();`,
      '// WAIT 3000ms for data to load',
      '',
      '// Scrape data',
      `const rows = document.querySelectorAll('table tbody tr');`,
      `const data = [];`,
      `rows.forEach(row => {`,
      `  const cells = row.querySelectorAll('td');`,
      `  if (cells.length >= 7) {`,
      `    const email = cells[0]?.textContent?.trim() || '';`,
      `    const sent = parseInt(cells[2]?.textContent?.trim()) || 0;`,
      `    const repliedMatch = cells[4]?.textContent?.match(/([\\d.]+)%\\s*\\((\\d+)\\)/);`,
      `    const replied = repliedMatch ? parseInt(repliedMatch[2]) : 0;`,
      `    data.push({ email, sent, replied });`,
      `  }`,
      `});`,
      `JSON.stringify(data);`
    ]
  };
}

// Main execution
async function main() {
  console.log('Domain Stats Scraper');
  console.log('====================\n');
  
  const today = new Date().toISOString().split('T')[0];
  const outputFile = path.join(__dirname, '..', 'data', `domain-stats-scraped-${today}.json`);
  
  console.log('Time periods to scrape:', TIME_PERIODS.map(d => `${d}d`).join(', '));
  console.log('Output file:', outputFile);
  console.log('');
  
  // Generate commands for each period
  const allCommands = TIME_PERIODS.map(days => generateBrowserCommands(days));
  
  console.log('Generated browser commands for each period.');
  console.log('');
  console.log('To execute: Use clawd browser automation with these commands.');
  console.log('');
  
  // Save command reference
  const commandsFile = path.join(__dirname, '..', 'data', 'scrape-commands.json');
  fs.writeFileSync(commandsFile, JSON.stringify(allCommands, null, 2));
  console.log('Commands saved to:', commandsFile);
  
  // Template for results
  const template = {
    capturedAt: new Date().toISOString(),
    periods: {},
    summary: {
      google: {},
      hyper: {}
    }
  };
  
  for (const days of TIME_PERIODS) {
    template.periods[`d${days}`] = {
      domains: [],
      totals: { sent: 0, replied: 0, replyRate: '0.00' }
    };
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(template, null, 2));
  console.log('Template created:', outputFile);
}

// Export for use as module
module.exports = {
  classifyDomain,
  aggregateByDomain,
  getDateRange,
  TIME_PERIODS,
  HYPER_DOMAINS
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
