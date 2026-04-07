#!/usr/bin/env node
/**
 * Data Gaps Analyzer
 * Shows what enrichment data is missing that would improve campaign routing
 * Based on Eric's insight: "Only 8% of leads have data for premium campaigns"
 * 
 * Usage:
 *   node gex.js gaps              - Show data gaps summary
 *   node gex.js gaps --actions    - Show actionable enrichment steps
 */

const fs = require('fs');
const path = require('path');
const { detectVertical } = require('../lib/intent-signals');

// Data fields and their impact
const DATA_FIELDS = {
  linkedin_post: {
    name: 'LinkedIn Post',
    campaign: 'A',
    impact: 'Highest response rate (1 in 10)',
    how_to_get: 'Phantom Buster → LinkedIn Post Likers, or manual check',
    clay_action: 'Add column: Recent LinkedIn posts (last 14 days)'
  },
  new_in_role: {
    name: 'New In Role',
    campaign: 'B',
    impact: '1 in 25 response rate',
    how_to_get: 'Apollo job changes filter, LinkedIn alerts',
    clay_action: 'Add column: Months in current role'
  },
  hiring_signal: {
    name: 'Hiring Signal',
    campaign: 'C',
    impact: '1 in 30 response rate',
    how_to_get: 'LinkedIn Jobs scrape, Predict Leads',
    clay_action: 'Add column: Open marketing/growth jobs'
  },
  competitor_activity: {
    name: 'Competitor Activity',
    campaign: 'D',
    impact: '1 in 35 response rate',
    how_to_get: 'YouTube scrape for competitor sponsorships',
    clay_action: 'Add column: Competitor creator campaigns'
  },
  funding_status: {
    name: 'Funding Status',
    campaign: 'E',
    impact: 'Budget signal',
    how_to_get: 'Harmonic, Crunchbase, Apollo',
    clay_action: 'Add column: Latest funding round'
  },
  company_size: {
    name: 'Company Size',
    campaign: 'E',
    impact: 'Budget capacity signal',
    how_to_get: 'Apollo, LinkedIn company page',
    clay_action: 'Add column: Employee count'
  }
};

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

// Analyze data gaps
function analyzeGaps(leads) {
  const gaps = {
    linkedin_post: { missing: 0, has: 0 },
    new_in_role: { missing: 0, has: 0 },
    hiring_signal: { missing: 0, has: 0 },
    competitor_activity: { missing: 0, has: 0 },
    funding_status: { missing: 0, has: 0 },
    company_size: { missing: 0, has: 0 }
  };
  
  leads.forEach(lead => {
    // LinkedIn post
    if (lead.linkedin_post || lead.recent_post) {
      gaps.linkedin_post.has++;
    } else {
      gaps.linkedin_post.missing++;
    }
    
    // New in role
    if (lead.new_in_role || (lead.months_in_role && lead.months_in_role < 6)) {
      gaps.new_in_role.has++;
    } else {
      gaps.new_in_role.missing++;
    }
    
    // Hiring signal
    if (lead.hiring || lead.job_posting) {
      gaps.hiring_signal.has++;
    } else {
      gaps.hiring_signal.missing++;
    }
    
    // Competitor activity
    if (lead.competitor_campaign) {
      gaps.competitor_activity.has++;
    } else {
      gaps.competitor_activity.missing++;
    }
    
    // Funding status
    if (lead.funding_stage || lead.latest_funding) {
      gaps.funding_status.has++;
    } else {
      gaps.funding_status.missing++;
    }
    
    // Company size
    if (lead.employee_count || lead.employees) {
      gaps.company_size.has++;
    } else {
      gaps.company_size.missing++;
    }
  });
  
  return gaps;
}

