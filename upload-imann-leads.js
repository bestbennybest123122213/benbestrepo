#!/usr/bin/env node
/**
 * Upload new Imann leads to Supabase
 * Creates new table + updates all_leads
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Loading new domains...');
  const domains = fs.readFileSync('/tmp/new_domains.txt', 'utf8')
    .split('\n')
    .filter(d => d.trim())
    .map(d => d.toLowerCase().trim());
  
  console.log(`Found ${domains.length} new domains to upload`);

  // Create table for this batch if needed
  console.log('\nCreating imann_leads_2026_02_05 table if not exists...');
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS imann_leads_2026_02_05 (
      id SERIAL PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      company_name TEXT,
      description TEXT,
      category TEXT,
      geo TEXT,
      priority TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  
  // Prepare records
  const records = domains.map(domain => ({
    domain: domain,
    company_name: domain.split('.')[0],
    description: '[imann_scrape_2026-02-05] Scraped for Imann sponsorship outreach',
    category: 'Unknown',
    geo: 'Unknown',
    priority: '2'
  }));

  // Batch insert to new table
  console.log('\nInserting to imann_leads_2026_02_05...');
  const batchSize = 500;
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('imann_leads_2026_02_05')
      .upsert(batch, { onConflict: 'domain', ignoreDuplicates: true });
    
    if (error && !error.message.includes('already exists')) {
      console.error('Batch error:', error.message);
    } else {
      inserted += batch.length;
    }
    process.stdout.write(`\rInserted: ${inserted}/${records.length}`);
  }
  console.log('\n');

  // Also insert to all_leads
  console.log('Inserting to all_leads...');
  const allLeadsRecords = domains.map(domain => ({
    company_name: domain.split('.')[0],
    website: domain.startsWith('http') ? domain : `https://${domain}`,
    short_description: '[imann_scrape_2026-02-05] Scraped for Imann sponsorship outreach'
  }));

  let allLeadsInserted = 0;
  for (let i = 0; i < allLeadsRecords.length; i += batchSize) {
    const batch = allLeadsRecords.slice(i, i + batchSize);
    const { error } = await supabase
      .from('all_leads')
      .upsert(batch, { onConflict: 'website', ignoreDuplicates: true });
    
    if (error) {
      // Ignore duplicate errors
      if (!error.message.includes('duplicate')) {
        console.error('all_leads error:', error.message);
      }
    } else {
      allLeadsInserted += batch.length;
    }
    process.stdout.write(`\rall_leads: ${allLeadsInserted}/${allLeadsRecords.length}`);
  }
  
  console.log('\n\n=== UPLOAD COMPLETE ===');
  console.log(`New table: imann_leads_2026_02_05 (${inserted} rows)`);
  console.log(`all_leads updated: ${allLeadsInserted} rows`);
}

main().catch(console.error);
