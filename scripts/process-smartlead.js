#!/usr/bin/env node
/**
 * Smartlead Domain Health Data Processor
 * 
 * Processes raw account data into domain-level aggregations for the dashboard.
 * 
 * Usage: node process-smartlead.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'domain-health.json');

// Time periods to process
const PERIODS = ['7d', '14d', '30d', '60d', '90d'];

// Provider detection patterns
const PROVIDER_PATTERNS = {
  'Google': ['gmail.com'],
  'HyperTide': [
    'itss-imannntv', 'itssimannntv', 'getitss', 'goitss', 'helloitss',
    'myitss', 'proitss', 'smartitss', 'useitssimannntv', 'teamitss',
    'joinitss', 'the365itss', 'theitss'
  ]
};

function detectProvider(domain) {
  const lowerDomain = domain.toLowerCase();
  for (const [provider, patterns] of Object.entries(PROVIDER_PATTERNS)) {
    if (patterns.some(p => lowerDomain.includes(p))) {
      return provider;
    }
  }
  return 'Unknown';
}

function parseMetric(str) {
  if (!str) return { pct: 0, count: 0 };
  if (typeof str === 'object') return str;
  const match = str.toString().match(/([\d.]+)%\s*\((\d+)\)/);
  return match ? { pct: parseFloat(match[1]), count: parseInt(match[2]) } : { pct: 0, count: 0 };
}

function loadPeriodData(period) {
  const filePath = path.join(DATA_DIR, `raw-${period}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  No data for ${period}`);
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`  Loaded ${period}: ${data.totalAccounts || data.accounts?.length || 0} accounts`);
    return data;
  } catch (err) {
    console.error(`  Error loading ${period}:`, err.message);
    return null;
  }
}

function aggregateByDomain(accounts) {
  const domains = {};
  
  for (const account of accounts) {
    const domain = account.email.split('@')[1];
    if (!domain) continue;
    
    if (!domains[domain]) {
      domains[domain] = {
        domain,
        provider: detectProvider(domain),
        accounts: [],
        totalSent: 0,
        totalReplied: 0,
        totalBounce: 0,
        totalOpened: 0,
        totalPositive: 0
      };
    }
    
    domains[domain].accounts.push(account.email);
    domains[domain].totalSent += account.emailSent || 0;
    
    const replied = parseMetric(account.replied);
    const bounce = parseMetric(account.bounce);
    const opened = parseMetric(account.opened);
    const positive = parseMetric(account.positiveReply);
    
    domains[domain].totalReplied += replied.count;
    domains[domain].totalBounce += bounce.count;
    domains[domain].totalOpened += opened.count;
    domains[domain].totalPositive += positive.count;
  }
  
  // Calculate percentages
  for (const domain of Object.values(domains)) {
    const sent = domain.totalSent;
    domain.replyPct = sent > 0 ? parseFloat(((domain.totalReplied / sent) * 100).toFixed(2)) : 0;
    domain.bouncePct = sent > 0 ? parseFloat(((domain.totalBounce / sent) * 100).toFixed(2)) : 0;
    domain.openPct = sent > 0 ? parseFloat(((domain.totalOpened / sent) * 100).toFixed(2)) : 0;
    domain.accountCount = domain.accounts.length;
  }
  
  return domains;
}

function processDomainHealth() {
  console.log('Processing Smartlead Domain Health Data...\n');
  
  // Load data for all periods
  const periodData = {};
  for (const period of PERIODS) {
    periodData[period] = loadPeriodData(period);
  }
  
  console.log('\nAggregating by domain...');
  
  // Get all unique domains from all periods
  const allDomains = new Set();
  for (const period of PERIODS) {
    const data = periodData[period];
    if (data?.accounts) {
      data.accounts.forEach(acc => {
        const domain = acc.email?.split('@')[1];
        if (domain) allDomains.add(domain);
      });
    }
    if (data?.domains) {
      data.domains.forEach(d => allDomains.add(d.domain));
    }
  }
  
  console.log(`Found ${allDomains.size} unique domains\n`);
  
  // Build combined domain data
  const domains = [];
  
  for (const domainName of allDomains) {
    const domainEntry = {
      domain: domainName,
      provider: detectProvider(domainName),
      accounts: []
    };
    
    // Collect accounts from all periods
    const accountSet = new Set();
    for (const period of PERIODS) {
      const data = periodData[period];
      if (data?.accounts) {
        data.accounts
          .filter(a => a.email?.split('@')[1] === domainName)
          .forEach(a => accountSet.add(a.email));
      }
      if (data?.domains) {
        const domainData = data.domains.find(d => d.domain === domainName);
        if (domainData?.accounts) {
          domainData.accounts.forEach(email => accountSet.add(email));
        }
      }
    }
    domainEntry.accounts = Array.from(accountSet);
    
    // Calculate metrics for each period
    for (const period of PERIODS) {
      const data = periodData[period];
      if (!data) {
        domainEntry[period] = { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 };
        continue;
      }
      
      // Check if data has pre-aggregated domains
      if (data.domains) {
        const domainAgg = data.domains.find(d => d.domain === domainName);
        if (domainAgg) {
          domainEntry[period] = {
            sent: domainAgg.totalSent || 0,
            reply: domainAgg.totalReplied || 0,
            replyPct: parseFloat(domainAgg.replyPct) || 0,
            bounce: domainAgg.totalBounce || 0,
            bouncePct: parseFloat(domainAgg.bouncePct) || 0
          };
          continue;
        }
      }
      
      // Aggregate from accounts
      if (data.accounts) {
        const domainAccounts = data.accounts.filter(a => a.email?.split('@')[1] === domainName);
        let sent = 0, replied = 0, bounced = 0;
        
        for (const acc of domainAccounts) {
          sent += acc.emailSent || 0;
          replied += parseMetric(acc.replied).count;
          bounced += parseMetric(acc.bounce).count;
        }
        
        domainEntry[period] = {
          sent,
          reply: replied,
          replyPct: sent > 0 ? parseFloat(((replied / sent) * 100).toFixed(2)) : 0,
          bounce: bounced,
          bouncePct: sent > 0 ? parseFloat(((bounced / sent) * 100).toFixed(2)) : 0
        };
      } else {
        domainEntry[period] = { sent: 0, reply: 0, replyPct: 0, bounce: 0, bouncePct: 0 };
      }
    }
    
    domains.push(domainEntry);
  }
  
  // Sort by most recent (14d) sent volume
  domains.sort((a, b) => (b['14d']?.sent || 0) - (a['14d']?.sent || 0));
  
  // Generate output
  const output = {
    generatedAt: new Date().toISOString(),
    periods: PERIODS,
    totalDomains: domains.length,
    domains
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWritten ${domains.length} domains to ${OUTPUT_FILE}`);
  
  // Print summary
  console.log('\nTop 10 Domains by 14d Volume:');
  console.log('─'.repeat(80));
  for (const domain of domains.slice(0, 10)) {
    const d14 = domain['14d'] || {};
    console.log(`  ${domain.domain.padEnd(40)} ${String(d14.sent || 0).padStart(6)} sent | ${String(d14.replyPct || 0).padStart(5)}% reply | ${String(d14.bouncePct || 0).padStart(5)}% bounce`);
  }
  
  return output;
}

// Run if called directly
if (require.main === module) {
  processDomainHealth();
}

module.exports = { processDomainHealth, aggregateByDomain };
