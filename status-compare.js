#!/usr/bin/env node
/**
 * Status Comparison Tool
 * Shows what changed since last check
 * 
 * Commands:
 *   gex compare        - Compare current vs last snapshot
 *   gex changes        - Alias
 *   gex diff           - Alias
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const SNAPSHOT_FILE = path.join(__dirname, 'data', 'status-snapshots.json');

function loadSnapshots() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    }
  } catch (e) {}
  return { snapshots: [] };
}

function saveSnapshot(snapshot) {
  const data = loadSnapshots();
  data.snapshots.push(snapshot);
  // Keep last 48 snapshots (24 hours at 30-min intervals)
  if (data.snapshots.length > 48) {
    data.snapshots = data.snapshots.slice(-48);
  }
  
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
}

async function getCurrentStatus() {
  const supabase = initSupabase();
  if (!supabase) return null;

  const status = {
    timestamp: new Date().toISOString(),
    hotLeads: 0,
    pendingLeads: 0,
    bookedLeads: 0,
    staleLeads: 0,
    pipelineValue: 0,
    domainsHealthy: 0,
    domainsCritical: 0
  };

  // Get lead counts
  try {
    const { data: leads } = await supabase
      .from('imann_positive_replies')
      .select('status, conversation_date');
    
    const now = Date.now();
    for (const lead of leads || []) {
      if (lead.status === 'Booked') {
        status.bookedLeads++;
      } else {
        status.pendingLeads++;
        const age = (now - new Date(lead.conversation_date).getTime()) / (1000 * 60 * 60 * 24);
        if (age < 3) status.hotLeads++;
        if (age > 14) status.staleLeads++;
      }
    }
  } catch (e) {}

  // Get domain health
  try {
    const { data: domains } = await supabase
      .from('domain_snapshots')
      .select('domain, reputation')
      .order('snapshot_date', { ascending: false })
      .limit(30);
    
    const latestByDomain = {};
    for (const d of domains || []) {
      if (!latestByDomain[d.domain]) {
        latestByDomain[d.domain] = d;
      }
    }
    
    for (const d of Object.values(latestByDomain)) {
      if (d.reputation >= 70) {
        status.domainsHealthy++;
      } else {
        status.domainsCritical++;
      }
    }
  } catch (e) {}

  // Get pipeline value
  try {
    const dealsPath = path.join(__dirname, 'data', 'deals.json');
    if (fs.existsSync(dealsPath)) {
      const deals = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      status.pipelineValue = deals.deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;
    }
  } catch (e) {}

  return status;
}

function formatChange(current, previous, label, inverse = false) {
  const diff = current - previous;
  if (diff === 0) return `${c.dim}${label}: ${current} (no change)${c.reset}`;
  
  const arrow = diff > 0 ? '↑' : '↓';
  const color = inverse ? (diff > 0 ? c.red : c.green) : (diff > 0 ? c.green : c.red);
  
  return `${label}: ${current} ${color}${arrow}${Math.abs(diff)}${c.reset}`;
}

async function compare() {
  console.log(`\n${c.bold}╔${'═'.repeat(55)}╗${c.reset}`);
  console.log(`${c.bold}║  📊 STATUS COMPARISON                               ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(55)}╝${c.reset}\n`);

  const current = await getCurrentStatus();
  if (!current) {
    console.log(`${c.red}Could not get current status${c.reset}`);
    return;
  }

  const data = loadSnapshots();
  const previous = data.snapshots[data.snapshots.length - 1];

  // Save current snapshot
  saveSnapshot(current);

  if (!previous) {
    console.log(`${c.cyan}CURRENT STATUS (first snapshot)${c.reset}`);
    console.log(`${c.cyan}${'━'.repeat(55)}${c.reset}`);
    console.log(`  Hot leads:       ${current.hotLeads}`);
    console.log(`  Pending leads:   ${current.pendingLeads}`);
    console.log(`  Booked leads:    ${current.bookedLeads}`);
    console.log(`  Stale leads:     ${current.staleLeads}`);
    console.log(`  Domains healthy: ${current.domainsHealthy}`);
    console.log(`  Domains critical: ${current.domainsCritical}`);
    console.log(`  Pipeline value:  $${current.pipelineValue.toLocaleString()}`);
    console.log(`\n${c.dim}Run again later to see changes${c.reset}\n`);
    return;
  }

  // Calculate time since last snapshot
  const lastTime = new Date(previous.timestamp);
  const hoursSince = Math.round((Date.now() - lastTime.getTime()) / (1000 * 60 * 60) * 10) / 10;

  console.log(`${c.cyan}CHANGES SINCE ${lastTime.toLocaleString()} (${hoursSince}h ago)${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(55)}${c.reset}`);

  console.log(`  ${formatChange(current.hotLeads, previous.hotLeads, 'Hot leads')}`);
  console.log(`  ${formatChange(current.pendingLeads, previous.pendingLeads, 'Pending leads')}`);
  console.log(`  ${formatChange(current.bookedLeads, previous.bookedLeads, 'Booked leads')}`);
  console.log(`  ${formatChange(current.staleLeads, previous.staleLeads, 'Stale leads', true)}`);
  console.log(`  ${formatChange(current.domainsHealthy, previous.domainsHealthy, 'Domains healthy')}`);
  console.log(`  ${formatChange(current.domainsCritical, previous.domainsCritical, 'Domains critical', true)}`);
  
  const pipelineDiff = current.pipelineValue - previous.pipelineValue;
  if (pipelineDiff !== 0) {
    const sign = pipelineDiff > 0 ? '+' : '';
    const color = pipelineDiff > 0 ? c.green : c.red;
    console.log(`  Pipeline value:  $${current.pipelineValue.toLocaleString()} ${color}(${sign}$${pipelineDiff.toLocaleString()})${c.reset}`);
  } else {
    console.log(`  ${c.dim}Pipeline value:  $${current.pipelineValue.toLocaleString()} (no change)${c.reset}`);
  }

  // Summary
  console.log();
  const totalChanges = Math.abs(current.hotLeads - previous.hotLeads) +
                       Math.abs(current.pendingLeads - previous.pendingLeads) +
                       Math.abs(current.bookedLeads - previous.bookedLeads);
  
  if (totalChanges === 0) {
    console.log(`${c.yellow}⚠️ No lead activity in the last ${hoursSince} hours${c.reset}`);
  } else if (current.bookedLeads > previous.bookedLeads) {
    console.log(`${c.green}✅ ${current.bookedLeads - previous.bookedLeads} new booking(s)!${c.reset}`);
  }
  
  console.log();
}

compare().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
