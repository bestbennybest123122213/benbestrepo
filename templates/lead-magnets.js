/**
 * Lead Magnet Templates
 * Based on Eric Nowoslawski's "17 out of 20 best campaigns offered something free"
 * 
 * These are BY Influence specific lead magnets for cold email outreach
 */

const LEAD_MAGNETS = {
  // Tier 1: TANGIBLE (Highest Value)
  
  creator_match_report: {
    name: 'Creator Match Report',
    tier: 1,
    prep_time: '30 min',
    value: '$500-2,000',
    description: 'Custom list of 5 YouTube creators perfect for their brand',
    template: `Subject: 5 YouTube creators for {company}

Hey {first_name},

I put together a list of 5 YouTube creators that would be perfect for {company}:

1. ItssIMANNN (10M subs) - Story-driven skits, 361M monthly views
2. {creator_2} ({subs_2} subs) - {specialty_2}
3. {creator_3} ({subs_3} subs) - {specialty_3}
4. {creator_4} ({subs_4} subs) - {specialty_4}
5. {creator_5} ({subs_5} subs) - {specialty_5}

Included estimated rates, audience overlap with {company_audience}, and past brand deal performance.

Worth 5 minutes to go through it?

Best,
Jan`,
    variables: ['first_name', 'company', 'company_audience', 'creator_2', 'subs_2', 'specialty_2', 'creator_3', 'subs_3', 'specialty_3', 'creator_4', 'subs_4', 'specialty_4', 'creator_5', 'subs_5', 'specialty_5']
  },
  
  competitor_audit: {
    name: 'Competitor Campaign Audit',
    tier: 1,
    prep_time: '20 min',
    value: '$300-500',
    description: 'Analysis of competitor\'s creator marketing strategy',
    template: `Subject: {competitor}'s creator strategy

Hey {first_name},

Noticed {competitor} just launched a campaign with {creator_name}.

I broke down their approach:
- Estimated spend: {estimated_spend}
- View performance: {view_count}
- Content style: {content_style}
- Audience response: {audience_response}

Thought you'd want the intel. Happy to walk through what's working and what they missed.

Open to a quick chat?

Best,
Jan`,
    variables: ['first_name', 'competitor', 'creator_name', 'estimated_spend', 'view_count', 'content_style', 'audience_response']
  },
  
  benchmark_data: {
    name: 'Performance Benchmark Data',
    tier: 1,
    prep_time: '10 min',
    value: '$200-400',
    description: 'Industry-specific influencer campaign benchmarks',
    template: `Subject: {vertical} creator marketing benchmarks

Hey {first_name},

We ran {campaign_count} campaigns in {vertical} this quarter.

Quick benchmarks:
- Average CPM: {cpm}
- Average CPA: {cpa}
- Best performing content: {content_type}
- Top converting audience: {audience_demo}

Want to see how {company} stacks up? I can put together a quick comparison.

Best,
Jan`,
    variables: ['first_name', 'vertical', 'company', 'campaign_count', 'cpm', 'cpa', 'content_type', 'audience_demo']
  },
  
  // Tier 2: INTANGIBLE (No Prep Required)
  
  strategy_session: {
    name: 'Strategy Session',
    tier: 2,
    prep_time: '0 min',
    value: '$300/hour',
    description: '90-day influencer strategy sketch on a call',
    template: `Subject: Quick creator strategy for {company}

Hey {first_name},

I'd sketch out a 90-day influencer strategy for {company} on a quick call:
- Which creators make sense
- What content style works for {vertical}
- Expected ROI based on similar campaigns

No strings. If it's useful, great. If not, you've got a free roadmap.

Open to 15 minutes this week?

Best,
Jan`,
    variables: ['first_name', 'company', 'vertical']
  },
  
  rate_negotiation: {
    name: 'Rate Negotiation Playbook',
    tier: 2,
    prep_time: '0 min',
    value: '$500+',
    description: 'Real rate data to prevent overpaying',
    template: `Subject: Creator rates for {vertical}

Hey {first_name},

Most brands overpay creators by 30-40%.

Quick data point: {vertical} creators with 1-5M subscribers typically charge {rate_range} for integrations. A lot of agencies push 2-3x that.

I can show you what {creator_type} should actually cost based on our deal data.

Worth a quick call?

Best,
Jan`,
    variables: ['first_name', 'vertical', 'rate_range', 'creator_type']
  },
  
  vetting_checklist: {
    name: 'Creator Vetting Checklist',
    tier: 2,
    prep_time: '0 min',
    value: '$200',
    description: '12-point checklist for evaluating creators',
    template: `Subject: Creator red flags to watch for

Hey {first_name},

We use a 12-point checklist before recommending any creator to brands.

Quick preview:
- Audience authenticity check (fake followers)
- Comment sentiment analysis
- Brand safety review
- Past sponsor performance

Happy to share the full checklist. Even if you never work with us, you'll know what to look for.

Want me to send it over?

Best,
Jan`,
    variables: ['first_name']
  },
  
  // Tier 3: CASE STUDY
  
  case_study: {
    name: 'Relevant Case Study',
    tier: 3,
    prep_time: '5 min',
    value: '$100',
    description: 'Similar campaign results',
    template: `Subject: {similar_company} campaign results

Hey {first_name},

We just wrapped a campaign for {similar_company} ({vertical}).

Results:
- {view_count} views
- {conversion_count} {conversion_type}
- {additional_metric}

{company} has a similar audience. Happy to share what worked if you're thinking about creator content.

Best,
Jan`,
    variables: ['first_name', 'company', 'similar_company', 'vertical', 'view_count', 'conversion_count', 'conversion_type', 'additional_metric']
  }
};

