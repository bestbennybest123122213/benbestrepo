#!/usr/bin/env node
/**
 * Unified Leads View
 * Shows leads from both GEX pipeline and LDS in one view
 * 
 * Usage:
 *   gex unified          # Show combined leads
 *   gex unified --hot    # Hot leads only
 *   gex unified --search # Interactive search
 */

require('dotenv').config();
const path = require('path');
const { initSupabase } = require('./lib/supabase');

// Colors
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

// Try to load LDS bridge
let ldsBridge = null;
try {
    ldsBridge = require('../lead-discovery-system/backend/gex-bridge.js');
} catch (e) {
    // LDS not available
}

async function getGexLeads(limit = 50) {
    const client = initSupabase();
    if (!client) return [];
    
    const { data } = await client
        .from('positive_replies')
        .select('*')
        .eq('follow_up_status', 'pending')
        .neq('reply_category', 'Booked')
        .order('replied_at', { ascending: false })
        .limit(limit);
    
    return (data || []).map(r => {
        const ageDays = r.replied_at 
            ? Math.floor((Date.now() - new Date(r.replied_at).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
        
        return {
            source: 'GEX',
            id: r.id,
            email: r.lead_email,
            name: r.lead_name,
            company: r.lead_company,
            domain: r.lead_email?.split('@')[1],
            score: r.reply_category === 'Interested' ? 100 :
                   r.reply_category === 'Meeting Request' ? 90 : 50,
            tier: ageDays <= 3 ? 'hot' : ageDays <= 7 ? 'warm' : 'cold',
            category: r.reply_category,
            status: r.follow_up_status,
            ageDays,
            date: r.replied_at
        };
    });
}

async function getLdsLeads(limit = 50) {
    if (!ldsBridge) return [];
    
    try {
        const result = await ldsBridge.getLdsLeadsForExport({ tier: 'all', limit, status: 'all' });
        if (result.error) return [];
        
        return (result.leads || []).map(l => ({
            source: 'LDS',
            id: l.id,
            email: l.email,
            name: l.company_name,
            company: l.company_name,
            domain: l.domain,
            score: l.lead_score || 0,
            tier: l.quality_tier || 'unscored',
            category: l.vertical || '-',
            status: l.status,
            ageDays: l.first_discovered_at
                ? Math.floor((Date.now() - new Date(l.first_discovered_at).getTime()) / (1000 * 60 * 60 * 24))
                : 0,
            date: l.first_discovered_at
        }));
    } catch (e) {
        return [];
    }
}

async function showUnifiedLeads(options = {}) {
    const { tierFilter = null, limit = 30, searchQuery = null } = options;
    
    console.log(`\n${c.bold}━━━ Unified Lead Pipeline ━━━${c.reset}\n`);
    
    // Get leads from both systems
    const [gexLeads, ldsLeads] = await Promise.all([
        getGexLeads(50),
        getLdsLeads(50)
    ]);
    
    // Combine and sort by score
    let allLeads = [...gexLeads, ...ldsLeads];
    
    // Apply filters
    if (tierFilter) {
        allLeads = allLeads.filter(l => l.tier === tierFilter);
    }
    
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        allLeads = allLeads.filter(l => 
            l.email?.toLowerCase().includes(q) ||
            l.name?.toLowerCase().includes(q) ||
            l.company?.toLowerCase().includes(q) ||
            l.domain?.toLowerCase().includes(q)
        );
    }
    
    // Sort by score descending
    allLeads.sort((a, b) => b.score - a.score);
    
    // Limit results
    allLeads = allLeads.slice(0, limit);
    
    // Stats
    const gexCount = allLeads.filter(l => l.source === 'GEX').length;
    const ldsCount = allLeads.filter(l => l.source === 'LDS').length;
    const hotCount = allLeads.filter(l => l.tier === 'hot').length;
    
    console.log(`${c.cyan}Sources:${c.reset} GEX ${c.green}${gexCount}${c.reset} | LDS ${c.blue}${ldsCount}${c.reset} | ${c.red}Hot: ${hotCount}${c.reset}`);
    console.log();
    
    if (allLeads.length === 0) {
        console.log(`${c.dim}No leads found${c.reset}`);
        if (tierFilter) console.log(`${c.dim}Try without --${tierFilter} filter${c.reset}`);
        return;
    }
    
    // Display header
    console.log(`${c.dim}${'Src'.padEnd(5)} ${'Tier'.padEnd(6)} ${'Score'.padEnd(6)} ${'Email/Domain'.padEnd(35)} ${'Category'.padEnd(20)} Age${c.reset}`);
    console.log(`${c.dim}${'─'.repeat(90)}${c.reset}`);
    
    // Display leads
    for (const lead of allLeads) {
        const srcColor = lead.source === 'GEX' ? c.green : c.blue;
        const tierColor = lead.tier === 'hot' ? c.red : 
                         lead.tier === 'warm' ? c.yellow : c.cyan;
        
        const display = lead.email || lead.domain || '-';
        const truncDisplay = display.length > 33 ? display.substring(0, 30) + '...' : display;
        
        console.log(
            `${srcColor}${lead.source.padEnd(5)}${c.reset}` +
            `${tierColor}${(lead.tier || '-').padEnd(6)}${c.reset}` +
            `${c.cyan}${String(lead.score).padEnd(6)}${c.reset}` +
            `${truncDisplay.padEnd(35)} ` +
            `${(lead.category || '-').substring(0, 18).padEnd(20)} ` +
            `${lead.ageDays}d`
        );
    }
    
    console.log(`\n${c.dim}Showing ${allLeads.length} leads (use --hot for hot only)${c.reset}\n`);
}

// Parse args
const args = process.argv.slice(2);
const options = {
    tierFilter: args.includes('--hot') ? 'hot' : 
                args.includes('--warm') ? 'warm' :
                args.includes('--cold') ? 'cold' : null,
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 30,
    searchQuery: args.find(a => !a.startsWith('--'))
};

showUnifiedLeads(options).catch(err => {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    process.exit(1);
});
