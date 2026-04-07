#!/usr/bin/env node
/**
 * Quick Pitch Generator
 * Generate personalized pitches based on company data
 * Uses Eric's "Why You, Why Now" framework
 * 
 * Usage:
 *   node gex.js pitch <company>          - Generate pitch for company
 *   node gex.js pitch <company> --gaming - Use gaming vertical template
 *   node gex.js pitch --batch            - Generate pitches for top leads
 */

const fs = require('fs');
const path = require('path');
const { detectVertical } = require('../lib/intent-signals');

// BY Influence case studies for proof
const CASE_STUDIES = {
  gaming: {
    company: 'Whiteout Survival',
    result: '48M views, 100K+ new users',
    approach: 'Story-driven integration with ItssIMANNN'
  },
  education: {
    company: 'Gauth AI',
    result: '15M+ views, 50K+ downloads',
    approach: 'Educational content with student use cases'
  },
  tech: {
    company: 'Valeo',
    result: '$30,906 campaign ROI',
    approach: 'Tech-focused integration with Alementary'
  }
};

// John Barrows "Why You, Why Now" template
const WHY_YOU_WHY_NOW = {
  template: `Subject: {subject}

Hey {first_name},

{why_you}

{why_now}

{proof}

{cta}

Best,
Jan`,
  
  why_you_options: [
    "Noticed {company} is {observation}.",
    "Saw {company} just {recent_action}.",
    "I was looking at {company}'s {asset} and noticed {detail}.",
    "Your team at {company} caught my attention because {reason}."
  ],
  
  why_now_options: {
    gaming: "Mobile game marketing is getting more expensive. YouTube creators are outperforming paid UA by 3-4x on CPA.",
    education: "EdTech companies are shifting budget from paid social to creator content. Students trust YouTubers more than ads.",
    tech: "B2C tech brands are seeing 40%+ lower CAC from creator integrations vs traditional digital.",
    default: "Creator marketing is outperforming traditional paid channels for companies like yours."
  },
  
  proof_options: {
    gaming: `We helped ${CASE_STUDIES.gaming.company} get ${CASE_STUDIES.gaming.result} through ${CASE_STUDIES.gaming.approach}.`,
    education: `We helped ${CASE_STUDIES.education.company} get ${CASE_STUDIES.education.result} through ${CASE_STUDIES.education.approach}.`,
    tech: `We helped ${CASE_STUDIES.tech.company} achieve ${CASE_STUDIES.tech.result} through ${CASE_STUDIES.tech.approach}.`,
    default: "We've run 23+ campaigns in the last quarter with an average 4x ROAS on creator content."
  },
  
  cta_options: [
    "Worth a quick chat to see if this could work for {company}?",
    "Open to a 15-minute call this week?",
    "Would you be the right person to talk about creator marketing at {company}? Or should I reach out to someone else?",
    "Interested in seeing how this would work for {company}?"
  ]
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

// Generate pitch for a company
function generatePitch(company, options = {}) {
  const vertical = options.vertical || detectVertical({ name: company }) || 'default';
  const firstName = options.firstName || '[First Name]';
  
  // Select components
  const whyYou = WHY_YOU_WHY_NOW.why_you_options[Math.floor(Math.random() * WHY_YOU_WHY_NOW.why_you_options.length)]
    .replace('{company}', company)
    .replace('{observation}', options.observation || 'growing fast in the ' + vertical + ' space')
    .replace('{recent_action}', options.recent_action || 'launched a new campaign')
    .replace('{asset}', options.asset || 'marketing')
    .replace('{detail}', options.detail || 'you\'re investing in growth')
    .replace('{reason}', options.reason || 'you\'re in a vertical we know well');
  
  const whyNow = WHY_YOU_WHY_NOW.why_now_options[vertical] || WHY_YOU_WHY_NOW.why_now_options.default;
  
  const proof = WHY_YOU_WHY_NOW.proof_options[vertical] || WHY_YOU_WHY_NOW.proof_options.default;
  
  const cta = WHY_YOU_WHY_NOW.cta_options[Math.floor(Math.random() * WHY_YOU_WHY_NOW.cta_options.length)]
    .replace('{company}', company);
  
  // Generate subject
  const subjects = [
    `Quick idea for ${company}`,
    `${company} + YouTube creators`,
    `Thought of ${company}`,
    `Creator marketing for ${company}?`
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  
  // Fill template
  let pitch = WHY_YOU_WHY_NOW.template
    .replace('{subject}', subject)
    .replace('{first_name}', firstName)
    .replace('{why_you}', whyYou)
    .replace('{why_now}', whyNow)
    .replace('{proof}', proof)
    .replace('{cta}', cta);
  
  return {
    pitch,
    vertical,
    subject
  };
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== 'pitch' && a !== 'qp');
  
  // Parse flags
  const flags = {
    batch: args.includes('--batch') || args.includes('-b'),
    gaming: args.includes('--gaming'),
    education: args.includes('--education') || args.includes('--edu'),
    tech: args.includes('--tech'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    limit: 5
  };
  
  // Determine vertical override
  let verticalOverride = null;
  if (flags.gaming) verticalOverride = 'gaming';
  if (flags.education) verticalOverride = 'education';
  if (flags.tech) verticalOverride = 'tech';
  
  // Parse limit
  const limitIdx = args.findIndex(a => a === '--limit' || a === '-n');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    flags.limit = parseInt(args[limitIdx + 1]) || 5;
  }
  
  // Get company name from args
  const companyArgs = args.filter(a => !a.startsWith('-') && !a.startsWith('--'));
  const company = companyArgs.join(' ');
  
  console.log('');
  console.log('📝 \x1b[1mQUICK PITCH GENERATOR\x1b[0m');
  console.log('   John Barrows "Why You, Why Now" framework');
  console.log('');
  
  if (flags.batch) {
    // Generate pitches for top leads
    const leads = getLeadsData();
    
    if (leads.length === 0) {
      console.log('\x1b[33m⚠️  No leads data found.\x1b[0m');
      return;
    }
    
    // Filter to Scheduling leads (need follow-up)
    const scheduling = leads.filter(l => l.status === 'Scheduling').slice(0, flags.limit);
    
    console.log(`Generating pitches for ${scheduling.length} leads in Scheduling:\n`);
    
    scheduling.forEach((lead, i) => {
      const result = generatePitch(lead.company || lead.domain, {
        vertical: verticalOverride,
        firstName: lead.name?.split(' ')[0] || '[First Name]'
      });
      
      console.log(`\x1b[1m${i + 1}. ${lead.company || lead.domain}\x1b[0m (${result.vertical})`);
      console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
      console.log(result.pitch);
      console.log('');
    });
    
    return;
  }
  
  if (!company) {
    console.log('Usage:');
    console.log('  gex pitch <company>          Generate pitch for company');
    console.log('  gex pitch <company> --gaming Use gaming template');
    console.log('  gex pitch --batch            Generate for top leads');
    console.log('');
    console.log('Examples:');
    console.log('  gex pitch "Supercell" --gaming');
    console.log('  gex pitch "Duolingo" --education');
    console.log('  gex pitch --batch --limit 10');
    console.log('');
    return;
  }
  
  // Generate single pitch
  const result = generatePitch(company, {
    vertical: verticalOverride
  });
  
  console.log(`Company: \x1b[1m${company}\x1b[0m`);
  console.log(`Vertical: ${result.vertical}`);
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log(result.pitch);
  console.log('');
  console.log('\x1b[2m─────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log('\x1b[32m✓ Ready to copy and personalize\x1b[0m');
  console.log('');
  
  // Show framework
  if (flags.verbose) {
    console.log('\x1b[1mFRAMEWORK BREAKDOWN:\x1b[0m');
    console.log('  Line 1: WHY YOU - How you found them');
    console.log('  Line 2: WHY NOW - The problem/opportunity');
    console.log('  Line 3: PROOF - Case study');
    console.log('  Line 4: CTA - Question, not link');
    console.log('');
  }
}

main().catch(console.error);
