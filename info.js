#!/usr/bin/env node
/**
 * System Info - Comprehensive system information
 * 
 * Shows detailed information about the GEX installation including
 * commands, scripts, database status, and configuration.
 * 
 * Usage:
 *   node info.js           # Full info
 *   node info.js commands  # Just commands
 *   node info.js files     # Just file stats
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const args = process.argv.slice(2);
const SECTION = args[0];

function main() {
  const baseDir = __dirname;
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ℹ️  GEX SYSTEM INFORMATION                                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (!SECTION || SECTION === 'all') {
    showGeneral(baseDir);
    showCommands(baseDir);
    showFiles(baseDir);
    showConfig();
  } else if (SECTION === 'commands') {
    showCommands(baseDir);
  } else if (SECTION === 'files') {
    showFiles(baseDir);
  } else if (SECTION === 'config') {
    showConfig();
  }
}

function showGeneral(baseDir) {
  const pkg = require(path.join(baseDir, 'package.json'));
  
  console.log('📋 GENERAL');
  console.log('═══════════');
  console.log(`  Name:     ${pkg.name || 'gex-cli'}`);
  console.log(`  Version:  ${pkg.version || '1.0.0'}`);
  console.log(`  Node:     ${process.version}`);
  console.log(`  Platform: ${process.platform} (${process.arch})`);
  console.log(`  Path:     ${baseDir}`);
  console.log('');
}

function showCommands(baseDir) {
  // Read gex.js and extract commands
  const gexContent = fs.readFileSync(path.join(baseDir, 'gex.js'), 'utf8');
  const commandMatch = gexContent.match(/const commands = \{([^}]+)\}/s);
  
  if (!commandMatch) {
    console.log('  Could not parse commands');
    return;
  }
  
  const lines = commandMatch[1].split('\n').filter(l => l.includes(':'));
  const commands = {};
  const categories = {
    'Daily': 0,
    'Lead': 0,
    'Analytics': 0,
    'Data': 0,
    'Alert': 0,
    'Infrastructure': 0,
    'Other': 0
  };
  
  lines.forEach(line => {
    const match = line.match(/^\s*(\w+):\s*'\.\/([^']+)'/);
    if (match) {
      const [_, name, script] = match;
      commands[name] = script;
      
      // Categorize
      if (script.match(/daily|morning|routine|status|pulse|brief|digest|today/)) {
        categories['Daily']++;
      } else if (script.match(/lead|meeting|closer|draft|email|followup|rank/)) {
        categories['Lead']++;
      } else if (script.match(/tracker|goal|funnel|performance|conversion|velocity/)) {
        categories['Analytics']++;
      } else if (script.match(/export|backup|cleanup|sync|enrich/)) {
        categories['Data']++;
      } else if (script.match(/alert|notify|telegram|prevent|stale/)) {
        categories['Alert']++;
      } else if (script.match(/health|server|webhook|api|cron/)) {
        categories['Infrastructure']++;
      } else {
        categories['Other']++;
      }
    }
  });
  
  console.log('🎮 COMMANDS');
  console.log('═══════════');
  console.log(`  Total registered: ${Object.keys(commands).length}`);
  console.log('');
  console.log('  By category:');
  Object.entries(categories)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`    ${cat.padEnd(15)} ${count}`);
    });
  console.log('');
  
  // Check which scripts actually exist
  const existing = Object.values(commands)
    .filter(script => fs.existsSync(path.join(baseDir, script)))
    .length;
  const missing = Object.keys(commands).length - existing;
  
  console.log(`  Scripts found:    ${existing}`);
  if (missing > 0) {
    console.log(`  Scripts missing:  ${missing}`);
  }
  console.log('');
}

function showFiles(baseDir) {
  const jsFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.js'));
  const jsonFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.json'));
  const mdFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.md'));
  
  console.log('📁 FILES');
  console.log('═════════');
  console.log(`  JavaScript: ${jsFiles.length}`);
  console.log(`  JSON:       ${jsonFiles.length}`);
  console.log(`  Markdown:   ${mdFiles.length}`);
  console.log('');
  
  // Check directories
  const dirs = ['lib', 'public', 'data', 'logs', 'backups', 'exports', 'reports'];
  console.log('  Directories:');
  dirs.forEach(dir => {
    const exists = fs.existsSync(path.join(baseDir, dir));
    const icon = exists ? '✓' : '✗';
    if (exists) {
      const files = fs.readdirSync(path.join(baseDir, dir)).length;
      console.log(`    ${icon} ${dir}/ (${files} items)`);
    } else {
      console.log(`    ${icon} ${dir}/ (missing)`);
    }
  });
  console.log('');
}

function showConfig() {
  console.log('⚙️  CONFIGURATION');
  console.log('═══════════════════');
  
  const vars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SMARTLEAD_API_KEY', 'TELEGRAM_BOT_TOKEN'];
  vars.forEach(v => {
    const value = process.env[v];
    const status = value ? '✓ Set' : '✗ Not set';
    const preview = value ? ` (${value.substring(0, 20)}...)` : '';
    console.log(`  ${v}: ${status}`);
  });
  console.log('');
}

main();
