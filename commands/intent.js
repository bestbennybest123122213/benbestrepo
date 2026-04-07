#!/usr/bin/env node
/**
 * Intent Signal Detector
 * Surfaces leads with buying signals based on Eric Nowoslawski's framework
 * 
 * Usage:
 *   node gex.js intent              - Show all leads ranked by intent score
 *   node gex.js intent --hot        - Show only HOT intent leads
 *   node gex.js intent --gaming     - Filter to gaming vertical
 *   node gex.js intent --hiring     - Only leads with hiring signals
 *   node gex.js intent --funded     - Only leads with recent funding
 */

const { calculateIntentScore, rankByIntent, findHighIntentLeads, VERTICAL_SCORES } = require('../lib/intent-signals');

// Mock data for testing - in production, this would come from Supabase/Smartlead
function getLeadsData() {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Try to load from local curated data
    const dataPath = path.join(__dirname, '..', 'data', 'positive-replies-processed.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return data.leads || [];
    }
    
    return [];
  } catch (e) {
    return [];
  }
}

// Enrich lead with company data (mock enrichment)
function enrichLead(lead) {
  const domain = lead.domain || lead.email?.split('@')[1] || '';
  
  // Basic vertical detection from domain/company name
  const text = `${lead.company || ''} ${domain}`.toLowerCase();
  
  return {
    ...lead,
    company: {
      name: lead.company || domain,
      domain: domain,
      industry: text.includes('game') ? 'gaming' : 
                text.includes('edu') ? 'education' : 
                text.includes('tech') ? 'tech' : 'other'
    }
  };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'intent');
  
  // Parse flags
  const flags = {
    hot: args.includes('--hot') || args.includes('-h'),
    gaming: args.includes('--gaming') || args.includes('-g'),
    hiring: args.includes('--hiring'),
    funded: args.includes('--funded') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    limit: 20
  };
  
  // Parse limit
  const limitIdx = args.findIndex(a => a === '--limit' || a === '-n');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    flags.limit = parseInt(args[limitIdx + 1]) || 20;
  }
  
  console.log('');
  console.log('🎯 \x1b[1mINTENT SIGNAL DETECTOR\x1b[0m');
  console.log('   Based on Eric Nowoslawski\'s 239+ video framework');
  console.log('');
  
  // Get leads
  let leads = getLeadsData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found. Run sync first.\x1b[0m');
    console.log('   Expected: data/positive-replies-processed.json');
    return;
  }
  
  // Enrich leads
  leads = leads.map(enrichLead);
  
  // Apply filters
  let criteria = {};
  if (flags.hot) criteria.minScore = 35;
  if (flags.gaming) criteria.vertical = 'gaming';
  if (flags.hiring) criteria.hasHiringSignal = true;
  if (flags.funded) criteria.hasFunding = true;
  
  // Score and rank
  let results;
  if (Object.keys(criteria).length > 0) {
    results = findHighIntentLeads(leads, criteria);
  } else {
    results = rankByIntent(leads);
  }
  
  // Display results
  console.log(`📊 Found ${results.length} leads with intent signals\n`);
  
  if (results.length === 0) {
    console.log('   No leads match the criteria.');
    return;
  }
  
  // Show top leads
  const display = results.slice(0, flags.limit);
  
  console.log('┌──────┬────────────────────────────────┬──────────────┬─────────┐');
  console.log('│ Rank │ Company                        │ Intent       │ Score   │');
  console.log('├──────┼────────────────────────────────┼──────────────┼─────────┤');
  
  display.forEach((lead, i) => {
    const rank = String(i + 1).padStart(4);
    const company = (lead.company?.name || lead.company || 'Unknown').slice(0, 28).padEnd(28);
    const tier = lead.intent.tier;
    const tierDisplay = `${tier.emoji} ${tier.tier}`.padEnd(12);
    const score = String(lead.intent.score).padStart(5);
    
    console.log(`│ ${rank} │ ${company} │ ${tierDisplay} │ ${score}   │`);
  });
  
  console.log('└──────┴────────────────────────────────┴──────────────┴─────────┘');
  
  // Show breakdown summary
  console.log('');
  console.log('📈 \x1b[1mINTENT BREAKDOWN\x1b[0m');
  console.log('');
  
  const tiers = { HOT: 0, WARM: 0, COOL: 0, COLD: 0 };
  results.forEach(r => tiers[r.intent.tier.tier]++);
  
  console.log(`   🔥 HOT:  ${tiers.HOT} leads (score 50+) - prioritize immediately`);
  console.log(`   🟠 WARM: ${tiers.WARM} leads (score 35-49) - follow up this week`);
  console.log(`   🟡 COOL: ${tiers.COOL} leads (score 20-34) - nurture sequence`);
  console.log(`   ⚪ COLD: ${tiers.COLD} leads (score <20) - low priority`);
  
  // Vertical breakdown
  console.log('');
  console.log('🏷️  \x1b[1mBY VERTICAL\x1b[0m');
  console.log('');
  
  const verticals = {};
  results.forEach(r => {
    const v = r.intent.signals.vertical;
    verticals[v] = (verticals[v] || 0) + 1;
  });
  
  Object.entries(verticals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([v, count]) => {
      const score = VERTICAL_SCORES[v] || 0;
      const bar = '█'.repeat(Math.min(count, 30));
      console.log(`   ${v.padEnd(12)} ${String(count).padStart(3)} ${bar}`);
    });
  
  if (flags.verbose) {
    console.log('');
    console.log('🔍 \x1b[1mTOP LEAD DETAILS\x1b[0m');
    console.log('');
    
    display.slice(0, 5).forEach((lead, i) => {
      console.log(`   ${i + 1}. \x1b[1m${lead.company?.name || lead.company}\x1b[0m`);
      console.log(`      Score: ${lead.intent.score} (${lead.intent.tier.tier})`);
      console.log(`      Vertical: ${lead.intent.signals.vertical}`);
      console.log(`      Size: ${lead.intent.signals.size}`);
      console.log(`      Funding: ${lead.intent.signals.funding}`);
      if (lead.intent.signals.hiring.length > 0) {
        console.log(`      Hiring: ${lead.intent.signals.hiring.map(h => h.keyword).join(', ')}`);
      }
      console.log('');
    });
  }
  
  console.log('');
  console.log('\x1b[2m💡 Use --verbose for detailed breakdown | --hot for high-intent only\x1b[0m');
  console.log('');
}

main().catch(console.error);
