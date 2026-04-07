#!/usr/bin/env node
/**
 * Batch Mark Leads
 * Mark multiple leads as contacted/booked/etc after sending batch emails
 * 
 * Commands:
 *   gex batch-mark contacted 10      - Mark last 10 pending as contacted
 *   gex batch-mark contacted --all   - Mark ALL pending as contacted
 *   gex batch-mark booked email1 email2  - Mark specific leads as booked
 *   gex batch-mark --undo            - Undo last batch mark (set back to pending)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const args = process.argv.slice(2);
const HELP = args.includes('--help') || args.includes('-h');
const ALL = args.includes('--all') || args.includes('-a');
const DRY_RUN = args.includes('--dry-run') || args.includes('-n');
const UNDO = args.includes('--undo');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

if (HELP) {
  console.log(`
${c.bold}Batch Mark Leads${c.reset}

Mark multiple leads as contacted/booked after sending batch emails.

${c.bold}Usage:${c.reset}
  gex batch-mark <status> [count]     Mark last N pending leads
  gex batch-mark <status> --all       Mark ALL pending leads
  gex batch-mark <status> <emails...> Mark specific leads by email
  gex batch-mark --undo               Undo last batch operation

${c.bold}Statuses:${c.reset}
  contacted   Followed up, awaiting response
  booked      Meeting scheduled
  closed      Lost/not interested
  snoozed     Follow up later

${c.bold}Examples:${c.reset}
  gex batch-mark contacted 20         Mark 20 oldest pending as contacted
  gex batch-mark contacted --all      Mark ALL pending as contacted
  gex batch-mark booked john@a.com    Mark specific lead as booked
  gex batch-mark --dry-run contacted 10   Preview without changing

${c.bold}Aliases:${c.reset}
  bm, mark-all, mark-batch
`);
  process.exit(0);
}

// Parse arguments
const status = args.find(a => !a.startsWith('-') && !a.match(/^\d+$/) && !a.includes('@'));
const count = parseInt(args.find(a => a.match(/^\d+$/))) || null;
const emails = args.filter(a => a.includes('@'));

const historyFile = path.join(__dirname, '.batch-mark-history.json');

async function run() {
  console.log(`\n${c.bold}${c.cyan}📝 Batch Mark Leads${c.reset}\n`);

  // Handle undo
  if (UNDO) {
    if (!fs.existsSync(historyFile)) {
      console.log(`${c.yellow}No history found. Nothing to undo.${c.reset}`);
      process.exit(0);
    }
    
    const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    console.log(`Undoing last batch mark: ${history.count} leads → pending`);
    
    if (DRY_RUN) {
      console.log(`${c.yellow}Dry run - no changes made${c.reset}`);
      process.exit(0);
    }

    const { error } = await supabase
      .from('positive_replies')
      .update({ follow_up_status: 'pending', updated_at: new Date().toISOString() })
      .in('id', history.ids);

    if (error) {
      console.log(`${c.red}Error: ${error.message}${c.reset}`);
      process.exit(1);
    }

    fs.unlinkSync(historyFile);
    console.log(`${c.green}✓ Reverted ${history.count} leads to pending${c.reset}\n`);
    process.exit(0);
  }

  // Validate status
  if (!status) {
    console.log(`${c.red}Error: Status required (contacted, booked, closed, snoozed)${c.reset}`);
    console.log(`Run: gex batch-mark --help`);
    process.exit(1);
  }

  const validStatuses = ['contacted', 'booked', 'closed', 'snoozed'];
  if (!validStatuses.includes(status.toLowerCase())) {
    console.log(`${c.red}Invalid status: ${status}${c.reset}`);
    console.log(`Valid: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  // Get leads to mark
  let leadsToMark = [];

  if (emails.length > 0) {
    // Mark specific emails
    const { data } = await supabase
      .from('positive_replies')
      .select('id, lead_email, lead_name')
      .in('lead_email', emails);
    leadsToMark = data || [];
  } else {
    // Mark pending leads by count or all
    let query = supabase
      .from('positive_replies')
      .select('id, lead_email, lead_name, created_at')
      .eq('follow_up_status', 'pending')
      .order('created_at', { ascending: true }); // Oldest first

    if (!ALL && count) {
      query = query.limit(count);
    }

    const { data } = await query;
    leadsToMark = data || [];
  }

  if (leadsToMark.length === 0) {
    console.log(`${c.yellow}No leads found to mark${c.reset}\n`);
    process.exit(0);
  }

  console.log(`${c.bold}Found ${leadsToMark.length} leads to mark as "${status}"${c.reset}\n`);

  // Preview
  const preview = leadsToMark.slice(0, 5);
  preview.forEach(l => {
    console.log(`  • ${l.lead_name || l.lead_email}`);
  });
  if (leadsToMark.length > 5) {
    console.log(`  ... and ${leadsToMark.length - 5} more\n`);
  } else {
    console.log('');
  }

  if (DRY_RUN) {
    console.log(`${c.yellow}Dry run - no changes made${c.reset}\n`);
    process.exit(0);
  }

  // Save history for undo
  const history = {
    ids: leadsToMark.map(l => l.id),
    count: leadsToMark.length,
    previousStatus: 'pending',
    newStatus: status,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

  // Update
  const { error } = await supabase
    .from('positive_replies')
    .update({ 
      follow_up_status: status.toLowerCase(),
      updated_at: new Date().toISOString()
    })
    .in('id', leadsToMark.map(l => l.id));

  if (error) {
    console.log(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.green}✓ Marked ${leadsToMark.length} leads as "${status}"${c.reset}`);
  console.log(`${c.dim}Run: gex batch-mark --undo to revert${c.reset}\n`);
}

run().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
