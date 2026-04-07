#!/usr/bin/env node
/**
 * GEX LDS Bridge Commands
 * Connect GEX to Lead Discovery System
 * 
 * Usage:
 *   gex lds status   - Show LDS system status
 *   gex lds sync     - Sync leads between systems
 *   gex lds leads    - Show LDS leads
 *   gex lds export   - Export LDS leads to GEX format
 *   gex lds search   - Unified search across both systems
 *   gex lds dedup    - Check domain for duplicates
 *   gex lds stats    - Combined stats from both systems
 */

const path = require('path');
const LDS_PATH = path.join(__dirname, '..', '..', 'lead-discovery-system', 'backend');

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
    magenta: '\x1b[35m'
};

// Lazy load GEX bridge to handle missing LDS gracefully
let bridge = null;
function loadBridge() {
    if (bridge) return bridge;
    try {
        bridge = require(path.join(LDS_PATH, 'gex-bridge.js'));
        return bridge;
    } catch (err) {
        console.error(`${c.red}✗ Cannot load LDS bridge: ${err.message}${c.reset}`);
        console.log(`\n${c.dim}Make sure Lead Discovery System is installed at:${c.reset}`);
        console.log(`  ${c.cyan}${LDS_PATH}${c.reset}\n`);
        process.exit(1);
    }
}

/**
 * Show LDS system status
 */
async function showStatus() {
    const bridge = loadBridge();
    
    console.log(`\n${c.bold}━━━ LDS Bridge Status ━━━${c.reset}\n`);
    
    const status = await bridge.getBridgeStatus();
    
    // LDS Status
    console.log(`${c.cyan}Lead Discovery System:${c.reset}`);
    if (status.lds.connected) {
        console.log(`  ${c.green}✓ Connected${c.reset}`);
        console.log(`  ${c.dim}Total Leads: ${status.lds.stats.totalLeads || 0}${c.reset}`);
        if (status.lds.stats.byTier) {
            const tiers = status.lds.stats.byTier;
            console.log(`  ${c.dim}Tiers: Hot ${c.red}${tiers.hot || 0}${c.dim} | Warm ${c.yellow}${tiers.warm || 0}${c.dim} | Cold ${c.blue}${tiers.cold || 0}${c.reset}`);
        }
    } else {
        console.log(`  ${c.red}✗ Not Connected${c.reset}`);
        console.log(`  ${c.dim}${status.lds.message}${c.reset}`);
    }
    
    // GEX Status
    console.log(`\n${c.cyan}GEX Pipeline:${c.reset}`);
    if (status.gex.connected) {
        console.log(`  ${c.green}✓ Connected${c.reset}`);
        console.log(`  ${c.dim}Positive Replies: ${status.gex.stats.positiveReplies || 0}${c.reset}`);
        console.log(`  ${c.dim}Pending Followups: ${c.yellow}${status.gex.stats.pendingFollowups || 0}${c.reset}`);
    } else {
        console.log(`  ${c.red}✗ Not Connected${c.reset}`);
        console.log(`  ${c.dim}${status.gex.error}${c.reset}`);
    }
    
    // Bridge Health
    console.log(`\n${c.cyan}Bridge Health:${c.reset}`);
    if (status.bridgeHealthy) {
        console.log(`  ${c.green}✓ Healthy - Both systems connected${c.reset}`);
    } else {
        console.log(`  ${c.yellow}⚠ Degraded - Check connections above${c.reset}`);
    }
    
    console.log();
}

/**
 * Show LDS leads
 */
