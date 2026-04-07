#!/usr/bin/env node
/**
 * Personalized Follow-Up Email Generator
 * Takes a lead email and generates a contextual follow-up
 * 
 * Usage: node generate-followup.js <email>
 * Example: node generate-followup.js olli.laamanen@rovio.com
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Email templates by urgency
const TEMPLATES = {
  critical: {
    subject: [
      "Quick question, {firstName}",
      "Still interested in influencer marketing?",
      "Checking in - {company}",
      "Should I close your file?"
    ],
    body: `Hey {firstName},

We connected back in {month} about influencer marketing for {company}.

I wanted to check if this is still on your radar? If timing isn't right, no worries at all - just let me know and I'll reach out later in the year.

If you're ready to chat, here's my calendar: [CALENDAR_LINK]

Best,
Imann`
  },
  warm: {
    subject: [
      "Circling back",
      "{company} + ItssIMANNN",
      "Quick follow-up"
    ],
    body: `Hi {firstName},

Hope your {currentMonth} is going well!

Following up on our conversation about influencer marketing for {company}. 

Would love to find 15 minutes to walk through how we've been driving results for similar brands in the {industry} space.

What does your week look like?

Best,
Imann`
  },
  recent: {
    subject: [
      "Thought of you",
      "Quick idea for {company}",
      "Saw this and thought of you"
    ],
    body: `Hey {firstName},

Following up on our chat - I was thinking about {company} and had a few ideas on how influencers could amplify your reach.

Would you have 15 mins this week for a quick call? I can share some specific creator recommendations.

[CALENDAR_LINK]

Best,
Imann`
  }
};

// Industry keywords for personalization
const INDUSTRIES = {
  gaming: ['game', 'gaming', 'esports', 'studio', 'mobile game', 'pc game', 'console'],
  tech: ['software', 'saas', 'platform', 'api', 'ai', 'tech', 'app'],
  education: ['edu', 'learning', 'academy', 'school', 'course'],
  media: ['media', 'entertainment', 'content', 'streaming', 'video'],
  consumer: ['consumer', 'brand', 'retail', 'ecommerce', 'food', 'drink']
};

function detectIndustry(company, notes) {
  const text = `${company} ${notes || ''}`.toLowerCase();
  for (const [industry, keywords] of Object.entries(INDUSTRIES)) {
    if (keywords.some(k => text.includes(k))) return industry;
  }
  return 'tech';
}

function getFirstName(name) {
  if (!name) return 'there';
  return name.split(' ')[0];
}

function getMonth(date) {
  if (!date) return 'a while back';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[new Date(date).getMonth()];
}

async function generateFollowup(email) {
  const { data: lead, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !lead) {
    console.error('Lead not found:', email);
    return;
  }

  const now = Date.now();
  const daysStale = lead.conversation_date 
    ? Math.floor((now - new Date(lead.conversation_date)) / (1000 * 60 * 60 * 24))
    : 0;

  // Determine template based on staleness
  let templateType = 'recent';
  if (daysStale > 30) templateType = 'critical';
  else if (daysStale > 14) templateType = 'warm';

  const template = TEMPLATES[templateType];
  const industry = detectIndustry(lead.company, lead.notes);
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
  const firstName = getFirstName(lead.name);
  const month = getMonth(lead.conversation_date);

  // Select random subject line
  const subjectTemplate = template.subject[Math.floor(Math.random() * template.subject.length)];
  
  // Replace placeholders
  const replacements = {
    '{firstName}': firstName,
    '{company}': lead.company || 'your company',
    '{month}': month,
    '{currentMonth}': currentMonth,
    '{industry}': industry
  };

  let subject = subjectTemplate;
  let body = template.body;
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    subject = subject.replace(new RegExp(placeholder, 'g'), value);
    body = body.replace(new RegExp(placeholder, 'g'), value);
  }

  // Output
  console.log('\n' + '='.repeat(60));
  console.log('📧 FOLLOW-UP EMAIL GENERATOR');
  console.log('='.repeat(60));
  
  console.log(`\n📋 LEAD INFO:`);
  console.log(`• Name: ${lead.name || 'Unknown'}`);
  console.log(`• Email: ${lead.email}`);
  console.log(`• Company: ${lead.company || 'Unknown'}`);
  console.log(`• Category: ${lead.category || 'Unknown'}`);
  console.log(`• Days Stale: ${daysStale}d`);
  console.log(`• Template: ${templateType.toUpperCase()}`);
  console.log(`• Industry: ${industry}`);

  console.log('\n' + '-'.repeat(60));
  console.log('📨 GENERATED EMAIL:');
  console.log('-'.repeat(60));
  
  console.log(`\nSubject: ${subject}\n`);
  console.log(body);
  
  console.log('\n' + '='.repeat(60));
  console.log('💡 TIP: Personalize further with recent company news!');
  console.log('='.repeat(60));
}

// CLI
const email = process.argv[2];
if (!email) {
  console.log('Usage: node generate-followup.js <email>');
  console.log('Example: node generate-followup.js olli.laamanen@rovio.com');
  process.exit(1);
}

generateFollowup(email).catch(console.error);
