#!/usr/bin/env node
/**
 * ROI Calculator
 * 
 * Calculate and present ROI projections for prospects.
 * Use during sales calls to demonstrate value.
 * 
 * Usage:
 *   node roi-calculator.js gaming 25000       # Gaming vertical, $25K budget
 *   node roi-calculator.js education 20000    # Education vertical, $20K budget
 *   node roi-calculator.js --interactive      # Guided mode
 */

require('dotenv').config();

const args = process.argv.slice(2);
const VERTICAL = args[0];
const BUDGET = parseInt(args[1]) || 25000;

// Historical performance data
const BENCHMARKS = {
  gaming: {
    name: 'Gaming / Mobile Apps',
    avgViews: 30000000,      // 30M average views
    ctr: 0.015,              // 1.5% click-through
    conversionRate: 0.08,    // 8% install rate from click
    avgUserValue: 2.50,      // $2.50 LTV per user
    typicalCac: 3.00,        // $3 typical CAC in market
    caseStudy: {
      name: 'Whiteout Survival',
      views: 48000000,
      users: 100000,
      costPerUser: 0.48
    }
  },
  education: {
    name: 'Education / EdTech',
    avgViews: 15000000,      // 15M average views
    ctr: 0.012,              // 1.2% click-through
    conversionRate: 0.06,    // 6% signup rate
    avgUserValue: 15.00,     // $15 LTV per user
    typicalCac: 8.00,        // $8 typical CAC in market
    caseStudy: {
      name: 'Gauth AI',
      views: 15000000,
      users: 50000,
      costPerUser: 0.70
    }
  },
  ai: {
    name: 'AI / SaaS',
    avgViews: 12000000,      // 12M average views
    ctr: 0.01,               // 1% click-through
    conversionRate: 0.03,    // 3% trial signup rate
    avgUserValue: 50.00,     // $50 LTV per user
    typicalCac: 25.00,       // $25 typical CAC in market
    caseStudy: {
      name: 'Allison AI',
      views: 10000000,
      users: 3000,
      costPerUser: 8.00
    }
  },
  consumer: {
    name: 'Consumer / DTC',
    avgViews: 20000000,      // 20M average views
    ctr: 0.02,               // 2% click-through
    conversionRate: 0.04,    // 4% purchase rate
    avgUserValue: 35.00,     // $35 AOV
    typicalCac: 15.00,       // $15 typical CAC
    caseStudy: {
      name: 'Valeo',
      views: 12000000,
      users: 9600,
      costPerUser: 3.22
    }
  }
};

// CPM benchmarks for comparison
const CPM_BENCHMARKS = {
  youtube_ads: 15,
  tv: 25,
  facebook: 12,
  instagram: 10,
  tiktok: 8,
  itssimannn: 0.83  // Based on $25K for 30M views
};

