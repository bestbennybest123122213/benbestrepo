#!/usr/bin/env node
/**
 * One-Click Morning Routine
 * Opens everything Jan needs to start his day
 * 
 * Commands:
 *   gex morning       - Full morning routine (briefing + open browser)
 *   gex morning --quick  - Just show priorities
 *   gex morning --open   - Open Quick Send in browser
 */

const { execSync, spawn } = require('child_process');
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

const args = process.argv.slice(2);
const QUICK = args.includes('--quick') || args.includes('-q');
const OPEN = args.includes('--open') || args.includes('-o');
const HELP = args.includes('--help') || args.includes('-h');

if (HELP) {
  console.log(`
${c.bold}Morning Routine${c.reset} - Start your day right

Usage: gex morning [options]

Options:
  --quick, -q   Just show priorities (no browser)
  --open, -o    Open Quick Send in browser
  --help, -h    Show this help

What it does:
  1. Shows pipeline score
  2. Shows hot leads count
  3. Shows today's priorities
  4. Opens Quick Send HTML in browser (optional)
`);
  process.exit(0);
}

async function runMorningRoutine() {
  console.log(`\n${c.bold}${c.cyan}☀️ GOOD MORNING - Starting your routine${c.reset}\n`);

  // 1. Pipeline Score
  try {
    console.log(`${c.cyan}1. Checking pipeline health...${c.reset}`);
    const score = execSync('node pipeline-score.js --quick 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    console.log(`   ${score}\n`);
  } catch (e) {
    console.log(`   ${c.dim}Could not get pipeline score${c.reset}\n`);
  }

  // 2. Hot Leads
  try {
    console.log(`${c.cyan}2. Checking hot leads...${c.reset}`);
    const hb = execSync('node heartbeat-check.js 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    console.log(`   ${hb}\n`);
  } catch (e) {
    console.log(`   ${c.dim}Could not check hot leads${c.reset}\n`);
  }

  // 3. Domain Health
  try {
    console.log(`${c.cyan}3. Checking domain health...${c.reset}`);
    const domains = execSync('node domain-alerts.js 2>/dev/null | head -20', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const criticalMatch = domains.match(/Critical:\s*(\d+)/);
    const criticalCount = criticalMatch ? criticalMatch[1] : '0';
    if (parseInt(criticalCount) > 0) {
      console.log(`   ${c.red}⚠️ ${criticalCount} domains below 70%${c.reset}\n`);
    } else {
      console.log(`   ${c.green}✓ All domains healthy${c.reset}\n`);
    }
  } catch (e) {
    console.log(`   ${c.dim}Could not check domains${c.reset}\n`);
  }

  // 3b. Account Health
  try {
    console.log(`${c.cyan}3b. Checking account health...${c.reset}`);
    const accounts = execSync('node account-optimizer.js --telegram 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const pauseMatch = accounts.match(/Pause needed:\s*(\d+)/);
    const pauseCount = pauseMatch ? parseInt(pauseMatch[1]) : 0;
    
    if (pauseCount > 20) {
      console.log(`   ${c.red}⚠️ ${pauseCount} accounts need pausing (0 replies)${c.reset}`);
      console.log(`   ${c.dim}   Run: gex accounts --action${c.reset}\n`);
    } else if (pauseCount > 0) {
      console.log(`   ${c.yellow}⚠️ ${pauseCount} accounts with 0 replies${c.reset}\n`);
    } else {
      console.log(`   ${c.green}✓ All accounts performing${c.reset}\n`);
    }
  } catch (e) {
    console.log(`   ${c.dim}Could not check accounts${c.reset}\n`);
  }

  // 4. Quick Send Status
  try {
    console.log(`${c.cyan}4. Checking ready emails...${c.reset}`);
    const send = execSync('node quick-send.js 2>/dev/null | head -10', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, '');
    
    const pendingMatch = send.match(/Pending:\s*(\d+)/);
    const hotMatch = send.match(/(\d+)\s*HOT/);
    const pending = pendingMatch ? pendingMatch[1] : '?';
    const hot = hotMatch ? hotMatch[1] : '0';
    
    console.log(`   📧 ${pending} emails ready (${hot} hot leads)\n`);
  } catch (e) {
    console.log(`   ${c.dim}Could not check emails${c.reset}\n`);
  }

  // 5. PENDING LEADS CHECK (new)
  try {
    console.log(`${c.cyan}5. Checking pending follow-ups...${c.reset}`);
    const pending = execSync('node pending-leads-monitor.js --summary 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    }).trim().replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI codes
    
    // Parse the summary output (format: "🔴 Critical (14+ days): 166")
    const criticalMatch = pending.match(/Critical[^:]*:\s*(\d+)/i);
    const urgentMatch = pending.match(/Urgent[^:]*:\s*(\d+)/i);
    const totalMatch = pending.match(/Total pending:\s*(\d+)/i);
    
    const critical = criticalMatch ? parseInt(criticalMatch[1]) : 0;
    const urgent = urgentMatch ? parseInt(urgentMatch[1]) : 0;
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;
    
    if (critical > 10) {
      console.log(`   ${c.red}🚨 ${critical} leads said YES but no follow-up (14+ days)${c.reset}`);
      console.log(`   ${c.red}   Run: gex pending --critical${c.reset}\n`);
    } else if (critical > 0 || urgent > 0) {
      console.log(`   ${c.yellow}⚠️ ${critical + urgent} pending follow-ups needed${c.reset}`);
      console.log(`   ${c.dim}   Run: gex pending${c.reset}\n`);
    } else {
      console.log(`   ${c.green}✓ All interested leads followed up${c.reset}\n`);
    }
  } catch (e) {
    console.log(`   ${c.dim}Could not check pending leads${c.reset}\n`);
  }

  // 6. Inbound Growth Check
  try {
    console.log(`${c.cyan}6. Inbound growth check...${c.reset}`);
    // Get inbound score (just the score line)
    const scoreOutput = execSync('node commands/inbound-score.js 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8',
      shell: true
    });
    const scoreLine = scoreOutput.split('\n').find(l => l.includes('/100'));
    if (scoreLine) {
      console.log(`   Inbound Score: ${scoreLine.trim()}`);
    }
    console.log(`   ${c.green}Inbound: 100% close${c.reset} vs ${c.dim}Outbound: 20% close${c.reset} (5x)`);
    console.log(`   ${c.dim}→ gex referral template  (ask happy clients)${c.reset}`);
    console.log(`   ${c.dim}→ gex inbound-score      (check full score)${c.reset}\n`);
  } catch (e) {
    // Silent fail - show basic message
    console.log(`   ${c.green}Inbound: 100% close${c.reset} vs ${c.dim}Outbound: 20% close${c.reset} (5x)`);
    console.log(`   ${c.dim}→ gex referral template${c.reset}\n`);
  }

  // 7. Today's Priorities
  console.log(`${c.cyan}7. TODAY'S PRIORITIES${c.reset}`);
  console.log(`${c.cyan}${'━'.repeat(50)}${c.reset}`);
  console.log(`   1. ${c.red}Follow up pending leads${c.reset} → gex pending --critical`);
  console.log(`   2. ${c.red}Respond to hot leads${c.reset} → gex send --html`);
  console.log(`   3. ${c.green}Ask for referrals${c.reset} → gex referral template`);
  console.log(`   4. Book meeting requests → gex book`);
  console.log(`   5. Check full briefing → gex briefing\n`);

  // Open browser if requested or default
  if (OPEN || !QUICK) {
    console.log(`${c.cyan}Opening Quick Send in browser...${c.reset}`);
    try {
      // Generate HTML and open
      execSync('node quick-send.js --html 2>/dev/null', {
        cwd: __dirname,
        encoding: 'utf8'
      });
      
      const htmlPath = path.join(__dirname, 'public', 'quick-send.html');
      
      // Open in default browser (macOS)
      spawn('open', [htmlPath], { detached: true, stdio: 'ignore' }).unref();
      
      console.log(`   ${c.green}✓ Opened in browser${c.reset}\n`);
    } catch (e) {
      console.log(`   ${c.yellow}Run: gex send --html to open manually${c.reset}\n`);
    }
  }

  // Summary
  console.log(`${c.bold}${c.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}Ready to go. Focus on hot leads first.${c.reset}`);
  console.log(`${c.bold}${c.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
}

runMorningRoutine().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
