#!/usr/bin/env node
/**
 * Pipeline Diff
 * 
 * Compares current pipeline state with a previous snapshot.
 * Useful for tracking changes over time.
 * 
 * Usage:
 *   node pipeline-diff.js snapshot     # Save current state
 *   node pipeline-diff.js compare      # Compare with last snapshot
 *   node pipeline-diff.js list         # List saved snapshots
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ACTION = args[0] || 'compare';
const SNAPSHOTS_DIR = path.join(__dirname, 'snapshots');

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Ensure snapshots dir exists
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR);
  }

  switch (ACTION) {
    case 'snapshot':
      await saveSnapshot(client);
      break;
    case 'list':
      listSnapshots();
      break;
    default:
      await compare(client);
  }
}

async function saveSnapshot(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  const snapshot = {
    date: new Date().toISOString(),
    total: leads.length,
    booked: leads.filter(l => l.reply_category === 'Booked').length,
    meetings: leads.filter(l => l.reply_category === 'Meeting Request').length,
    interested: leads.filter(l => l.reply_category === 'Interested').length,
    leads: leads.map(l => ({
      id: l.id,
      email: l.lead_email,
      category: l.reply_category,
      company: l.lead_company
    }))
  };

  const filename = `snapshot-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));

  console.log(`✅ Snapshot saved: ${filename}`);
  console.log(`   Total: ${snapshot.total} leads`);
  console.log(`   Booked: ${snapshot.booked}`);
  console.log(`   Meetings: ${snapshot.meetings}`);
}

function listSnapshots() {
  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📸 SAVED SNAPSHOTS                                                      ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (files.length === 0) {
    console.log('  No snapshots yet. Run: node pipeline-diff.js snapshot\n');
    return;
  }

  files.slice(0, 10).forEach(f => {
    const data = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f)));
    const date = new Date(data.date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    console.log(`  📸 ${f}`);
    console.log(`     ${date} | ${data.total} leads | ${data.booked} booked`);
    console.log('');
  });

  console.log(`  Total snapshots: ${files.length}`);
  console.log('');
}

async function compare(client) {
  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  // Find most recent snapshot
  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log('❌ No snapshots to compare. Run: node pipeline-diff.js snapshot\n');
    return;
  }

  const latestFile = files[0];
  const snapshot = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, latestFile)));

  const current = {
    total: leads.length,
    booked: leads.filter(l => l.reply_category === 'Booked').length,
    meetings: leads.filter(l => l.reply_category === 'Meeting Request').length,
    interested: leads.filter(l => l.reply_category === 'Interested').length,
    emails: new Set(leads.map(l => l.lead_email))
  };

  const snapshotEmails = new Set(snapshot.leads.map(l => l.email));

  // Find new leads
  const newLeads = leads.filter(l => !snapshotEmails.has(l.lead_email));
  
  // Find status changes
  const statusChanges = [];
  leads.forEach(l => {
    const oldLead = snapshot.leads.find(s => s.email === l.lead_email);
    if (oldLead && oldLead.category !== l.reply_category) {
      statusChanges.push({
        name: l.lead_name,
        email: l.lead_email,
        from: oldLead.category,
        to: l.reply_category
      });
    }
  });

  const snapshotDate = new Date(snapshot.date).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit' 
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 PIPELINE DIFF                                                        ║
║  Comparing to: ${snapshotDate}                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const diff = (curr, prev) => {
    const d = curr - prev;
    return d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0';
  };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 METRICS CHANGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Metric          | Previous | Current | Change`);
  console.log(`  ────────────────┼──────────┼─────────┼────────`);
  console.log(`  Total leads     | ${snapshot.total.toString().padStart(8)} | ${current.total.toString().padStart(7)} | ${diff(current.total, snapshot.total)}`);
  console.log(`  Booked          | ${snapshot.booked.toString().padStart(8)} | ${current.booked.toString().padStart(7)} | ${diff(current.booked, snapshot.booked)}`);
  console.log(`  Meetings        | ${snapshot.meetings.toString().padStart(8)} | ${current.meetings.toString().padStart(7)} | ${diff(current.meetings, snapshot.meetings)}`);
  console.log(`  Interested      | ${snapshot.interested.toString().padStart(8)} | ${current.interested.toString().padStart(7)} | ${diff(current.interested, snapshot.interested)}`);
  console.log('');

  if (newLeads.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🆕 NEW LEADS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    newLeads.slice(0, 10).forEach(l => {
      console.log(`  ✨ ${l.lead_name} @ ${l.lead_company || 'Unknown'}`);
      console.log(`     ${l.lead_email} | ${l.reply_category}`);
    });
    if (newLeads.length > 10) {
      console.log(`  ... and ${newLeads.length - 10} more`);
    }
    console.log('');
  }

  if (statusChanges.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 STATUS CHANGES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    statusChanges.forEach(c => {
      const emoji = c.to === 'Booked' ? '🎉' : '📊';
      console.log(`  ${emoji} ${c.name}`);
      console.log(`     ${c.from} → ${c.to}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Save new snapshot: node pipeline-diff.js snapshot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
