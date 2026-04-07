#!/usr/bin/env node
/**
 * Auto Follow-up Scheduler
 * 
 * Automatically generates and schedules follow-up emails
 * for leads that haven't been contacted in X days.
 * 
 * Schedule: Day 1, 3, 7, 14 after initial reply
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const FOLLOW_UP_SCHEDULE = [
  { days: 1, template: 'quick_check', subject: 'Quick follow-up' },
  { days: 3, template: 'value_add', subject: 'Thought you might find this interesting' },
  { days: 7, template: 'case_study', subject: 'How [similar company] achieved X' },
  { days: 14, template: 'last_chance', subject: 'Should I close your file?' }
];

const TEMPLATES = {
  quick_check: (lead) => `Hi ${lead.name || 'there'},

Just wanted to make sure my previous message didn't get buried. Would love to find 15 minutes to chat about how we can help ${lead.company || 'your team'}.

What does your calendar look like this week?

Best,
Imann`,

  value_add: (lead) => `Hi ${lead.name || 'there'},

I came across this case study that reminded me of ${lead.company || 'your company'} - thought you might find it interesting.

[Insert relevant case study link]

Happy to walk you through how we achieved similar results. Got 15 minutes this week?

Best,
Imann`,

  case_study: (lead) => `Hi ${lead.name || 'there'},

Wanted to share how we helped a company similar to ${lead.company || 'yours'} increase their [metric] by X%.

The key insight was [specific tactic]. Would love to explore if something similar could work for you.

Free for a quick call this week?

Best,
Imann`,

  last_chance: (lead) => `Hi ${lead.name || 'there'},

I've reached out a few times but haven't heard back - totally understand if the timing isn't right.

Should I close your file for now, or is there a better time to reconnect?

Either way, I wish you the best with ${lead.company || 'everything'}!

Best,
Imann`
};

async function getLeadsNeedingFollowUp() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .in('reply_category', ['Interested', 'Information Request', 'Meeting Request'])
    .order('replied_at', { ascending: true });

  if (error) throw new Error(error.message);
  return leads || [];
}

function determineFollowUpAction(lead) {
  if (!lead.replied_at) return null;
  
  const daysSinceReply = Math.floor(
    (Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // Find the appropriate follow-up stage
  for (const stage of FOLLOW_UP_SCHEDULE) {
    if (daysSinceReply >= stage.days && daysSinceReply < stage.days + 3) {
      return {
        ...stage,
        daysSinceReply,
        lead: {
          name: lead.lead_name,
          email: lead.lead_email,
          company: lead.lead_company,
          category: lead.reply_category
        }
      };
    }
  }
  
  // If past all stages, mark as need-escalation
  if (daysSinceReply > 21) {
    return {
      days: daysSinceReply,
      template: 'escalate',
      subject: 'NEEDS ESCALATION',
      daysSinceReply,
      lead: {
        name: lead.lead_name,
        email: lead.lead_email,
        company: lead.lead_company,
        category: lead.reply_category
      }
    };
  }
  
  return null;
}

async function generateFollowUpQueue() {
  console.log('🔄 Generating follow-up queue...\n');
  
  const leads = await getLeadsNeedingFollowUp();
  console.log(`Found ${leads.length} leads in pending status\n`);
  
  const queue = {
    day1: [],
    day3: [],
    day7: [],
    day14: [],
    escalate: []
  };
  
  for (const lead of leads) {
    const action = determineFollowUpAction(lead);
    if (!action) continue;
    
    if (action.template === 'escalate') {
      queue.escalate.push(action);
    } else if (action.days === 1) {
      queue.day1.push(action);
    } else if (action.days === 3) {
      queue.day3.push(action);
    } else if (action.days === 7) {
      queue.day7.push(action);
    } else if (action.days === 14) {
      queue.day14.push(action);
    }
  }
  
  return queue;
}

function generateEmailContent(action) {
  const template = TEMPLATES[action.template];
  if (!template) return null;
  return template(action.lead);
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📧 AUTO FOLLOW-UP SCHEDULER                                  ║
║  Generates follow-up emails based on lead age                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    const queue = await generateFollowUpQueue();
    
    console.log('📊 FOLLOW-UP QUEUE SUMMARY\n');
    console.log(`   Day 1 (quick check):    ${queue.day1.length} leads`);
    console.log(`   Day 3 (value add):      ${queue.day3.length} leads`);
    console.log(`   Day 7 (case study):     ${queue.day7.length} leads`);
    console.log(`   Day 14 (last chance):   ${queue.day14.length} leads`);
    console.log(`   🚨 Need escalation:     ${queue.escalate.length} leads`);
    
    // Generate emails for today
    const todaysEmails = [...queue.day1, ...queue.day3, ...queue.day7, ...queue.day14];
    
    if (todaysEmails.length > 0) {
      console.log('\n📝 GENERATED EMAILS FOR TODAY:\n');
      console.log('='.repeat(60));
      
      const output = [];
      
      for (const action of todaysEmails.slice(0, 10)) { // Limit to 10
        const content = generateEmailContent(action);
        if (!content) continue;
        
        const email = {
          to: action.lead.email,
          subject: action.subject,
          body: content,
          stage: action.template,
          daysSince: action.daysSinceReply
        };
        
        output.push(email);
        
        console.log(`\nTO: ${email.to}`);
        console.log(`SUBJECT: ${email.subject}`);
        console.log(`STAGE: ${email.stage} (${email.daysSince} days)`);
        console.log('-'.repeat(40));
        console.log(email.body);
        console.log('='.repeat(60));
      }
      
      // Save to file
      fs.writeFileSync(
        'followup-queue.json',
        JSON.stringify({ generated: new Date().toISOString(), emails: output }, null, 2)
      );
      console.log('\n✅ Saved to followup-queue.json');
    }
    
    // Escalation warnings
    if (queue.escalate.length > 0) {
      console.log('\n🚨 ESCALATION NEEDED:\n');
      for (const e of queue.escalate) {
        console.log(`   ${e.lead.name || e.lead.email} @ ${e.lead.company} - ${e.daysSinceReply} days!`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

module.exports = { generateFollowUpQueue, TEMPLATES };

if (require.main === module) {
  main();
}