function calculateROI(vertical, budget) {
  const data = BENCHMARKS[vertical] || BENCHMARKS.consumer;
  
  // Calculate projected performance
  const projectedViews = Math.round((budget / 25000) * data.avgViews);
  const projectedClicks = Math.round(projectedViews * data.ctr);
  const projectedConversions = Math.round(projectedClicks * data.conversionRate);
  const projectedRevenue = projectedConversions * data.avgUserValue;
  const roi = ((projectedRevenue - budget) / budget) * 100;
  const costPerAcquisition = projectedConversions > 0 ? budget / projectedConversions : 0;
  const effectiveCPM = (budget / projectedViews) * 1000;
  
  // Compare to typical CAC
  const cacSavings = (data.typicalCac - costPerAcquisition) * projectedConversions;
  const cacSavingsPercent = ((data.typicalCac - costPerAcquisition) / data.typicalCac) * 100;
  
  return {
    vertical: data.name,
    budget,
    projectedViews,
    projectedClicks,
    projectedConversions,
    projectedRevenue,
    roi,
    costPerAcquisition,
    effectiveCPM,
    typicalCac: data.typicalCac,
    cacSavings,
    cacSavingsPercent,
    caseStudy: data.caseStudy
  };
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function displayROI(results) {
  const {
    vertical, budget, projectedViews, projectedClicks, projectedConversions,
    projectedRevenue, roi, costPerAcquisition, effectiveCPM, typicalCac,
    cacSavings, cacSavingsPercent, caseStudy
  } = results;

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  💰 ROI CALCULATOR: ${vertical.toUpperCase().padEnd(48)}║
║  Budget: $${budget.toLocaleString().padEnd(61)}║
╚═══════════════════════════════════════════════════════════════════════════╝

📊 PROJECTED PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Views:              ${formatNumber(projectedViews)}
   Clicks:             ${formatNumber(projectedClicks)}
   Conversions:        ${formatNumber(projectedConversions)}

💵 FINANCIAL PROJECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Investment:         $${budget.toLocaleString()}
   Projected Revenue:  $${projectedRevenue.toLocaleString()}
   ROI:                ${roi > 0 ? '+' : ''}${roi.toFixed(0)}% ${roi > 100 ? '🚀' : roi > 0 ? '✅' : '⚠️'}

📈 COST EFFICIENCY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Cost per Acquisition:  $${costPerAcquisition.toFixed(2)}
   Industry Average CAC:  $${typicalCac.toFixed(2)}
   Your Savings:          ${cacSavingsPercent > 0 ? cacSavingsPercent.toFixed(0) + '% lower' : 'At market rate'}
   Total CAC Savings:     $${Math.max(0, cacSavings).toLocaleString()}

📺 CPM COMPARISON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ItssIMANNN:    $${effectiveCPM.toFixed(2)} CPM ⭐
   YouTube Ads:   $${CPM_BENCHMARKS.youtube_ads} CPM
   Facebook:      $${CPM_BENCHMARKS.facebook} CPM
   TV Ads:        $${CPM_BENCHMARKS.tv} CPM
   
   Savings vs YouTube Ads: ${((1 - effectiveCPM/CPM_BENCHMARKS.youtube_ads) * 100).toFixed(0)}%

📋 CASE STUDY: ${caseStudy.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Actual Views:        ${formatNumber(caseStudy.views)}
   Actual Users:        ${formatNumber(caseStudy.users)}
   Actual Cost/User:    $${caseStudy.costPerUser.toFixed(2)}

🎯 KEY TALKING POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. "${formatNumber(projectedViews)} views for $${budget.toLocaleString()} is a $${effectiveCPM.toFixed(2)} CPM"
   2. "That's ${((1 - effectiveCPM/CPM_BENCHMARKS.youtube_ads) * 100).toFixed(0)}% cheaper than YouTube ads"
   3. "At $${costPerAcquisition.toFixed(2)} per user vs $${typicalCac.toFixed(2)} market rate, you save ${cacSavingsPercent.toFixed(0)}%"
   4. "${caseStudy.name} got ${formatNumber(caseStudy.users)} users at $${caseStudy.costPerUser.toFixed(2)} each"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Use these numbers in your pitch. Adjust based on prospect's actual LTV.
`);
}

function showHelp() {
  console.log(`
ROI Calculator - Demonstrate value to prospects

Usage:
  gex roi gaming 25000      # Gaming vertical, $25K budget
  gex roi education 20000   # Education vertical, $20K budget
  gex roi ai 30000          # AI/SaaS vertical, $30K budget
  gex roi consumer 15000    # Consumer/DTC vertical, $15K budget

Verticals:
  gaming      - Mobile games, gaming apps, esports
  education   - EdTech, courses, learning apps
  ai          - AI tools, SaaS, B2B software
  consumer    - DTC brands, CPG, lifestyle

Examples:
  gex roi gaming 25000      # Typical gaming campaign
  gex roi education 35000   # Larger EdTech campaign
  gex roi ai 20000          # AI startup budget
`);
}

// Main
if (!VERTICAL || VERTICAL === '--help' || VERTICAL === 'help') {
  showHelp();
  process.exit(0);
}

const validVerticals = ['gaming', 'education', 'ai', 'consumer', 'saas', 'tech', 'edtech', 'mobile'];
const normalizedVertical = VERTICAL.toLowerCase();

let mappedVertical = normalizedVertical;
if (['saas', 'tech', 'software'].includes(normalizedVertical)) mappedVertical = 'ai';
if (['edtech', 'learning'].includes(normalizedVertical)) mappedVertical = 'education';
if (['mobile', 'app', 'games'].includes(normalizedVertical)) mappedVertical = 'gaming';
if (['dtc', 'ecommerce', 'retail'].includes(normalizedVertical)) mappedVertical = 'consumer';

if (!BENCHMARKS[mappedVertical]) {
  console.log(`Unknown vertical: ${VERTICAL}. Using 'consumer' as default.`);
  mappedVertical = 'consumer';
}

const results = calculateROI(mappedVertical, BUDGET);
displayROI(results);
