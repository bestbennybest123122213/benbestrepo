#!/usr/bin/env node
/**
 * Smartlead Domain Health Scraper
 * Processes raw account data and aggregates by domain
 */

const fs = require('fs');
const path = require('path');

// Date ranges for each period (from March 17, 2026)
const PERIODS = {
  '7d': { start: '2026-03-10', end: '2026-03-16' },
  '14d': { start: '2026-03-03', end: '2026-03-16' },
  '30d': { start: '2026-02-15', end: '2026-03-16' },
  '60d': { start: '2026-01-16', end: '2026-03-16' },
  '90d': { start: '2025-12-17', end: '2026-03-16' }
};

// Provider detection based on domain patterns
function detectProvider(domain) {
  // HyperTide domains typically have patterns like: itss-imannntv*, proitss*, getitss*, etc.
  const hypertidePatterns = [
    /^itss-imannntv/i,
    /^theitss-imannntv/i,
    /^joinitss-imannntv/i,
    /^proitss-imannntv/i,
    /^goitss-imannntv/i,
    /^getitss-imannntv/i,
    /^the365itss-imannntv/i,
    /^itssimannntv/i,
    /^getitssimannntv/i,
    /^goitssimannntv/i,
    /^helloitssimannntv/i,
    /^myitssimannntv/i,
    /^proitssimannntv/i,
    /^smartitssimannntv/i,
    /^useitssimannntv/i,
    /^teamitssimannntv/i
  ];
  
  for (const pattern of hypertidePatterns) {
    if (pattern.test(domain)) {
      return 'HyperTide';
    }
  }
  
  // Check for Google Workspace indicators
  if (domain.includes('google') || domain.includes('gmail')) {
    return 'Google';
  }
  
  return 'HyperTide'; // Default for ITSS domains
}

// Extract domain from email
function extractDomain(email) {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : email;
}

// Aggregate accounts by domain
function aggregateByDomain(accounts) {
  const domains = {};
  
  for (const account of accounts) {
    const domain = extractDomain(account.email);
    
    if (!domains[domain]) {
      domains[domain] = {
        domain,
        provider: detectProvider(domain),
        accounts: [],
        sent: 0,
        leadContacted: 0,
        opened: { count: 0 },
        replied: { count: 0 },
        positiveReply: { count: 0 },
        bounce: { count: 0 }
      };
    }
    
    domains[domain].accounts.push(account.email);
    domains[domain].sent += account.emailSent || 0;
    domains[domain].leadContacted += account.leadContacted || 0;
    domains[domain].opened.count += (account.opened?.count || 0);
    domains[domain].replied.count += (account.replied?.count || 0);
    domains[domain].positiveReply.count += (account.positiveReply?.count || 0);
    domains[domain].bounce.count += (account.bounce?.count || 0);
  }
  
  // Calculate percentages
  for (const domain of Object.values(domains)) {
    const sent = domain.sent || 1;
    domain.opened.percent = parseFloat(((domain.opened.count / sent) * 100).toFixed(2));
    domain.replied.percent = parseFloat(((domain.replied.count / sent) * 100).toFixed(2));
    domain.replyPct = domain.replied.percent;
    domain.positiveReply.percent = parseFloat(((domain.positiveReply.count / sent) * 100).toFixed(2));
    domain.bounce.percent = parseFloat(((domain.bounce.count / sent) * 100).toFixed(2));
    domain.bouncePct = domain.bounce.percent;
    domain.accountCount = domain.accounts.length;
  }
  
  return Object.values(domains);
}

// Process all raw data files and combine into dashboard format
function processAllPeriods() {
  const dataDir = path.join(__dirname);
  const allDomains = {};
  
  for (const [period, dateRange] of Object.entries(PERIODS)) {
    const rawFile = path.join(dataDir, `raw-${period}.json`);
    
    if (fs.existsSync(rawFile)) {
      console.log(`Processing ${period}...`);
      const rawData = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
      const domains = aggregateByDomain(rawData.accounts || []);
      
      for (const domain of domains) {
        if (!allDomains[domain.domain]) {
          allDomains[domain.domain] = {
            domain: domain.domain,
            provider: domain.provider,
            accounts: domain.accounts,
            '7d': { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 },
            '14d': { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 },
            '30d': { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 },
            '60d': { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 },
            '90d': { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 }
          };
        }
        
        allDomains[domain.domain][period] = {
          sent: domain.sent,
          reply: domain.replied.count,
          replyPct: domain.replied.percent,
          bounce: domain.bounce.count,
          bouncePct: domain.bounce.percent
        };
      }
    } else {
      console.log(`No data for ${period} (file not found: ${rawFile})`);
    }
  }
  
  return Object.values(allDomains);
}

// Main execution
if (require.main === module) {
  const domains = processAllPeriods();
  
  // Save processed data
  const outputFile = path.join(__dirname, 'domain-health-data.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    periods: PERIODS,
    domains
  }, null, 2));
  
  console.log(`\nProcessed ${domains.length} domains`);
  console.log(`Output saved to: ${outputFile}`);
  
  // Print summary
  console.log('\n=== DOMAIN SUMMARY ===');
  for (const domain of domains.slice(0, 5)) {
    console.log(`${domain.domain}: ${domain.accounts.length} accounts`);
  }
  if (domains.length > 5) {
    console.log(`... and ${domains.length - 5} more domains`);
  }
}

module.exports = { aggregateByDomain, processAllPeriods, PERIODS };
