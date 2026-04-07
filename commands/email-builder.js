#!/usr/bin/env node
/**
 * Email Builder
 * 4-Part cold email structure from $500K framework
 * Closed $500K+ and booked 1,000+ meetings
 * 
 * Structure:
 * 1. Relevant Introduction (segment-based)
 * 2. Pain Point (specific to their situation)
 * 3. Solution (isolated, specific service)
 * 4. CTA (hard or soft)
 * 
 * Usage:
 *   node gex.js email <company> [--segment gaming|education|tech]
 *   node gex.js email <company> --pain <pain_point>
 *   node gex.js email --batch
 */

const fs = require('fs');
const path = require('path');
const { detectVertical } = require('../lib/intent-signals');

// Pain points by segment
const PAIN_POINTS = {
  gaming: [
    { pain: 'UA costs keep climbing', tie: 'CPIs doubled in the last 2 years' },
    { pain: 'Organic installs are flat', tie: 'Paid UA is the only growth lever' },
    { pain: 'App store featuring is unpredictable', tie: 'Need consistent acquisition channel' },
    { pain: 'Influencer campaigns are hit or miss', tie: 'No reliable creator partnership process' }
  ],
  education: [
    { pain: 'Student acquisition costs are rising', tie: 'CAC on paid channels keeps climbing' },
    { pain: 'Ad fatigue with Gen Z', tie: 'Traditional ads don\'t resonate with students' },
    { pain: 'Hard to stand out in crowded EdTech', tie: 'Every app looks the same in ads' },
    { pain: 'Seasonal enrollment pressure', tie: 'Back-to-school is make-or-break' }
  ],
  tech: [
    { pain: 'B2C acquisition is expensive', tie: 'Google/Meta CPCs keep rising' },
    { pain: 'Brand awareness is low', tie: 'Competing against established players' },
    { pain: 'Conversion rates are plateauing', tie: 'Same ad creative fatigue' },
    { pain: 'Need to reach younger demos', tie: 'Gen Z doesn\'t respond to traditional ads' }
  ],
  default: [
    { pain: 'Paid acquisition costs rising', tie: 'Marketing budget efficiency declining' },
    { pain: 'Brand awareness is limited', tie: 'Hard to break through the noise' },
    { pain: 'Content isn\'t resonating', tie: 'Engagement rates are flat' },
    { pain: 'Need new growth channels', tie: 'Current channels are maxed out' }
  ]
};

// Solution angles for BY Influence
const SOLUTIONS = {
  gaming: [
    'Story-driven YouTube integrations that feel like entertainment, not ads',
    'Creator partnerships that consistently outperform paid UA by 3-4x on CPA',
    'Authentic gaming content that players actually want to watch'
  ],
  education: [
    'Educational content creators who students actually trust',
    'YouTube integrations timed for back-to-school and exam seasons',
    'Creator partnerships that show real student use cases'
  ],
  tech: [
    'Creator content that builds brand awareness while driving downloads',
    'YouTube integrations with engaged tech audiences',
    'Authentic tech reviews that convert better than paid ads'
  ],
  default: [
    'YouTube creator partnerships that outperform traditional paid channels',
    'Story-driven content that resonates with your target audience',
    'Creator marketing that builds brand while driving conversions'
  ]
};

// CTAs
const CTAS = {
  soft: [
    'Is this a challenge you\'re dealing with?',
    'Would this be helpful to explore?',
    'Mind if I share some examples?',
    'Worth a quick look?'
  ],
  hard: [
    'Open to a 15-minute call this week?',
    'When are you free for a quick chat?',
    'Want to see how this would work for {company}?'
  ]
};

// Intro templates by segment type
const INTROS = {
  gaming: [
    'Noticed {company} is growing in mobile gaming.',
    'Saw {company} in the app store - your game caught my eye.',
    'Fellow gaming industry person here.'
  ],
  education: [
    'Noticed {company} is making waves in EdTech.',
    'Saw {company}\'s app - helping students is important work.',
    'Following what you\'re building at {company}.'
  ],
  tech: [
    'Noticed {company} is growing fast.',
    'Been following {company}\'s progress.',
    'Saw {company}\'s recent launch.'
  ],
  default: [
    'Came across {company} and wanted to reach out.',
    'Noticed what you\'re building at {company}.',
    'Following {company}\'s growth.'
  ]
};

