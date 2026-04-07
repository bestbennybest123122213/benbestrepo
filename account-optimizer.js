#!/usr/bin/env node
/**
 * Account Optimizer - Identify accounts to pause/scale based on performance
 * 
 * Usage:
 *   node account-optimizer.js              # Full analysis
 *   node account-optimizer.js --pause      # Show only accounts to pause
 *   node account-optimizer.js --scale      # Show only accounts to scale
 *   node account-optimizer.js --action     # Generate action plan
 *   node account-optimizer.js --telegram   # Telegram-ready format
 *   node account-optimizer.js --export     # Export CSV for Smartlead
 */

const fs = require('fs');
const path = require('path');

// Colors
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// Load latest account data
function loadAccountData() {
    const dataDir = path.join(__dirname, 'data');
    const files = fs.readdirSync(dataDir).filter(f => f.includes('account-health'));
    
    // Get most recent 14d file
    const file14d = files.filter(f => f.includes('14d')).sort().pop();
    const file7d = files.filter(f => f.includes('7d')).sort().pop();
    
    if (!file14d) {
        console.error('No account health data found. Run scraper first.');
        process.exit(1);
    }
    
    const data14d = JSON.parse(fs.readFileSync(path.join(dataDir, file14d)));
    const data7d = file7d ? JSON.parse(fs.readFileSync(path.join(dataDir, file7d))) : null;
    
    return { data14d, data7d };
}

// Analyze accounts
function analyzeAccounts(data14d, data7d) {
    const accounts = data14d.accounts.map(acc => {
        const replyRate = acc.sent > 0 ? (acc.replied / acc.sent * 100) : 0;
        const domain = acc.email.split('@')[1];
        
        // Get 7d data for trend
        let trend = null;
        if (data7d) {
            const acc7d = data7d.accounts.find(a => a.email === acc.email);
            if (acc7d && acc7d.sent > 0) {
                const rate7d = acc7d.replied / acc7d.sent * 100;
                trend = rate7d - replyRate; // Positive = improving
            }
        }
        
        return {
            email: acc.email,
            domain,
            sent: acc.sent,
            replied: acc.replied,
            replyRate,
            trend,
            status: categorizeAccount(replyRate, acc.sent)
        };
    });
    
    // Sort by reply rate descending
    accounts.sort((a, b) => b.replyRate - a.replyRate);
    
    return accounts;
}

// Categorize account based on performance
function categorizeAccount(replyRate, sent) {
    if (sent < 30) return 'new'; // Not enough data
    if (replyRate >= 3) return 'scale'; // Top performer
    if (replyRate >= 1) return 'keep'; // Working
    if (replyRate > 0) return 'monitor'; // Low but not dead
    return 'pause'; // Zero replies
}

