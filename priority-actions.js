#!/usr/bin/env node
/**
 * Priority Action Queue
 * Shows the top 5 most important actions right now
 * 
 * Commands:
 *   gex actions         - Show priority action queue
 *   gex todo            - Alias
 *   gex actions --do 1  - Execute action #1
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const args = process.argv.slice(2);
const DO_ACTION = args.find(a => a.startsWith('--do'))?.split('=')[1] || 
                  (args.includes('--do') ? args[args.indexOf('--do') + 1] : null);

async function getActions() {
  const actions = [];

  // 1. Check hot leads
  try {
    const hb = execSync('node heartbeat-check.js 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const immediateMatch = hb.match(/(\d+)\s*leads?\s*need\s*IMMEDIATE/i);
    const todayMatch = hb.match(/(\d+)\s*leads?\s*need\s*response\s*TODAY/i);
    
    const immediate = immediateMatch ? parseInt(immediateMatch[1]) : 0;
    const today = todayMatch ? parseInt(todayMatch[1]) : 0;
    
    if (immediate > 0) {
      actions.push({
        priority: 1,
        icon: '🔴',
        title: `Respond to ${immediate} IMMEDIATE leads`,
        impact: 'High - these leads are hot and will go cold',
        command: 'gex send --html',
        type: 'hot-leads'
      });
    } else if (today > 0) {
      actions.push({
        priority: 2,
        icon: '🟠',
        title: `Respond to ${today} leads needing response TODAY`,
        impact: 'Medium - don\'t let them go stale',
        command: 'gex send --html',
        type: 'hot-leads'
      });
    }
  } catch (e) {}

  // 2. Check domain health
  try {
    const domains = execSync('node domain-alerts.js 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const criticalMatch = domains.match(/Critical:\s*(\d+)/);
    const critical = criticalMatch ? parseInt(criticalMatch[1]) : 0;
    
    if (critical > 0) {
      actions.push({
        priority: 3,
        icon: '🏥',
        title: `Fix ${critical} domains with low reputation`,
        impact: 'High - affects email deliverability',
        command: 'gex domain-alerts --recover <domain>',
        type: 'domains'
      });
    }
  } catch (e) {}

  // 3. Check stale leads to archive
  try {
    const archive = execSync('node archive.js 2>/dev/null | head -20', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const staleMatch = archive.match(/Stale.*?:\s*(\d+)/);
    const stale = staleMatch ? parseInt(staleMatch[1]) : 0;
    
    if (stale > 20) {
      actions.push({
        priority: 4,
        icon: '🗑️',
        title: `Archive ${stale} stale leads (>60 days)`,
        impact: 'Medium - improves pipeline score',
        command: 'gex archive --execute --force',
        type: 'archive'
      });
    }
  } catch (e) {}

  // 4. Check meeting requests
  try {
    const book = execSync('node booking-assistant.js 2>/dev/null | head -10', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const meetingMatch = book.match(/(\d+)\s*meeting\s*requests?\s*pending/i);
    const meetings = meetingMatch ? parseInt(meetingMatch[1]) : 0;
    
    if (meetings > 10) {
      actions.push({
        priority: 5,
        icon: '📅',
        title: `Book ${meetings} pending meeting requests`,
        impact: 'High - these leads already want to meet',
        command: 'gex book',
        type: 'meetings'
      });
    }
  } catch (e) {}

  // 5. Check decay prevention
  try {
    const decay = execSync('node decay-prevention.js 2>/dev/null | head -15', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const criticalMatch = decay.match(/Critical.*?:\s*(\d+)/);
    const lostMatch = decay.match(/Lost.*?:\s*(\d+)/);
    const critical = criticalMatch ? parseInt(criticalMatch[1]) : 0;
    const lost = lostMatch ? parseInt(lostMatch[1]) : 0;
    
    if (critical + lost > 30) {
      actions.push({
        priority: 3,
        icon: '⏰',
        title: `Save ${critical + lost} leads from decay`,
        impact: 'High - these leads are about to be lost',
        command: 'gex prevent --critical',
        type: 'decay'
      });
    }
  } catch (e) {}

  // Sort by priority
  actions.sort((a, b) => a.priority - b.priority);

  return actions.slice(0, 5);
}

async function showActions() {
  const actions = await getActions();

  console.log(`\n${c.bold}╔${'═'.repeat(60)}╗${c.reset}`);
  console.log(`${c.bold}║  🎯 PRIORITY ACTION QUEUE                                  ║${c.reset}`);
  console.log(`${c.bold}╚${'═'.repeat(60)}╝${c.reset}\n`);

  if (actions.length === 0) {
    console.log(`${c.green}✅ No urgent actions needed. Pipeline is healthy.${c.reset}\n`);
    return;
  }

  console.log(`${c.cyan}TOP ${actions.length} ACTIONS (in priority order)${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(62)}${c.reset}\n`);

  actions.forEach((action, i) => {
    const num = i + 1;
    const priorityColor = action.priority <= 2 ? c.red : action.priority <= 4 ? c.yellow : c.cyan;
    
    console.log(`${c.bold}${num}. ${action.icon} ${action.title}${c.reset}`);
    console.log(`   ${c.dim}Impact: ${action.impact}${c.reset}`);
    console.log(`   ${priorityColor}→ ${action.command}${c.reset}`);
    console.log();
  });

  console.log(`${c.cyan}${'━'.repeat(62)}${c.reset}`);
  console.log(`${c.dim}Complete action #1 first for maximum impact${c.reset}\n`);
}

async function executeAction(num) {
  const actions = await getActions();
  const action = actions[parseInt(num) - 1];
  
  if (!action) {
    console.log(`${c.red}Invalid action number: ${num}${c.reset}`);
    return;
  }

  console.log(`\n${c.cyan}Executing: ${action.title}${c.reset}\n`);
  
  // For now, just show the command
  console.log(`${c.yellow}Run this command:${c.reset}`);
  console.log(`  ${c.bold}${action.command}${c.reset}\n`);
}

// Main
if (DO_ACTION) {
  executeAction(DO_ACTION);
} else {
  showActions().catch(err => {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
  });
}
