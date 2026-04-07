#!/usr/bin/env node
/**
 * Campaign Performance Database
 * Track and reference historical campaign results for pitching
 * 
 * Usage:
 *   node campaigns.js                    # Show all campaigns
 *   node campaigns.js add "Brand" "Creator" 25000 "2025-10-15"
 *   node campaigns.js update <id> --views=48000000 --installs=100000
 *   node campaigns.js stats              # Performance statistics
 *   node campaigns.js pitch <vertical>   # Get relevant case studies
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CAMPAIGNS_FILE = path.join(__dirname, 'data', 'campaigns.json');

function loadCampaigns() {
  try {
    if (fs.existsSync(CAMPAIGNS_FILE)) {
      return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { campaigns: [], lastId: 0 };
}

function saveCampaigns(data) {
  const dir = path.dirname(CAMPAIGNS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(data, null, 2));
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString();
}

// Initialize with historical data if empty
function initializeWithHistory() {
  const data = loadCampaigns();
  if (data.campaigns.length > 0) return data;
  
  // Add known historical campaigns
  const historicalCampaigns = [
    {
      brand: 'Whiteout Survival',
      creator: 'ItssIMANNN',
      vertical: 'gaming',
      dealValue: 48000,
      date: '2025-10-15',
      metrics: {
        views: 48000000,
        installs: 100000,
        engagement: 8.5,
        trending: 'Top 10 iOS for 3 days'
      },
      notes: 'Best performing campaign. Story integration format.'
    },
    {
      brand: 'Gauth AI',
      creator: 'ItssIMANNN',
      vertical: 'edtech',
      dealValue: 35000,
      date: '2025-11-20',
      metrics: {
        views: 15000000,
        installs: 50000,
        engagement: 7.8,
        trending: 'Viral on TikTok'
      },
      notes: 'Education app. Strong conversion.'
    },
    {
      brand: 'Valeo',
      creator: 'ItssIMANNN',
      vertical: 'consumer',
      dealValue: 30906,
      date: '2025-12-10',
      metrics: {
        views: 12000000,
        engagement: 6.5
      },
      notes: 'Consumer brand integration.'
    },
    {
      brand: 'Allison AI',
      creator: 'ItssIMANNN',
      vertical: 'tech',
      dealValue: 24045,
      date: '2026-01-15',
      metrics: {
        views: 10000000,
        engagement: 7.2
      },
      notes: 'AI/tech product.'
    }
  ];
  
  for (const campaign of historicalCampaigns) {
    data.lastId++;
    data.campaigns.push({
      id: data.lastId,
      ...campaign,
      createdAt: new Date().toISOString()
    });
  }
  
  saveCampaigns(data);
  console.log('✅ Initialized with 4 historical campaigns');
  return data;
}

function showCampaigns() {
  const data = initializeWithHistory();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 CAMPAIGN PERFORMANCE DATABASE                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  // Sort by date descending
  const sorted = [...data.campaigns].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  console.log('📈 ALL CAMPAIGNS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const c of sorted) {
    const views = c.metrics?.views ? formatNumber(c.metrics.views) + ' views' : '';
    const installs = c.metrics?.installs ? formatNumber(c.metrics.installs) + ' installs' : '';
    const results = [views, installs].filter(Boolean).join(', ') || 'No metrics yet';
    
    console.log(`\n  #${c.id} ${c.brand}`);
    console.log(`     Creator: ${c.creator} | Vertical: ${c.vertical}`);
    console.log(`     Deal: ${formatCurrency(c.dealValue)} | Date: ${c.date}`);
    console.log(`     Results: ${results}`);
    if (c.metrics?.trending) console.log(`     🔥 ${c.metrics.trending}`);
  }
  
  // Summary stats
  const totalDeals = data.campaigns.reduce((sum, c) => sum + c.dealValue, 0);
  const totalViews = data.campaigns.reduce((sum, c) => sum + (c.metrics?.views || 0), 0);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Campaigns: ${data.campaigns.length}`);
  console.log(`  Total Deal Value: ${formatCurrency(totalDeals)}`);
  console.log(`  Total Views: ${formatNumber(totalViews)}`);
  console.log('');
}

function addCampaign(brand, creator, dealValue, date, vertical) {
  const data = loadCampaigns();
  data.lastId++;
  
  const campaign = {
    id: data.lastId,
    brand,
    creator: creator || 'ItssIMANNN',
    vertical: vertical || 'consumer',
    dealValue: parseFloat(dealValue) || 0,
    date: date || new Date().toISOString().split('T')[0],
    metrics: {},
    notes: '',
    createdAt: new Date().toISOString()
  };
  
  data.campaigns.push(campaign);
  saveCampaigns(data);
  
  console.log(`\n✅ Added campaign #${campaign.id}: ${brand}`);
  console.log(`   Creator: ${campaign.creator}`);
  console.log(`   Deal: ${formatCurrency(campaign.dealValue)}`);
  console.log(`   Update metrics with: node campaigns.js update ${campaign.id} --views=1000000\n`);
  
  return campaign;
}

function updateCampaign(id, updates) {
  const data = loadCampaigns();
  const campaign = data.campaigns.find(c => c.id === parseInt(id));
  
  if (!campaign) {
    console.error(`Campaign #${id} not found`);
    return null;
  }
  
  if (!campaign.metrics) campaign.metrics = {};
  
  for (const [key, value] of Object.entries(updates)) {
    if (['views', 'installs', 'clicks', 'engagement'].includes(key)) {
      campaign.metrics[key] = parseFloat(value);
    } else if (key === 'trending') {
      campaign.metrics.trending = value;
    } else if (key === 'notes') {
      campaign.notes = value;
    } else if (key === 'vertical') {
      campaign.vertical = value;
    }
  }
  
  campaign.updatedAt = new Date().toISOString();
  saveCampaigns(data);
  
  console.log(`✅ Updated campaign #${id}: ${campaign.brand}`);
  return campaign;
}

function showStats() {
  const data = initializeWithHistory();
  
  console.log('\n📊 CAMPAIGN STATISTICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // By vertical
  const byVertical = {};
  for (const c of data.campaigns) {
    if (!byVertical[c.vertical]) {
      byVertical[c.vertical] = { count: 0, value: 0, views: 0 };
    }
    byVertical[c.vertical].count++;
    byVertical[c.vertical].value += c.dealValue;
    byVertical[c.vertical].views += c.metrics?.views || 0;
  }
  
  console.log('  BY VERTICAL:');
  for (const [vertical, stats] of Object.entries(byVertical)) {
    console.log(`    ${vertical.padEnd(12)} ${stats.count} campaigns | ${formatCurrency(stats.value)} | ${formatNumber(stats.views)} views`);
  }
  
  // By creator
  const byCreator = {};
  for (const c of data.campaigns) {
    if (!byCreator[c.creator]) {
      byCreator[c.creator] = { count: 0, value: 0, views: 0 };
    }
    byCreator[c.creator].count++;
    byCreator[c.creator].value += c.dealValue;
    byCreator[c.creator].views += c.metrics?.views || 0;
  }
  
  console.log('\n  BY CREATOR:');
  for (const [creator, stats] of Object.entries(byCreator)) {
    console.log(`    ${creator.padEnd(15)} ${stats.count} campaigns | ${formatCurrency(stats.value)} | ${formatNumber(stats.views)} views`);
  }
  
  // Top performers
  const withViews = data.campaigns.filter(c => c.metrics?.views);
  const topByViews = [...withViews].sort((a, b) => b.metrics.views - a.metrics.views).slice(0, 3);
  
  console.log('\n  TOP PERFORMERS (by views):');
  for (const c of topByViews) {
    console.log(`    ${c.brand.padEnd(20)} ${formatNumber(c.metrics.views)} views`);
  }
  
  // Average deal value
  const avgDeal = data.campaigns.reduce((sum, c) => sum + c.dealValue, 0) / data.campaigns.length;
  console.log(`\n  Average Deal Value: ${formatCurrency(avgDeal)}`);
  console.log('');
}

function getCaseStudies(vertical) {
  const data = initializeWithHistory();
  const relevant = data.campaigns.filter(c => 
    !vertical || c.vertical === vertical || c.vertical.includes(vertical)
  );
  
  console.log(`\n🎯 CASE STUDIES${vertical ? ` (${vertical})` : ''}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  for (const c of relevant) {
    console.log(`  📌 ${c.brand}`);
    console.log(`     Vertical: ${c.vertical} | Deal: ${formatCurrency(c.dealValue)}`);
    
    const results = [];
    if (c.metrics?.views) results.push(`${formatNumber(c.metrics.views)} views`);
    if (c.metrics?.installs) results.push(`${formatNumber(c.metrics.installs)} installs`);
    if (c.metrics?.engagement) results.push(`${c.metrics.engagement}% engagement`);
    
    if (results.length) console.log(`     Results: ${results.join(', ')}`);
    if (c.metrics?.trending) console.log(`     🔥 ${c.metrics.trending}`);
    if (c.notes) console.log(`     Notes: ${c.notes}`);
    console.log('');
  }
  
  console.log('  Use these in pitches to demonstrate proven results.\n');
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'list') {
  showCampaigns();
} else if (command === 'add') {
  const [, brand, creator, dealValue, date, vertical] = args;
  if (!brand) {
    console.log('Usage: node campaigns.js add "Brand" "Creator" <deal_value> "YYYY-MM-DD" "vertical"');
  } else {
    addCampaign(brand, creator, dealValue, date, vertical);
  }
} else if (command === 'update') {
  const id = args[1];
  const updates = {};
  for (let i = 2; i < args.length; i++) {
    const match = args[i].match(/^--(\w+)=(.+)$/);
    if (match) updates[match[1]] = match[2];
  }
  if (!id) {
    console.log('Usage: node campaigns.js update <id> --views=1000000 --installs=50000');
  } else {
    updateCampaign(id, updates);
  }
} else if (command === 'stats') {
  showStats();
} else if (command === 'pitch' || command === 'case' || command === 'cases') {
  const vertical = args[1];
  getCaseStudies(vertical);
} else {
  console.log(`Unknown command: ${command}`);
  console.log('Commands: list, add, update, stats, pitch');
}
