#!/usr/bin/env node
/**
 * Smart Meeting Prep Tool
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo, COMPANY_DATA } = require('./lead-enrichment');

const INDUSTRY_PLAYBOOKS = {
  'Gaming': {
    pain_points: [
      'User acquisition costs rising',
      'Player retention challenges',
      'Standing out in crowded app stores',
      'Monetization balance (IAP vs ads)',
      'Community management at scale'
    ],
    value_props: [
      'We help gaming companies increase LTV by 40% average',
      'Our influencer network reaches 100M+ gamers monthly',
      'Case study: Helped [X] reduce CPI by 35%'
    ],
    questions: [
      'What is your current player acquisition strategy?',
      'How are you measuring player engagement beyond DAU/MAU?',
      'What is your biggest challenge with retention?',
      'Are you exploring creator/influencer marketing?'
    ]
  },
  'EdTech': {
    pain_points: [
      'Student engagement and completion rates',
      'B2B vs B2C go-to-market complexity',
      'Standing out in saturated market',
      'Measuring learning outcomes',
      'International expansion challenges'
    ],
    value_props: [
      'We specialize in EdTech creator partnerships',
      'Our network includes 500+ education influencers',
      'Average 3x increase in brand awareness for EdTech clients'
    ],
    questions: [
      'What is your biggest growth channel right now?',
      'How are you approaching content marketing?',
      'Are you focusing on B2B enterprise or B2C consumers?',
      'What markets are you prioritizing for expansion?'
    ]
  },
  'default': {
    pain_points: [
      'Customer acquisition costs',
      'Brand awareness in competitive market',
      'Reaching target audience authentically',
      'Measuring marketing ROI',
      'Content creation at scale'
    ],
    value_props: [
      'We connect brands with authentic creator partnerships',
      'Data-driven influencer matching',
      'Full-service campaign management'
    ],
    questions: [
      'What is your current marketing mix?',
      'Have you worked with influencers/creators before?',
      'What does success look like for you this quarter?',
      'Who is your target customer?'
    ]
  }
};

const OBJECTION_HANDLING = [
  {
    objection: "We don't have budget for influencer marketing",
    rebuttal: "Many of our clients started small - even $5-10K can generate significant results. Would a pilot program make sense to prove ROI?"
  },
  {
    objection: "We've tried influencers before and it didn't work",
    rebuttal: "That's common - usually it comes down to creator-brand fit. What happened in your previous campaign?"
  },
  {
    objection: "We handle this in-house",
    rebuttal: "Great! Many clients use us to complement their team. How's your team's capacity right now?"
  },
  {
    objection: "Now isn't the right time",
    rebuttal: "Understood. When would be a better time to revisit? I'd love to stay in touch."
  }
];

async function generateMeetingPrep(email) {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: lead, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (error || !lead) throw new Error('Lead not found: ' + email);

  const companyInfo = getCompanyInfo(email);
  const industry = companyInfo?.industry || 'default';
  const playbook = INDUSTRY_PLAYBOOKS[industry] || INDUSTRY_PLAYBOOKS['default'];

  return {
    lead: {
      name: lead.lead_name || 'Unknown',
      email: lead.lead_email,
      company: lead.lead_company || companyInfo?.name || 'Unknown',
      category: lead.reply_category,
      first_reply: lead.replied_at
    },
    company: companyInfo,
    playbook: { industry, ...playbook },
    objection_handling: OBJECTION_HANDLING,
    linkedin: 'https://www.linkedin.com/search/results/people/?keywords=' + 
      encodeURIComponent((lead.lead_name || '') + ' ' + (lead.lead_company || '')),
    generated_at: new Date().toISOString()
  };
}

function formatMeetingPrep(prep) {
  return `
════════════════════════════════════════════════════════════════
📋 MEETING PREP: ${prep.lead.name}
   ${prep.lead.company}
════════════════════════════════════════════════════════════════

📧 Email: ${prep.lead.email}
📅 First replied: ${new Date(prep.lead.first_reply).toLocaleDateString()}
📊 Status: ${prep.lead.category}

────────────────────────────────────────────────────────────────
🏢 COMPANY INTEL
────────────────────────────────────────────────────────────────
   Name:     ${prep.company?.name || 'Unknown'}
   Industry: ${prep.company?.industry || 'Unknown'}
   Size:     ${prep.company?.size || 'Unknown'}
   Funding:  ${prep.company?.funding || 'Unknown'}
   Tier:     ${prep.company?.tier || 'Unknown'}

🔗 LinkedIn: ${prep.linkedin}

────────────────────────────────────────────────────────────────
🎯 TALKING POINTS (${prep.playbook.industry})
────────────────────────────────────────────────────────────────

📍 PAIN POINTS TO PROBE:
${prep.playbook.pain_points.map((p, i) => '   ' + (i + 1) + '. ' + p).join('\n')}

💎 VALUE PROPS TO HIGHLIGHT:
${prep.playbook.value_props.map((p, i) => '   ' + (i + 1) + '. ' + p).join('\n')}

❓ DISCOVERY QUESTIONS:
${prep.playbook.questions.map((q, i) => '   ' + (i + 1) + '. ' + q).join('\n')}

────────────────────────────────────────────────────────────────
🛡️ OBJECTION HANDLING
────────────────────────────────────────────────────────────────
${prep.objection_handling.map(obj => '\n❌ "' + obj.objection + '"\n   ✅ ' + obj.rebuttal).join('\n')}

────────────────────────────────────────────────────────────────
📝 MEETING AGENDA (15 min)
────────────────────────────────────────────────────────────────
1. [2 min] Intro & rapport
2. [5 min] Discovery questions
3. [5 min] Present solutions
4. [3 min] Next steps & close

Generated: ${new Date(prep.generated_at).toLocaleString()}
════════════════════════════════════════════════════════════════
`;
}

async function main() {
  const email = process.argv[2];

  console.log('\n📋 SMART MEETING PREP\n');

  if (!email) {
    const client = initSupabase();
    if (!client) throw new Error('Supabase not initialized');

    const { data: leads } = await client
      .from('positive_replies')
      .select('lead_email, lead_name, lead_company, reply_category')
      .in('reply_category', ['Meeting Request', 'Booked', 'Interested'])
      .order('replied_at', { ascending: false })
      .limit(10);

    console.log('Usage: node smart-meeting-prep.js <email>\n');
    console.log('Hot leads:\n');
    for (const l of leads || []) {
      console.log('  ' + l.lead_email);
      console.log('    ' + (l.lead_name || 'N/A') + ' @ ' + (l.lead_company || 'N/A'));
      console.log('');
    }
    return;
  }

  try {
    const prep = await generateMeetingPrep(email);
    console.log(formatMeetingPrep(prep));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

module.exports = { generateMeetingPrep, INDUSTRY_PLAYBOOKS };

if (require.main === module) {
  main();
}
