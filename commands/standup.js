#!/usr/bin/env node
/**
 * Quick Standup - One-line status
 * Even faster than morning routine.
 */

const { execSync } = require('child_process');
const path = require('path');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

async function main() {
  const stats = [];

  // Pipeline score
  try {
    const out = execSync('node pipeline-score.js --quick 2>/dev/null', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    const match = out.match(/(\d+)\/100/);
    if (match) {
      const score = parseInt(match[1]);
      const emoji = score >= 50 ? '🟢' : score >= 25 ? '🟡' : '🔴';
      stats.push(`Pipeline: ${emoji}${score}`);
    }
  } catch (e) {}

  // Hot leads
  try {
    const out = execSync('node heartbeat-check.js 2>/dev/null', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    const match = out.match(/(\d+)\s*hot/i);
    if (match) stats.push(`Hot: ${match[1]}`);
  } catch (e) {}

  // Pending critical
  try {
    const out = execSync('node pending-leads-monitor.js --summary 2>/dev/null', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    const match = out.match(/Critical[^:]*:\s*(\d+)/i);
    if (match && parseInt(match[1]) > 0) {
      stats.push(`${c.red}Critical: ${match[1]}${c.reset}`);
    }
  } catch (e) {}

  // Inbound score
  try {
    const out = execSync('node commands/inbound-score.js 2>/dev/null', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });
    const match = out.match(/(\d+)\/100/);
    if (match) {
      const score = parseInt(match[1]);
      const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
      stats.push(`Inbound: ${emoji}${score}`);
    }
  } catch (e) {}

  // Output
  console.log(`\n${c.bold}📊 STANDUP${c.reset} | ${stats.join(' | ')}`);
  console.log(`${c.dim}   Full routine: gex morning${c.reset}\n`);
}

main().catch(console.error);
