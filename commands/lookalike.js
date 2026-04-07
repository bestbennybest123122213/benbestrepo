#!/usr/bin/env node
/**
 * Lookalike Company Finder
 * Given winning customers, find similar companies to target
 * Based on Eric Nowoslawski's Ocean.io framework
 * 
 * Usage:
 *   node gex.js lookalike                    - Use default winning customers
 *   node gex.js lookalike whiteout-survival  - Find companies like Whiteout Survival
 *   node gex.js lookalike --vertical gaming  - Find gaming companies like your winners
 *   node gex.js lookalike --export           - Export to CSV for outreach
 */

const fs = require('fs');
const path = require('path');

// BY Influence winning customers (seed companies for lookalike)
const WINNING_CUSTOMERS = [
  {
    name: 'Whiteout Survival',
    domain: 'whiteoutsurvival.com',
    vertical: 'gaming',
    deal_size: 48000,
    views: 48000000,
    conversions: 100000,
    success_metric: '48M views, 100K+ new users'
  },
  {
    name: 'Gauth AI',
    domain: 'gauthmath.com',
    vertical: 'education',
    deal_size: 35000,
    views: 15000000,
    conversions: 50000,
    success_metric: '15M+ views, 50K+ downloads'
  },
  {
    name: 'Valeo',
    domain: 'valeo.com',
    vertical: 'tech',
    deal_size: 30906,
    success_metric: '$30,906 campaign'
  },
  {
    name: 'Allison AI',
    domain: 'allison.ai',
    vertical: 'tech',
    deal_size: 24045,
    success_metric: '$24,045 campaign'
  }
];

// Characteristics to match for lookalike
const LOOKALIKE_SIGNALS = {
  gaming: {
    keywords: ['mobile game', 'gaming', 'game studio', 'game publisher', 'casual game', 'strategy game', 'rpg'],
    tech_stack: ['unity', 'unreal', 'appsflyer', 'adjust', 'firebase'],
    job_titles: ['UA Manager', 'User Acquisition', 'Growth Marketing', 'Mobile Marketing'],
    funding_stage: ['series_a', 'series_b', 'series_c'],
    min_employees: 20
  },
  education: {
    keywords: ['edtech', 'learning', 'education', 'tutoring', 'course', 'e-learning', 'study', 'homework'],
    tech_stack: ['stripe', 'segment', 'amplitude', 'mixpanel'],
    job_titles: ['Growth', 'Marketing', 'Brand', 'Content'],
    funding_stage: ['seed', 'series_a', 'series_b'],
    min_employees: 10
  },
  tech: {
    keywords: ['saas', 'software', 'platform', 'app', 'tech', 'ai', 'automation'],
    tech_stack: ['stripe', 'segment', 'hubspot', 'intercom'],
    job_titles: ['VP Marketing', 'Head of Growth', 'CMO', 'Director Marketing'],
    funding_stage: ['series_a', 'series_b', 'series_c'],
    min_employees: 50
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

// Calculate similarity score between a lead and winning customers
function calculateSimilarity(lead, winningCustomers) {
  let score = 0;
  const signals = [];
  
  const domain = lead.domain || lead.email?.split('@')[1] || '';
  const text = `${lead.company || ''} ${domain}`.toLowerCase();
  
  // Determine which vertical this lead might be in
  let matchedVertical = null;
  
  for (const [vertical, config] of Object.entries(LOOKALIKE_SIGNALS)) {
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        matchedVertical = vertical;
        score += 10;
        signals.push({ type: 'keyword_match', keyword, vertical });
        break;
      }
    }
    if (matchedVertical) break;
  }
  
  // Check if any winning customer is in the same vertical
  const sameVerticalWinners = winningCustomers.filter(w => w.vertical === matchedVertical);
  if (sameVerticalWinners.length > 0) {
    score += 20;
    signals.push({ 
      type: 'vertical_match', 
      vertical: matchedVertical,
      winners: sameVerticalWinners.map(w => w.name)
    });
  }
  
  // Check status (Booked = proven, Scheduling = promising)
  if (lead.status === 'Booked') {
    score += 15;
    signals.push({ type: 'status', status: 'Booked' });
  } else if (lead.status === 'Scheduling') {
    score += 10;
    signals.push({ type: 'status', status: 'Scheduling' });
  }
  
  // Check response time (fast responders are more engaged)
  if (lead.ert) {
    const parts = lead.ert.split(':').map(Number);
    const hours = parts[0] + (parts[1] || 0) / 60;
    if (hours < 1) {
      score += 10;
      signals.push({ type: 'fast_responder', hours });
    } else if (hours < 4) {
      score += 5;
    }
  }
  
  return {
    score,
    vertical: matchedVertical,
    signals
  };
}

// Find lookalike companies from existing leads
function findLookalikes(leads, seedCompanies = WINNING_CUSTOMERS, options = {}) {
  const results = leads
    .map(lead => {
      const similarity = calculateSimilarity(lead, seedCompanies);
      return {
        ...lead,
        similarity
      };
    })
    .filter(lead => {
      // Filter by vertical if specified
      if (options.vertical && lead.similarity.vertical !== options.vertical) {
        return false;
      }
      // Filter by minimum score
      if (options.minScore && lead.similarity.score < options.minScore) {
        return false;
      }
      return lead.similarity.score > 0;
    })
    .sort((a, b) => b.similarity.score - a.similarity.score);
  
  return results;
}

