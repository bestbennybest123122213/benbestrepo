#!/usr/bin/env node
/**
 * Estimate 60d and 90d data based on existing 7d/14d/30d patterns
 * Uses linear extrapolation from known data points
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Load existing domain stats
function loadDomainStats() {
  const files = [
    'domain-stats-complete-2026-03-16.json',
    'domain-stats-exact-2026-03-16.json'
  ];
  
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`Loading ${file}...`);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }
  throw new Error('No domain stats file found');
}

// Estimate missing period data using growth rate
function estimatePeriod(domain, targetDays, knownPeriods) {
  // Use ratio-based estimation from known periods
  // If we have 7d, 14d, 30d, estimate 60d and 90d
  
  const d30 = knownPeriods.d30 || { sent: 0, replied: 0, bounced: 0 };
  const d14 = knownPeriods.d14 || { sent: 0, replied: 0, bounced: 0 };
  const d7 = knownPeriods.d7 || { sent: 0, replied: 0, bounced: 0 };
  
  // Calculate daily average from 30d data
  const dailySent = d30.sent / 30;
  const dailyReplied = d30.replied / 30;
  const dailyBounced = d30.bounced / 30;
  
  // Estimate for target period
  const sent = Math.round(dailySent * targetDays);
  const replied = Math.round(dailyReplied * targetDays);
  const bounced = Math.round(dailyBounced * targetDays);
  
  return {
    sent,
    replied,
    bounced,
    replyRate: sent > 0 ? ((replied / sent) * 100).toFixed(2) : '0.00',
    bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(2) : '0.00',
    estimated: true
  };
}

function main() {
  console.log('Estimating 60d and 90d data...\n');
  
  const data = loadDomainStats();
  const domains = data.domains || [];
  
  console.log(`Processing ${domains.length} domains...\n`);
  
  const enrichedDomains = domains.map(d => {
    const knownPeriods = {
      d7: d.d7,
      d14: d.d14,
      d30: d.d30
    };
    
    // Estimate 60d and 90d if not present
    const d60 = d.d60 || estimatePeriod(d.domain, 60, knownPeriods);
    const d90 = d.d90 || estimatePeriod(d.domain, 90, knownPeriods);
    
    return {
      ...d,
      d60,
      d90
    };
  });
  
  // Create output with all periods
  const output = {
    ...data,
    domains: enrichedDomains,
    estimatedPeriods: ['d60', 'd90'],
    generatedAt: new Date().toISOString()
  };
  
  // Save enriched data
  const outputPath = path.join(DATA_DIR, 'domain-stats-all-periods.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${outputPath}`);
  
  // Print sample
  console.log('\nSample domain with all periods:');
  const sample = enrichedDomains[0];
  console.log(`  Domain: ${sample.domain}`);
  console.log(`  7d:  ${sample.d7?.sent || 0} sent, ${sample.d7?.replied || 0} replied`);
  console.log(`  14d: ${sample.d14?.sent || 0} sent, ${sample.d14?.replied || 0} replied`);
  console.log(`  30d: ${sample.d30?.sent || 0} sent, ${sample.d30?.replied || 0} replied`);
  console.log(`  60d: ${sample.d60?.sent || 0} sent, ${sample.d60?.replied || 0} replied ${sample.d60?.estimated ? '(estimated)' : ''}`);
  console.log(`  90d: ${sample.d90?.sent || 0} sent, ${sample.d90?.replied || 0} replied ${sample.d90?.estimated ? '(estimated)' : ''}`);
}

main();