// Build email from components
function buildEmail(data) {
  const {
    company,
    firstName = '[First Name]',
    vertical = 'default',
    painIndex = 0,
    solutionIndex = 0,
    ctaType = 'soft',
    ctaIndex = 0
  } = data;
  
  const v = PAIN_POINTS[vertical] ? vertical : 'default';
  
  // Select components
  const intro = INTROS[v][Math.floor(Math.random() * INTROS[v].length)].replace('{company}', company);
  const pain = PAIN_POINTS[v][painIndex % PAIN_POINTS[v].length];
  const solution = SOLUTIONS[v][solutionIndex % SOLUTIONS[v].length];
  const cta = CTAS[ctaType][ctaIndex % CTAS[ctaType].length].replace('{company}', company);
  
  // Build subject
  const subjects = [
    `Quick idea for ${company}`,
    `${company} + creators`,
    `Thought for ${company}`
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  
  // Build email
  const email = `Subject: ${subject}

Hey ${firstName},

${intro}

${pain.pain} - ${pain.tie}.

${solution}

${cta}

Best,
Jan

---
Jan | BY Influence Company
YouTube Creator Partnerships
`;

  return {
    subject,
    email,
    components: {
      intro,
      pain: pain.pain,
      solution,
      cta,
      ctaType
    }
  };
}

// Generate variations
function generateVariations(company, vertical, count = 3) {
  const variations = [];
  
  for (let i = 0; i < count; i++) {
    const result = buildEmail({
      company,
      vertical,
      painIndex: i,
      solutionIndex: i % 3,
      ctaType: i % 2 === 0 ? 'soft' : 'hard',
      ctaIndex: i % 2
    });
    variations.push(result);
  }
  
  return variations;
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

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'email' && a !== 'email-builder');
  
  // Parse flags
  const flags = {
    batch: args.includes('--batch') || args.includes('-b'),
    variations: args.includes('--variations') || args.includes('-v'),
    soft: args.includes('--soft'),
    hard: args.includes('--hard'),
    limit: 5
  };
  
  // Parse segment
  let segment = null;
  const segmentIdx = args.findIndex(a => a === '--segment' || a === '-s');
  if (segmentIdx !== -1 && args[segmentIdx + 1]) {
    segment = args[segmentIdx + 1].toLowerCase();
  }
  
  // Get company from args
  const companyArgs = args.filter(a => !a.startsWith('-') && !a.startsWith('--'));
  const company = companyArgs.join(' ');
  
  console.log('');
  console.log('📧 \x1b[1mEMAIL BUILDER\x1b[0m');
  console.log('   $500K Framework - 4-Part Structure');
  console.log('');
  
  if (flags.batch) {
    // Generate for top leads
    const leads = getLeadsData();
    const scheduling = leads.filter(l => l.status === 'Scheduling').slice(0, flags.limit);
    
    console.log(`Generating emails for ${scheduling.length} leads:\n`);
    
    scheduling.forEach((lead, i) => {
      const leadCompany = lead.company || lead.domain || 'Unknown';
      const vertical = segment || detectVertical({ name: leadCompany });
      const result = buildEmail({
        company: leadCompany,
        firstName: lead.name?.split(' ')[0] || '[First Name]',
        vertical,
        ctaType: flags.hard ? 'hard' : 'soft'
      });
      
      console.log(`\x1b[1m${i + 1}. ${leadCompany}\x1b[0m (${vertical})`);
      console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
      console.log(result.email);
      console.log('');
    });
    
    return;
  }
  
  if (!company) {
    console.log('\x1b[1m4-PART STRUCTURE:\x1b[0m');
    console.log('');
    console.log('   1. INTRO - Segment-based relevance');
    console.log('   2. PAIN - Specific problem they have');
    console.log('   3. SOLUTION - Your isolated service');
    console.log('   4. CTA - Soft (more replies) or Hard (higher intent)');
    console.log('');
    console.log('\x1b[1mUSAGE:\x1b[0m');
    console.log('');
    console.log('   gex email "Supercell" --segment gaming');
    console.log('   gex email "Duolingo" --segment education');
    console.log('   gex email --batch --soft');
    console.log('   gex email "Company" --variations');
    console.log('');
    console.log('\x1b[1mPAIN POINTS BY SEGMENT:\x1b[0m');
    console.log('');
    Object.entries(PAIN_POINTS).forEach(([seg, pains]) => {
      console.log(`   \x1b[1m${seg.toUpperCase()}\x1b[0m`);
      pains.slice(0, 2).forEach(p => {
        console.log(`      • ${p.pain}`);
      });
      console.log('');
    });
    return;
  }
  
  // Generate email(s)
  const vertical = segment || detectVertical({ name: company });
  
  if (flags.variations) {
    const variations = generateVariations(company, vertical, 3);
    
    console.log(`Company: \x1b[1m${company}\x1b[0m`);
    console.log(`Vertical: ${vertical}`);
    console.log('');
    console.log('Generating 3 variations with different pain points:\n');
    
    variations.forEach((v, i) => {
      console.log(`\x1b[1mVARIATION ${i + 1}\x1b[0m (${v.components.ctaType} CTA)`);
      console.log(`Pain: "${v.components.pain}"`);
      console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
      console.log(v.email);
      console.log('');
    });
  } else {
    const result = buildEmail({
      company,
      vertical,
      ctaType: flags.hard ? 'hard' : 'soft'
    });
    
    console.log(`Company: \x1b[1m${company}\x1b[0m`);
    console.log(`Vertical: ${vertical}`);
    console.log(`CTA Type: ${result.components.ctaType}`);
    console.log('');
    console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
    console.log('');
    console.log(result.email);
    console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
    console.log('');
    console.log('\x1b[32m✓ Ready to copy and personalize\x1b[0m');
    console.log('');
    console.log('\x1b[2m💡 Use --variations to see 3 different pain points\x1b[0m');
  }
  console.log('');
}

main().catch(console.error);
