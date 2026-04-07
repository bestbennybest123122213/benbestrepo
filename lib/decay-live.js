/**
 * Lead Decay Visualizer
 * 
 * Shows real-time value being lost as leads age without follow-up.
 * 
 * Usage:
 *   gex decay-live           # Current decay status
 *   gex decay-live --cost    # Cost of inaction
 *   gex decay-live --urgent  # Only show urgent
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Booking probability by age (based on lead decay analysis)
const DECAY_CURVE = {
  7: 0.50,   // 50% at 7 days
  14: 0.38,  // 38% at 14 days
  21: 0.19,  // 19% at 21 days
  30: 0.10,  // 10% at 30 days
  60: 0.05   // 5% at 60 days
};

// Average deal value
const AVG_DEAL = 25000;
const COMMISSION_RATE = 0.30;

function getDecayRate(daysOld) {
  if (daysOld <= 7) return 0.50;
  if (daysOld <= 14) return 0.50 - (daysOld - 7) * 0.017; // Linear decay
  if (daysOld <= 21) return 0.38 - (daysOld - 14) * 0.027;
  if (daysOld <= 30) return 0.19 - (daysOld - 21) * 0.01;
  return 0.05;
}

async function getDecayingLeads() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('category', ['Meeting Request', 'Interested', 'Information Request'])
    .neq('status', 'Booked')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error:', error);
    return [];
  }
  
  const now = Date.now();
  
  return leads.map(lead => {
    const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const currentProb = getDecayRate(daysOld);
    const tomorrowProb = getDecayRate(daysOld + 1);
    const dailyLoss = (currentProb - tomorrowProb) * AVG_DEAL * COMMISSION_RATE;
    
    return {
      ...lead,
      daysOld,
      currentProb,
      tomorrowProb,
      dailyLoss,
      currentValue: currentProb * AVG_DEAL * COMMISSION_RATE,
      urgency: daysOld <= 7 ? 'warm' : daysOld <= 14 ? 'urgent' : daysOld <= 21 ? 'critical' : 'dead'
    };
  }).filter(l => l.daysOld >= 5); // Only show leads 5+ days old
}

function formatDecayStatus(leads) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ⏳ LEAD DECAY VISUALIZER                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Summary
  const totalValue = leads.reduce((sum, l) => sum + l.currentValue, 0);
  const dailyBurn = leads.reduce((sum, l) => sum + l.dailyLoss, 0);
  const hourlyBurn = dailyBurn / 24;
  
  console.log('💰 CURRENT PIPELINE VALUE');
  console.log('─'.repeat(50));
  console.log(`   Expected Commission: $${Math.round(totalValue).toLocaleString()}`);
  console.log(`   Daily Decay: -$${Math.round(dailyBurn).toLocaleString()}/day`);
  console.log(`   Hourly Burn: -$${Math.round(hourlyBurn).toLocaleString()}/hour`);
  
  // Group by urgency
  const groups = {
    urgent: leads.filter(l => l.urgency === 'urgent'),
    critical: leads.filter(l => l.urgency === 'critical'),
    dead: leads.filter(l => l.urgency === 'dead')
  };
  
  console.log('\n⏱️ DECAY BY URGENCY');
  console.log('─'.repeat(50));
  
  if (groups.urgent.length > 0) {
    const urgentValue = groups.urgent.reduce((sum, l) => sum + l.currentValue, 0);
    const urgentBurn = groups.urgent.reduce((sum, l) => sum + l.dailyLoss, 0);
    console.log(`   🟠 Urgent (7-14d): ${groups.urgent.length} leads`);
    console.log(`      Value: $${Math.round(urgentValue).toLocaleString()} | Burning: -$${Math.round(urgentBurn).toLocaleString()}/day`);
  }
  
  if (groups.critical.length > 0) {
    const critValue = groups.critical.reduce((sum, l) => sum + l.currentValue, 0);
    const critBurn = groups.critical.reduce((sum, l) => sum + l.dailyLoss, 0);
    console.log(`   🔴 Critical (14-21d): ${groups.critical.length} leads`);
    console.log(`      Value: $${Math.round(critValue).toLocaleString()} | Burning: -$${Math.round(critBurn).toLocaleString()}/day`);
  }
  
  if (groups.dead.length > 0) {
    const deadValue = groups.dead.reduce((sum, l) => sum + l.currentValue, 0);
    console.log(`   💀 Dead (21d+): ${groups.dead.length} leads`);
    console.log(`      Remaining Value: $${Math.round(deadValue).toLocaleString()} (5% probability)`);
  }
  
  // Top decaying leads
  const topDecaying = leads
    .filter(l => l.urgency !== 'dead')
    .sort((a, b) => b.dailyLoss - a.dailyLoss)
    .slice(0, 5);
  
  if (topDecaying.length > 0) {
    console.log('\n🔥 TOP DECAYING LEADS');
    console.log('─'.repeat(50));
    
    topDecaying.forEach((lead, i) => {
      const name = lead.name?.split(/[\s@]/)[0] || 'Unknown';
      const company = lead.domain?.split('.')[0] || 'Unknown';
      console.log(`   ${i + 1}. ${name} @ ${company} (${lead.daysOld}d)`);
      console.log(`      -$${Math.round(lead.dailyLoss).toLocaleString()}/day | ${(lead.currentProb * 100).toFixed(0)}% → ${(lead.tomorrowProb * 100).toFixed(0)}% tomorrow`);
    });
  }
  
  // Call to action
  console.log('\n💡 ACTION');
  console.log('─'.repeat(50));
  console.log(`   Every hour without action costs ~$${Math.round(hourlyBurn).toLocaleString()}`);
  console.log(`   Send follow-ups NOW: gex reply`);
}

async function run(args = []) {
  const costOnly = args.includes('--cost') || args.includes('-c');
  const urgentOnly = args.includes('--urgent') || args.includes('-u');
  
  const leads = await getDecayingLeads();
  
  if (leads.length === 0) {
    console.log('\n✅ No decaying leads found.');
    return;
  }
  
  formatDecayStatus(urgentOnly ? leads.filter(l => l.urgency !== 'dead') : leads);
  console.log();
}

module.exports = { run, getDecayingLeads };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
