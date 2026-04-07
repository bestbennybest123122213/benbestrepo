#!/usr/bin/env node
/**
 * Campaign Router
 * Auto-assign leads to campaigns based on available data
 * Based on Eric Nowoslawski's "Graduation Table" concept
 * 
 * "I always always always want to run all campaigns from one Clay table"
 * 
 * Usage:
 *   node gex.js route                     - Show routing recommendations
 *   node gex.js route --analyze           - Analyze current lead distribution
 *   node gex.js route --dry-run           - Preview routing without changes
 */

const fs = require('fs');
const path = require('path');
const { detectVertical } = require('../lib/intent-signals');

// Campaign definitions based on available data
const CAMPAIGNS = {
  // Priority 1: Best data = best campaigns
  A: {
    name: 'LinkedIn Post Campaign',
    priority: 1,
    description: 'Recent LinkedIn post personalization',
    requires: ['linkedin_post'],
    template: 'Saw your post about {topic}...',
    expected_response: '1 in 10'
  },
  B: {
    name: 'New Role Campaign',
    priority: 2,
    description: 'Congrats on new position',
    requires: ['new_in_role'],
    template: 'Congrats on the new role at {company}...',
    expected_response: '1 in 25'
  },
  C: {
    name: 'Hiring Signal Campaign',
    priority: 3,
    description: 'Company is hiring marketing roles',
    requires: ['hiring_signal'],
    template: 'Noticed {company} is hiring {role}...',
    expected_response: '1 in 30'
  },
  D: {
    name: 'Competitor Campaign',
    priority: 4,
    description: 'Competitor launched creator content',
    requires: ['competitor_activity'],
    template: 'Saw {competitor} just launched with {creator}...',
    expected_response: '1 in 35'
  },
  E: {
    name: 'Vertical Match Campaign',
    priority: 5,
    description: 'Gaming/Education/Tech specific',
    requires: ['vertical_match'],
    template: 'Working with {vertical} companies like {company}...',
    expected_response: '1 in 50'
  },
  F: {
    name: 'Generic Outreach',
    priority: 6,
    description: 'Baseline campaign - no specific signal',
    requires: [],
    template: 'I help companies like {company} with creator marketing...',
    expected_response: '1 in 100'
  }
};

// Routing rules based on available data
function routeLead(lead) {
  const signals = detectLeadSignals(lead);
  
  // Priority order: A → B → C → D → E → F
  if (signals.linkedin_post) return 'A';
  if (signals.new_in_role) return 'B';
  if (signals.hiring_signal) return 'C';
  if (signals.competitor_activity) return 'D';
  if (signals.vertical_match) return 'E';
  return 'F';
}

// Detect available signals for a lead
function detectLeadSignals(lead) {
  const vertical = detectVertical({ 
    name: lead.company || '', 
    industry: lead.industry || '' 
  });
  
  return {
    linkedin_post: !!lead.linkedin_post || !!lead.recent_post,
    new_in_role: !!lead.new_in_role || !!lead.months_in_role && lead.months_in_role < 6,
    hiring_signal: !!lead.hiring || !!lead.job_posting,
    competitor_activity: !!lead.competitor_campaign,
    vertical_match: vertical === 'gaming' || vertical === 'education' || vertical === 'tech',
    vertical: vertical
  };
}

