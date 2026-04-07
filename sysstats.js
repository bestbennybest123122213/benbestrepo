#!/usr/bin/env node
/**
 * System Statistics - Quick overview of system metrics
 * 
 * Usage:
 *   node sysstats.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function main() {
  const baseDir = __dirname;
  const rootDir = path.join(baseDir, '..');
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📊 SYSTEM STATISTICS                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // GEX stats
  const jsFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.js')).length;
  const jsonFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.json')).length;
  const mdFiles = fs.readdirSync(baseDir).filter(f => f.endsWith('.md')).length;
  
  // Count commands
  let cmdCount = 0;
  try {
    const gexContent = fs.readFileSync(path.join(baseDir, 'gex.js'), 'utf8');
    const match = gexContent.match(/const commands = \{([^}]+)\}/s);
    if (match) {
      cmdCount = match[1].split('\n').filter(l => l.includes(':')).length;
    }
  } catch {}
  
  console.log(`  📁 GEX Dashboard`);
  console.log(`     Commands:   ${cmdCount}`);
  console.log(`     JS files:   ${jsFiles}`);
  console.log(`     JSON files: ${jsonFiles}`);
  console.log(`     MD files:   ${mdFiles}`);
  console.log('');
  
  // Mission Control stats
  const mcDir = path.join(rootDir, 'mission-control');
  let taskCount = 0;
  let activityCount = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(mcDir, 'data.json'), 'utf8'));
    Object.values(data.columns).forEach(col => { taskCount += col.length; });
    activityCount = data.activity?.length || 0;
  } catch {}
  
  console.log(`  📋 Mission Control`);
  console.log(`     Tasks:      ${taskCount}`);
  console.log(`     Activities: ${activityCount}`);
  console.log('');
  
  // Memory stats
  const memDir = path.join(rootDir, 'memory');
  let memFiles = 0;
  let memSize = 0;
  try {
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
    memFiles = files.length;
    files.forEach(f => {
      memSize += fs.statSync(path.join(memDir, f)).size;
    });
  } catch {}
  
  console.log(`  🧠 Memory`);
  console.log(`     Files:      ${memFiles}`);
  console.log(`     Size:       ${(memSize / 1024).toFixed(1)} KB`);
  console.log('');
  
  // Git stats
  let commits = 0;
  let branch = '';
  try {
    commits = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir, encoding: 'utf8' }));
    branch = execSync('git branch --show-current', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {}
  
  console.log(`  📁 Git Repository`);
  console.log(`     Branch:     ${branch}`);
  console.log(`     Commits:    ${commits}`);
  console.log('');
  
  // Uptime-like summary
  const now = new Date();
  console.log(`  ⏰ ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
  console.log('');
}

main();
