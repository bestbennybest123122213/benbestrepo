#!/usr/bin/env node
/**
 * Overnight Work Report Generator
 * 
 * Creates a summary of what was built/fixed overnight for Jan's morning.
 * Designed to lead with accomplishments, not status updates.
 * 
 * Usage:
 *   node overnight-report.js           # Generate full report
 *   node overnight-report.js --telegram # Telegram format
 *   node overnight-report.js --save    # Save to file
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const TELEGRAM = args.includes('--telegram');
const SAVE = args.includes('--save');

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

// Get git commits from overnight (22:00 to 09:00)
function getOvernightCommits() {
  try {
    const since = new Date();
    since.setHours(22, 0, 0, 0);
    if (since > new Date()) {
      since.setDate(since.getDate() - 1);
    }
    
    const until = new Date();
    until.setHours(9, 0, 0, 0);
    if (until < new Date()) {
      // We're after 9 AM, so look at last night to this morning
      since.setDate(since.getDate() - 1);
    } else {
      // We're before 9 AM, so look at last night to now
      until.setTime(Date.now());
    }
    
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();
    
    const cmd = `git log --since="${sinceStr}" --until="${untilStr}" --oneline --no-merges 2>/dev/null || echo ""`;
    const output = execSync(cmd, { cwd: __dirname, encoding: 'utf8' });
    
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split(' ');
      return { hash, message: msgParts.join(' ') };
    });
  } catch (e) {
    return [];
  }
}

// Get new files from overnight
function getNewFiles() {
  try {
    const since = new Date();
    since.setHours(22, 0, 0, 0);
    if (since > new Date()) {
      since.setDate(since.getDate() - 1);
    }
    
    const cmd = `git log --since="${since.toISOString()}" --diff-filter=A --name-only --pretty=format: 2>/dev/null || echo ""`;
    const output = execSync(cmd, { cwd: __dirname, encoding: 'utf8' });
    
    return output.trim().split('\n').filter(f => f && f.endsWith('.js'));
  } catch (e) {
    return [];
  }
}

// Get lines of code added overnight
function getLinesAdded() {
  try {
    const since = new Date();
    since.setHours(22, 0, 0, 0);
    if (since > new Date()) {
      since.setDate(since.getDate() - 1);
    }
    
    const cmd = `git log --since="${since.toISOString()}" --oneline --shortstat 2>/dev/null || echo ""`;
    const output = execSync(cmd, { cwd: __dirname, encoding: 'utf8' });
    
    let insertions = 0;
    let deletions = 0;
    
    const matches = output.matchAll(/(\d+) insertions?\(\+\)/g);
    for (const match of matches) {
      insertions += parseInt(match[1]);
    }
    
    const delMatches = output.matchAll(/(\d+) deletions?\(-\)/g);
    for (const match of delMatches) {
      deletions += parseInt(match[1]);
    }
    
    return { insertions, deletions, net: insertions - deletions };
  } catch (e) {
    return { insertions: 0, deletions: 0, net: 0 };
  }
}

// Parse commits to extract features
function extractFeatures(commits) {
  const features = [];
  
  for (const commit of commits) {
    const msg = commit.message.toLowerCase();
    
    // Detect feature types
    if (msg.includes('feat:') || msg.includes('add')) {
      let feature = commit.message.replace(/^feat:\s*/i, '').replace(/^add\s*/i, '');
      features.push({ type: 'new', description: feature });
    } else if (msg.includes('fix:') || msg.includes('fix')) {
      let fix = commit.message.replace(/^fix:\s*/i, '');
      features.push({ type: 'fix', description: fix });
    } else if (msg.includes('improve') || msg.includes('enhance') || msg.includes('update')) {
      features.push({ type: 'improve', description: commit.message });
    }
  }
  
  return features;
}

// Read today's memory file for work done
function readTodayMemory() {
  const today = new Date().toISOString().split('T')[0];
  const memoryPath = path.join(__dirname, '..', 'memory', `${today}.md`);
  
  try {
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf8');
      
      // Extract completed items
      const completed = [];
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.includes('COMPLETE') || (line.includes('✅') && line.includes('Built:'))) {
          const match = line.match(/\*\*(.+?)\*\*/);
          if (match) completed.push(match[1]);
        }
      }
      
      // Extract running total
      let linesOfCode = 0;
      const locMatch = content.match(/Total:\s*~?([\d,]+)\s*lines/);
      if (locMatch) {
        linesOfCode = parseInt(locMatch[1].replace(/,/g, ''));
      }
      
      return { completed, linesOfCode };
    }
  } catch (e) {
    // ignore
  }
  
  return { completed: [], linesOfCode: 0 };
}

async function generateReport() {
  const commits = getOvernightCommits();
  const newFiles = getNewFiles();
  const linesStats = getLinesAdded();
  const features = extractFeatures(commits);
  const memoryData = readTodayMemory();
  
  // Get pipeline data
  const client = initSupabase();
  let pipelineStats = null;
  
  if (client) {
    const { data: leads } = await client
      .from('imann_positive_replies')
      .select('status, conversation_date')
      .neq('status', 'Archived');
    
    if (leads) {
      const now = new Date();
      const daysSince = (d) => Math.floor((now - new Date(d)) / (1000 * 60 * 60 * 24));
      
      pipelineStats = {
        total: leads.length,
        hot: leads.filter(l => daysSince(l.conversation_date) <= 3).length,
        stale: leads.filter(l => daysSince(l.conversation_date) > 60).length,
        booked: leads.filter(l => l.status === 'Booked').length
      };
    }
  }
  
  // Generate report
  if (TELEGRAM) {
    return generateTelegramReport(commits, newFiles, linesStats, features, memoryData, pipelineStats);
  } else {
    return generateTerminalReport(commits, newFiles, linesStats, features, memoryData, pipelineStats);
  }
}

