#!/usr/bin/env node
/**
 * Data Cleanup Tool
 * 
 * Identifies and fixes data quality issues:
 * - Duplicate leads (same email)
 * - Missing company names
 * - Invalid email addresses
 * - Stale data
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function analyzeDuplicates() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log('🔍 Analyzing duplicates...\n');

  const { data: replies, error } = await client
    .from('positive_replies')
    .select('id, lead_email, lead_name, lead_company, reply_category, replied_at, created_at')
    .order('lead_email', { ascending: true });

  if (error) throw new Error(error.message);

  // Group by email
  const byEmail = {};
  for (const r of replies) {
    const email = (r.lead_email || '').toLowerCase().trim();
    if (!email) continue;
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(r);
  }

  // Find duplicates
  const duplicates = Object.entries(byEmail)
    .filter(([email, records]) => records.length > 1)
    .map(([email, records]) => ({
      email,
      count: records.length,
      records: records.map(r => ({
        id: r.id,
        name: r.lead_name,
        company: r.lead_company,
        category: r.reply_category,
        date: r.replied_at
      }))
    }))
    .sort((a, b) => b.count - a.count);

  console.log(`📊 DUPLICATE ANALYSIS\n`);
  console.log(`   Total records: ${replies.length}`);
  console.log(`   Unique emails: ${Object.keys(byEmail).length}`);
  console.log(`   Emails with duplicates: ${duplicates.length}`);
  console.log(`   Total duplicate records: ${duplicates.reduce((sum, d) => sum + d.count - 1, 0)}`);

  if (duplicates.length > 0) {
    console.log('\n📋 TOP DUPLICATES:\n');
    for (const dup of duplicates.slice(0, 20)) {
      console.log(`   ${dup.email} - ${dup.count}x`);
      for (const r of dup.records) {
        console.log(`      ID ${r.id}: ${r.name || 'no name'} @ ${r.company || 'no company'} (${r.category})`);
      }
    }
  }

  return duplicates;
}

async function analyzeDataQuality() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log('\n🔍 Analyzing data quality...\n');

  const { data: replies, error } = await client
    .from('positive_replies')
    .select('*');

  if (error) throw new Error(error.message);

  const issues = {
    missingName: [],
    missingCompany: [],
    missingEmail: [],
    invalidEmail: [],
    missingCategory: []
  };

  for (const r of replies) {
    if (!r.lead_name || r.lead_name.trim() === '') {
      issues.missingName.push(r);
    }
    if (!r.lead_company || r.lead_company.trim() === '' || r.lead_company === 'null') {
      issues.missingCompany.push(r);
    }
    if (!r.lead_email) {
      issues.missingEmail.push(r);
    } else if (!r.lead_email.includes('@') || !r.lead_email.includes('.')) {
      issues.invalidEmail.push(r);
    }
    if (!r.reply_category) {
      issues.missingCategory.push(r);
    }
  }

  console.log(`📊 DATA QUALITY REPORT\n`);
  console.log(`   Total records: ${replies.length}`);
  console.log(`   Missing name: ${issues.missingName.length} (${(issues.missingName.length/replies.length*100).toFixed(1)}%)`);
  console.log(`   Missing company: ${issues.missingCompany.length} (${(issues.missingCompany.length/replies.length*100).toFixed(1)}%)`);
  console.log(`   Missing email: ${issues.missingEmail.length}`);
  console.log(`   Invalid email: ${issues.invalidEmail.length}`);
  console.log(`   Missing category: ${issues.missingCategory.length}`);

  // Extract company from email domain for missing companies
  const fixable = issues.missingCompany.filter(r => {
    if (!r.lead_email) return false;
    const domain = r.lead_email.split('@')[1];
    if (!domain) return false;
    // Skip generic domains
    if (['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domain)) {
      return false;
    }
    return true;
  });

  console.log(`\n💡 FIXABLE ISSUES:`);
  console.log(`   Can extract company from email: ${fixable.length} records`);

  return { issues, fixable };
}

async function fixMissingCompanies(dryRun = true) {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log(`\n🔧 ${dryRun ? '[DRY RUN]' : ''} Fixing missing companies...\n`);

  const { data: replies, error } = await client
    .from('positive_replies')
    .select('id, lead_email, lead_company')
    .or('lead_company.is.null,lead_company.eq.');

  if (error) throw new Error(error.message);

  const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'protonmail.com'];
  const updates = [];

  for (const r of replies) {
    if (!r.lead_email) continue;
    const domain = r.lead_email.split('@')[1];
    if (!domain || genericDomains.includes(domain.toLowerCase())) continue;

    // Extract company name from domain
    const companyName = domain
      .split('.')[0]
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    updates.push({
      id: r.id,
      email: r.lead_email,
      oldCompany: r.lead_company,
      newCompany: companyName
    });
  }

  console.log(`   Found ${updates.length} records to update`);

  if (!dryRun && updates.length > 0) {
    let success = 0;
    for (const u of updates) {
      const { error: updateError } = await client
        .from('positive_replies')
        .update({ lead_company: u.newCompany })
        .eq('id', u.id);
      
      if (!updateError) success++;
    }
    console.log(`   ✅ Updated ${success} records`);
  } else if (dryRun) {
    console.log('\n   Sample updates:');
    for (const u of updates.slice(0, 10)) {
      console.log(`      ${u.email}: "${u.oldCompany || 'null'}" → "${u.newCompany}"`);
    }
    console.log('\n   Run with --fix flag to apply changes');
  }

  return updates;
}

async function deduplicateRecords(dryRun = true) {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  console.log(`\n🔧 ${dryRun ? '[DRY RUN]' : ''} Deduplicating records...\n`);

  const { data: replies, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false }); // Keep most recent

  if (error) throw new Error(error.message);

  // Group by email
  const byEmail = {};
  for (const r of replies) {
    const email = (r.lead_email || '').toLowerCase().trim();
    if (!email) continue;
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(r);
  }

  // Find IDs to delete (keep the first/most recent one)
  const toDelete = [];
  for (const [email, records] of Object.entries(byEmail)) {
    if (records.length <= 1) continue;
    
    // Keep the one with most data, then most recent
    records.sort((a, b) => {
      // Prefer records with company name
      const aHasCompany = a.lead_company && a.lead_company !== 'null' ? 1 : 0;
      const bHasCompany = b.lead_company && b.lead_company !== 'null' ? 1 : 0;
      if (aHasCompany !== bHasCompany) return bHasCompany - aHasCompany;
      
      // Then prefer most recent
      return new Date(b.replied_at || 0) - new Date(a.replied_at || 0);
    });
    
    // Delete all except the first one
    for (let i = 1; i < records.length; i++) {
      toDelete.push({
        id: records[i].id,
        email: records[i].lead_email,
        reason: `Duplicate of ID ${records[0].id}`
      });
    }
  }

  console.log(`   Found ${toDelete.length} duplicate records to remove`);

  if (!dryRun && toDelete.length > 0) {
    const ids = toDelete.map(d => d.id);
    const { error: deleteError } = await client
      .from('positive_replies')
      .delete()
      .in('id', ids);
    
    if (deleteError) {
      console.log(`   ❌ Error: ${deleteError.message}`);
    } else {
      console.log(`   ✅ Deleted ${toDelete.length} duplicate records`);
    }
  } else if (dryRun) {
    console.log('\n   Sample deletions:');
    for (const d of toDelete.slice(0, 10)) {
      console.log(`      ID ${d.id}: ${d.email} (${d.reason})`);
    }
    console.log('\n   Run with --dedupe flag to apply changes');
  }

  return toDelete;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const shouldDedupe = args.includes('--dedupe');

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  🧹 DATA CLEANUP TOOL                                         ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    await analyzeDuplicates();
    await analyzeDataQuality();
    await fixMissingCompanies(!shouldFix);
    await deduplicateRecords(!shouldDedupe);

    console.log('\n📝 USAGE:');
    console.log('   node data-cleanup.js           # Analyze only (dry run)');
    console.log('   node data-cleanup.js --fix     # Fix missing companies');
    console.log('   node data-cleanup.js --dedupe  # Remove duplicates');
    console.log('   node data-cleanup.js --fix --dedupe  # Both');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { analyzeDuplicates, analyzeDataQuality, fixMissingCompanies, deduplicateRecords };

if (require.main === module) {
  main();
}
