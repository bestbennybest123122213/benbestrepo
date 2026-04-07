#!/usr/bin/env node
/**
 * Quick Actions CLI
 * 
 * Fast one-liner actions on leads without complex commands.
 * 
 * Usage:
 *   node quick-actions-cli.js mark-booked <email>    # Mark as booked
 *   node quick-actions-cli.js mark-meeting <email>   # Mark as meeting request
 *   node quick-actions-cli.js snooze <email> <days>  # Snooze for X days
 *   node quick-actions-cli.js archive <email>        # Archive lead
 *   node quick-actions-cli.js find <term>            # Quick search
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const ACTION = args[0];
const TARGET = args[1];
const EXTRA = args[2];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  if (!ACTION) {
    showHelp();
    return;
  }

  switch (ACTION) {
    case 'mark-booked':
      await markCategory(client, TARGET, 'Booked');
      break;
    case 'mark-meeting':
      await markCategory(client, TARGET, 'Meeting Request');
      break;
    case 'mark-interested':
      await markCategory(client, TARGET, 'Interested');
      break;
    case 'snooze':
      await snooze(client, TARGET, parseInt(EXTRA) || 7);
      break;
    case 'archive':
      await archive(client, TARGET);
      break;
    case 'find':
      await find(client, TARGET);
      break;
    case 'touch':
      await touch(client, TARGET);
      break;
    default:
      showHelp();
  }
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ⚡ QUICK ACTIONS CLI                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

  Usage:
    node quick-actions-cli.js mark-booked <email>      # Mark as booked
    node quick-actions-cli.js mark-meeting <email>     # Mark as meeting request
    node quick-actions-cli.js mark-interested <email>  # Mark as interested
    node quick-actions-cli.js snooze <email> <days>    # Snooze for X days
    node quick-actions-cli.js archive <email>          # Archive (soft delete)
    node quick-actions-cli.js find <term>              # Quick search
    node quick-actions-cli.js touch <email>            # Update last contacted

  Examples:
    node quick-actions-cli.js mark-booked nick.depalo@unity.com
    node quick-actions-cli.js snooze user@example.com 14
    node quick-actions-cli.js find unity
`);
}

async function markCategory(client, email, category) {
  if (!email) {
    console.error('❌ Please provide an email');
    return;
  }

  const { data: lead, error: findError } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (findError || !lead) {
    console.error(`❌ Lead not found: ${email}`);
    return;
  }

  const { error } = await client
    .from('positive_replies')
    .update({ reply_category: category })
    .eq('id', lead.id);

  if (error) {
    console.error(`❌ Error updating: ${error.message}`);
    return;
  }

  console.log(`✅ ${lead.lead_name} marked as ${category}`);
  console.log(`   Previous: ${lead.reply_category}`);
}

async function snooze(client, email, days) {
  if (!email) {
    console.error('❌ Please provide an email');
    return;
  }

  const { data: lead, error: findError } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (findError || !lead) {
    console.error(`❌ Lead not found: ${email}`);
    return;
  }

  // Update the replied_at to push it back in the sequence
  const newDate = new Date();
  newDate.setDate(newDate.getDate() - (days - 3)); // Will be "3 days old" in X days

  const { error } = await client
    .from('positive_replies')
    .update({ replied_at: newDate.toISOString() })
    .eq('id', lead.id);

  if (error) {
    console.error(`❌ Error updating: ${error.message}`);
    return;
  }

  console.log(`✅ ${lead.lead_name} snoozed for ${days} days`);
  console.log(`   Will appear in Day 3 follow-up on ${new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString()}`);
}

async function archive(client, email) {
  if (!email) {
    console.error('❌ Please provide an email');
    return;
  }

  // Note: This would typically update a status field rather than delete
  // For now, we'll mark it as a special category
  const { data: lead, error: findError } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (findError || !lead) {
    console.error(`❌ Lead not found: ${email}`);
    return;
  }

  // Could add an 'archived' column or move to different table
  console.log(`⚠️ Archive not fully implemented - would archive ${lead.lead_name}`);
  console.log(`   To remove from active pipeline, use mark-booked or add custom status`);
}

async function find(client, term) {
  if (!term) {
    console.error('❌ Please provide a search term');
    return;
  }

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .or(`lead_name.ilike.%${term}%,lead_email.ilike.%${term}%,lead_company.ilike.%${term}%`)
    .limit(10);

  if (!leads || leads.length === 0) {
    console.log(`❌ No leads found matching "${term}"`);
    return;
  }

  console.log(`\n🔍 Found ${leads.length} leads matching "${term}":\n`);

  leads.forEach((l, i) => {
    const age = getAgeDays(l.replied_at);
    console.log(`  ${i + 1}. ${l.lead_name}`);
    console.log(`     📧 ${l.lead_email}`);
    console.log(`     🏢 ${l.lead_company || 'Unknown'} | ${l.reply_category} | ${age}d`);
    console.log('');
  });
}

async function touch(client, email) {
  if (!email) {
    console.error('❌ Please provide an email');
    return;
  }

  const { data: lead, error: findError } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (findError || !lead) {
    console.error(`❌ Lead not found: ${email}`);
    return;
  }

  // Reset the replied_at to today to restart the sequence
  const { error } = await client
    .from('positive_replies')
    .update({ replied_at: new Date().toISOString() })
    .eq('id', lead.id);

  if (error) {
    console.error(`❌ Error updating: ${error.message}`);
    return;
  }

  console.log(`✅ ${lead.lead_name} touched - sequence restarted`);
  console.log(`   Will appear in Day 3 follow-up in 3 days`);
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