// Calculate potential improvement
function calculatePotential(gaps, total) {
  let potential = 0;
  const improvements = [];
  
  // LinkedIn posts would move leads from Campaign F to Campaign A
  const linkedinPotential = Math.round(gaps.linkedin_post.missing * 0.1); // 10% might have posts
  if (linkedinPotential > 0) {
    improvements.push({
      field: 'linkedin_post',
      leads: linkedinPotential,
      response_lift: '10x better response rate',
      action: DATA_FIELDS.linkedin_post.how_to_get
    });
    potential += linkedinPotential;
  }
  
  // New in role
  const rolePotential = Math.round(gaps.new_in_role.missing * 0.15);
  if (rolePotential > 0) {
    improvements.push({
      field: 'new_in_role',
      leads: rolePotential,
      response_lift: '4x better response rate',
      action: DATA_FIELDS.new_in_role.how_to_get
    });
    potential += rolePotential;
  }
  
  // Hiring signals
  const hiringPotential = Math.round(gaps.hiring_signal.missing * 0.08);
  if (hiringPotential > 0) {
    improvements.push({
      field: 'hiring_signal',
      leads: hiringPotential,
      response_lift: '3x better response rate',
      action: DATA_FIELDS.hiring_signal.how_to_get
    });
    potential += hiringPotential;
  }
  
  return { potential, improvements };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'gaps' && a !== 'data-gaps');
  
  const flags = {
    actions: args.includes('--actions') || args.includes('-a'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
  
  console.log('');
  console.log('🔍 \x1b[1mDATA GAPS ANALYZER\x1b[0m');
  console.log('   What enrichment data is missing?');
  console.log('');
  
  const leads = getLeadsData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found.\x1b[0m');
    return;
  }
  
  const total = leads.length;
  const gaps = analyzeGaps(leads);
  
  console.log('\x1b[1mDATA COVERAGE\x1b[0m');
  console.log('');
  
  console.log('┌────────────────────────┬──────────┬──────────┬────────────┐');
  console.log('│ Field                  │ Has Data │ Missing  │ Coverage   │');
  console.log('├────────────────────────┼──────────┼──────────┼────────────┤');
  
  Object.entries(gaps).forEach(([field, data]) => {
    const name = DATA_FIELDS[field].name.padEnd(22);
    const has = String(data.has).padStart(8);
    const missing = String(data.missing).padStart(8);
    const coverage = Math.round((data.has / total) * 100);
    const coverageStr = (coverage + '%').padStart(10);
    const color = coverage >= 50 ? '\x1b[32m' : coverage >= 20 ? '\x1b[33m' : '\x1b[31m';
    
    console.log(`│ ${name} │ ${has} │ ${missing} │ ${color}${coverageStr}\x1b[0m │`);
  });
  
  console.log('└────────────────────────┴──────────┴──────────┴────────────┘');
  console.log('');
  
  // Calculate potential
  const { potential, improvements } = calculatePotential(gaps, total);
  
  console.log('\x1b[1mPOTENTIAL IMPROVEMENT\x1b[0m');
  console.log('');
  console.log(`   If you enriched the missing data:`);
  console.log(`   ~${potential} leads could move to better campaigns`);
  console.log('');
  
  if (flags.actions || true) {
    console.log('\x1b[1mTOP 3 ACTIONS (by impact)\x1b[0m');
    console.log('');
    
    improvements.slice(0, 3).forEach((imp, i) => {
      console.log(`   ${i + 1}. \x1b[1m${DATA_FIELDS[imp.field].name}\x1b[0m`);
      console.log(`      Potential: ${imp.leads} leads → ${imp.response_lift}`);
      console.log(`      How: ${imp.action}`);
      console.log('');
    });
    
    console.log('\x1b[1mCLAY TABLE COLUMNS TO ADD\x1b[0m');
    console.log('');
    
    Object.entries(DATA_FIELDS).slice(0, 4).forEach(([field, data]) => {
      console.log(`   • ${data.clay_action}`);
    });
    console.log('');
  }
  
  // Eric's quote
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log('   \x1b[2m"Only proceed if all data fields are populated."');
  console.log('   - Eric\'s conditional run order principle\x1b[0m');
  console.log('');
}

main().catch(console.error);