// Generate lookalike search recommendations
function generateSearchRecommendations(vertical) {
  const config = LOOKALIKE_SIGNALS[vertical];
  if (!config) return null;
  
  return {
    vertical,
    linkedin_search: {
      keywords: config.keywords.slice(0, 3).join(' OR '),
      job_titles: config.job_titles,
      company_size: `${config.min_employees}+`
    },
    apollo_filters: {
      industry_keywords: config.keywords,
      job_titles: config.job_titles,
      funding_stage: config.funding_stage,
      min_employees: config.min_employees
    },
    ocean_io: {
      seed_companies: WINNING_CUSTOMERS.filter(w => w.vertical === vertical).map(w => w.domain),
      instructions: 'Enter these domains as seed companies, filter by US, exclude irrelevant industries'
    }
  };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'lookalike' && a !== 'similar');
  
  // Parse flags
  const flags = {
    vertical: null,
    export: args.includes('--export'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    minScore: 15,
    limit: 30
  };
  
  // Parse vertical
  const verticalIdx = args.findIndex(a => a === '--vertical' || a === '-v');
  if (verticalIdx !== -1 && args[verticalIdx + 1]) {
    flags.vertical = args[verticalIdx + 1].toLowerCase();
  }
  
  // Parse limit
  const limitIdx = args.findIndex(a => a === '--limit' || a === '-n');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    flags.limit = parseInt(args[limitIdx + 1]) || 30;
  }
  
  console.log('');
  console.log('🎯 \x1b[1mLOOKALIKE COMPANY FINDER\x1b[0m');
  console.log('   Based on BY Influence winning customers');
  console.log('');
  
  // Show seed companies
  console.log('📊 \x1b[1mSEED COMPANIES (Your Winners)\x1b[0m');
  console.log('');
  WINNING_CUSTOMERS.forEach(c => {
    console.log(`   • \x1b[1m${c.name}\x1b[0m (${c.vertical}) - ${c.success_metric}`);
  });
  console.log('');
  
  // Get leads
  let leads = getLeadsData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found. Showing search recommendations instead.\x1b[0m');
    console.log('');
  } else {
    // Find lookalikes
    const lookalikes = findLookalikes(leads, WINNING_CUSTOMERS, {
      vertical: flags.vertical,
      minScore: flags.minScore
    });
    
    console.log(`🔍 Found ${lookalikes.length} potential lookalike companies`);
    console.log('');
    
    if (lookalikes.length > 0) {
      // Group by vertical
      const byVertical = {};
      lookalikes.forEach(l => {
        const v = l.similarity.vertical || 'other';
        if (!byVertical[v]) byVertical[v] = [];
        byVertical[v].push(l);
      });
      
      // Display by vertical
      for (const [vertical, companies] of Object.entries(byVertical)) {
        console.log(`\x1b[1m${vertical.toUpperCase()}\x1b[0m (${companies.length} companies)`);
        console.log('');
        
        companies.slice(0, flags.limit / Object.keys(byVertical).length).forEach((c, i) => {
          const name = (c.company || c.domain || 'Unknown').slice(0, 25).padEnd(25);
          const status = (c.status || 'Unknown').padEnd(12);
          const score = String(c.similarity.score).padStart(3);
          
          console.log(`   ${i + 1}. ${name} ${status} Score: ${score}`);
        });
        console.log('');
      }
      
      if (flags.export) {
        // Export to CSV
        const csvPath = path.join(__dirname, '..', 'exports', `lookalikes-${Date.now()}.csv`);
        const csv = [
          'Company,Domain,Email,Status,Vertical,Similarity Score',
          ...lookalikes.map(l => [
            l.company || '',
            l.domain || '',
            l.email || '',
            l.status || '',
            l.similarity.vertical || '',
            l.similarity.score
          ].join(','))
        ].join('\n');
        
        fs.mkdirSync(path.dirname(csvPath), { recursive: true });
        fs.writeFileSync(csvPath, csv);
        console.log(`\x1b[32m✓ Exported to ${csvPath}\x1b[0m`);
        console.log('');
      }
    }
  }
  
  // Show search recommendations
  console.log('🚀 \x1b[1mSEARCH RECOMMENDATIONS\x1b[0m');
  console.log('   Use these to find more lookalike companies');
  console.log('');
  
  const verticalsToShow = flags.vertical ? [flags.vertical] : ['gaming', 'education', 'tech'];
  
  for (const vertical of verticalsToShow) {
    const recs = generateSearchRecommendations(vertical);
    if (!recs) continue;
    
    console.log(`\x1b[1m${vertical.toUpperCase()}\x1b[0m`);
    console.log('');
    console.log('   LinkedIn Search:');
    console.log(`   → Keywords: ${recs.linkedin_search.keywords}`);
    console.log(`   → Titles: ${recs.linkedin_search.job_titles.join(', ')}`);
    console.log(`   → Company Size: ${recs.linkedin_search.company_size}`);
    console.log('');
    console.log('   Ocean.io Seeds:');
    console.log(`   → ${recs.ocean_io.seed_companies.join(', ')}`);
    console.log('');
  }
  
  console.log('\x1b[2m💡 Use --vertical gaming to focus on one vertical | --export to save CSV\x1b[0m');
  console.log('');
}

main().catch(console.error);
