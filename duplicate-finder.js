#!/usr/bin/env node
/**
 * Duplicate Lead Finder
 * 
 * Identifies duplicate leads in the pipeline.
 * 
 * Usage:
 *   node duplicate-finder.js         # Find duplicates
 *   node duplicate-finder.js fix     # Suggest merges
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0] || 'find';

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('created_at', { ascending: true });

  if (!leads) {
    console.error('❌ No leads found');
    process.exit(1);
  }

  // Group by email
  const byEmail = {};
  leads.forEach(l => {
    const email = (l.lead_email || '').toLowerCase();
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(l);
  });

  // Find duplicates
  const duplicates = Object.entries(byEmail)
    .filter(([_, leads]) => leads.length > 1)
    .map(([email, leads]) => ({ email, leads, count: leads.length }))
    .sort((a, b) => b.count - a.count);

  // Also find similar names
  const byName = {};
  leads.forEach(l => {
    const name = (l.lead_name || '').toLowerCase().trim();
    if (!byName[name]) byName[name] = [];
    byName[name].push(l);
  });

  const nameDupes = Object.entries(byName)
    .filter(([name, leads]) => leads.length > 1 && name.length > 3)
    .map(([name, leads]) => ({ name, leads, count: leads.length }))
    .sort((a, b) => b.count - a.count);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 DUPLICATE FINDER                                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 DUPLICATE EMAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (duplicates.length === 0) {
    console.log('  ✅ No duplicate emails found!');
  } else {
    console.log(`  Found ${duplicates.length} emails with multiple entries:\n`);
    
    duplicates.slice(0, 10).forEach(d => {
      console.log(`  📧 ${d.email} (${d.count} entries)`);
      d.leads.forEach(l => {
        const age = getAgeDays(l.created_at);
        console.log(`     • ${l.lead_name} | ${l.reply_category} | ${age}d ago`);
      });
      console.log('');
    });

    if (duplicates.length > 10) {
      console.log(`  ... and ${duplicates.length - 10} more\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 DUPLICATE NAMES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (nameDupes.length === 0) {
    console.log('  ✅ No duplicate names found!');
  } else {
    console.log(`  Found ${nameDupes.length} names with multiple entries:\n`);
    
    nameDupes.slice(0, 10).forEach(d => {
      console.log(`  👤 ${d.name} (${d.count} entries)`);
      d.leads.forEach(l => {
        console.log(`     • ${l.lead_email} | ${l.reply_category}`);
      });
      console.log('');
    });
  }

  // Summary
  const totalDupes = duplicates.reduce((sum, d) => sum + d.count - 1, 0) +
                     nameDupes.reduce((sum, d) => sum + d.count - 1, 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Total leads: ${leads.length}`);
  console.log(`  Duplicate emails: ${duplicates.length} groups (${duplicates.reduce((s, d) => s + d.count, 0)} entries)`);
  console.log(`  Duplicate names: ${nameDupes.length} groups`);
  console.log('');

  if (duplicates.length > 0) {
    console.log('  💡 Consider merging duplicates to clean up the pipeline.');
  }
  console.log('');
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