// Display full analysis
function displayAnalysis(accounts) {
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║  📊 ACCOUNT OPTIMIZER - Performance Analysis                            ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════╝${RESET}\n`);
    
    const stats = {
        scale: accounts.filter(a => a.status === 'scale'),
        keep: accounts.filter(a => a.status === 'keep'),
        monitor: accounts.filter(a => a.status === 'monitor'),
        pause: accounts.filter(a => a.status === 'pause'),
        new: accounts.filter(a => a.status === 'new')
    };
    
    // Summary
    console.log(`${BOLD}📈 SUMMARY${RESET}`);
    console.log(`   Total accounts: ${accounts.length}`);
    console.log(`   ${GREEN}✓ Scale (3%+):${RESET} ${stats.scale.length} accounts`);
    console.log(`   ${CYAN}○ Keep (1-3%):${RESET} ${stats.keep.length} accounts`);
    console.log(`   ${YELLOW}⚠ Monitor (<1%):${RESET} ${stats.monitor.length} accounts`);
    console.log(`   ${RED}✗ Pause (0%):${RESET} ${stats.pause.length} accounts`);
    console.log(`   ${DIM}? New (<30 sent):${RESET} ${stats.new.length} accounts\n`);
    
    // Impact calculation
    const pauseEmails = stats.pause.reduce((sum, a) => sum + a.sent, 0);
    const totalEmails = accounts.reduce((sum, a) => sum + a.sent, 0);
    const wastedPct = (pauseEmails / totalEmails * 100).toFixed(1);
    
    console.log(`${BOLD}💡 IMPACT${RESET}`);
    console.log(`   ${RED}${pauseEmails}${RESET} emails sent from zero-reply accounts (${wastedPct}% wasted)`);
    console.log(`   Pausing these accounts would improve overall reply rate\n`);
    
    // Top performers
    console.log(`${BOLD}🏆 TOP PERFORMERS (scale these)${RESET}`);
    console.log(`${'─'.repeat(70)}`);
    stats.scale.slice(0, 10).forEach((acc, i) => {
        const trend = acc.trend !== null ? (acc.trend >= 0 ? `${GREEN}↑${RESET}` : `${RED}↓${RESET}`) : '';
        console.log(`   ${i + 1}. ${GREEN}${acc.email}${RESET}`);
        console.log(`      ${acc.replied}/${acc.sent} (${acc.replyRate.toFixed(2)}%) ${trend}`);
    });
    
    // Zero performers
    console.log(`\n${BOLD}🔴 ZERO REPLY ACCOUNTS (pause these)${RESET}`);
    console.log(`${'─'.repeat(70)}`);
    
    // Group by domain
    const domainGroups = {};
    stats.pause.forEach(acc => {
        if (!domainGroups[acc.domain]) domainGroups[acc.domain] = [];
        domainGroups[acc.domain].push(acc);
    });
    
    Object.entries(domainGroups).forEach(([domain, accs]) => {
        console.log(`   ${RED}${domain}${RESET} (${accs.length} accounts, ${accs.reduce((s, a) => s + a.sent, 0)} emails sent)`);
        accs.forEach(acc => {
            console.log(`      ${DIM}${acc.email.split('@')[0]}@...${RESET}`);
        });
    });
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${BOLD}💡 Quick Actions:${RESET}`);
    console.log(`   node account-optimizer.js --pause    # List accounts to pause`);
    console.log(`   node account-optimizer.js --action   # Generate action plan`);
    console.log(`   node account-optimizer.js --export   # Export CSV`);
}

// Display accounts to pause
function displayPause(accounts) {
    const toPause = accounts.filter(a => a.status === 'pause');
    
    console.log(`\n${BOLD}🔴 ACCOUNTS TO PAUSE (${toPause.length} total)${RESET}\n`);
    
    toPause.forEach((acc, i) => {
        console.log(`${i + 1}. ${acc.email}`);
        console.log(`   ${DIM}Sent: ${acc.sent} | Replied: 0 | Domain: ${acc.domain}${RESET}`);
    });
    
    console.log(`\n${BOLD}📋 COPY FOR SMARTLEAD:${RESET}`);
    console.log(`${'─'.repeat(50)}`);
    toPause.forEach(acc => console.log(acc.email));
}

// Display accounts to scale
function displayScale(accounts) {
    const toScale = accounts.filter(a => a.status === 'scale');
    
    console.log(`\n${BOLD}🏆 ACCOUNTS TO SCALE (${toScale.length} total)${RESET}\n`);
    
    toScale.forEach((acc, i) => {
        console.log(`${GREEN}${i + 1}. ${acc.email}${RESET}`);
        console.log(`   Reply rate: ${acc.replyRate.toFixed(2)}% (${acc.replied}/${acc.sent})`);
    });
    
    const avgRate = toScale.reduce((s, a) => s + a.replyRate, 0) / toScale.length;
    console.log(`\n${BOLD}Average reply rate of top performers: ${avgRate.toFixed(2)}%${RESET}`);
}

