/**
 * Quick Reply Generator
 * 
 * Mobile-friendly interface for quickly replying to leads.
 * Shows context + suggested reply, easy to copy.
 * 
 * Usage:
 *   gex reply                 # Show top leads needing reply
 *   gex reply <email>         # Generate reply for specific lead
 *   gex reply --urgent        # Only urgent leads
 *   gex reply --copy <n>      # Copy reply #n to clipboard
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Reply templates by category
const templates = {
  'Booked': (lead) => ({
    subject: `Re: ${lead.company} x ItssIMANNN call`,
    body: `Hey ${lead.firstName},

I noticed we had a call scheduled but haven't connected yet. Totally understand if things got hectic.

Still excited to chat about how ItssIMANNN could help ${lead.company}. Let me know if you'd like to reschedule.

Best,
Jan`
  }),
  
  'Meeting Request': (lead) => ({
    subject: `Re: ${lead.company} x ItssIMANNN`,
    body: `Hey ${lead.firstName},

Following up on your meeting request. Would love to find time to chat this week.

Here's my calendar: [CALENDLY]

Best,
Jan`
  }),
  
  'Interested': (lead) => ({
    subject: `Quick follow-up on ItssIMANNN`,
    body: `Hey ${lead.firstName},

Circling back on our conversation. Still interested in exploring how ItssIMANNN could work with ${lead.company}?

Happy to hop on a quick call whenever works.

Best,
Jan`
  }),
  
  'Information Request': (lead) => ({
    subject: `ItssIMANNN info for ${lead.company}`,
    body: `Hey ${lead.firstName},

Following up on your request for more info.

Quick overview:
• 10M+ subs, 300M+ monthly views
• Gen Z audience (18-34)
• Story-driven moral content
• Past results: 48M views, 100K+ users for Whiteout Survival

Happy to share a deck or hop on a call. Let me know what works.

Best,
Jan`
  })
};

function extractFirstName(name) {
  if (!name) return 'there';
  return name.split(/[\s@]/)[0];
}

function extractCompany(domain) {
  if (!domain) return 'your company';
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function getLeadsNeedingReply(options = {}) {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('booking_status', ['Pending', null, ''])
    .in('lead_category', ['Booked', 'Meeting Request', 'Interested', 'Information Request'])
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
  
  const now = Date.now();
  return leads
    .map(lead => {
      const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const firstName = extractFirstName(lead.name);
      const company = extractCompany(lead.domain);
      const template = templates[lead.lead_category] || templates['Interested'];
      const reply = template({ firstName, company, ...lead });
      
      return {
        ...lead,
        firstName,
        company,
        daysOld,
        urgency: daysOld <= 6 ? 'warm' : daysOld <= 13 ? 'urgent' : daysOld <= 20 ? 'critical' : 'dead',
        reply
      };
    })
    .filter(lead => {
      if (options.urgentOnly) {
        return lead.daysOld >= 7 && lead.daysOld <= 20;
      }
      return lead.daysOld >= 5; // At least 5 days old
    })
    .sort((a, b) => {
      // Sort by urgency (urgent > critical > warm > dead), then by days
      const urgencyOrder = { urgent: 0, critical: 1, warm: 2, dead: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysOld - b.daysOld;
    })
    .slice(0, 10); // Top 10
}

function formatReply(lead, index) {
  const urgencyEmoji = {
    warm: '🟢',
    urgent: '🟠',
    critical: '🔴',
    dead: '💀'
  };
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${index}] ${urgencyEmoji[lead.urgency]} ${lead.firstName} @ ${lead.company} (${lead.daysOld}d)`);
  console.log(`    ${lead.lead_category} | ${lead.email}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`\n📧 Subject: ${lead.reply.subject}\n`);
  console.log(lead.reply.body);
}

async function run(args = []) {
  const urgentOnly = args.includes('--urgent') || args.includes('-u');
  const copyIndex = args.findIndex(a => a === '--copy' || a === '-c');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📱 QUICK REPLY GENERATOR                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const leads = await getLeadsNeedingReply({ urgentOnly });
  
  if (leads.length === 0) {
    console.log('\n✅ No leads need immediate reply.');
    return;
  }
  
  // Summary
  const urgent = leads.filter(l => l.urgency === 'urgent').length;
  const critical = leads.filter(l => l.urgency === 'critical').length;
  
  console.log(`\n📊 ${leads.length} leads need reply`);
  console.log(`   🟠 Urgent (7-13d): ${urgent}`);
  console.log(`   🔴 Critical (14-20d): ${critical}`);
  
  // Show each lead with reply
  leads.forEach((lead, i) => formatReply(lead, i + 1));
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log('\n💡 Copy any email above and send it.');
  console.log('   Then log: gex engage log email "<name> @ <company>"');
  console.log();
}

module.exports = { run, getLeadsNeedingReply };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
