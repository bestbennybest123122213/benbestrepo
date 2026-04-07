/**
 * Inaction Cost Tracker
 * Shows the cumulative cost of not taking action
 * 
 * Usage: gex cost
 * 
 * Built: Feb 9, 2026 22:15
 */

const { createClient } = require('@supabase/supabase-js');

// Constants for cost calculation
const AVG_DEAL_VALUE = 25000;  // Average deal size
const COMMISSION_RATE = 0.30;  // 30% average commission
const CLOSE_RATE = 0.25;       // 25% close rate on positive leads
const DECAY_RATE_PER_DAY = 0.02; // 2% decay per day of inaction

// Key dates
const LAST_WIN_DATE = new Date('2026-01-15'); // 26 days ago

async function calculateCosts(supabase) {
  const now = new Date();
  const daysSinceWin = Math.floor((now - LAST_WIN_DATE) / (1000 * 60 * 60 * 24));

  // Get lead counts
  const { data: scheduling } = await supabase
    .from('imann_positive_replies')
    .select('id, created_at')
    .eq('status', 'Scheduling');

  const { data: booked } = await supabase
    .from('imann_positive_replies')
    .select('id')
    .eq('status', 'Booked');

  const { data: notBooked } = await supabase
    .from('imann_positive_replies')
    .select('id')
    .eq('status', 'Not booked');

  const schedulingCount = scheduling?.length || 0;
  const bookedCount = booked?.length || 0;
  const notBookedCount = notBooked?.length || 0;

  // Calculate potential value
  const avgCommission = AVG_DEAL_VALUE * COMMISSION_RATE;
  
  // Booked leads have 60% close rate
  const bookedValue = bookedCount * avgCommission * 0.60;
  
  // Scheduling leads have 40% close rate (need to book first)
  const schedulingValue = schedulingCount * avgCommission * 0.40;
  
  // Not booked leads have 15% close rate (need re-engagement)
  const notBookedValue = notBookedCount * avgCommission * 0.15;

  const totalPotentialValue = bookedValue + schedulingValue + notBookedValue;

  // Calculate decay - each day of inaction loses value
  const decayMultiplier = Math.pow(1 - DECAY_RATE_PER_DAY, daysSinceWin);
  const currentValue = totalPotentialValue * decayMultiplier;
  const valueLost = totalPotentialValue - currentValue;

  // Calculate daily burn rate
  const dailyBurn = currentValue * DECAY_RATE_PER_DAY;

  // Calculate if we act today vs wait another day
  const tomorrowValue = currentValue * (1 - DECAY_RATE_PER_DAY);
  const costOfWaitingOneDay = currentValue - tomorrowValue;

  return {
    daysSinceWin,
    schedulingCount,
    bookedCount,
    notBookedCount,
    totalPotentialValue,
    currentValue,
    valueLost,
    dailyBurn,
    costOfWaitingOneDay,
    decayMultiplier
  };
}

function formatCurrency(num) {
  return '$' + Math.round(num).toLocaleString();
}

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Supabase not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const costs = await calculateCosts(supabase);

  console.log('\n' + '═'.repeat(60));
  console.log('💸 INACTION COST TRACKER');
  console.log('═'.repeat(60));

  console.log(`\n📅 Days since last win: ${costs.daysSinceWin}`);
  console.log(`📉 Value decay: ${((1 - costs.decayMultiplier) * 100).toFixed(1)}%\n`);

  console.log('─'.repeat(60));
  console.log('PIPELINE VALUE');
  console.log('─'.repeat(60));
  console.log(`  Booked (${costs.bookedCount} leads):      ${formatCurrency(costs.bookedCount * 7500 * 0.60)}`);
  console.log(`  Scheduling (${costs.schedulingCount} leads): ${formatCurrency(costs.schedulingCount * 7500 * 0.40)}`);
  console.log(`  Not booked (${costs.notBookedCount} leads):  ${formatCurrency(costs.notBookedCount * 7500 * 0.15)}`);
  console.log('─'.repeat(60));
  console.log(`  Original potential:    ${formatCurrency(costs.totalPotentialValue)}`);
  console.log(`  After ${costs.daysSinceWin} days decay:    ${formatCurrency(costs.currentValue)}`);
  console.log(`  \x1b[31mValue LOST:\x1b[0m            \x1b[31m${formatCurrency(costs.valueLost)}\x1b[0m`);
  console.log('─'.repeat(60));

  console.log('\n' + '─'.repeat(60));
  console.log('🔥 BURN RATE');
  console.log('─'.repeat(60));
  console.log(`  Losing per day:        \x1b[31m${formatCurrency(costs.dailyBurn)}\x1b[0m`);
  console.log(`  Losing per hour:       \x1b[31m${formatCurrency(costs.dailyBurn / 24)}\x1b[0m`);
  console.log(`  Cost of waiting 1 day: \x1b[31m${formatCurrency(costs.costOfWaitingOneDay)}\x1b[0m`);
  console.log('─'.repeat(60));

  console.log('\n' + '─'.repeat(60));
  console.log('💡 THE MATH');
  console.log('─'.repeat(60));
  console.log(`  If you act TODAY:      You might close ${formatCurrency(costs.currentValue)}`);
  console.log(`  If you wait TOMORROW:  You might close ${formatCurrency(costs.currentValue - costs.costOfWaitingOneDay)}`);
  console.log(`  Difference:            \x1b[31m-${formatCurrency(costs.costOfWaitingOneDay)}\x1b[0m`);
  console.log('─'.repeat(60));

  console.log('\n⏰ Every hour you wait costs ' + formatCurrency(costs.dailyBurn / 24) + '\n');
}

module.exports = { run, calculateCosts };

if (require.main === module) {
  require('dotenv').config();
  run().catch(console.error);
}
