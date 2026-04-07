#!/usr/bin/env node
/**
 * Stale Lead Archiver
 * 
 * Bulk cleanup tool for stale leads dragging down the pipeline score.
 * Move dead leads to "Archived" status to improve pipeline health.
 * 
 * Usage:
 *   node archive.js                 # Show archivable leads
 *   node archive.js --preview       # List leads that would be archived
 *   node archive.js --execute       # Actually archive stale leads
 *   node archive.js --recover <id>  # Bring a lead back from archive
 *   node archive.js --stats         # Archive history and counts
 *   node archive.js --dry-run       # Simulate archive with impact report
 * 
 * Options:
 *   --days <n>       Days threshold (default: 60)
 *   --limit <n>      Max leads to archive at once (default: 50)
 *   --category <c>   Only archive specific category
 *   --force          Skip confirmation
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ARCHIVE_LOG = path.join(__dirname, 'data', 'archive-log.json');
const SCORE_HISTORY = path.join(__dirname, '.gex-score-history.json');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Parse options
function getOption(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

const OPTIONS = {
  preview: args.includes('--preview'),
  execute: args.includes('--execute'),
  recover: args.includes('--recover'),
  stats: args.includes('--stats'),
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  help: args.includes('--help') || args.includes('-h'),
  days: parseInt(getOption('--days', '60')),
  limit: parseInt(getOption('--limit', '50')),
  category: getOption('--category', null),
  recoverId: args.includes('--recover') ? args[args.indexOf('--recover') + 1] : null
};

// Help
if (OPTIONS.help) {
  console.log(`
${c.bold}Stale Lead Archiver${c.reset}
Move dead leads to archive status to improve pipeline health.

${c.cyan}Usage:${c.reset}
  gex archive                   Show archivable leads summary
  gex archive --preview         List all leads that would be archived
  gex archive --execute         Actually archive the leads
  gex archive --recover <id>    Restore a lead from archive
  gex archive --stats           Show archive history
  gex archive --dry-run         Simulate and show impact

${c.cyan}Options:${c.reset}
  --days <n>        Days threshold (default: 60)
  --limit <n>       Max leads per batch (default: 50)
  --category <cat>  Filter by category
  --force           Skip confirmation prompt

${c.cyan}Examples:${c.reset}
  gex archive --days 30 --preview     # See leads older than 30 days
  gex archive --execute --force       # Archive without confirmation
  gex archive --recover abc123        # Restore lead abc123
`);
  process.exit(0);
}

// Load archive log
function loadArchiveLog() {
  try {
    if (fs.existsSync(ARCHIVE_LOG)) {
      return JSON.parse(fs.readFileSync(ARCHIVE_LOG, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return { archived: [], restorations: [], lastRun: null };
}

// Save archive log
function saveArchiveLog(log) {
  const dir = path.dirname(ARCHIVE_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARCHIVE_LOG, JSON.stringify(log, null, 2));
}

// Get current pipeline score
function getCurrentScore() {
  try {
    if (fs.existsSync(SCORE_HISTORY)) {
      const history = JSON.parse(fs.readFileSync(SCORE_HISTORY, 'utf8'));
      if (history.length > 0) {
        return history[history.length - 1].score;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// Calculate days since date
function daysSince(dateStr) {
  if (!dateStr) return 999;
  const now = new Date();
  const date = new Date(dateStr);
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: '2-digit'
  });
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error(`${c.red}❌ Database not initialized${c.reset}`);
    process.exit(1);
  }

  if (OPTIONS.stats) {
    await showStats();
  } else if (OPTIONS.recover) {
    await recoverLead(client);
  } else if (OPTIONS.execute) {
    await executeArchive(client);
  } else if (OPTIONS.preview || OPTIONS.dryRun) {
    await previewArchive(client, OPTIONS.dryRun);
  } else {
    await showSummary(client);
  }
}

// Show summary of archivable leads
async function showSummary(client) {
  console.log(`\n${c.bold}📦 STALE LEAD ARCHIVER${c.reset}\n`);
  console.log(`${c.dim}Clean up leads older than ${OPTIONS.days} days with no activity${c.reset}\n`);

  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Booked')
    .neq('status', 'Archived');

  if (error || !leads) {
    console.error(`${c.red}❌ Failed to load leads${c.reset}`);
    process.exit(1);
  }

  // Find stale leads
  const stale = leads.filter(l => {
    const age = daysSince(l.conversation_date || l.created_at);
    return age > OPTIONS.days;
  });

  // Already archived count
  const { data: archived } = await client
    .from('imann_positive_replies')
    .select('id')
    .eq('status', 'Archived');

  const archivedCount = archived?.length || 0;

  // Group by age ranges
  const groups = {
    '60-90 days': stale.filter(l => {
      const age = daysSince(l.conversation_date || l.created_at);
      return age >= 60 && age < 90;
    }),
    '90-180 days': stale.filter(l => {
      const age = daysSince(l.conversation_date || l.created_at);
      return age >= 90 && age < 180;
    }),
    '180+ days': stale.filter(l => {
      const age = daysSince(l.conversation_date || l.created_at);
      return age >= 180;
    })
  };

  // Group by category
  const byCategory = {};
  for (const lead of stale) {
    const cat = lead.reply_category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(lead);
  }

  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  Pipeline Overview${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  console.log(`  Total Active Leads:    ${c.bold}${leads.length}${c.reset}`);
  console.log(`  Already Archived:      ${c.dim}${archivedCount}${c.reset}`);
  console.log(`  Stale (>${OPTIONS.days}d):         ${c.yellow}${stale.length}${c.reset}`);
  console.log(`  ${c.dim}└─ ${stale.length}/${leads.length} = ${Math.round(stale.length/leads.length*100)}% of pipeline${c.reset}`);

  console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  By Age${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  for (const [range, list] of Object.entries(groups)) {
    if (list.length > 0) {
      const bar = '█'.repeat(Math.min(Math.ceil(list.length / 5), 20));
      console.log(`  ${range.padEnd(15)} ${c.red}${list.length.toString().padStart(3)}${c.reset}  ${c.dim}${bar}${c.reset}`);
    }
  }

  console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  By Category${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  const sortedCats = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
  for (const [cat, list] of sortedCats.slice(0, 6)) {
    console.log(`  ${cat.padEnd(20)} ${c.yellow}${list.length}${c.reset}`);
  }

  // Pipeline score impact estimate
  const currentScore = getCurrentScore();
  if (currentScore !== null) {
    // Rough estimate: removing stale leads improves score by ~0.1-0.2 per lead
    const estimatedGain = Math.min(stale.length * 0.15, 15);
    const projectedScore = Math.min(currentScore + estimatedGain, 100);
    
    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.bold}  Pipeline Score Impact${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
    
    console.log(`  Current Score:     ${c.red}${currentScore}${c.reset}/100`);
    console.log(`  Est. After Archive: ${c.green}~${Math.round(projectedScore)}${c.reset}/100`);
    console.log(`  Potential Gain:    ${c.green}+${Math.round(estimatedGain)}${c.reset} points`);
  }

  console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  Next Steps${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  console.log(`  ${c.cyan}gex archive --preview${c.reset}       List leads to archive`);
  console.log(`  ${c.cyan}gex archive --dry-run${c.reset}       Simulate with impact`);
  console.log(`  ${c.cyan}gex archive --execute${c.reset}       Archive the leads`);
  console.log(`  ${c.cyan}gex archive --days 30${c.reset}       Change threshold\n`);
}

// Preview leads that would be archived
async function previewArchive(client, showImpact = false) {
  console.log(`\n${c.bold}📋 ARCHIVE PREVIEW${c.reset}`);
  console.log(`${c.dim}Leads older than ${OPTIONS.days} days${c.reset}\n`);

  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Booked')
    .neq('status', 'Archived');

  if (error || !leads) {
    console.error(`${c.red}❌ Failed to load leads${c.reset}`);
    process.exit(1);
  }

  let stale = leads.filter(l => {
    const age = daysSince(l.conversation_date || l.created_at);
    return age > OPTIONS.days;
  });

  // Filter by category if specified
  if (OPTIONS.category) {
    stale = stale.filter(l => 
      (l.reply_category || '').toLowerCase().includes(OPTIONS.category.toLowerCase())
    );
  }

  // Sort by age (oldest first)
  stale.sort((a, b) => {
    const ageA = daysSince(a.conversation_date || a.created_at);
    const ageB = daysSince(b.conversation_date || b.created_at);
    return ageB - ageA;
  });

  // Apply limit for preview
  const previewList = stale.slice(0, OPTIONS.limit);

  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`  ${'Lead'.padEnd(25)} ${'Company'.padEnd(20)} ${'Category'.padEnd(15)} ${'Age'.padEnd(8)}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);

  for (const lead of previewList) {
    const age = daysSince(lead.conversation_date || lead.created_at);
    const name = (lead.lead_name || 'Unknown').substring(0, 24);
    const company = (lead.lead_company || 'N/A').substring(0, 19);
    const category = (lead.reply_category || 'N/A').substring(0, 14);
    
    let ageColor = c.yellow;
    if (age > 180) ageColor = c.red;
    else if (age > 90) ageColor = c.yellow;
    
    console.log(`  ${name.padEnd(25)} ${company.padEnd(20)} ${category.padEnd(15)} ${ageColor}${age}d${c.reset}`);
  }

  if (stale.length > OPTIONS.limit) {
    console.log(`${c.dim}  ... and ${stale.length - OPTIONS.limit} more${c.reset}`);
  }

  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`\n${c.bold}Total: ${stale.length} leads${c.reset} to archive\n`);

  if (showImpact) {
    const currentScore = getCurrentScore();
    if (currentScore !== null) {
      const estimatedGain = Math.min(stale.length * 0.15, 15);
      const projectedScore = Math.min(currentScore + estimatedGain, 100);
      
      console.log(`${c.bold}📊 Impact Simulation:${c.reset}`);
      console.log(`   Current Score:  ${c.red}${currentScore}${c.reset}/100`);
      console.log(`   After Archive:  ${c.green}~${Math.round(projectedScore)}${c.reset}/100`);
      console.log(`   Improvement:    ${c.green}+${Math.round(estimatedGain)}${c.reset} points\n`);
    }

    console.log(`${c.dim}Run ${c.cyan}gex archive --execute${c.dim} to proceed${c.reset}\n`);
  }
}

// Execute the archive
async function executeArchive(client) {
  console.log(`\n${c.bold}📦 EXECUTING ARCHIVE${c.reset}\n`);

  const { data: leads, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .neq('status', 'Booked')
    .neq('status', 'Archived');

  if (error || !leads) {
    console.error(`${c.red}❌ Failed to load leads${c.reset}`);
    process.exit(1);
  }

  let toArchive = leads.filter(l => {
    const age = daysSince(l.conversation_date || l.created_at);
    return age > OPTIONS.days;
  });

  // Filter by category if specified
  if (OPTIONS.category) {
    toArchive = toArchive.filter(l => 
      (l.reply_category || '').toLowerCase().includes(OPTIONS.category.toLowerCase())
    );
  }

  // Apply limit
  toArchive = toArchive.slice(0, OPTIONS.limit);

  if (toArchive.length === 0) {
    console.log(`${c.green}✓ No leads to archive${c.reset}\n`);
    return;
  }

  console.log(`Found ${c.yellow}${toArchive.length}${c.reset} leads to archive\n`);

  // Confirmation if not forced
  if (!OPTIONS.force) {
    console.log(`${c.yellow}⚠️  This will mark ${toArchive.length} leads as Archived${c.reset}`);
    console.log(`${c.dim}   Leads can be recovered with: gex archive --recover <id>${c.reset}\n`);
    console.log(`${c.dim}   Add --force to skip this prompt${c.reset}\n`);
    
    // Simple confirmation (read from stdin would require readline)
    console.log(`${c.cyan}Run again with --force to confirm${c.reset}\n`);
    return;
  }

  // Archive the leads
  const archiveLog = loadArchiveLog();
  const timestamp = new Date().toISOString();
  let archived = 0;
  let failed = 0;

  console.log(`${c.cyan}Archiving leads...${c.reset}\n`);

  for (const lead of toArchive) {
    const { error: updateError } = await client
      .from('imann_positive_replies')
      .update({ 
        status: 'Archived',
        archived_at: timestamp,
        previous_status: lead.status || 'Unknown'
      })
      .eq('id', lead.id);

    if (updateError) {
      console.log(`  ${c.red}✗${c.reset} ${lead.lead_name || 'Unknown'} - ${updateError.message}`);
      failed++;
    } else {
      console.log(`  ${c.green}✓${c.reset} ${lead.lead_name || 'Unknown'} (${lead.lead_company || 'N/A'})`);
      archived++;
      
      // Log for potential recovery
      archiveLog.archived.push({
        id: lead.id,
        name: lead.lead_name,
        company: lead.lead_company,
        email: lead.lead_email,
        previousStatus: lead.status,
        archivedAt: timestamp,
        age: daysSince(lead.conversation_date || lead.created_at)
      });
    }
  }

  archiveLog.lastRun = timestamp;
  saveArchiveLog(archiveLog);

  console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  Archive Complete${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  console.log(`  Archived: ${c.green}${archived}${c.reset}`);
  if (failed > 0) console.log(`  Failed:   ${c.red}${failed}${c.reset}`);
  
  console.log(`\n  ${c.dim}Run ${c.cyan}gex pscore${c.dim} to see new pipeline score${c.reset}\n`);
}

// Recover a lead from archive
async function recoverLead(client) {
  if (!OPTIONS.recoverId) {
    console.log(`\n${c.red}❌ No lead ID provided${c.reset}`);
    console.log(`${c.dim}Usage: gex archive --recover <id>${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}🔄 RECOVERING LEAD${c.reset}\n`);

  const { data: lead, error } = await client
    .from('imann_positive_replies')
    .select('*')
    .eq('id', OPTIONS.recoverId)
    .single();

  if (error || !lead) {
    console.log(`${c.red}❌ Lead not found: ${OPTIONS.recoverId}${c.reset}\n`);
    return;
  }

  if (lead.status !== 'Archived') {
    console.log(`${c.yellow}⚠️  Lead is not archived (status: ${lead.status})${c.reset}\n`);
    return;
  }

  const previousStatus = lead.previous_status || 'Interested';
  
  const { error: updateError } = await client
    .from('imann_positive_replies')
    .update({ 
      status: previousStatus,
      archived_at: null,
      previous_status: null
    })
    .eq('id', OPTIONS.recoverId);

  if (updateError) {
    console.log(`${c.red}❌ Failed to recover: ${updateError.message}${c.reset}\n`);
    return;
  }

  // Log restoration
  const archiveLog = loadArchiveLog();
  archiveLog.restorations.push({
    id: lead.id,
    name: lead.lead_name,
    restoredAt: new Date().toISOString(),
    restoredTo: previousStatus
  });
  saveArchiveLog(archiveLog);

  console.log(`${c.green}✓ Recovered:${c.reset} ${lead.lead_name} (${lead.lead_company})`);
  console.log(`${c.dim}  Status restored to: ${previousStatus}${c.reset}\n`);
}

// Show archive stats
async function showStats() {
  console.log(`\n${c.bold}📊 ARCHIVE STATISTICS${c.reset}\n`);

  const log = loadArchiveLog();
  
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}  History${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  console.log(`  Total Archived:    ${c.bold}${log.archived.length}${c.reset}`);
  console.log(`  Total Recovered:   ${c.bold}${log.restorations.length}${c.reset}`);
  if (log.lastRun) {
    console.log(`  Last Archive Run:  ${formatDate(log.lastRun)}`);
  }

  if (log.archived.length > 0) {
    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.bold}  Recent Archives${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

    const recent = log.archived.slice(-10).reverse();
    for (const item of recent) {
      console.log(`  ${c.dim}${formatDate(item.archivedAt)}${c.reset} ${item.name || 'Unknown'} (${item.company || 'N/A'})`);
      console.log(`    ${c.dim}ID: ${item.id} | Was: ${item.previousStatus} | Age: ${item.age}d${c.reset}`);
    }
  }

  if (log.restorations.length > 0) {
    console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.bold}  Recent Restorations${c.reset}`);
    console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

    const recent = log.restorations.slice(-5).reverse();
    for (const item of recent) {
      console.log(`  ${c.green}↩${c.reset} ${item.name} - restored ${formatDate(item.restoredAt)}`);
    }
  }

  console.log('');
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