// Generate action plan
function displayActionPlan(accounts) {
    const toPause = accounts.filter(a => a.status === 'pause');
    const toScale = accounts.filter(a => a.status === 'scale');
    const toMonitor = accounts.filter(a => a.status === 'monitor');
    
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║  📋 ACCOUNT OPTIMIZATION ACTION PLAN                                    ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════╝${RESET}\n`);
    
    console.log(`${BOLD}STEP 1: PAUSE ZERO-REPLY ACCOUNTS (5 min)${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`Go to SmartLead → Email Accounts → Filter by domain → Pause\n`);
    
    // Group by domain for easier action
    const domains = [...new Set(toPause.map(a => a.domain))];
    domains.forEach(domain => {
        const count = toPause.filter(a => a.domain === domain).length;
        console.log(`   [ ] Pause ${count} accounts on ${domain}`);
    });
    
    console.log(`\n${BOLD}STEP 2: INCREASE VOLUME ON TOP PERFORMERS (5 min)${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    toScale.slice(0, 5).forEach(acc => {
        console.log(`   [ ] Increase daily limit: ${acc.email}`);
        console.log(`       ${DIM}Current: ${acc.replyRate.toFixed(2)}% reply rate${RESET}`);
    });
    
    console.log(`\n${BOLD}STEP 3: MONITOR LOW PERFORMERS (check weekly)${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`   ${toMonitor.length} accounts with <1% reply rate`);
    console.log(`   If still 0% next week → pause them`);
    
    console.log(`\n${BOLD}EXPECTED IMPACT:${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    
    const currentTotal = accounts.reduce((s, a) => s + a.sent, 0);
    const currentReplies = accounts.reduce((s, a) => s + a.replied, 0);
    const currentRate = (currentReplies / currentTotal * 100);
    
    const newTotal = accounts.filter(a => a.status !== 'pause').reduce((s, a) => s + a.sent, 0);
    const newReplies = accounts.filter(a => a.status !== 'pause').reduce((s, a) => s + a.replied, 0);
    const newRate = (newReplies / newTotal * 100);
    
    console.log(`   Current reply rate: ${currentRate.toFixed(2)}%`);
    console.log(`   After pausing: ${GREEN}${newRate.toFixed(2)}%${RESET} (+${(newRate - currentRate).toFixed(2)}%)`);
    console.log(`   Emails saved: ${toPause.reduce((s, a) => s + a.sent, 0)} per period`);
}

// Telegram format
function displayTelegram(accounts) {
    const toPause = accounts.filter(a => a.status === 'pause');
    const toScale = accounts.filter(a => a.status === 'scale');
    
    console.log(`📊 *ACCOUNT HEALTH REPORT*\n`);
    console.log(`Total: ${accounts.length} accounts`);
    console.log(`🟢 Scaling: ${toScale.length}`);
    console.log(`🔴 Pause needed: ${toPause.length}\n`);
    
    console.log(`*TOP 3 PERFORMERS:*`);
    toScale.slice(0, 3).forEach((acc, i) => {
        console.log(`${i + 1}. ${acc.email.split('@')[0]}@... (${acc.replyRate.toFixed(1)}%)`);
    });
    
    console.log(`\n⚠️ *${toPause.length} accounts have 0 replies*`);
    console.log(`Action: Pause in SmartLead (5 min task)`);
}

// Export CSV
function exportCSV(accounts) {
    const toPause = accounts.filter(a => a.status === 'pause');
    
    const csv = ['email,sent,replied,reply_rate,action'];
    toPause.forEach(acc => {
        csv.push(`${acc.email},${acc.sent},${acc.replied},${acc.replyRate.toFixed(2)},PAUSE`);
    });
    
    const outPath = path.join(__dirname, 'exports', `accounts-to-pause-${new Date().toISOString().split('T')[0]}.csv`);
    
    // Ensure exports dir exists
    const exportsDir = path.join(__dirname, 'exports');
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
    
    fs.writeFileSync(outPath, csv.join('\n'));
    console.log(`\n✅ Exported ${toPause.length} accounts to:`);
    console.log(`   ${outPath}`);
}

// Main
function main() {
    const args = process.argv.slice(2);
    const { data14d, data7d } = loadAccountData();
    const accounts = analyzeAccounts(data14d, data7d);
    
    if (args.includes('--pause')) {
        displayPause(accounts);
    } else if (args.includes('--scale')) {
        displayScale(accounts);
    } else if (args.includes('--action')) {
        displayActionPlan(accounts);
    } else if (args.includes('--telegram') || args.includes('--tg')) {
        displayTelegram(accounts);
    } else if (args.includes('--export')) {
        exportCSV(accounts);
    } else {
        displayAnalysis(accounts);
    }
}

main();
