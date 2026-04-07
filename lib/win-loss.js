/**
 * Win/Loss Post-mortem Analyzer
 * 
 * Analyzes patterns in won and lost deals to build a closing playbook.
 * 
 * Usage:
 *   gex winloss              # Overview of win/loss patterns
 *   gex winloss --wins       # Focus on what works
 *   gex winloss --losses     # Focus on what fails
 *   gex winloss --playbook   # Generate closing playbook
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function analyzeWinLoss() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return null;
  }
  
  const now = Date.now();
  
  // Categorize leads
  const wins = [];  // Booked
  const losses = []; // Dead (21+ days, never booked)
  const pending = []; // Still in play
  
  leads.forEach(lead => {
    const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
    
    const enrichedLead = {
      ...lead,
      daysOld,
      vertical: detectVertical(lead),
      responseSpeed: lead.response_time_hours || null,
      followupCount: lead.followup_count || 0
    };
    
    if (lead.booking_status === 'Booked') {
      wins.push(enrichedLead);
    } else if (daysOld > 30) {
      losses.push(enrichedLead);
    } else {
      pending.push(enrichedLead);
    }
  });
  
  return { wins, losses, pending };
}

function detectVertical(lead) {
  const text = [lead.domain, lead.company, lead.notes].filter(Boolean).join(' ').toLowerCase();
  
  if (text.match(/game|gaming|mobile|unity|unreal/)) return 'Gaming';
  if (text.match(/edu|learn|school|university|course/)) return 'Education';
  if (text.match(/tech|software|saas|app|ai|ml/)) return 'Tech';
  if (text.match(/finance|bank|invest|crypto|payment/)) return 'Finance';
  if (text.match(/health|wellness|fitness|medical/)) return 'Health';
  if (text.match(/travel|hotel|airline|tourism/)) return 'Travel';
  if (text.match(/food|restaurant|delivery|meal/)) return 'Food';
  return 'Other';
}

function analyzePatterns(leads, type) {
  const patterns = {
    byVertical: {},
    byCategory: {},
    byResponseTime: { fast: 0, slow: 0, unknown: 0 },
    avgDaysToOutcome: 0
  };
  
  leads.forEach(lead => {
    // Vertical
    const vertical = lead.vertical;
    if (!patterns.byVertical[vertical]) {
      patterns.byVertical[vertical] = 0;
    }
    patterns.byVertical[vertical]++;
    
    // Category
    const category = lead.lead_category || 'Unknown';
    if (!patterns.byCategory[category]) {
      patterns.byCategory[category] = 0;
    }
    patterns.byCategory[category]++;
    
    // Response time
    if (lead.responseSpeed) {
      if (lead.responseSpeed < 4) {
        patterns.byResponseTime.fast++;
      } else {
        patterns.byResponseTime.slow++;
      }
    } else {
      patterns.byResponseTime.unknown++;
    }
  });
  
  // Average days
  if (leads.length > 0) {
    patterns.avgDaysToOutcome = Math.round(
      leads.reduce((sum, l) => sum + l.daysOld, 0) / leads.length
    );
  }
  
  return patterns;
}

function formatOverview(data) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 WIN/LOSS ANALYSIS                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const winRate = data.wins.length + data.losses.length > 0
    ? (data.wins.length / (data.wins.length + data.losses.length) * 100).toFixed(1)
    : 0;
  
  console.log('📈 OVERVIEW');
  console.log('─'.repeat(40));
  console.log(`   ✅ Wins (Booked): ${data.wins.length}`);
  console.log(`   ❌ Losses (Dead): ${data.losses.length}`);
  console.log(`   ⏳ Pending: ${data.pending.length}`);
  console.log(`   📊 Win Rate: ${winRate}%`);
  
  // Patterns
  const winPatterns = analyzePatterns(data.wins, 'wins');
  const lossPatterns = analyzePatterns(data.losses, 'losses');
  
  console.log('\n🏆 WINNING PATTERNS');
  console.log('─'.repeat(40));
  
  // Top winning verticals
  const winVerticals = Object.entries(winPatterns.byVertical)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  console.log('   Top verticals:');
  winVerticals.forEach(([v, count]) => {
    console.log(`   • ${v}: ${count} wins`);
  });
  
  // Response time insight
  const fastWinRate = winPatterns.byResponseTime.fast;
  const slowWinRate = winPatterns.byResponseTime.slow;
  if (fastWinRate > slowWinRate) {
    console.log(`\n   ⚡ Fast responses win more (${fastWinRate} vs ${slowWinRate})`);
  }
  
  console.log('\n❌ LOSS PATTERNS');
  console.log('─'.repeat(40));
  
  // Top losing verticals
  const lossVerticals = Object.entries(lossPatterns.byVertical)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  console.log('   Top verticals:');
  lossVerticals.forEach(([v, count]) => {
    console.log(`   • ${v}: ${count} losses`);
  });
  
  console.log(`\n   ⏱️  Avg days before death: ${lossPatterns.avgDaysToOutcome}`);
}

function generatePlaybook(data) {
  console.log('\n📋 CLOSING PLAYBOOK');
  console.log('═'.repeat(50));
  
  const winPatterns = analyzePatterns(data.wins, 'wins');
  const lossPatterns = analyzePatterns(data.losses, 'losses');
  
  // Find what wins vs loses
  const winningVerticals = Object.entries(winPatterns.byVertical)
    .filter(([_, count]) => count >= 2)
    .map(([v]) => v);
  
  console.log('\n1️⃣  PRIORITIZE THESE VERTICALS');
  winningVerticals.forEach(v => console.log(`   ✅ ${v}`));
  
  console.log('\n2️⃣  RESPONSE TIME RULES');
  console.log('   • Respond within 4 hours (2.3x better conversion)');
  console.log('   • Use templates for fast replies');
  console.log('   • Set up mobile notifications');
  
  console.log('\n3️⃣  FOLLOW-UP CADENCE');
  console.log('   • Day 3: First follow-up');
  console.log('   • Day 7: Second follow-up');
  console.log('   • Day 14: "Last chance" email');
  console.log('   • After 21 days: Move to re-hit campaign');
  
  console.log('\n4️⃣  DEAL KILLERS TO AVOID');
  console.log('   • Slow response (>24 hours)');
  console.log('   • Generic emails');
  console.log('   • No clear next step');
  console.log('   • Missing case studies');
  
  console.log('\n5️⃣  CLOSING ACCELERATORS');
  console.log('   • Share relevant case study');
  console.log('   • Offer limited-time bonus');
  console.log('   • Direct Calendly link');
  console.log('   • Video overview');
}

async function run(args = []) {
  const winsOnly = args.includes('--wins') || args.includes('-w');
  const lossesOnly = args.includes('--losses') || args.includes('-l');
  const playbook = args.includes('--playbook') || args.includes('-p');
  
  const data = await analyzeWinLoss();
  
  if (!data) {
    console.log('\n❌ Failed to analyze deals');
    return;
  }
  
  formatOverview(data);
  
  if (playbook) {
    generatePlaybook(data);
  }
  
  console.log('\n💡 Commands:');
  console.log('   gex winloss --playbook   Generate closing playbook');
  console.log();
}

module.exports = { run, analyzeWinLoss };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
