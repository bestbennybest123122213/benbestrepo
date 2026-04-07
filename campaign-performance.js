#!/usr/bin/env node
/**
 * Campaign Performance Tracker
 * 
 * Track live campaign performance and generate client reports.
 * 
 * Usage:
 *   node campaign-performance.js                    # Show all campaigns
 *   node campaign-performance.js add BRAND VALUE    # Add new campaign
 *   node campaign-performance.js update BRAND       # Update metrics
 *   node campaign-performance.js report BRAND       # Generate client report
 */

require('dotenv').config();
const fs = require('fs');

const args = process.argv.slice(2);
const ACTION = args[0] || 'list';
const BRAND = args[1];
const VALUE = args[2];

const DATA_FILE = './data/live-campaigns.json';

// Load/save data
function loadCampaigns() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { campaigns: [], history: [] };
}

function saveCampaigns(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Format numbers
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

// Calculate performance metrics
function calculateMetrics(campaign) {
  const views = campaign.views || 0;
  const clicks = campaign.clicks || 0;
  const conversions = campaign.conversions || 0;
  const spend = campaign.dealValue || 0;
  
  return {
    ctr: clicks > 0 && views > 0 ? ((clicks / views) * 100).toFixed(2) + '%' : 'N/A',
    conversionRate: conversions > 0 && clicks > 0 ? ((conversions / clicks) * 100).toFixed(2) + '%' : 'N/A',
    cpm: views > 0 && spend > 0 ? '$' + ((spend / views) * 1000).toFixed(2) : 'N/A',
    cpa: conversions > 0 && spend > 0 ? '$' + (spend / conversions).toFixed(2) : 'N/A',
    viewsFormatted: formatNumber(views),
    roi: campaign.estimatedRevenue && spend > 0 
      ? ((campaign.estimatedRevenue - spend) / spend * 100).toFixed(0) + '%'
      : 'N/A'
  };
}

// List all campaigns
function listCampaigns() {
  const data = loadCampaigns();
  
  if (data.campaigns.length === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📊 CAMPAIGN PERFORMANCE TRACKER                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝

   No active campaigns. Add one with:
   
   gex campaign add "Brand Name" 25000
   
   Then update metrics with:
   
   gex campaign update "Brand Name"
`);
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📊 CAMPAIGN PERFORMANCE TRACKER                                         ║
║  ${data.campaigns.length} Active Campaign${data.campaigns.length > 1 ? 's' : ''}                                                    ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  data.campaigns.forEach((campaign, i) => {
    const metrics = calculateMetrics(campaign);
    const status = campaign.status || 'Active';
    const statusEmoji = status === 'Active' ? '🟢' : status === 'Completed' ? '✅' : '🟡';
    
    console.log(`${statusEmoji} ${i + 1}. ${campaign.brand}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Creator:       ${campaign.creator || 'ItssIMANNN'}`);
    console.log(`   Deal Value:    $${(campaign.dealValue || 0).toLocaleString()}`);
    console.log(`   Live Date:     ${campaign.liveDate || 'TBD'}`);
    console.log(`   Status:        ${status}`);
    console.log('');
    console.log(`   📈 METRICS`);
    console.log(`   Views:         ${metrics.viewsFormatted}`);
    console.log(`   CTR:           ${metrics.ctr}`);
    console.log(`   Conversions:   ${formatNumber(campaign.conversions || 0)}`);
    console.log(`   CPA:           ${metrics.cpa}`);
    console.log(`   CPM:           ${metrics.cpm}`);
    console.log(`   Est. ROI:      ${metrics.roi}`);
    console.log('');
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands:
  gex campaign add BRAND VALUE    Add new campaign
  gex campaign update BRAND       Update metrics interactively
  gex campaign report BRAND       Generate client report
`);
}

// Add new campaign
function addCampaign(brand, dealValue) {
  if (!brand) {
    console.log('Usage: gex campaign add "Brand Name" 25000');
    return;
  }

  const data = loadCampaigns();
  
  const campaign = {
    id: Date.now(),
    brand: brand,
    dealValue: parseInt(dealValue) || 25000,
    creator: 'ItssIMANNN',
    status: 'Active',
    createdAt: new Date().toISOString(),
    liveDate: null,
    views: 0,
    clicks: 0,
    conversions: 0,
    estimatedRevenue: 0,
    updates: []
  };

  data.campaigns.push(campaign);
  saveCampaigns(data);

  console.log(`✅ Added campaign: ${brand}`);
  console.log(`   Deal Value: $${campaign.dealValue.toLocaleString()}`);
  console.log(`\n   Next: Update metrics with "gex campaign update ${brand}"`);
}

// Update campaign metrics
function updateCampaign(brand) {
  if (!brand) {
    console.log('Usage: gex campaign update "Brand Name"');
    return;
  }

  const data = loadCampaigns();
  const campaign = data.campaigns.find(c => 
    c.brand.toLowerCase().includes(brand.toLowerCase())
  );

  if (!campaign) {
    console.log(`Campaign not found: ${brand}`);
    return;
  }

  console.log(`
📊 Update Campaign: ${campaign.brand}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current metrics:
  Views:       ${formatNumber(campaign.views)}
  Clicks:      ${formatNumber(campaign.clicks)}
  Conversions: ${formatNumber(campaign.conversions)}

To update, edit data/live-campaigns.json directly or use:

  # Example: Update views to 5M
  node campaign-performance.js set "${campaign.brand}" views 5000000
  
  # Update multiple
  node campaign-performance.js set "${campaign.brand}" clicks 75000
  node campaign-performance.js set "${campaign.brand}" conversions 5000
`);
}

// Set specific metric
function setMetric(brand, metric, value) {
  const data = loadCampaigns();
  const campaign = data.campaigns.find(c => 
    c.brand.toLowerCase().includes(brand.toLowerCase())
  );

  if (!campaign) {
    console.log(`Campaign not found: ${brand}`);
    return;
  }

  const numValue = parseInt(value);
  if (isNaN(numValue)) {
    console.log(`Invalid value: ${value}`);
    return;
  }

  campaign[metric] = numValue;
  campaign.updates.push({
    date: new Date().toISOString(),
    metric,
    value: numValue
  });

  saveCampaigns(data);
  console.log(`✅ Updated ${campaign.brand}: ${metric} = ${formatNumber(numValue)}`);
}

// Generate client report
function generateReport(brand) {
  const data = loadCampaigns();
  const campaign = data.campaigns.find(c => 
    c.brand.toLowerCase().includes(brand.toLowerCase())
  );

  if (!campaign) {
    console.log(`Campaign not found: ${brand}`);
    return;
  }

  const metrics = calculateMetrics(campaign);

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📋 CAMPAIGN REPORT: ${campaign.brand.toUpperCase().padEnd(46)}║
╚═══════════════════════════════════════════════════════════════════════════╝

CAMPAIGN OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creator:          ${campaign.creator}
Integration Type: Story Integration
Live Date:        ${campaign.liveDate || 'TBD'}
Status:           ${campaign.status}

PERFORMANCE METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Views:      ${metrics.viewsFormatted}
Click-Through:    ${metrics.ctr}
Conversions:      ${formatNumber(campaign.conversions || 0)}
Cost per View:    ${metrics.cpm} CPM

ROI ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Investment:       $${(campaign.dealValue || 0).toLocaleString()}
Cost per Acq:     ${metrics.cpa}
Est. Revenue:     $${(campaign.estimatedRevenue || 0).toLocaleString()}
ROI:              ${metrics.roi}

KEY HIGHLIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Reached ${metrics.viewsFormatted} viewers
• Generated ${formatNumber(campaign.conversions || 0)} direct actions
• Effective CPM of ${metrics.cpm} (vs $15+ industry average)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Report Generated: ${new Date().toLocaleString()}
BY Influence Company LLC
`);
}

// Main router
switch (ACTION) {
  case 'list':
    listCampaigns();
    break;
  case 'add':
    addCampaign(BRAND, VALUE);
    break;
  case 'update':
    updateCampaign(BRAND);
    break;
  case 'set':
    setMetric(BRAND, VALUE, args[3]);
    break;
  case 'report':
    generateReport(BRAND);
    break;
  default:
    listCampaigns();
}
