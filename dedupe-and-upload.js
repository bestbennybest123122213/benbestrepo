#!/usr/bin/env node
/**
 * Dedupe new leads against all_leads and upload to Supabase
 * Usage: node dedupe-and-upload.js input.csv
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Normalize domain
function normalizeDomain(url) {
  if (!url) return null;
  try {
    let d = url.toLowerCase().trim();
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return d;
  } catch {
    return url;
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: node dedupe-and-upload.js input.csv');
    process.exit(1);
  }

  console.log('Loading existing domains...');
  const existingDomains = new Set(
    fs.readFileSync('/tmp/existing_domains.txt', 'utf8')
      .split('\n')
      .filter(d => d.trim())
      .map(d => d.toLowerCase().trim())
  );
  console.log(`Loaded ${existingDomains.size} existing domains`);

  console.log(`\nParsing ${inputFile}...`);
  const content = fs.readFileSync(inputFile, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0];
  const rows = lines.slice(1);

  console.log(`Found ${rows.length} leads to process`);

  // Parse and dedupe
  const newLeads = [];
  const duplicates = [];
  
  for (const row of rows) {
    const cols = row.split(',');
    const domain = normalizeDomain(cols[0]);
    
    if (!domain) continue;
    
    if (existingDomains.has(domain)) {
      duplicates.push(domain);
    } else {
      newLeads.push({
        domain,
        company_name: cols[1] || '',
        description: cols[2] || '',
        category: cols[3] || '',
        geo: cols[4] || '',
        priority: cols[5] || '',
        raw: row
      });
      // Add to set to prevent dupes within this batch
      existingDomains.add(domain);
    }
  }

  console.log(`\n=== DEDUP RESULTS ===`);
  console.log(`New unique leads: ${newLeads.length}`);
  console.log(`Duplicates removed: ${duplicates.length}`);

  // Save deduped CSV
  const outputFile = inputFile.replace('.csv', '-DEDUPED.csv');
  const outputContent = [header, ...newLeads.map(l => l.raw)].join('\n');
  fs.writeFileSync(outputFile, outputContent);
  console.log(`\nSaved deduped CSV to: ${outputFile}`);

  // Prepare for Supabase upload
  const supabaseLeads = newLeads.map(l => ({
    company_name: l.company_name || l.domain,
    website: l.domain.startsWith('http') ? l.domain : `https://${l.domain}`,
    short_description: `[imann_scrape_${new Date().toISOString().split('T')[0]}] ${l.description} | Category: ${l.category} | Priority: ${l.priority}`.substring(0, 500)
  }));

  // Upload to Supabase in batches
  console.log(`\nUploading ${supabaseLeads.length} leads to Supabase...`);
  const batchSize = 500;
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < supabaseLeads.length; i += batchSize) {
    const batch = supabaseLeads.slice(i, i + batchSize);
    const { error } = await supabase.from('all_leads').upsert(batch, { 
      onConflict: 'website',
      ignoreDuplicates: true 
    });
    
    if (error) {
      console.error(`Batch error:`, error.message);
      errors += batch.length;
    } else {
      uploaded += batch.length;
    }
    process.stdout.write(`\rProgress: ${uploaded}/${supabaseLeads.length}`);
  }

  console.log(`\n\n=== UPLOAD COMPLETE ===`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Errors: ${errors}`);
  console.log(`Output file: ${outputFile}`);

  return { newLeads: newLeads.length, duplicates: duplicates.length, outputFile };
}

main().catch(console.error);
