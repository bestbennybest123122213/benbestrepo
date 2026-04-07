#!/usr/bin/env node
/**
 * Smart Email Generator
 * Creates personalized emails based on lead characteristics
 */

const fs = require('fs');
const { leads } = require('./enriched-leads.json');

const now = Date.now();
leads.forEach(l => {
  l.age_days = Math.floor((now - new Date(l.replied_at)) / (1000 * 60 * 60 * 24));
});

// Get target lead (command line or first unbooked)
const targetCompany = process.argv[2];

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  ✉️  SMART EMAIL GENERATOR                                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

if (targetCompany) {
  const lead = leads.find(l => 
    l.lead_company?.toLowerCase().includes(targetCompany.toLowerCase()) ||
    l.lead_email?.toLowerCase().includes(targetCompany.toLowerCase())
  );
  
  if (lead) {
    generateEmailForLead(lead);
  } else {
    console.log(`Lead not found: ${targetCompany}`);
    console.log('\nUsage: node smart-email-generator.js [company_name]');
  }
} else {
  // Generate for top 5 priority leads
  const priority = leads
    .filter(l => l.reply_category !== 'Booked')
    .sort((a, b) => {
      // Enterprise first, then by category, then by age
      if (a.tier === 'enterprise' && b.tier !== 'enterprise') return -1;
      if (b.tier === 'enterprise' && a.tier !== 'enterprise') return 1;
      
      const catOrder = { 'Meeting Request': 1, 'Interested': 2, 'Information Request': 3 };
      const catDiff = (catOrder[a.reply_category] || 4) - (catOrder[b.reply_category] || 4);
      if (catDiff !== 0) return catDiff;
      
      return a.age_days - b.age_days;
    })
    .slice(0, 5);
  
  console.log('Top 5 Priority Leads:\n');
  priority.forEach((lead, i) => {
    console.log(`${'─'.repeat(70)}`);
    console.log(`\n📧 EMAIL ${i + 1}: ${lead.lead_company}\n`);
    generateEmailForLead(lead);
  });
}

function generateEmailForLead(lead) {
  const firstName = lead.lead_name.split(' ')[0];
  const industry = lead.company_info?.industry || detectIndustry(lead.lead_company, lead.lead_email);
  const tier = lead.tier || 'unknown';
  const category = lead.reply_category;
  const ageDays = lead.age_days;
  
  console.log(`  To: ${lead.lead_email}`);
  console.log(`  Company: ${lead.lead_company} (${tier})`);
  console.log(`  Category: ${category} | Age: ${ageDays} days`);
  console.log(`  Industry: ${industry}\n`);
  
  // Select template based on characteristics
  let subject, body;
  
  if (category === 'Meeting Request') {
    if (ageDays <= 3) {
      // Hot meeting request - urgent scheduling
      subject = `Re: Quick time slot for ${firstName}?`;
      body = `Hi ${firstName},

Excited to connect! I saw your interest in scheduling a meeting.

I've got a few slots open this week:
• Tomorrow at 2 PM or 4 PM (your time)
• Thursday morning
• Friday afternoon

Or grab any time that works: [CALENDLY_LINK]

Looking forward to it!

Best,
[YOUR_NAME]`;
    } else if (ageDays <= 14) {
      // Warm meeting request - gentle follow-up
      subject = `Re: Still good to connect, ${firstName}?`;
      body = `Hi ${firstName},

Just wanted to follow up on scheduling our call. I know things can get busy!

I'm flexible this week - would any of these times work?
• [TIME_OPTION_1]
• [TIME_OPTION_2]
• [TIME_OPTION_3]

Or just grab a slot here: [CALENDLY_LINK]

Let me know what works best.

Cheers,
[YOUR_NAME]`;
    } else {
      // Stale meeting request - re-engage
      subject = `${firstName} - quick check-in`;
      body = `Hi ${firstName},

I hope you've been well! Wanted to circle back on our previous conversation about partnering with Imann.

Are you still interested in exploring this? No pressure either way - just want to make sure I'm not leaving you hanging.

If timing is better later this quarter, just let me know and I'll reach out then.

Best,
[YOUR_NAME]`;
    }
  } else if (category === 'Interested') {
    // Nurture sequence
    subject = `${lead.lead_company} + Imann - next steps`;
    body = `Hi ${firstName},

Thanks for your interest in working with Imann! I wanted to share a few things that might be helpful:

${getIndustrySpecificValue(industry)}

Would you be open to a quick 15-minute call to discuss how we might work together? I'd love to learn more about ${lead.lead_company}'s goals.

Let me know if any of these times work:
• [TIME_OPTION_1]
• [TIME_OPTION_2]

Best,
[YOUR_NAME]`;
  } else if (category === 'Information Request') {
    // Provide info + CTA
    subject = `Re: Info about Imann for ${lead.lead_company}`;
    body = `Hi ${firstName},

Thanks for reaching out! Here's some info about how Imann works:

**What We Do:**
• Connect brands with top YouTube creators
• Performance-based sponsorship campaigns
• Full campaign management & analytics

**Who We Work With:**
• Gaming companies (our sweet spot)
• B2C consumer brands
• EdTech & apps

${getIndustrySpecificValue(industry)}

Would a quick call be helpful to discuss specifics? I'm happy to walk through case studies and answer any questions.

Best,
[YOUR_NAME]`;
  }
  
  // Enterprise customization
  if (tier === 'enterprise') {
    body = body.replace('a quick 15-minute call', 'a call with our enterprise team');
    body += `\n\nP.S. Given ${lead.lead_company}'s scale, we'd love to discuss custom partnership opportunities.`;
  }
  
  console.log('  ─── GENERATED EMAIL ───\n');
  console.log(`  Subject: ${subject}\n`);
  console.log(body.split('\n').map(line => `  ${line}`).join('\n'));
  console.log('\n');
}

function detectIndustry(company, email) {
  const text = (company + ' ' + email).toLowerCase();
  if (text.includes('game') || text.includes('play') || text.includes('studio')) return 'Gaming';
  if (text.includes('learn') || text.includes('edu') || text.includes('academy')) return 'EdTech';
  if (text.includes('travel') || text.includes('trip')) return 'Travel';
  if (text.includes('health') || text.includes('fit') || text.includes('well')) return 'Health';
  if (text.includes('shop') || text.includes('store') || text.includes('commerce')) return 'E-commerce';
  return 'Tech';
}

function getIndustrySpecificValue(industry) {
  const valueProps = {
    Gaming: `**For Gaming Companies:**
• 3x average engagement vs traditional ads
• Direct access to gaming audiences
• Proven ROI with titles like [EXAMPLE_GAME]`,
    
    EdTech: `**For Education Brands:**
• Authentic student/learner testimonials
• Long-form tutorial integrations
• Measurable sign-up attribution`,
    
    Travel: `**For Travel Brands:**
• Destination showcase content
• Travel vlog integrations
• Seasonal campaign expertise`,
    
    Health: `**For Health & Wellness:**
• Authentic product demonstrations
• Fitness creator partnerships
• Compliant health claims`,
    
    'E-commerce': `**For E-commerce Brands:**
• Unboxing & review content
• Direct purchase attribution
• Influencer affiliate programs`,
    
    Tech: `**Why Partner With Us:**
• Access to 500+ vetted creators
• Performance-based pricing
• Full campaign analytics`
  };
  
  return valueProps[industry] || valueProps.Tech;
}

console.log('─'.repeat(70));
console.log('\n💡 TIP: Run with company name for specific lead: node smart-email-generator.js Unity');
