#!/usr/bin/env node
/**
 * Fast bulk upload - just insert, count errors
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

  // First, get existing websites to filter
  console.log('Checking existing websites...');
  const { data: existing, error: existErr } = await supabase
    .from('all_leads')
    .select('website');
  
  if (existErr) {
    console.error('Error getting existing:', existErr.message);
    return;
  }

  const existingDomains = new Set(
    existing.map(r => r.website?.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase())
  );
  
  console.log(`Found ${existingDomains.size} existing domains in DB`);

  // Filter to only new domains
  const newDomains = domains.filter(d => !existingDomains.has(d));
  console.log(`${newDomains.length} truly new domains to insert`);

  if (newDomains.length === 0) {
    console.log('Nothing new to insert!');
    return;
  }

  // Bulk insert new ones
  const records = newDomains.map(domain => ({
    company_name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
    website: `https://${domain}`,
    short_description: '[imann_batch_2026-02-05] B2C/DTC sponsor prospect'
  }));

  const batchSize = 1000;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('all_leads')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`\nBatch ${i}-${i+batchSize} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
    }
    
    process.stdout.write(`\rProgress: ${Math.min(i + batchSize, records.length)}/${records.length}`);
  }

  console.log(`\n\n✅ Done! Inserted: ${inserted}, Errors: ${errors}`);
}

main().catch(console.error);