async function showLeads(tier = 'hot', limit = 20) {
    const bridge = loadBridge();
    
    console.log(`\n${c.bold}━━━ LDS Leads (${tier.toUpperCase()}) ━━━${c.reset}\n`);
    
    const result = await bridge.getLdsLeadsForExport({ tier, limit, status: 'all' });
    
    if (result.error) {
        console.log(`${c.red}✗ Error: ${result.error}${c.reset}`);
        return;
    }
    
    if (!result.leads || result.leads.length === 0) {
        console.log(`${c.dim}No leads found in LDS${c.reset}`);
        console.log(`\n${c.dim}Tip: Import leads using 'cd lead-discovery-system && node backend/cli.js import <file>'${c.reset}\n`);
        return;
    }
    
    // Table header
    console.log(`${c.dim}${'Domain'.padEnd(35)} ${'Company'.padEnd(25)} ${'Score'.padEnd(8)} ${'Tier'.padEnd(8)} Status${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(100)}${c.reset}`);
    
    for (const lead of result.leads) {
        const tierColor = lead.quality_tier === 'hot' ? c.red : 
                         lead.quality_tier === 'warm' ? c.yellow : c.blue;
        
        console.log(
            `${(lead.domain || '').padEnd(35)} ` +
            `${(lead.company_name || '-').substring(0, 24).padEnd(25)} ` +
            `${c.cyan}${String(lead.lead_score || 0).padEnd(8)}${c.reset} ` +
            `${tierColor}${(lead.quality_tier || 'unscored').padEnd(8)}${c.reset} ` +
            `${lead.status || 'new'}`
        );
    }
    
    console.log(`\n${c.dim}Showing ${result.leads.length} of ${result.count} leads${c.reset}\n`);
}

/**
 * Export LDS leads to GEX format
 */
async function exportLeads(tier = 'hot', outputPath = null) {
    const bridge = loadBridge();
    const fs = require('fs');
    
    console.log(`\n${c.bold}━━━ Export LDS Leads ━━━${c.reset}\n`);
    
    const result = await bridge.getLdsLeadsForExport({ tier, limit: 1000, status: 'enriched' });
    
    if (result.error) {
        console.log(`${c.red}✗ Error: ${result.error}${c.reset}`);
        return;
    }
    
    if (!result.formatted || result.formatted.length === 0) {
        console.log(`${c.dim}No leads to export${c.reset}`);
        return;
    }
    
    const filename = outputPath || `lds-export-${tier}-${Date.now()}.json`;
    const exportPath = path.join(__dirname, '..', 'exports', filename);
    
    // Ensure exports dir exists
    const exportsDir = path.dirname(exportPath);
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    fs.writeFileSync(exportPath, JSON.stringify(result.formatted, null, 2));
    
    console.log(`${c.green}✓ Exported ${result.formatted.length} leads${c.reset}`);
    console.log(`${c.dim}File: ${exportPath}${c.reset}\n`);
    
    // Also create CSV
    const csvPath = exportPath.replace('.json', '.csv');
    const headers = ['email', 'firstName', 'lastName', 'company', 'website', 'phone'];
    const csvLines = [headers.join(',')];
    
    for (const lead of result.formatted) {
        csvLines.push(headers.map(h => `"${(lead[h] || '').toString().replace(/"/g, '""')}"`).join(','));
    }
    
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`${c.dim}CSV: ${csvPath}${c.reset}\n`);
}

/**
 * Sync leads between systems
 */
async function syncLeads() {
    const bridge = loadBridge();
    
    console.log(`\n${c.bold}━━━ Sync LDS ↔ GEX ━━━${c.reset}\n`);
    console.log(`${c.dim}Checking LDS leads against GEX positive replies...${c.reset}\n`);
    
    const result = await bridge.syncLdsToGex();
    
    if (result.error) {
        console.log(`${c.red}✗ Error: ${result.error}${c.reset}`);
        return;
    }
    
    console.log(`${c.cyan}Sync Results:${c.reset}`);
    console.log(`  Leads checked: ${result.checked}`);
    console.log(`  ${c.green}Updated to 'contacted': ${result.updated}${c.reset}`);
    
    if (result.errors.length > 0) {
        console.log(`  ${c.red}Errors: ${result.errors.length}${c.reset}`);
        for (const err of result.errors.slice(0, 5)) {
            console.log(`    ${c.dim}- ${err.domain}: ${err.error}${c.reset}`);
        }
    }
    
    console.log();
}

/**
 * Unified search across both systems
 */