// Load leads data
function getLeadsData() {
  try {
    const dataPath = path.join(__dirname, '..', 'data', 'positive-replies-processed.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return data.leads || [];
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Analyze current distribution
function analyzeDistribution(leads) {
  const distribution = {};
  const byVertical = {};
  
  leads.forEach(lead => {
    const campaign = routeLead(lead);
    distribution[campaign] = (distribution[campaign] || 0) + 1;
    
    const vertical = detectVertical({ name: lead.company || '' });
    byVertical[vertical] = (byVertical[vertical] || 0) + 1;
  });
  
  return { distribution, byVertical };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'route' && a !== 'router');
  
  // Parse flags
  const flags = {
    analyze: args.includes('--analyze') || args.includes('-a'),
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    limit: 20
  };
  
  console.log('');
  console.log('🚦 \x1b[1mCAMPAIGN ROUTER\x1b[0m');
  console.log('   Eric\'s Graduation Table concept');
  console.log('');
  
  // Show campaign definitions
  console.log('\x1b[1mCAMPAIGNS (Priority Order)\x1b[0m');
  console.log('');
  
  Object.entries(CAMPAIGNS).forEach(([key, campaign]) => {
    console.log(`   \x1b[1m${key}\x1b[0m: ${campaign.name}`);
    console.log(`      ${campaign.description}`);
    console.log(`      Expected: ${campaign.expected_response}`);
    console.log('');
  });
  
  // Get leads
  const leads = getLeadsData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found.\x1b[0m');
    console.log('');
    console.log('\x1b[1mROUTING LOGIC:\x1b[0m');
    console.log('');
    console.log('   1. Check for LinkedIn post → Campaign A');
    console.log('   2. Check for new role (< 6 months) → Campaign B');
    console.log('   3. Check for hiring signal → Campaign C');
    console.log('   4. Check for competitor activity → Campaign D');
    console.log('   5. Check for vertical match (gaming/edu/tech) → Campaign E');
    console.log('   6. Default → Campaign F (generic)');
    console.log('');
    return;
  }
  
  // Analyze distribution
  const { distribution, byVertical } = analyzeDistribution(leads);
  
  console.log('\x1b[1mCURRENT DISTRIBUTION\x1b[0m');
  console.log('');
  
  const total = leads.length;
  Object.entries(CAMPAIGNS).forEach(([key, campaign]) => {
    const count = distribution[key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar = '█'.repeat(Math.min(pct / 2, 30));
    
    console.log(`   ${key}: ${campaign.name}`);
    console.log(`      ${String(count).padStart(4)} leads (${pct}%) ${bar}`);
    console.log('');
  });
  
  // Vertical breakdown
  console.log('\x1b[1mBY VERTICAL\x1b[0m');
  console.log('');
  
  Object.entries(byVertical)
    .sort((a, b) => b[1] - a[1])
    .forEach(([vertical, count]) => {
      const pct = Math.round((count / total) * 100);
      console.log(`   ${vertical.padEnd(12)} ${String(count).padStart(4)} (${pct}%)`);
    });
  console.log('');
  
  // Show recommendations
  console.log('\x1b[1mRECOMMENDATIONS\x1b[0m');
  console.log('');
  
  // Check for issues
  const genericPct = Math.round(((distribution.F || 0) / total) * 100);
  if (genericPct > 50) {
    console.log('   ⚠️  \x1b[33m' + genericPct + '% of leads in generic campaign\x1b[0m');
    console.log('      Consider enriching with:');
    console.log('      - LinkedIn post data (Campaign A)');
    console.log('      - Job change data (Campaign B)');
    console.log('      - Hiring signals (Campaign C)');
    console.log('');
  }
  
  const gamingCount = byVertical['gaming'] || 0;
  const eduCount = byVertical['education'] || 0;
  if (gamingCount > 0) {
    console.log(`   🎮 ${gamingCount} gaming leads - use Whiteout Survival case study`);
  }
  if (eduCount > 0) {
    console.log(`   📚 ${eduCount} education leads - use Gauth AI case study`);
  }
  console.log('');
  
  // 40-40-20 split recommendation
  console.log('\x1b[1mERIC\'S 40-40-20 SPLIT\x1b[0m');
  console.log('');
  console.log('   For A/B testing campaigns:');
  console.log('   • 40% → Campaign A (proven approach)');
  console.log('   • 40% → Campaign B (proven approach)');
  console.log('   • 20% → Campaign C (test new approach)');
  console.log('');
  console.log('   Generate random 1-10:');
  console.log('   • 1-4 → Campaign A');
  console.log('   • 5-8 → Campaign B');
  console.log('   • 9-10 → Campaign C');
  console.log('');
  
  if (flags.verbose) {
    console.log('\x1b[1mSAMPLE ROUTING\x1b[0m');
    console.log('');
    
    leads.slice(0, 10).forEach(lead => {
      const campaign = routeLead(lead);
      const signals = detectLeadSignals(lead);
      const company = (lead.company || lead.domain || 'Unknown').slice(0, 20);
      
      console.log(`   ${company.padEnd(20)} → Campaign ${campaign} (${signals.vertical})`);
    });
    console.log('');
  }
  
  console.log('\x1b[2m💡 Use --verbose to see sample routing | --analyze for deep analysis\x1b[0m');
  console.log('');
}

main().catch(console.error);
