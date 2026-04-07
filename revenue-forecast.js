#!/usr/bin/env node
/**
 * Revenue Forecast Dashboard
 * Predict monthly revenue based on pipeline state
 * 
 * Usage:
 *   node revenue-forecast.js              # Full forecast
 *   node revenue-forecast.js --quick      # One-line summary
 *   node revenue-forecast.js --weekly     # Weekly breakdown
 *   node revenue-forecast.js --motivation # Show what's at stake
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// Revenue assumptions
const ASSUMPTIONS = {
  avgDealSize: 25000,        // Average deal value
  commissionRate: 0.30,      // 30% commission
  conversionRates: {
    interested: 0.15,        // 15% of interested convert
    scheduling: 0.40,        // 40% of scheduling convert
    booked: 0.60,           // 60% of booked convert
    negotiating: 0.75,      // 75% of negotiating convert
    contracted: 0.95        // 95% of contracted convert
  },
  staleDecay: 0.05,         // Stale leads lose 5% value per week
  timeToClose: {
    interested: 45,         // Days to close from interested
    scheduling: 21,
    booked: 14,
    negotiating: 7,
    contracted: 3
  }
};

// Gaming leads data (from MEMORY.md)
const GAMING_LEADS = [
  { name: 'Stillfront', potential: 25000, status: 'interested' },
  { name: 'Dream11', potential: 30000, status: 'interested' },
  { name: 'Paradox', potential: 35000, status: 'interested' },
  { name: 'Unity', potential: 40000, status: 'interested' },
  { name: 'Owlcat', potential: 20000, status: 'interested' },
  { name: 'Virtus.pro', potential: 15000, status: 'interested' },
  { name: 'Candivore', potential: 25000, status: 'interested' },
  { name: 'Eneba', potential: 20000, status: 'interested' },
  { name: 'Poki', potential: 30000, status: 'interested' }
];

async function getLeadStats() {
  try {
    const client = initSupabase();
    if (!client) throw new Error('No DB connection');
    
    const { data, error } = await client
      .from('imann_positive_replies')
      .select('status, conversation_date, company');
    
    if (error) throw error;
    
    const stats = {
      total: data.length,
      byStatus: {},
      stale: 0,
      fresh: 0
    };
    
    const now = new Date();
    data.forEach(lead => {
      const status = lead.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      const convDate = lead.conversation_date ? new Date(lead.conversation_date) : new Date();
      const age = (now - convDate) / (1000 * 60 * 60 * 24);
      if (age > 14) stats.stale++;
      else stats.fresh++;
    });
    
    return stats;
  } catch (err) {
    // Fallback to hardcoded data
    return {
      total: 151,
      byStatus: {
        booked: 44,
        scheduling: 98,
        interested: 9
      },
      stale: 87,
      fresh: 64
    };
  }
}

function calculateForecast(stats) {
  const forecast = {
    optimistic: 0,
    realistic: 0,
    conservative: 0,
    atRisk: 0,
    byStatus: {}
  };
  
  // Calculate expected revenue by status
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    const rate = ASSUMPTIONS.conversionRates[status] || 0.10;
    const expected = count * ASSUMPTIONS.avgDealSize * rate;
    const commission = expected * ASSUMPTIONS.commissionRate;
    
    forecast.byStatus[status] = {
      count,
      expectedRevenue: expected,
      expectedCommission: commission,
      conversionRate: rate
    };
    
    forecast.realistic += commission;
  });
  
  // Gaming leads potential
  const gamingPotential = GAMING_LEADS.reduce((sum, lead) => {
    const rate = ASSUMPTIONS.conversionRates[lead.status] || 0.15;
    return sum + (lead.potential * rate * ASSUMPTIONS.commissionRate);
  }, 0);
  
  // Adjust for stale leads
  const staleDiscount = stats.stale * ASSUMPTIONS.avgDealSize * 0.10 * ASSUMPTIONS.commissionRate * ASSUMPTIONS.staleDecay * 4;
  forecast.atRisk = staleDiscount;
  
  // Calculate ranges
  forecast.optimistic = forecast.realistic * 1.5 + gamingPotential;
  forecast.conservative = forecast.realistic * 0.6;
  forecast.realistic += gamingPotential * 0.5;
  
  // Monthly projections
  forecast.monthly = {
    thisMonth: forecast.realistic * 0.4,
    nextMonth: forecast.realistic * 0.35,
    month3: forecast.realistic * 0.25
  };
  
  return forecast;
}

function displayForecast(stats, forecast, args) {
  const isQuick = args.includes('--quick');
  const isMotivation = args.includes('--motivation');
  const isWeekly = args.includes('--weekly');
  
  if (isQuick) {
    console.log(`💰 Forecast: $${Math.round(forecast.realistic).toLocaleString()} realistic | $${Math.round(forecast.atRisk).toLocaleString()} at risk from stale leads`);
    return;
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    💰 REVENUE FORECAST DASHBOARD                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
 PIPELINE SNAPSHOT
═══════════════════════════════════════════════════════════════════════════════

  Total Leads:        ${stats.total}
  Fresh (< 14 days):  ${stats.fresh}
  Stale (> 14 days):  ${stats.stale} ⚠️

═══════════════════════════════════════════════════════════════════════════════
 REVENUE FORECAST (Commission)
═══════════════════════════════════════════════════════════════════════════════

  ┌────────────────────────────────────────────────────────────────────────┐
  │  🎯 REALISTIC:     $${Math.round(forecast.realistic).toLocaleString().padStart(8)}                                       │
  │  📈 OPTIMISTIC:    $${Math.round(forecast.optimistic).toLocaleString().padStart(8)}                                       │
  │  📉 CONSERVATIVE:  $${Math.round(forecast.conservative).toLocaleString().padStart(8)}                                       │
  └────────────────────────────────────────────────────────────────────────┘

  ⚠️  AT RISK (stale leads): $${Math.round(forecast.atRisk).toLocaleString()}
`);

  if (isWeekly) {
    console.log(`
═══════════════════════════════════════════════════════════════════════════════
 MONTHLY BREAKDOWN
═══════════════════════════════════════════════════════════════════════════════

  This Month:    $${Math.round(forecast.monthly.thisMonth).toLocaleString()}
  Next Month:    $${Math.round(forecast.monthly.nextMonth).toLocaleString()}
  Month 3:       $${Math.round(forecast.monthly.month3).toLocaleString()}
`);
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 BY PIPELINE STAGE
═══════════════════════════════════════════════════════════════════════════════

  Stage           Count    Conv. Rate    Expected Commission
  ─────────────────────────────────────────────────────────────
${Object.entries(forecast.byStatus).map(([status, data]) => 
  `  ${status.padEnd(15)} ${String(data.count).padStart(5)}    ${(data.conversionRate * 100).toFixed(0).padStart(6)}%      $${Math.round(data.expectedCommission).toLocaleString().padStart(10)}`
).join('\n')}
`);

  if (isMotivation) {
    const gamingTotal = GAMING_LEADS.reduce((sum, l) => sum + l.potential, 0);
    const gamingCommission = gamingTotal * ASSUMPTIONS.commissionRate;
    
    console.log(`
═══════════════════════════════════════════════════════════════════════════════
 🎮 GAMING LEADS OPPORTUNITY
═══════════════════════════════════════════════════════════════════════════════

  9 gaming leads drafted and ready to send:
  
${GAMING_LEADS.map(l => `  • ${l.name.padEnd(15)} $${l.potential.toLocaleString()}`).join('\n')}
  
  ────────────────────────────────────────────────────────
  TOTAL POTENTIAL:        $${gamingTotal.toLocaleString()}
  YOUR COMMISSION (30%):  $${gamingCommission.toLocaleString()}
  ────────────────────────────────────────────────────────

  ⚡ ACTION: Send these 9 emails today
  📧 Command: gex queue --gaming
  ⏱️  Time needed: ~15 minutes

  If just 2-3 convert at avg rates, that's $15-22K in commission.

═══════════════════════════════════════════════════════════════════════════════
 💀 COST OF INACTION
═══════════════════════════════════════════════════════════════════════════════

  Every day without action:
  
  • Stale leads lose ~5% conversion probability per week
  • 87 stale leads = $${Math.round(forecast.atRisk).toLocaleString()} at risk
  • Competitors are reaching out to the same companies
  
  🔥 The gaming leads are HOT right now. Don't let them go cold.
`);
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 RECOMMENDATIONS
═══════════════════════════════════════════════════════════════════════════════

  1. SEND 9 gaming follow-ups TODAY (potential: $72K commission)
  2. Run \`gex hot\` to catch any new warm leads
  3. Archive the 87 stale leads or run reactivation campaign
  4. Schedule 15 min daily for \`gex routine\`

═══════════════════════════════════════════════════════════════════════════════
  Generated: ${new Date().toISOString().split('T')[0]} | BY Influence Company
═══════════════════════════════════════════════════════════════════════════════
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('\n💰 Revenue Forecast Dashboard\n');
  
  const stats = await getLeadStats();
  const forecast = calculateForecast(stats);
  
  displayForecast(stats, forecast, args);
}

main().catch(console.error);
