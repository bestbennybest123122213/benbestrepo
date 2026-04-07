#!/usr/bin/env node
/**
 * Positive Replies Command
 * View all positive replies from Supabase
 * 
 * Usage:
 *   gex positives           # Show recent positive replies
 *   gex positives --all     # Show all positive replies
 *   gex positives --today   # Show today's positive replies
 *   gex positives --count   # Just show the count
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function run(args = []) {
  const showAll = args.includes('--all');
  const todayOnly = args.includes('--today');
  const countOnly = args.includes('--count');
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📬 POSITIVE REPLIES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    let query = supabase
      .from('positive_replies')
      .select('*')
      .order('replied_at', { ascending: false });
    
    if (todayOnly) {
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('replied_at', today);
    }
    
    if (!showAll && !todayOnly) {
      query = query.limit(20);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching positive replies:', error.message);
      process.exit(1);
    }
    
    if (!data || data.length === 0) {
      console.log('No positive replies found.\n');
      return;
    }
    
    if (countOnly) {
      console.log(`Total positive replies: ${data.length}\n`);
      return;
    }
    
    // Group by category
    const byCategory = {};
    for (const reply of data) {
      const cat = reply.reply_category || 'Unknown';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(reply);
    }
    
    // Summary
    console.log(`Total: ${data.length} positive replies\n`);
    console.log('By Category:');
    for (const [cat, replies] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${replies.length}`);
    }
    console.log('');
    
    // Recent list
    console.log('───────────────────────────────────────────────────────────');
    console.log('RECENT POSITIVE REPLIES');
    console.log('───────────────────────────────────────────────────────────\n');
    
    const limit = showAll ? data.length : Math.min(data.length, 15);
    for (let i = 0; i < limit; i++) {
      const r = data[i];
      const date = new Date(r.replied_at).toLocaleDateString();
      const company = r.lead_company || extractCompany(r.lead_email) || '-';
      const status = r.follow_up_status || 'pending';
      
      console.log(`${i + 1}. ${r.lead_email}`);
      console.log(`   Company: ${company} | Category: ${r.reply_category}`);
      console.log(`   Date: ${date} | Status: ${status}`);
      console.log('');
    }
    
    if (!showAll && data.length > 15) {
      console.log(`... and ${data.length - 15} more. Use --all to see all.\n`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

function extractCompany(email) {
  if (!email) return null;
  const domain = email.split('@')[1];
  if (!domain) return null;
  return domain.split('.')[0];
}

// If run directly
if (require.main === module) {
  require('dotenv').config();
  run(process.argv.slice(2));
}

module.exports = { run };
