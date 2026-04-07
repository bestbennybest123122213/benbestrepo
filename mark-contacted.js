#!/usr/bin/env node
/**
 * Mark Lead as Contacted
 * 
 * Quick CLI to update lead status after contacting them
 * 
 * Usage:
 *   node mark-contacted.js <email> [status]
 *   node mark-contacted.js nick.depalo@unity.com booked
 *   node mark-contacted.js sara@example.com contacted
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function markContacted(email, newStatus = 'contacted') {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  // Find the lead
  const { data: lead, error: findError } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (findError || !lead) {
    console.log(`❌ Lead not found: ${email}`);
    return false;
  }

  // Map status to follow_up_status
  const statusMap = {
    'contacted': 'contacted',
    'booked': 'booked',
    'meeting': 'booked',
    'scheduled': 'booked',
    'lost': 'closed',
    'closed': 'closed',
    'not_interested': 'closed',
    'later': 'snoozed',
    'snooze': 'snoozed'
  };

  const mappedStatus = statusMap[newStatus.toLowerCase()] || newStatus;

  // Update
  const { error: updateError } = await client
    .from('positive_replies')
    .update({ 
      follow_up_status: mappedStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead.id);

  if (updateError) {
    console.log(`❌ Error updating: ${updateError.message}`);
    return false;
  }

  console.log(`
✅ Updated: ${lead.lead_name || lead.lead_email}
   Company: ${lead.lead_company || 'N/A'}
   Previous: ${lead.follow_up_status || 'pending'}
   New: ${mappedStatus}
`);

  return true;
}

async function listRecentLeads() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('lead_email, lead_name, lead_company, reply_category, follow_up_status')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false })
    .limit(10);

  console.log('\n📋 RECENT LEADS TO UPDATE:\n');
  leads.forEach(l => {
    const status = l.follow_up_status || 'pending';
    const emoji = status === 'pending' ? '⏳' : status === 'contacted' ? '📧' : status === 'booked' ? '✅' : '❌';
    console.log(`  ${emoji} node mark-contacted.js ${l.lead_email} <status>`);
    console.log(`     ${l.lead_name || 'N/A'} @ ${l.lead_company || 'N/A'} (${l.reply_category})`);
    console.log('');
  });

  console.log('STATUSES: contacted, booked, lost, later\n');
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const status = args[1];

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📝 MARK LEAD AS CONTACTED                                           ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  if (!email) {
    await listRecentLeads();
    return;
  }

  if (!status) {
    console.log('Usage: node mark-contacted.js <email> <status>');
    console.log('Statuses: contacted, booked, lost, later');
    return;
  }

  await markContacted(email, status);
}

module.exports = { markContacted };

if (require.main === module) {
  main().catch(console.error);
}
