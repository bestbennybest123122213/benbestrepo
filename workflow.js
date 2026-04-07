#!/usr/bin/env node
/**
 * Workflow Guide - Step-by-step guides for common workflows
 * 
 * Usage:
 *   node workflow.js          # List all workflows
 *   node workflow.js morning  # Morning workflow
 *   node workflow.js new-lead # New lead workflow
 */

const workflows = {
  morning: {
    name: 'Morning Routine',
    icon: '☀️',
    steps: [
      { cmd: 'node gex.js start', desc: 'Get overview' },
      { cmd: 'node gex.js inbox', desc: 'Check priority inbox' },
      { cmd: 'node gex.js nba', desc: 'Get next best action' },
      { cmd: 'node gex.js mc', desc: 'Check Mission Control' }
    ]
  },
  newlead: {
    name: 'Handle New Lead',
    icon: '🔥',
    steps: [
      { cmd: 'node gex.js fast', desc: 'Check hot leads' },
      { cmd: 'node gex.js prep <email>', desc: 'Prepare for meeting' },
      { cmd: 'node gex.js drafts 1', desc: 'Generate response' },
      { cmd: 'node gex.js mark <email> contacted', desc: 'Mark as contacted' }
    ]
  },
  weekly: {
    name: 'Weekly Review',
    icon: '📊',
    steps: [
      { cmd: 'node gex.js weekly', desc: 'Weekly performance' },
      { cmd: 'node gex.js bulk stats', desc: 'Pipeline temperature' },
      { cmd: 'node gex.js reengage', desc: 'Re-engage stale leads' },
      { cmd: 'node gex.js goals', desc: 'Check goal progress' }
    ]
  },
  cleanup: {
    name: 'Data Cleanup',
    icon: '🧹',
    steps: [
      { cmd: 'node gex.js validate', desc: 'Check system health' },
      { cmd: 'node gex.js bulk list-stale', desc: 'Find stale leads' },
      { cmd: 'node gex.js dupes', desc: 'Find duplicates' },
      { cmd: './backup.sh', desc: 'Create backup' },
      { cmd: './clean.sh --force', desc: 'Clean temp files' }
    ]
  },
  endofday: {
    name: 'End of Day',
    icon: '🌙',
    steps: [
      { cmd: 'node gex.js recent', desc: 'Review today\'s activity' },
      { cmd: 'node gex.js mc log "done for today"', desc: 'Log activity' },
      { cmd: './backup.sh', desc: 'Create backup' }
    ]
  }
};

const args = process.argv.slice(2);
const WORKFLOW = args[0];

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📋 GEX WORKFLOW GUIDES                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

if (!WORKFLOW) {
  console.log('  Available workflows:\n');
  Object.entries(workflows).forEach(([key, wf]) => {
    console.log(`    ${wf.icon} ${key.padEnd(12)} - ${wf.name}`);
  });
  console.log('\n  Usage: node workflow.js <workflow-name>\n');
} else {
  const wf = workflows[WORKFLOW.toLowerCase().replace('-', '')];
  if (!wf) {
    console.log(`  ❌ Unknown workflow: ${WORKFLOW}`);
    console.log('  Run without arguments to see available workflows.');
    process.exit(1);
  }
  
  console.log(`  ${wf.icon} ${wf.name.toUpperCase()}`);
  console.log('  ' + '═'.repeat(50));
  console.log('');
  
  wf.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.desc}`);
    console.log(`     $ ${step.cmd}`);
    console.log('');
  });
  
  console.log('  ─────────────────────────────────────────────────');
  console.log('  💡 Copy and run these commands in order');
  console.log('');
}
