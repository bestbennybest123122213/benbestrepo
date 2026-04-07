#!/usr/bin/env node
/**
 * Deal Pipeline Tracker
 * Track active deals through stages with values and next actions
 * 
 * Usage:
 *   node deals.js                    # Show pipeline overview
 *   node deals.js add "Company" 25000 "Negotiation" "Send proposal"
 *   node deals.js update <id> --stage="Closed Won" --value=30000
 *   node deals.js list               # List all deals
 *   node deals.js next               # Show deals needing action
 *   node deals.js forecast           # Revenue forecast by stage
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DEALS_FILE = path.join(__dirname, 'data', 'deals.json');

// Deal stages with win probability
const STAGES = {
  'Lead': { probability: 0.1, order: 1 },
  'Contacted': { probability: 0.2, order: 2 },
  'Meeting Scheduled': { probability: 0.4, order: 3 },
  'Proposal Sent': { probability: 0.6, order: 4 },
  'Negotiation': { probability: 0.75, order: 5 },
  'Contract Sent': { probability: 0.9, order: 6 },
  'Closed Won': { probability: 1.0, order: 7 },
  'Closed Lost': { probability: 0, order: 8 }
};

function loadDeals() {
  try {
    if (fs.existsSync(DEALS_FILE)) {
      return JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading deals:', e.message);
  }
  return { deals: [], lastId: 0 };
}

function saveDeals(data) {
  const dir = path.dirname(DEALS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DEALS_FILE, JSON.stringify(data, null, 2));
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const target = new Date(dateStr);
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function showOverview() {
  const data = loadDeals();
  const activeDeals = data.deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  💼 DEAL PIPELINE                                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (activeDeals.length === 0) {
    console.log('No active deals. Add one with: node deals.js add "Company" 25000 "Stage" "Next action"\n');
    return;
  }
  
  // Group by stage
  const byStage = {};
  for (const deal of activeDeals) {
    if (!byStage[deal.stage]) byStage[deal.stage] = [];
    byStage[deal.stage].push(deal);
  }
  
  // Show funnel
  console.log('📊 PIPELINE FUNNEL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const stageOrder = Object.entries(STAGES)
    .filter(([s]) => s !== 'Closed Won' && s !== 'Closed Lost')
    .sort((a, b) => a[1].order - b[1].order);
  
  let totalValue = 0;
  let weightedValue = 0;
  
  for (const [stage, info] of stageOrder) {
    const deals = byStage[stage] || [];
    const stageValue = deals.reduce((sum, d) => sum + d.value, 0);
    const weighted = stageValue * info.probability;
    totalValue += stageValue;
    weightedValue += weighted;
    
    const bar = '█'.repeat(Math.min(deals.length * 3, 30));
    console.log(`  ${stage.padEnd(18)} ${bar.padEnd(30)} ${deals.length} deals | ${formatCurrency(stageValue)}`);
  }
  
  console.log('\n💰 PIPELINE VALUE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Pipeline:      ${formatCurrency(totalValue)}`);
  console.log(`  Weighted Forecast:   ${formatCurrency(weightedValue)}`);
  
  // Won this month
  const now = new Date();
  const thisMonth = data.deals.filter(d => {
    if (d.stage !== 'Closed Won') return false;
    const closed = new Date(d.closedAt);
    return closed.getMonth() === now.getMonth() && closed.getFullYear() === now.getFullYear();
  });
  const wonValue = thisMonth.reduce((sum, d) => sum + d.value, 0);
  console.log(`  Won This Month:      ${formatCurrency(wonValue)} (${thisMonth.length} deals)`);
  
  // Deals needing action
  console.log('\n⚡ NEEDS ACTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const needsAction = activeDeals
    .filter(d => d.nextAction)
    .sort((a, b) => {
      const daysA = daysUntil(a.nextActionDate) || 999;
      const daysB = daysUntil(b.nextActionDate) || 999;
      return daysA - daysB;
    })
    .slice(0, 5);
  
  if (needsAction.length === 0) {
    console.log('  No pending actions');
  } else {
    for (const deal of needsAction) {
      const days = daysUntil(deal.nextActionDate);
      let urgency = '';
      if (days !== null) {
        if (days < 0) urgency = '🔴 OVERDUE';
        else if (days === 0) urgency = '🟠 TODAY';
        else if (days <= 2) urgency = '🟡 SOON';
      }
      console.log(`  ${deal.company.substring(0, 20).padEnd(20)} ${urgency.padEnd(12)} ${deal.nextAction}`);
    }
  }
  
  console.log('\n');
}

function addDeal(company, value, stage, nextAction, nextActionDate, creator = 'ItssIMANNN') {
  const data = loadDeals();
  data.lastId++;
  
  const deal = {
    id: data.lastId,
    company,
    value: parseInt(value) || 0,
    stage: stage || 'Lead',
    nextAction: nextAction || null,
    nextActionDate: nextActionDate || null,
    creator,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [{
      date: new Date().toISOString(),
      action: 'Created',
      stage: stage || 'Lead'
    }]
  };
  
  data.deals.push(deal);
  saveDeals(data);
  
  console.log(`✅ Added deal #${deal.id}: ${company} - ${formatCurrency(deal.value)}`);
  return deal;
}

function updateDeal(id, updates) {
  const data = loadDeals();
  const deal = data.deals.find(d => d.id === parseInt(id));
  
  if (!deal) {
    console.error(`Deal #${id} not found`);
    return null;
  }
  
  const oldStage = deal.stage;
  
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'stage') {
      deal.stage = value;
      deal.history.push({
        date: new Date().toISOString(),
        action: `Stage changed: ${oldStage} → ${value}`,
        stage: value
      });
      if (value === 'Closed Won') {
        deal.closedAt = new Date().toISOString();
      }
    } else if (key === 'value') {
      deal.value = parseInt(value);
    } else if (key === 'nextAction') {
      deal.nextAction = value;
    } else if (key === 'nextActionDate') {
      deal.nextActionDate = value;
    }
  }
  
  deal.updatedAt = new Date().toISOString();
  saveDeals(data);
  
  console.log(`✅ Updated deal #${id}: ${deal.company}`);
  return deal;
}

function listDeals(filter = 'active') {
  const data = loadDeals();
  let deals = data.deals;
  
  if (filter === 'active') {
    deals = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
  } else if (filter === 'won') {
    deals = deals.filter(d => d.stage === 'Closed Won');
  } else if (filter === 'lost') {
    deals = deals.filter(d => d.stage === 'Closed Lost');
  }
  
  console.log('\n📋 DEALS LIST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (deals.length === 0) {
    console.log('  No deals found\n');
    return;
  }
  
  for (const deal of deals) {
    console.log(`  #${deal.id.toString().padEnd(3)} ${deal.company.substring(0, 25).padEnd(25)} ${formatCurrency(deal.value).padStart(10)} | ${deal.stage}`);
    if (deal.nextAction) {
      console.log(`        → ${deal.nextAction}`);
    }
  }
  console.log('');
}

function showForecast() {
  const data = loadDeals();
  const activeDeals = data.deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost');
  
  console.log('\n📈 REVENUE FORECAST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let total = 0;
  for (const [stage, info] of Object.entries(STAGES)) {
    if (stage === 'Closed Won' || stage === 'Closed Lost') continue;
    
    const stageDeals = activeDeals.filter(d => d.stage === stage);
    const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
    const weighted = stageValue * info.probability;
    total += weighted;
    
    if (stageDeals.length > 0) {
      console.log(`  ${stage.padEnd(18)} ${formatCurrency(stageValue).padStart(10)} × ${(info.probability * 100).toFixed(0).padStart(3)}% = ${formatCurrency(weighted).padStart(10)}`);
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${'Expected Revenue'.padEnd(18)} ${formatCurrency(total).padStart(35)}`);
  console.log('');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'overview') {
  showOverview();
} else if (command === 'add') {
  // node deals.js add "Company" 25000 "Stage" "Next action" "2026-02-15"
  const [, company, value, stage, nextAction, nextActionDate] = args;
  if (!company || !value) {
    console.log('Usage: node deals.js add "Company" 25000 "Stage" "Next action" "YYYY-MM-DD"');
  } else {
    addDeal(company, value, stage, nextAction, nextActionDate);
  }
} else if (command === 'update') {
  // node deals.js update 1 --stage="Negotiation" --value=30000
  const id = args[1];
  const updates = {};
  for (let i = 2; i < args.length; i++) {
    const match = args[i].match(/^--(\w+)=(.+)$/);
    if (match) {
      updates[match[1]] = match[2];
    }
  }
  if (!id || Object.keys(updates).length === 0) {
    console.log('Usage: node deals.js update <id> --stage="Stage" --value=30000');
  } else {
    updateDeal(id, updates);
  }
} else if (command === 'list') {
  const filter = args[1] || 'active';
  listDeals(filter);
} else if (command === 'next' || command === 'actions') {
  const data = loadDeals();
  const activeDeals = data.deals.filter(d => 
    d.stage !== 'Closed Won' && 
    d.stage !== 'Closed Lost' && 
    d.nextAction
  );
  
  console.log('\n⚡ DEALS NEEDING ACTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const sorted = activeDeals.sort((a, b) => {
    const daysA = daysUntil(a.nextActionDate) || 999;
    const daysB = daysUntil(b.nextActionDate) || 999;
    return daysA - daysB;
  });
  
  for (const deal of sorted) {
    const days = daysUntil(deal.nextActionDate);
    let urgency = '  ';
    if (days !== null) {
      if (days < 0) urgency = '🔴';
      else if (days === 0) urgency = '🟠';
      else if (days <= 2) urgency = '🟡';
      else urgency = '🟢';
    }
    console.log(`  ${urgency} #${deal.id} ${deal.company.substring(0, 20).padEnd(20)} ${formatCurrency(deal.value).padStart(10)}`);
    console.log(`       ${deal.nextAction}`);
  }
  console.log('');
} else if (command === 'forecast') {
  showForecast();
} else if (command === 'won') {
  // Mark as won
  const id = args[1];
  if (id) {
    updateDeal(id, { stage: 'Closed Won' });
  } else {
    listDeals('won');
  }
} else if (command === 'lost') {
  // Mark as lost
  const id = args[1];
  if (id) {
    updateDeal(id, { stage: 'Closed Lost' });
  } else {
    listDeals('lost');
  }
} else {
  console.log(`Unknown command: ${command}`);
  console.log('Commands: overview, add, update, list, next, forecast, won, lost');
}