async function unifiedSearch(query) {
    const bridge = loadBridge();
    
    if (!query) {
        console.log(`${c.red}Usage: gex lds search <query>${c.reset}`);
        return;
    }
    
    console.log(`\n${c.bold}━━━ Unified Search: "${query}" ━━━${c.reset}\n`);
    
    const results = await bridge.unifiedLeadSearch(query, { limit: 25 });
    
    if (results.error) {
        console.log(`${c.red}✗ Error: ${results.error}${c.reset}`);
        return;
    }
    
    // LDS Results
    if (results.lds.length > 0) {
        console.log(`${c.cyan}Lead Discovery System (${results.lds.length}):${c.reset}`);
        for (const lead of results.lds.slice(0, 10)) {
            const tierColor = lead.quality_tier === 'hot' ? c.red : 
                             lead.quality_tier === 'warm' ? c.yellow : c.blue;
            console.log(
                `  ${lead.domain?.padEnd(30) || '-'.padEnd(30)} ` +
                `${tierColor}${(lead.quality_tier || '-').padEnd(6)}${c.reset} ` +
                `Score: ${c.cyan}${lead.lead_score || 0}${c.reset}`
            );
        }
        if (results.lds.length > 10) {
            console.log(`  ${c.dim}... and ${results.lds.length - 10} more${c.reset}`);
        }
    }
    
    // GEX Results
    if (results.gex.length > 0) {
        console.log(`\n${c.cyan}GEX Positive Replies (${results.gex.length}):${c.reset}`);
        for (const reply of results.gex.slice(0, 10)) {
            const catColor = reply.reply_category === 'Interested' ? c.green : 
                            reply.reply_category === 'Meeting Request' ? c.magenta : c.yellow;
            console.log(
                `  ${reply.lead_email?.padEnd(35) || '-'.padEnd(35)} ` +
                `${catColor}${(reply.reply_category || '-').padEnd(20)}${c.reset} ` +
                `${reply.follow_up_status || 'pending'}`
            );
        }
        if (results.gex.length > 10) {
            console.log(`  ${c.dim}... and ${results.gex.length - 10} more${c.reset}`);
        }
    }
    
    if (results.total === 0) {
        console.log(`${c.dim}No results found in either system${c.reset}`);
    }
    
    console.log(`\n${c.dim}Total: ${results.total} results${c.reset}\n`);
}

/**
 * Dedup check across both systems
 */
async function dedupCheck(domain) {
    const bridge = loadBridge();
    
    if (!domain) {
        console.log(`${c.red}Usage: gex lds dedup <domain>${c.reset}`);
        return;
    }
    
    console.log(`\n${c.bold}━━━ Dedup Check: ${domain} ━━━${c.reset}\n`);
    
    const result = await bridge.crossSystemDedupCheck(domain);
    
    console.log(`${c.cyan}Domain:${c.reset} ${result.domain}`);
    console.log(`${c.cyan}Status:${c.reset} ${result.isDuplicate ? c.yellow + '⚠ DUPLICATE FOUND' + c.reset : c.green + '✓ Unique' + c.reset}`);
    
    console.log(`\n${c.cyan}GEX Pipeline:${c.reset}`);
    if (result.existsInGex) {
        console.log(`  ${c.yellow}Found in ${result.gexMatches.length} positive reply(s)${c.reset}`);
        for (const match of result.gexMatches.slice(0, 3)) {
            console.log(`    ${c.dim}- ${match.lead_email} (${match.lead_company || 'unknown'})${c.reset}`);
        }
    } else {
        console.log(`  ${c.green}Not found${c.reset}`);
    }
    
    console.log(`\n${c.cyan}Lead Discovery System:${c.reset}`);
    if (result.existsInLds) {
        const lead = result.ldsLead;
        console.log(`  ${c.yellow}Found: ${lead.company_name || lead.domain}${c.reset}`);
        console.log(`    ${c.dim}Score: ${lead.lead_score} | Status: ${lead.status}${c.reset}`);
    } else {
        console.log(`  ${c.green}Not found${c.reset}`);
    }
    
    console.log();
}

/**
 * Combined stats from both systems
 */
