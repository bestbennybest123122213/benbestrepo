/**
 * One-Click Actions
 * 
 * Simplifies taking action to absolute minimum.
 * Shows pre-filled emails with copy buttons.
 * 
 * Usage:
 *   gex oneclick             # Top 5 one-click actions
 *   gex oneclick --all       # All pending actions
 *   gex oneclick 1           # Copy action #1
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Quick templates by category
const TEMPLATES = {
  'Meeting Request': (lead) => `Hey ${lead.firstName},

Following up on your meeting request. Would love to find 15 minutes this week.

Here's my calendar: [CALENDLY]

Best,
Jan`,

  'Interested': (lead) => `Hey ${lead.firstName},

Circling back on ItssIMANNN. Still interested in exploring a collab?

Happy to hop on a quick call whenever works.

Best,
Jan`,

  'Information Request': (lead) => `Hey ${lead.firstName},

Quick follow-up on your info request:

• 10M+ subs, 300M+ monthly views
• Gen Z audience (18-34)  
• Past results: 48M views, 100K+ users

Want to hop on a call to discuss?

Best,
Jan`,

  'Booked': (lead) => `Hey ${lead.firstName},

Just checking in on our scheduled call. Looking forward to connecting.

Let me know if you need to reschedule.

Best,
Jan`
};

function extractFirstName(name) {
  if (!name) return 'there';
  return name.split(/[\s@]/)[0];
}

async function getOneClickActions() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .in('category', ['Meeting Request', 'Interested', 'Information Request', 'Booked'])
    .neq('status', 'Booked')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error:', error);
    return [];
  }
  
  const now = Date.now();
  
  return leads
    .map(lead => {
      const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const firstName = extractFirstName(lead.name);
      const company = lead.domain?.split('.')[0] || 'Unknown';
      const template = TEMPLATES[lead.category] || TEMPLATES['Interested'];
      
      return {
        ...lead,
        firstName,
        company,
        daysOld,
        urgency: daysOld <= 7 ? 'warm' : daysOld <= 14 ? 'urgent' : daysOld <= 21 ? 'critical' : 'dead',
        email_body: template({ firstName }),
        subject: `Re: ${company} x ItssIMANNN`
      };
    })
    .filter(l => l.daysOld >= 7 && l.daysOld <= 21) // Focus on saveable leads
    .sort((a, b) => {
      // Prioritize by urgency then age
      const urgencyOrder = { urgent: 0, critical: 1, warm: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysOld - b.daysOld;
    });
}

function formatAction(lead, index) {
  const urgencyEmoji = {
    warm: '🟢',
    urgent: '🟠', 
    critical: '🔴'
  };
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[${index}] ${urgencyEmoji[lead.urgency]} ${lead.firstName} @ ${lead.company} (${lead.daysOld}d)`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`📧 To: ${lead.email}`);
  console.log(`📋 Subject: ${lead.subject}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(lead.email_body);
  console.log(`${'─'.repeat(60)}`);
  console.log(`⏱️ Time to send: ~30 seconds`);
}

async function run(args = []) {
  const showAll = args.includes('--all') || args.includes('-a');
  const actionNum = args.find(a => /^\d+$/.test(a));
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ⚡ ONE-CLICK ACTIONS                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const actions = await getOneClickActions();
  
  if (actions.length === 0) {
    console.log('\n✅ No urgent one-click actions right now.\n');
    return;
  }
  
  const displayActions = showAll ? actions : actions.slice(0, 5);
  
  console.log(`\n📊 ${actions.length} leads need follow-up (showing ${displayActions.length})`);
  console.log(`⏱️ Total time: ~${displayActions.length * 0.5} minutes`);
  
  displayActions.forEach((action, i) => formatAction(action, i + 1));
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('\n💡 INSTRUCTIONS:');
  console.log('   1. Copy email above');
  console.log('   2. Paste in Gmail/email client');
  console.log('   3. Add Calendly link');
  console.log('   4. Send');
  console.log('   5. Log: gex engage log email "<name>"');
  
  if (!showAll && actions.length > 5) {
    console.log(`\n📋 ${actions.length - 5} more actions: gex oneclick --all`);
  }
  
  console.log();
}

module.exports = { run, getOneClickActions };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
