/**
 * Deal Value Calculator
 * 
 * Calculates potential revenue by vertical, source, and category.
 * 
 * Usage:
 *   gex value               # Overall pipeline value
 *   gex value --vertical    # By vertical
 *   gex value --source      # By source
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Deal value estimates by category
const DEAL_VALUES = {
  'Booked': { min: 20000, max: 40000, prob: 0.9 },
  'Meeting Request': { min: 15000, max: 35000, prob: 0.5 },
  'Interested': { min: 10000, max: 30000, prob: 0.3 },
  'Information Request': { min: 10000, max: 25000, prob: 0.2 }
};

// Commission rate
const COMMISSION_RATE = 0.3;

function detectVertical(lead) {
  const text = [lead.domain, lead.company, lead.notes].filter(Boolean).join(' ').toLowerCase();
  
  if (text.match(/game|gaming|mobile|unity|unreal|studio/)) return 'Gaming';
  if (text.match(/edu|learn|school|university|course/)) return 'Education';
  if (text.match(/tech|software|saas|app(?!le)|ai|ml/)) return 'Tech';
  if (text.match(/finance|bank|invest|crypto|payment/)) return 'Finance';
  if (text.match(/health|wellness|fitness|medical/)) return 'Health';
  return 'Other';
}

function detectSource(lead) {
  const text = [lead.source, lead.campaign_name, lead.notes].filter(Boolean).join(' ').toLowerCase();
  
  if (text.includes('google')) return 'Google';
  if (text.includes('crunchbase')) return 'Crunchbase';
  if (text.includes('linkedin')) return 'LinkedIn';
  if (text.includes('inbound') || text.includes('referral')) return 'Inbound';
  return 'Other';
}

async function calculatePipelineValue() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('category', ['Booked', 'Meeting Request', 'Interested', 'Information Request'])
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    return null;
  }
  
  const stats = {
    total: {
      count: 0,
      minValue: 0,
      maxValue: 0,
      expectedValue: 0,
      commission: 0
    },
    byVertical: {},
    bySource: {},
    byCategory: {}
  };
  
  leads.forEach(lead => {
    const category = lead.category;
    const vertical = detectVertical(lead);
    const source = detectSource(lead);
    const value = DEAL_VALUES[category] || DEAL_VALUES['Interested'];
    
    const expectedValue = (value.min + value.max) / 2 * value.prob;
    
    // Total
    stats.total.count++;
    stats.total.minValue += value.min * value.prob;
    stats.total.maxValue += value.max * value.prob;
    stats.total.expectedValue += expectedValue;
    stats.total.commission += expectedValue * COMMISSION_RATE;
    
    // By vertical
    if (!stats.byVertical[vertical]) {
      stats.byVertical[vertical] = { count: 0, value: 0, commission: 0 };
    }
    stats.byVertical[vertical].count++;
    stats.byVertical[vertical].value += expectedValue;
    stats.byVertical[vertical].commission += expectedValue * COMMISSION_RATE;
    
    // By source
    if (!stats.bySource[source]) {
      stats.bySource[source] = { count: 0, value: 0, commission: 0 };
    }
    stats.bySource[source].count++;
    stats.bySource[source].value += expectedValue;
    stats.bySource[source].commission += expectedValue * COMMISSION_RATE;
    
    // By category
    if (!stats.byCategory[category]) {
      stats.byCategory[category] = { count: 0, value: 0, commission: 0 };
    }
    stats.byCategory[category].count++;
    stats.byCategory[category].value += expectedValue;
    stats.byCategory[category].commission += expectedValue * COMMISSION_RATE;
  });
  
  return stats;
}

function formatValue(num) {
  return '$' + Math.round(num).toLocaleString();
}

function formatOverview(stats) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  💰 PIPELINE VALUE CALCULATOR                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 TOTAL PIPELINE');
  console.log('─'.repeat(50));
  console.log(`   Leads: ${stats.total.count}`);
  console.log(`   Expected Value: ${formatValue(stats.total.expectedValue)}`);
  console.log(`   Expected Commission: ${formatValue(stats.total.commission)}`);
  console.log(`   Range: ${formatValue(stats.total.minValue)} - ${formatValue(stats.total.maxValue)}`);
  
  // By category
  console.log('\n📋 BY CATEGORY');
  console.log('─'.repeat(50));
  console.log('Category            │ Leads │ Value      │ Commission');
  console.log('─'.repeat(50));
  
  Object.entries(stats.byCategory)
    .sort((a, b) => b[1].value - a[1].value)
    .forEach(([cat, data]) => {
      const name = cat.padEnd(19);
      const count = String(data.count).padStart(5);
      const value = formatValue(data.value).padStart(10);
      const comm = formatValue(data.commission).padStart(10);
      console.log(`${name} │${count} │${value} │${comm}`);
    });
  
  // By vertical
  console.log('\n🏢 BY VERTICAL');
  console.log('─'.repeat(50));
  console.log('Vertical            │ Leads │ Value      │ Commission');
  console.log('─'.repeat(50));
  
  Object.entries(stats.byVertical)
    .sort((a, b) => b[1].value - a[1].value)
    .forEach(([vert, data]) => {
      const name = vert.padEnd(19);
      const count = String(data.count).padStart(5);
      const value = formatValue(data.value).padStart(10);
      const comm = formatValue(data.commission).padStart(10);
      console.log(`${name} │${count} │${value} │${comm}`);
    });
  
  // By source
  console.log('\n📍 BY SOURCE');
  console.log('─'.repeat(50));
  console.log('Source              │ Leads │ Value      │ Commission');
  console.log('─'.repeat(50));
  
  Object.entries(stats.bySource)
    .sort((a, b) => b[1].value - a[1].value)
    .forEach(([src, data]) => {
      const name = src.padEnd(19);
      const count = String(data.count).padStart(5);
      const value = formatValue(data.value).padStart(10);
      const comm = formatValue(data.commission).padStart(10);
      console.log(`${name} │${count} │${value} │${comm}`);
    });
  
  // Recommendations
  console.log('\n💡 INSIGHTS');
  console.log('─'.repeat(50));
  
  const topVertical = Object.entries(stats.byVertical)
    .sort((a, b) => b[1].value - a[1].value)[0];
  const topSource = Object.entries(stats.bySource)
    .sort((a, b) => b[1].value - a[1].value)[0];
  
  if (topVertical) {
    console.log(`   🏆 Top vertical: ${topVertical[0]} (${formatValue(topVertical[1].commission)} commission)`);
  }
  if (topSource) {
    console.log(`   📍 Top source: ${topSource[0]} (${formatValue(topSource[1].commission)} commission)`);
  }
}

async function run(args = []) {
  const stats = await calculatePipelineValue();
  
  if (!stats) {
    console.log('\n❌ Failed to calculate pipeline value');
    return;
  }
  
  formatOverview(stats);
  console.log();
}

module.exports = { run, calculatePipelineValue };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