async function showStats() {
    const bridge = loadBridge();
    
    console.log(`\n${c.bold}━━━ Combined Pipeline Stats ━━━${c.reset}\n`);
    
    const stats = await bridge.getCombinedStats();
    
    // LDS Stats
    console.log(`${c.cyan}Lead Discovery System:${c.reset}`);
    console.log(`  Total Leads: ${c.bold}${stats.lds.totalLeads}${c.reset}`);
    if (stats.lds.byTier) {
        console.log(`  Tiers: ${c.red}Hot ${stats.lds.byTier.hot || 0}${c.reset} | ${c.yellow}Warm ${stats.lds.byTier.warm || 0}${c.reset} | ${c.blue}Cold ${stats.lds.byTier.cold || 0}${c.reset}`);
    }
    
    // GEX Stats
    console.log(`\n${c.cyan}GEX Pipeline:${c.reset}`);
    console.log(`  Positive Replies: ${c.bold}${stats.gex.positiveReplies}${c.reset}`);
    console.log(`  Pending Followups: ${c.yellow}${stats.gex.pendingFollowups}${c.reset}`);
    if (Object.keys(stats.gex.byCategory).length > 0) {
        console.log(`  By Category:`);
        for (const [cat, count] of Object.entries(stats.gex.byCategory).slice(0, 5)) {
            console.log(`    ${c.dim}${cat}: ${count}${c.reset}`);
        }
    }
    
    // Combined
    console.log(`\n${c.cyan}Combined Pipeline:${c.reset}`);
    console.log(`  ${c.bold}Total Pipeline Leads: ${stats.combined.totalPipelineLeads}${c.reset}`);
    console.log(`  Hot Discovery Leads: ${c.red}${stats.combined.hotLeads}${c.reset}`);
    console.log(`  Active Followups: ${c.yellow}${stats.combined.activeFollowups}${c.reset}`);
    
    console.log();
}

/**
 * Show help
 */
function showHelp() {
    console.log(`
${c.bold}GEX LDS Bridge Commands${c.reset}

${c.cyan}Usage:${c.reset}
  gex lds <command> [options]

${c.cyan}Commands:${c.reset}
  ${c.green}status${c.reset}              Show LDS and GEX connection status
  ${c.green}leads${c.reset} [tier]        Show LDS leads (hot/warm/cold/all)
  ${c.green}export${c.reset} [tier]       Export LDS leads to GEX format
  ${c.green}sync${c.reset}                Sync leads between systems
  ${c.green}search${c.reset} <query>      Unified search across both systems
  ${c.green}dedup${c.reset} <domain>      Check domain for duplicates
  ${c.green}stats${c.reset}               Combined stats from both systems

${c.cyan}Examples:${c.reset}
  gex lds status           # Check both systems
  gex lds leads hot        # Show hot leads from LDS
  gex lds search gaming    # Search "gaming" in both systems
  gex lds dedup acme.com   # Check if acme.com exists
  gex lds export warm      # Export warm leads to JSON/CSV
`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main CLI Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
    // When called via gex.js: node lds-bridge.js <subcommand> <arg1> <arg2>
    const subcommand = process.argv[2] || 'status';
    const arg1 = process.argv[3];
    const arg2 = process.argv[4];
    
    switch (subcommand) {
        case 'status':
        case 's':
            await showStatus();
            break;
            
        case 'leads':
        case 'l':
            await showLeads(arg1 || 'hot', parseInt(arg2) || 20);
            break;
            
        case 'export':
        case 'e':
            await exportLeads(arg1 || 'hot', arg2);
            break;
            
        case 'sync':
            await syncLeads();
            break;
            
        case 'search':
        case 'find':
        case 'f':
            await unifiedSearch(arg1);
            break;
            
        case 'dedup':
        case 'd':
        case 'check':
            await dedupCheck(arg1);
            break;
            
        case 'stats':
            await showStats();
            break;
            
        case 'help':
        case 'h':
        case '--help':
        case '-h':
            showHelp();
            break;
            
        default:
            console.log(`${c.red}Unknown subcommand: ${subcommand}${c.reset}`);
            showHelp();
    }
}

main().catch(err => {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
});