function generateTerminalReport(commits, newFiles, linesStats, features, memoryData, pipelineStats) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  let report = '';
  
  report += `\n${c.bold}╔═══════════════════════════════════════════════════════════════════════════╗${c.reset}\n`;
  report += `${c.bold}║  🌙 OVERNIGHT WORK REPORT                                                  ║${c.reset}\n`;
  report += `${c.bold}║  ${dateStr.padEnd(70)}║${c.reset}\n`;
  report += `${c.bold}╚═══════════════════════════════════════════════════════════════════════════╝${c.reset}\n`;
  
  // Lead with what was built
  if (memoryData.completed.length > 0 || features.filter(f => f.type === 'new').length > 0) {
    report += `\n${c.cyan}HERE'S WHAT I BUILT OVERNIGHT:${c.reset}\n`;
    report += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
    
    // From memory file
    for (const item of memoryData.completed) {
      report += `   ${c.green}✓${c.reset} ${item}\n`;
    }
    
    // From commits
    for (const feature of features.filter(f => f.type === 'new')) {
      if (!memoryData.completed.some(c => feature.description.toLowerCase().includes(c.toLowerCase()))) {
        report += `   ${c.green}✓${c.reset} ${feature.description}\n`;
      }
    }
    
    report += '\n';
  }
  
  // Stats
  report += `${c.cyan}BUILD STATS:${c.reset}\n`;
  report += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  
  const lines = memoryData.linesOfCode || linesStats.net;
  if (lines > 0) {
    report += `   ${c.bold}${lines.toLocaleString()}${c.reset} lines of code written\n`;
  }
  if (commits.length > 0) {
    report += `   ${c.bold}${commits.length}${c.reset} commits made\n`;
  }
  if (newFiles.length > 0) {
    report += `   ${c.bold}${newFiles.length}${c.reset} new files created\n`;
  }
  report += '\n';
  
  // Fixes/improvements
  const fixes = features.filter(f => f.type === 'fix' || f.type === 'improve');
  if (fixes.length > 0) {
    report += `${c.cyan}FIXES & IMPROVEMENTS:${c.reset}\n`;
    report += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
    for (const fix of fixes.slice(0, 5)) {
      const icon = fix.type === 'fix' ? '🔧' : '📈';
      report += `   ${icon} ${fix.description}\n`;
    }
    report += '\n';
  }
  
  // Pipeline snapshot
  if (pipelineStats) {
    report += `${c.cyan}PIPELINE SNAPSHOT:${c.reset}\n`;
    report += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
    report += `   Active leads: ${c.bold}${pipelineStats.total}${c.reset}\n`;
    report += `   Hot (< 3 days): ${pipelineStats.hot > 0 ? c.green : c.yellow}${pipelineStats.hot}${c.reset}\n`;
    report += `   Stale (> 60 days): ${pipelineStats.stale > 0 ? c.red : c.green}${pipelineStats.stale}${c.reset}\n`;
    report += `   Booked: ${c.green}${pipelineStats.booked}${c.reset}\n`;
    report += '\n';
  }
  
  // Ready for action
  report += `${c.cyan}READY FOR YOU:${c.reset}\n`;
  report += `${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  report += `   ${c.dim}gex briefing${c.reset}     Full morning briefing\n`;
  report += `   ${c.dim}gex queue${c.reset}        Ready-to-send emails\n`;
  report += `   ${c.dim}gex goals${c.reset}        Weekly goal progress\n`;
  report += `   ${c.dim}gex pscore${c.reset}       Pipeline health score\n`;
  report += '\n';
  
  report += `${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`;
  report += `${c.dim}Generated: ${timeStr}${c.reset}\n`;
  
  return report;
}

function generateTelegramReport(commits, newFiles, linesStats, features, memoryData, pipelineStats) {
  let msg = '🌙 *OVERNIGHT WORK REPORT*\n\n';
  
  // What was built
  if (memoryData.completed.length > 0) {
    msg += '*HERE\'S WHAT I BUILT:*\n';
    for (const item of memoryData.completed) {
      msg += `✅ ${item}\n`;
    }
    msg += '\n';
  }
  
  // Stats
  const lines = memoryData.linesOfCode || linesStats.net;
  if (lines > 0 || commits.length > 0) {
    msg += '*BUILD STATS:*\n';
    if (lines > 0) msg += `📝 ${lines.toLocaleString()} lines of code\n`;
    if (commits.length > 0) msg += `💾 ${commits.length} commits\n`;
    msg += '\n';
  }
  
  // Pipeline
  if (pipelineStats) {
    msg += '*PIPELINE:*\n';
    msg += `📊 ${pipelineStats.total} active | ${pipelineStats.hot} hot | ${pipelineStats.stale} stale\n\n`;
  }
  
  msg += '👉 Run `gex briefing` for full details';
  
  return msg;
}

async function main() {
  const report = await generateReport();
  console.log(report);
  
  if (SAVE) {
    const today = new Date().toISOString().split('T')[0];
    const filepath = path.join(__dirname, 'reports', `overnight-${today}.txt`);
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    // Strip ANSI codes for file
    const plain = report.replace(/\x1b\[[0-9;]*m/g, '');
    fs.writeFileSync(filepath, plain);
    console.log(`\n${c.dim}Saved to: ${filepath}${c.reset}`);
  }
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
