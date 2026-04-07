#!/usr/bin/env node
/**
 * Pipeline Velocity Tracker
 * 
 * Tracks how fast leads move through the pipeline.
 * Predicts close dates and identifies bottlenecks.
 * 
 * Usage:
 *   node pipeline-velocity.js           # Show velocity metrics
 *   node pipeline-velocity.js --detail  # Detailed breakdown
 *   node pipeline-velocity.js --predict # Close date predictions
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const DETAIL = args.includes('--detail');
const PREDICT = args.includes('--predict');

// Stage definitions with expected days
const STAGES = {
  lead: { name: 'Lead', expectedDays: 0, winProb: 0.05 },
  contacted: { name: 'Contacted', expectedDays: 3, winProb: 0.15 },
  meeting_scheduled: { name: 'Meeting Scheduled', expectedDays: 7, winProb: 0.35 },
  proposal_sent: { name: 'Proposal Sent', expectedDays: 14, winProb: 0.55 },
  negotiation: { name: 'Negotiation', expectedDays: 21, winProb: 0.75 },
  contract_sent: { name: 'Contract Sent', expectedDays: 28, winProb: 0.90 },
  won: { name: 'Won', expectedDays: 35, winProb: 1.00 },
  lost: { name: 'Lost', expectedDays: null, winProb: 0 }
};

// Historical benchmarks (based on industry averages)
const BENCHMARKS = {
  avgDaysToClose: 21,
  avgDaysPerStage: {
    lead_to_contacted: 1,
    contacted_to_meeting: 3,
    meeting_to_proposal: 5,
    proposal_to_negotiation: 4,
    negotiation_to_contract: 5,
    contract_to_won: 3
  },
  conversionRates: {
    lead_to_contacted: 0.80,
    contacted_to_meeting: 0.40,
    meeting_to_proposal: 0.60,
    proposal_to_won: 0.50
  }
};

async function analyzeVelocity(client) {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get all positive replies with timestamps
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads || leads.length === 0) {
    console.log('No leads found in database.');
    return;
  }

  // Calculate age distribution
  const ageGroups = {
    '0-3 days': 0,
    '4-7 days': 0,
    '8-14 days': 0,
    '15-30 days': 0,
    '30+ days': 0
  };

  const categoryBreakdown = {};
  let totalAgeDays = 0;
  let pendingCount = 0;

  leads.forEach(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Age groups
    if (age <= 3) ageGroups['0-3 days']++;
    else if (age <= 7) ageGroups['4-7 days']++;
    else if (age <= 14) ageGroups['8-14 days']++;
    else if (age <= 30) ageGroups['15-30 days']++;
    else ageGroups['30+ days']++;
    
    // Category breakdown
    const cat = lead.reply_category || 'Unknown';
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { count: 0, totalAge: 0 };
    categoryBreakdown[cat].count++;
    categoryBreakdown[cat].totalAge += age;
    
    // Pending stats
    if (lead.follow_up_status === 'pending') {
      pendingCount++;
      totalAgeDays += age;
    }
  });

  const avgAge = pendingCount > 0 ? Math.round(totalAgeDays / pendingCount) : 0;

  // Load deals for stage analysis
  let deals = [];
  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      deals = data.deals || data || [];
    }
  } catch (e) {}

  // Calculate stage velocity from deals
  const stageVelocity = {};
  deals.forEach(deal => {
    if (deal.history && deal.history.length > 1) {
      for (let i = 1; i < deal.history.length; i++) {
        const from = deal.history[i-1];
        const to = deal.history[i];
        const fromDate = new Date(from.date);
        const toDate = new Date(to.date);
        const days = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
        
        const transition = `${from.stage}_to_${to.stage}`;
        if (!stageVelocity[transition]) stageVelocity[transition] = { total: 0, count: 0 };
        stageVelocity[transition].total += days;
        stageVelocity[transition].count++;
      }
    }
  });

  // Calculate conversion funnel
  const funnel = {
    total_leads: leads.length,
    meeting_requests: leads.filter(l => l.reply_category === 'Meeting Request').length,
    booked: leads.filter(l => l.reply_category === 'Booked' || l.reply_category === 'Meeting Booked').length,
    pending: pendingCount
  };

  return {
    leads,
    ageGroups,
    categoryBreakdown,
    avgAge,
    pendingCount,
    deals,
    stageVelocity,
    funnel
  };
}

function displayVelocity(data) {
  const { ageGroups, categoryBreakdown, avgAge, pendingCount, deals, funnel } = data;

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  ⚡ PIPELINE VELOCITY TRACKER                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝

📊 LEAD AGE DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Visual bar chart for age groups
  const maxCount = Math.max(...Object.values(ageGroups));
  Object.entries(ageGroups).forEach(([range, count]) => {
    const barLength = Math.round((count / maxCount) * 30) || 0;
    const bar = '█'.repeat(barLength);
    const emoji = range === '0-3 days' ? '🔴' : range === '4-7 days' ? '🟡' : '⚪';
    console.log(`   ${emoji} ${range.padEnd(12)} ${bar} ${count}`);
  });

  console.log(`
📈 VELOCITY METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Average Lead Age:     ${avgAge} days ${avgAge > 14 ? '⚠️ SLOW' : avgAge > 7 ? '🟡 OK' : '✅ FAST'}
   Pending Leads:        ${pendingCount}
   Active Deals:         ${deals.length}
   Benchmark:            ${BENCHMARKS.avgDaysToClose} days to close (industry avg)`);

  console.log(`
🔄 CONVERSION FUNNEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Total Leads:          ${funnel.total_leads}
   Meeting Requests:     ${funnel.meeting_requests} (${Math.round(funnel.meeting_requests/funnel.total_leads*100)}%)
   Meetings Booked:      ${funnel.booked} (${Math.round(funnel.booked/funnel.total_leads*100)}%)
   Still Pending:        ${funnel.pending} (${Math.round(funnel.pending/funnel.total_leads*100)}%)`);

  // Category breakdown
  console.log(`
📋 BY CATEGORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  Object.entries(categoryBreakdown)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([cat, stats]) => {
      const avgCatAge = Math.round(stats.totalAge / stats.count);
      console.log(`   ${cat.padEnd(20)} ${stats.count} leads, avg ${avgCatAge}d old`);
    });

  // Bottleneck analysis
  console.log(`
⚠️ BOTTLENECK ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const hot = ageGroups['0-3 days'];
  const warm = ageGroups['4-7 days'];
  const stale = ageGroups['15-30 days'] + ageGroups['30+ days'];

  if (stale > hot + warm) {
    console.log('   🔴 HIGH STALE RATIO: More stale leads than active. Need faster follow-up.');
  }
  if (avgAge > 14) {
    console.log('   🟡 SLOW VELOCITY: Average age over 2 weeks. Consider reactivation campaign.');
  }
  if (funnel.meeting_requests > funnel.booked * 2) {
    console.log('   🟡 BOOKING GAP: Many meeting requests not converting to booked. Follow up faster.');
  }
  if (stale <= hot + warm && avgAge <= 14) {
    console.log('   ✅ Pipeline velocity is healthy.');
  }

  // Predictions
  if (PREDICT && deals.length > 0) {
    console.log(`
🔮 CLOSE DATE PREDICTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    deals.forEach(deal => {
      const stage = deal.stage?.toLowerCase().replace(/\s+/g, '_') || 'contacted';
      const stageInfo = STAGES[stage] || STAGES.contacted;
      const daysToClose = BENCHMARKS.avgDaysToClose - (stageInfo.expectedDays || 0);
      const predictedClose = new Date(Date.now() + daysToClose * 24 * 60 * 60 * 1000);
      
      console.log(`   ${deal.company}`);
      console.log(`      Stage: ${deal.stage} (${Math.round(stageInfo.winProb * 100)}% win prob)`);
      console.log(`      Predicted close: ${predictedClose.toLocaleDateString('en-GB')}`);
      console.log(`      Value: $${(deal.value || 0).toLocaleString()}`);
      console.log('');
    });
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 TIP: Run "gex queue" to see ready-to-send follow-ups for stale leads.
`);
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  const data = await analyzeVelocity(client);
  if (data) {
    displayVelocity(data);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
