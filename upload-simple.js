#!/usr/bin/env node
/**
 * Simple upload to all_leads table
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // Read domains
  const domains = fs.readFileSync('/tmp/new_domains.txt', 'utf8')
    .split('\n')
    .filter(d => d.trim())
    .map(d => d.toLowerCase().trim());
  
  console.log(`Found ${domains.length} domains to upload`);

  // Check all_leads structure first
  const { data: sample, error: sampleErr } = await supabase
    .from('all_leads')
    .select('*')
    .limit(1);
  
  if (sampleErr) {
    console.error('Error checking all_leads:', sampleErr.message);
    return;
  }
  
  console.log('all_leads columns:', sample.length ? Object.keys(sample[0]) : 'empty table');

  // Insert in batches without upsert (just insert, skip duplicates)
  const batchSize = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize).map(domain => ({
      company_name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
      website: `https://${domain}`,
      short_description: '[imann_batch_2026-02-05] B2C/DTC sponsor prospect',
      source: 'imann_scrape'
    }));

    const { data, error } = await supabase
      .from('all_leads')
      .insert(batch)
      .select();

    if (error) {
      // Try one by one for this batch to skip duplicates
      for (const record of batch) {
        const { error: singleErr } = await supabase.from('all_leads').insert(record);
        if (!singleErr) inserted++;
        else skipped++;
      }
    } else {
      inserted += data?.length || batch.length;
    }
    
    process.stdout.write(`\rProgress: ${i + batch.length}/${domains.length} (inserted: ${inserted}, skipped: ${skipped})`);
  }

  console.log(`\n\n✅ Done! Inserted: ${inserted}, Skipped/Duplicate: ${skipped}`);
}

main().catch(console.error);
