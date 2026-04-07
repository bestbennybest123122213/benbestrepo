#!/usr/bin/env node

/**
 * Quick Fix - The ONE thing to fix right now
 * Shows the most critical action in 30 seconds
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function loadData() {
    const dataDir = path.join(__dirname, 'data');
    
    // Load account health
    const accountFiles = fs.readdirSync(dataDir)
        .filter(f => f.includes('14d-account-health'))
        .sort()
        .reverse();
    
    let accounts = [];
    if (accountFiles.length > 0) {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, accountFiles[0])));
        accounts = data.accounts || [];
    }
    
    // Load domain health
    const domainFiles = fs.readdirSync(dataDir)
        .filter(f => f.includes('7d-domain-health'))
        .sort()
        .reverse();
    
    let domains = [];
    if (domainFiles.length > 0) {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, domainFiles[0])));
        domains = data.domains || [];
    }
    
    return { accounts, domains };
}

function analyze(accounts, domains) {
    const issues = [];
    
    // Check for zero-reply accounts
    const zeroReplyAccounts = accounts.filter(a => a.replied === 0 && a.sent >= 30);
    if (zeroReplyAccounts.length > 20) {
        issues.push({
            severity: 'critical',
            type: 'accounts',
            title: `${zeroReplyAccounts.length} accounts have ZERO replies`,
            impact: `${Math.round(zeroReplyAccounts.reduce((s, a) => s + a.sent, 0))} emails wasted`,
            action: 'Pause these accounts in SmartLead',
            time: '5 min',
            command: 'gex accounts --pause'
        });
    }
    
    // Check for critical domains
    const criticalDomains = domains.filter(d => d.reputation && d.reputation < 70);
    if (criticalDomains.length > 0) {
        issues.push({
            severity: 'critical',
            type: 'domains',
            title: `${criticalDomains.length} domains below 70% reputation`,
            impact: 'Damaging overall sender reputation',
            action: `Pause: ${criticalDomains.slice(0, 3).map(d => d.domain).join(', ')}${criticalDomains.length > 3 ? '...' : ''}`,
            time: '5 min',
            command: 'gex domains --critical'
        });
    }
    
    // Check for warning domains
    const warningDomains = domains.filter(d => d.reputation && d.reputation >= 70 && d.reputation < 75);
    if (warningDomains.length > 5) {
        issues.push({
            severity: 'warning',
            type: 'domains',
            title: `${warningDomains.length} domains at 70-74% reputation`,
            impact: 'Risk of further degradation',
            action: 'Reduce sending volume by 50%',
            time: '10 min',
            command: 'gex domains --warning'
        });
    }
    
    return issues;
}

function display(issues) {
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║  🔧 QUICK FIX - What to do RIGHT NOW                         ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);
    
    if (issues.length === 0) {
        console.log(`${GREEN}✓ No critical issues found.${RESET}`);
        console.log(`${DIM}Run 'gex perf' for performance trends.${RESET}\n`);
        return;
    }
    
    // Show the most critical issue
    const top = issues[0];
    const color = top.severity === 'critical' ? RED : YELLOW;
    const icon = top.severity === 'critical' ? '🚨' : '⚠️';
    
    console.log(`${BOLD}${color}${icon} ${top.title}${RESET}`);
    console.log(`${DIM}Impact: ${top.impact}${RESET}`);
    console.log(`\n${BOLD}ACTION:${RESET} ${top.action}`);
    console.log(`${DIM}Time: ${top.time}${RESET}`);
    console.log(`\n${CYAN}Command: ${top.command}${RESET}`);
    
    if (issues.length > 1) {
        console.log(`\n${DIM}(${issues.length - 1} more issues - run 'gex fix --all' to see all)${RESET}`);
    }
    
    console.log();
}

function displayAll(issues) {
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║  🔧 ALL ISSUES TO FIX                                        ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);
    
    if (issues.length === 0) {
        console.log(`${GREEN}✓ No issues found.${RESET}\n`);
        return;
    }
    
    issues.forEach((issue, i) => {
        const color = issue.severity === 'critical' ? RED : YELLOW;
        const icon = issue.severity === 'critical' ? '🚨' : '⚠️';
        
        console.log(`${BOLD}${i + 1}. ${color}${icon} ${issue.title}${RESET}`);
        console.log(`   ${DIM}Impact: ${issue.impact}${RESET}`);
        console.log(`   ${BOLD}Action:${RESET} ${issue.action} ${DIM}(${issue.time})${RESET}`);
        console.log(`   ${CYAN}→ ${issue.command}${RESET}\n`);
    });
}

function displayTelegram(issues) {
    if (issues.length === 0) {
        console.log(`✅ No critical issues\n`);
        return;
    }
    
    const top = issues[0];
    const icon = top.severity === 'critical' ? '🚨' : '⚠️';
    
    console.log(`${icon} *QUICK FIX NEEDED*\n`);
    console.log(`*${top.title}*`);
    console.log(`Impact: ${top.impact}`);
    console.log(`\n*Action:* ${top.action}`);
    console.log(`Time: ${top.time}`);
    
    if (issues.length > 1) {
        console.log(`\n_(${issues.length - 1} more issues)_`);
    }
}

// Main
const args = process.argv.slice(2);
const { accounts, domains } = loadData();
const issues = analyze(accounts, domains);

if (args.includes('--all')) {
    displayAll(issues);
} else if (args.includes('--telegram') || args.includes('--tg')) {
    displayTelegram(issues);
} else {
    display(issues);
}
