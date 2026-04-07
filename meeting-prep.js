#!/usr/bin/env node
/**
 * Meeting Prep Generator
 * 
 * Generates talking points, case studies, and pricing for meetings.
 * Use before any sales call.
 * 
 * Usage:
 *   node meeting-prep.js COMPANY           # Generate prep for company
 *   node meeting-prep.js EMAIL             # Generate prep from email
 *   node meeting-prep.js --next            # Prep for next scheduled meeting
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const TARGET = args[0];

// Business knowledge base
const CASE_STUDIES = [
  {
    name: 'Whiteout Survival',
    vertical: 'gaming',
    views: '48M',
    results: '100K+ new app users',
    dealSize: '$48K',
    integration: 'Story integration in moral skit format'
  },
  {
    name: 'Gauth AI',
    vertical: 'education',
    views: '15M+',
    results: '50K+ downloads',
    dealSize: '$35K',
    integration: 'Educational content integration'
  },
  {
    name: 'Valeo',
    vertical: 'consumer',
    views: '12M',
    results: 'Brand awareness campaign',
    dealSize: '$31K',
    integration: 'Product feature in storyline'
  },
  {
    name: 'Allison AI',
    vertical: 'AI/tech',
    views: '10M+',
    results: 'Lead generation campaign',
    dealSize: '$24K',
    integration: 'AI tool showcase'
  }
];

const PRICING = {
  storyIntegration: { min: 15000, max: 25000, typical: 20000, desc: 'Brand woven into ItssIMANNN\'s story naturally' },
  dedicatedVideo: { min: 30000, max: 45000, typical: 35000, desc: 'Full video focused on brand/product' },
  series: { min: 50000, max: 75000, typical: 60000, desc: '3-5 video campaign with ongoing presence' }
};

const VERTICALS = {
  gaming: {
    talking_points: [
      'ItssIMANNN\'s audience loves gaming content',
      'Story-driven moral skits create deep engagement',
      'Whiteout Survival campaign drove 100K+ new users',
      'Gaming integrations feel natural in content'
    ],
    objection_handlers: {
      'too expensive': 'Gaming campaigns typically see 5-10x ROI based on user acquisition costs. Whiteout paid ~$0.48 per user.',
      'audience fit': 'Our audience is 18-34, heavy mobile users, exactly who downloads and plays mobile games.',
      'competition': 'ItssIMANNN\'s unique moral skit format means your game stands out vs generic gameplay videos.'
    },
    recommended_case: 'Whiteout Survival'
  },
  education: {
    talking_points: [
      'Education content resonates with our 18-34 demo',
      'Moral stories naturally incorporate learning themes',
      'Gauth AI saw 50K+ downloads from single campaign',
      'Perfect for apps, courses, and EdTech'
    ],
    objection_handlers: {
      'too expensive': 'Gauth paid ~$0.70 per download. Compare to $3-5 CAC for typical EdTech.',
      'audience fit': 'Our audience actively seeks self-improvement and learning opportunities.',
      'competition': 'Story format creates genuine interest vs traditional ads.'
    },
    recommended_case: 'Gauth AI'
  },
  ai: {
    talking_points: [
      'AI tools are hot with our tech-savvy audience',
      'Story format demonstrates real use cases',
      'Allison AI campaign drove significant leads',
      'Perfect for SaaS, AI tools, productivity apps'
    ],
    objection_handlers: {
      'too expensive': 'B2B leads from our campaigns convert at 3x rate of cold outreach.',
      'audience fit': '18-34 demo are early adopters of AI tools.',
      'competition': 'Authentic integration beats traditional sponsor reads.'
    },
    recommended_case: 'Allison AI'
  },
  consumer: {
    talking_points: [
      'Consumer brands love our engaged audience',
      'Product features naturally in storylines',
      'High brand recall from story format',
      'Great for DTC, CPG, lifestyle brands'
    ],
    objection_handlers: {
      'too expensive': 'Compare CPM to traditional media - we\'re at $5-8 vs $15-20 for TV.',
      'audience fit': 'Young, engaged audience with purchasing power.',
      'competition': 'Story integration feels organic, not like an ad.'
    },
    recommended_case: 'Valeo'
  }
};

// Known gaming companies
const GAMING_COMPANIES = [
  'stillfront', 'paradox', 'unity', 'dream11', 'owlcat', 'virtus', 'candivore',
  'eneba', 'poki', 'naver', 'supercell', 'zynga', 'king', 'rovio', 'ubisoft',
  'ea', 'activision', 'blizzard', 'riot', 'epic', 'valve', 'nexon', 'netease',
  'mihoyo', 'krafton', 'scopely', 'playtika', 'jam city', 'glu', 'kabam'
];

// Detect vertical from company name or info
function detectVertical(company, email) {
  const text = `${company} ${email}`.toLowerCase();
  
  // Check known gaming companies first
  if (GAMING_COMPANIES.some(gc => text.includes(gc))) return 'gaming';
  
  if (/game|gaming|studio|play|mobile.*game|esport/i.test(text)) return 'gaming';
  if (/edu|learn|school|course|study|tutor/i.test(text)) return 'education';
  if (/ai|artificial|ml|machine|saas|software|tech|app/i.test(text)) return 'ai';
  return 'consumer'; // default
}

async function generatePrep(client, target) {
  // Find the lead
  let lead = null;
  
  if (target.includes('@')) {
    const { data } = await client
      .from('positive_replies')
      .select('*')
      .ilike('lead_email', `%${target}%`)
      .limit(1);
    lead = data?.[0];
  } else {
    const { data } = await client
      .from('positive_replies')
      .select('*')
      .ilike('lead_company', `%${target}%`)
      .limit(1);
    lead = data?.[0];
  }

  if (!lead) {
    // Create a generic prep based on company name
    lead = {
      lead_name: 'Contact',
      lead_company: target,
      lead_email: ''
    };
  }

  const company = lead.lead_company || target;
  const firstName = lead.lead_name?.split(' ')[0] || 'Contact';
  const vertical = detectVertical(company, lead.lead_email || '');
  const verticalInfo = VERTICALS[vertical];
  const recommendedCase = CASE_STUDIES.find(c => c.name === verticalInfo.recommended_case) || CASE_STUDIES[0];

  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  📋 MEETING PREP: ${company.toUpperCase().slice(0, 50).padEnd(50)}║
╚═══════════════════════════════════════════════════════════════════════════╝

👤 CONTACT INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Name: ${lead.lead_name || 'Unknown'}
   Email: ${lead.lead_email || 'Unknown'}
   Company: ${company}
   Vertical: ${vertical.charAt(0).toUpperCase() + vertical.slice(1)}

🎯 TALKING POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${verticalInfo.talking_points.map((p, i) => `   ${i + 1}. ${p}`).join('\n')}

📊 RECOMMENDED CASE STUDY: ${recommendedCase.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Views: ${recommendedCase.views}
   Results: ${recommendedCase.results}
   Deal Size: ${recommendedCase.dealSize}
   Integration: ${recommendedCase.integration}

💰 PRICING GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Story Integration:  $${PRICING.storyIntegration.min.toLocaleString()} - $${PRICING.storyIntegration.max.toLocaleString()}
                       ${PRICING.storyIntegration.desc}
   
   Dedicated Video:    $${PRICING.dedicatedVideo.min.toLocaleString()} - $${PRICING.dedicatedVideo.max.toLocaleString()}
                       ${PRICING.dedicatedVideo.desc}
   
   Series (3-5 vids):  $${PRICING.series.min.toLocaleString()} - $${PRICING.series.max.toLocaleString()}
                       ${PRICING.series.desc}

⚔️ OBJECTION HANDLERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   "Too expensive"
   → ${verticalInfo.objection_handlers['too expensive']}

   "Not sure about audience fit"
   → ${verticalInfo.objection_handlers['audience fit']}

   "What makes you different?"
   → ${verticalInfo.objection_handlers['competition']}

📝 CALL SCRIPT OPENER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   "Hi ${firstName}, thanks for taking the time. Before I dive in, I'd love to 
   understand what ${company}'s goals are for influencer marketing this quarter.
   What would success look like for you?"

   [LISTEN, then pivot to relevant case study]

   "That's exactly what we helped ${recommendedCase.name} achieve. They saw 
   ${recommendedCase.views} views and ${recommendedCase.results}..."

✅ CALL GOALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. Understand their goals and budget
   2. Share relevant case study
   3. Propose integration type (story/dedicated/series)
   4. Get commitment to next step (proposal, follow-up)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Good luck. Close the deal.
`);
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  if (!TARGET || TARGET === '--help') {
    console.log(`
Usage:
  gex prep COMPANY       Generate prep for company
  gex prep EMAIL         Generate prep from lead email
  
Examples:
  gex prep Stillfront
  gex prep marina.andersson@stillfront.com
`);
    return;
  }

  if (TARGET === '--next') {
    // Get next meeting from deals
    console.log('Looking for next scheduled meeting...');
    // For now, just show help
    console.log('Use: gex prep COMPANY to generate prep');
    return;
  }

  await generatePrep(client, TARGET);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
