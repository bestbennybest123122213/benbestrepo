#!/usr/bin/env node
/**
 * Mailbox Health Sync
 * Scrapes Smartlead Email Health Metrics and syncs to Supabase
 * Aggregates by domain for domain-level health tracking
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npuotzflxerbxwelclxj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Sample data structure (will be passed from browser scrape)
async function processMailboxData(rawData, dateRange) {
  console.log(`Processing ${rawData.length} mailboxes for ${dateRange.start} to ${dateRange.end}`);
  
  // Aggregate by domain
  const domains = {};
  rawData.forEach(row => {
    if (!domains[row.domain]) {
      domains[row.domain] = { 
        domain: row.domain,
        accounts: 0,
        lead_contacted: 0, 
        email_sent: 0, 
        opened_count: 0,
        replied_count: 0,
        positive_count: 0,
        bounce_count: 0,
        date_start: dateRange.start,
        date_end: dateRange.end,
        scraped_at: new Date().toISOString()
      };
    }
    domains[row.domain].accounts++;
    domains[row.domain].lead_contacted += row.leadContacted;
    domains[row.domain].email_sent += row.emailSent;
    domains[row.domain].opened_count += row.openedCount;
    domains[row.domain].replied_count += row.repliedCount;
    domains[row.domain].positive_count += row.positiveCount;
    domains[row.domain].bounce_count += row.bounceCount;
  });
  
  const domainData = Object.values(domains);
  
  // Calculate rates
  domainData.forEach(d => {
    d.reply_rate = d.lead_contacted > 0 ? (d.replied_count / d.lead_contacted * 100).toFixed(2) : 0;
    d.positive_rate = d.replied_count > 0 ? (d.positive_count / d.replied_count * 100).toFixed(2) : 0;
    d.bounce_rate = d.lead_contacted > 0 ? (d.bounce_count / d.lead_contacted * 100).toFixed(2) : 0;
  });
  
  return domainData;
}

async function insertToSupabase(domainData) {
  console.log(`Inserting ${domainData.length} domain records to Supabase...`);
  
  const { data, error } = await supabase
    .from('domain_health')
    .upsert(domainData, { 
      onConflict: 'domain,date_start,date_end',
      ignoreDuplicates: false 
    });
    
  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }
  
  console.log('Successfully inserted to Supabase');
  return data;
}

async function printSummary(domainData) {
  // Sort by email_sent descending
  domainData.sort((a, b) => b.email_sent - a.email_sent);
  
  console.log('\n=== DOMAIN HEALTH SUMMARY ===\n');
  console.log('DOMAIN                          | ACCTS | SENT  | REPLY | POS | BOUNCE | REPLY% | BOUNCE%');
  console.log('--------------------------------|-------|-------|-------|-----|--------|--------|--------');
  
  let totalSent = 0;
  let totalReplied = 0;
  let totalPositive = 0;
  let totalBounce = 0;
  
  domainData.forEach(d => {
    const domain = d.domain.padEnd(31).slice(0, 31);
    console.log(`${domain} | ${String(d.accounts).padStart(5)} | ${String(d.email_sent).padStart(5)} | ${String(d.replied_count).padStart(5)} | ${String(d.positive_count).padStart(3)} | ${String(d.bounce_count).padStart(6)} | ${String(d.reply_rate).padStart(6)}% | ${String(d.bounce_rate).padStart(6)}%`);
    
    totalSent += d.email_sent;
    totalReplied += d.replied_count;
    totalPositive += d.positive_count;
    totalBounce += d.bounce_count;
  });
  
  console.log('--------------------------------|-------|-------|-------|-----|--------|--------|--------');
  console.log(`TOTAL                           | ${String(domainData.length).padStart(5)} | ${String(totalSent).padStart(5)} | ${String(totalReplied).padStart(5)} | ${String(totalPositive).padStart(3)} | ${String(totalBounce).padStart(6)} |`);
  console.log(`\nOverall Reply Rate: ${(totalReplied / totalSent * 100).toFixed(2)}%`);
  console.log(`Overall Bounce Rate: ${(totalBounce / totalSent * 100).toFixed(2)}%`);
}

// Export for use in other scripts
module.exports = { processMailboxData, insertToSupabase, printSummary };

// If run directly, show usage
if (require.main === module) {
  console.log('Mailbox Health Sync');
  console.log('Usage: Import and call processMailboxData(data, dateRange)');
  console.log('Or use with browser automation to scrape and sync.');
}
