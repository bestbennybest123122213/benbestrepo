#!/usr/bin/env node
/**
 * Quick Mark - Fast Lead Status Updates
 * 
 * After sending emails, quickly mark leads as contacted.
 * Shows recent queue items for easy selection.
 * 
 * Usage:
 *   node quick-mark.js                     # Interactive mode - show recent leads
 *   node quick-mark.js done 1,2,3          # Mark queue items 1,2,3 as contacted
 *   node quick-mark.js done EMAIL          # Mark specific email as contacted
 *   node quick-mark.js booked EMAIL        # Mark as booked (meeting scheduled)
 *   node quick-mark.js lost EMAIL          # Mark as lost (not interested)
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const STATUS = args[0] || 'show';
const TARGET = args[1];

const STATUS_MAP = {
  done: 'contacted',
  contacted: 'contacted',
  booked: 'booked',
  lost: 'lost',
  later: 'later',
  skip: 'skip'
};

async function getRecentQueue(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false })
    .limit(10);

  const now = Date.now();
  return (leads || []).map((lead, i) => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    return { ...lead, index: i + 1, age_days: age };
  });
}

async function markLead(client, email, status) {
  const { data, error } = await client
    .from('positive_replies')
    .update({ follow_up_status: status })
    .eq('lead_email', email)
    .select();

  if (error) {
    console.error(`Error marking ${email}:`, error.message);
    return false;
  }
  
  console.log(`✅ Marked ${email} as "${status}"`);
  return true;
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  // Show mode - display recent queue for reference
  if (STATUS === 'show' || !TARGET) {
    const queue = await getRecentQueue(client);
    
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  ✓ QUICK MARK - Recent Queue Items                                       ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);
    
    queue.forEach(lead => {
      const name = lead.lead_name?.split(' ')[0] || 'Unknown';
      const company = lead.lead_company || '—';
      console.log(`   ${lead.index}. ${name} @ ${company}`);
      console.log(`      ${lead.lead_email} | ${lead.age_days}d old`);
      console.log('');
    });

    console.log(`
USAGE:
   gex qm done 1,2,3     Mark items 1,2,3 as contacted
   gex qm done EMAIL     Mark specific email as contacted
   gex qm booked EMAIL   Mark as meeting booked
   gex qm lost EMAIL     Mark as lost

STATUSES: done, contacted, booked, lost, later, skip
`);
    return;
  }

  // Get the actual status
  const actualStatus = STATUS_MAP[STATUS.toLowerCase()] || STATUS;
  
  if (!['contacted', 'booked', 'lost', 'later', 'skip', 'pending'].includes(actualStatus)) {
    console.error(`Unknown status: ${STATUS}`);
    console.log('Valid statuses: done, contacted, booked, lost, later, skip');
    process.exit(1);
  }

  // Handle comma-separated indices (1,2,3)
  if (/^[\d,]+$/.test(TARGET)) {
    const indices = TARGET.split(',').map(n => parseInt(n.trim())).filter(n => n > 0);
    const queue = await getRecentQueue(client);
    
    let success = 0;
    for (const idx of indices) {
      const lead = queue.find(l => l.index === idx);
      if (lead) {
        const marked = await markLead(client, lead.lead_email, actualStatus);
        if (marked) success++;
      } else {
        console.log(`⚠️  No lead at index ${idx}`);
      }
    }
    
    console.log(`\nMarked ${success}/${indices.length} leads as "${actualStatus}"`);
    return;
  }

  // Handle email directly
  if (TARGET.includes('@')) {
    await markLead(client, TARGET, actualStatus);
    return;
  }

  // Handle single index
  const idx = parseInt(TARGET);
  if (!isNaN(idx) && idx > 0) {
    const queue = await getRecentQueue(client);
    const lead = queue.find(l => l.index === idx);
    if (lead) {
      await markLead(client, lead.lead_email, actualStatus);
    } else {
      console.log(`⚠️  No lead at index ${idx}`);
    }
    return;
  }

  console.error('Invalid target. Use an email, index number, or comma-separated indices.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
