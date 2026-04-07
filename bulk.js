#!/usr/bin/env node
/**
 * Bulk Operations
 * 
 * Perform batch operations on multiple leads at once.
 * 
 * Usage:
 *   node bulk.js list-stale            # List stale leads
 *   node bulk.js mark-stale <status>   # Mark all stale leads
 *   node bulk.js export-stale          # Export stale leads to file
 *   node bulk.js archive-cold          # Archive leads >60 days old
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getAgeDays, timeAgo } = require('./lib/utils');
const fs = require('fs');

const args = process.argv.slice(2);
const ACTION = args[0];
const PARAM = args[1];

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  switch (ACTION) {
    case 'list-stale':
      await listStale(client);
      break;
      
    case 'list-hot':
      await listHot(client);
      break;
      
    case 'mark-stale':
      if (!PARAM) {
        console.error('Usage: node bulk.js mark-stale <status>');
        console.error('       Status: contacted, snoozed, closed');
        process.exit(1);
      }
      await markStale(client, PARAM);
      break;
      
    case 'export-stale':
      await exportStale(client);
      break;
      
    case 'export-hot':
      await exportHot(client);
      break;
      
    case 'archive-cold':
      await archiveCold(client, parseInt(PARAM) || 60);
      break;
      
    case 'stats':
      await showStats(client);
      break;
      
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
  }
}

async function listStale(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked');
  
  const stale = leads
    .filter(l => getAgeDays(l.replied_at) > 14)
    .sort((a, b) => getAgeDays(b.replied_at) - getAgeDays(a.replied_at));
  
  console.log(`\n⚠️  STALE LEADS (>14 days) - ${stale.length} total\n`);
  console.log('─'.repeat(80));
  
  stale.slice(0, 20).forEach(lead => {
    const age = getAgeDays(lead.replied_at);
    const emoji = age > 30 ? '🔴' : age > 21 ? '🟠' : '🟡';
    console.log(`  ${emoji} ${(lead.lead_name || 'Unknown').padEnd(25)} ${(lead.lead_company || '').padEnd(20)} ${age}d ago`);
  });
  
  if (stale.length > 20) {
    console.log(`\n  ... and ${stale.length - 20} more`);
  }
  console.log('');
}

async function listHot(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked');
  
  const hot = leads
    .filter(l => getAgeDays(l.replied_at) <= 3)
    .sort((a, b) => new Date(b.replied_at) - new Date(a.replied_at));
  
  console.log(`\n🔥 HOT LEADS (≤3 days) - ${hot.length} total\n`);
  console.log('─'.repeat(80));
  
  hot.forEach(lead => {
    const ago = timeAgo(lead.replied_at);
    console.log(`  🔥 ${(lead.lead_name || 'Unknown').padEnd(25)} ${(lead.lead_company || '').padEnd(20)} ${ago}`);
  });
  console.log('');
}

async function markStale(client, status) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('id')
    .neq('reply_category', 'Booked');
  
  const staleIds = leads
    .filter(l => getAgeDays(l.replied_at) > 14)
    .map(l => l.id);
  
  if (staleIds.length === 0) {
    console.log('✅ No stale leads to update');
    return;
  }
  
  console.log(`\n⚠️  About to mark ${staleIds.length} stale leads as "${status}"`);
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds...');
  
  await new Promise(r => setTimeout(r, 3000));
  
  const { error } = await client
    .from('positive_replies')
    .update({ follow_up_status: status })
    .in('id', staleIds);
  
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log(`✅ Updated ${staleIds.length} leads to status: ${status}`);
  }
}

async function exportStale(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked');
  
  const stale = leads.filter(l => getAgeDays(l.replied_at) > 14);
  
  const csv = [
    'Email,Name,Company,Category,Days Stale,Status',
    ...stale.map(l => 
      `${l.lead_email},${l.lead_name || ''},${l.lead_company || ''},${l.reply_category},${getAgeDays(l.replied_at)},${l.follow_up_status || 'pending'}`
    )
  ].join('\n');
  
  const filename = `stale-leads-${new Date().toISOString().split('T')[0]}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`\n✅ Exported ${stale.length} stale leads to ${filename}\n`);
}

async function exportHot(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked');
  
  const hot = leads.filter(l => getAgeDays(l.replied_at) <= 3);
  
  const csv = [
    'Email,Name,Company,Category,Hours Ago,Status',
    ...hot.map(l => 
      `${l.lead_email},${l.lead_name || ''},${l.lead_company || ''},${l.reply_category},${Math.round((Date.now() - new Date(l.replied_at)) / 3600000)},${l.follow_up_status || 'pending'}`
    )
  ].join('\n');
  
  const filename = `hot-leads-${new Date().toISOString().split('T')[0]}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`\n✅ Exported ${hot.length} hot leads to ${filename}\n`);
}

async function archiveCold(client, days) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('id')
    .neq('reply_category', 'Booked');
  
  const coldIds = leads
    .filter(l => getAgeDays(l.replied_at) > days)
    .map(l => l.id);
  
  if (coldIds.length === 0) {
    console.log(`✅ No leads older than ${days} days`);
    return;
  }
  
  console.log(`\n⚠️  About to archive ${coldIds.length} leads older than ${days} days`);
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds...');
  
  await new Promise(r => setTimeout(r, 5000));
  
  const { error } = await client
    .from('positive_replies')
    .update({ follow_up_status: 'archived' })
    .in('id', coldIds);
  
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log(`✅ Archived ${coldIds.length} leads`);
  }
}

async function showStats(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*');
  
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked').length;
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const hot = unbooked.filter(l => getAgeDays(l.replied_at) <= 3).length;
  const warm = unbooked.filter(l => getAgeDays(l.replied_at) > 3 && getAgeDays(l.replied_at) <= 14).length;
  const stale = unbooked.filter(l => getAgeDays(l.replied_at) > 14).length;
  const cold = unbooked.filter(l => getAgeDays(l.replied_at) > 30).length;
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 BULK OPERATIONS STATS                                                ║
╚══════════════════════════════════════════════════════════════════════════╝

  📈 Pipeline
     Total:    ${total}
     Booked:   ${booked} (${total > 0 ? Math.round(booked/total*100) : 0}%)
     
  🌡️  Temperature
     🔥 Hot:   ${hot} (≤3 days)
     🟡 Warm:  ${warm} (4-14 days)
     ⚠️  Stale: ${stale} (>14 days)
     ❄️  Cold:  ${cold} (>30 days)
`);
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📦 BULK OPERATIONS                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝

  Commands:
    node bulk.js stats              # Show pipeline temperature stats
    node bulk.js list-stale         # List stale leads (>14 days)
    node bulk.js list-hot           # List hot leads (≤3 days)
    node bulk.js mark-stale <status>  # Mark all stale leads
    node bulk.js export-stale       # Export stale leads to CSV
    node bulk.js export-hot         # Export hot leads to CSV
    node bulk.js archive-cold [days]  # Archive leads >N days (default 60)

  Statuses: pending, contacted, snoozed, closed, archived
`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
