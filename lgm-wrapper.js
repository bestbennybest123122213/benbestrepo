#!/usr/bin/env node
/**
 * LGM Wrapper for GEX CLI
 * Routes commands to the Lead Generation Manager
 */

const { spawn } = require('child_process');
const path = require('path');

const lgmPath = path.join(__dirname, '..', 'lead-gen-manager', 'lgm.js');
const args = process.argv.slice(2);

// If no args, show help
if (args.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  🔍 LEAD GENERATION MANAGER                                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  COMMANDS                                                                    ║
║  ─────────────────────────────────────────────────────────────────────────   ║
║  lgm status              System overview                                     ║
║  lgm research --csv=X    Import & qualify leads from CSV                     ║
║  lgm sessions            View research history                               ║
║  lgm top [N]             Show top N leads (default 20)                       ║
║  lgm search <query>      Search qualified leads                              ║
║  lgm learn               AI recommendations                                  ║
║  lgm report              Weekly report + CSV export                          ║
║  lgm angles              List research angles                                ║
║  lgm dashboard           Regenerate dashboard data                           ║
║  lgm dedup               Check deduplication database                        ║
║                                                                              ║
║  QUICK ACCESS                                                                ║
║  ─────────────────────────────────────────────────────────────────────────   ║
║  leads                   Same as 'lgm status'                                ║
║  leads top               Same as 'lgm top 10'                                ║
║  leads find <query>      Same as 'lgm search <query>'                        ║
║                                                                              ║
║  Dashboard: ~/clawd/lead-gen-manager/dashboard.html                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Run lgm.js with the provided args
const child = spawn('node', [lgmPath, ...args], {
  stdio: 'inherit',
  cwd: path.dirname(lgmPath)
});

child.on('error', (err) => {
  console.error('Error running LGM:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