// Gaming-specific templates
const GAMING_TEMPLATES = {
  whiteout_case_study: {
    name: 'Whiteout Survival Case Study',
    template: `Subject: How Whiteout Survival got 100K users from YouTube

Hey {first_name},

Quick case study: We helped Whiteout Survival run a YouTube campaign that got 48M views and 100K+ new users.

The approach:
- Story-driven integration (not obvious ad)
- Creator with gaming/entertainment overlap
- Timing aligned with game update

{company} has a similar user profile. Worth exploring?

Best,
Jan`,
    variables: ['first_name', 'company']
  },
  
  gaming_benchmark: {
    name: 'Gaming Campaign Benchmarks',
    template: `Subject: Mobile gaming creator benchmarks

Hey {first_name},

Quick benchmarks from our gaming campaigns:
- CPM: $15-25 (YouTube integrations)
- CPA: $1.50-3.00 (mobile installs)
- Best creators: Entertainment/story format > pure gaming
- Audience: 18-34 casual gamers

{company} matches the profile of campaigns that worked well. Want the detailed breakdown?

Best,
Jan`,
    variables: ['first_name', 'company']
  }
};

// Education-specific templates
const EDUCATION_TEMPLATES = {
  gauth_case_study: {
    name: 'Gauth AI Case Study',
    template: `Subject: How Gauth AI got 50K downloads from YouTube

Hey {first_name},

Case study: Gauth AI ran YouTube integrations that got 15M+ views and 50K+ downloads.

What worked:
- Educational content creators (not just influencers)
- "Real student" use case demonstrations
- Back-to-school timing

{company} serves a similar audience. Want to see the full breakdown?

Best,
Jan`,
    variables: ['first_name', 'company']
  }
};

// Helper function to fill template
function fillTemplate(template, variables) {
  let filled = template;
  for (const [key, value] of Object.entries(variables)) {
    filled = filled.replace(new RegExp(`{${key}}`, 'g'), value);
    filled = filled.replace(new RegExp(`\\$${key}`, 'g'), value);
  }
  return filled;
}

// Get template by name
function getTemplate(name) {
  return LEAD_MAGNETS[name] || GAMING_TEMPLATES[name] || EDUCATION_TEMPLATES[name];
}

// List all templates
function listTemplates() {
  return {
    tier1: Object.entries(LEAD_MAGNETS).filter(([k, v]) => v.tier === 1).map(([k, v]) => ({ key: k, ...v })),
    tier2: Object.entries(LEAD_MAGNETS).filter(([k, v]) => v.tier === 2).map(([k, v]) => ({ key: k, ...v })),
    tier3: Object.entries(LEAD_MAGNETS).filter(([k, v]) => v.tier === 3).map(([k, v]) => ({ key: k, ...v })),
    gaming: Object.entries(GAMING_TEMPLATES).map(([k, v]) => ({ key: k, ...v })),
    education: Object.entries(EDUCATION_TEMPLATES).map(([k, v]) => ({ key: k, ...v }))
  };
}

module.exports = {
  LEAD_MAGNETS,
  GAMING_TEMPLATES,
  EDUCATION_TEMPLATES,
  fillTemplate,
  getTemplate,
  listTemplates
};
