#!/usr/bin/env node
/**
 * Action Queue - Ready-to-Send Email Queue
 * 
 * Combines inbox priority with AI-generated responses.
 * Jan reviews and sends. That's it.
 * 
 * Usage:
 *   node action-queue.js            # Show top 5 ready-to-send
 *   node action-queue.js --all      # Show all pending
 *   node action-queue.js --count=10 # Show 10
 *   node action-queue.js --export   # Save to action-queue.md
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const SHOW_ALL = args.includes('--all');
const EXPORT = args.includes('--export');
const COUNT = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1]) || (SHOW_ALL ? 50 : 5);

// Business context
const CONTEXT = {
  creator: 'ItssIMANNN',
  subs: '10M+',
  monthlyViews: '361M',
  topCampaign: { name: 'Whiteout Survival', views: '48M', users: '100K+' },
  pricing: {
    integration: '$15-25K',
    dedicated: '$30-45K',
    series: '$50-75K'
  }
};

// Generate contextual response based on category and age
function generateResponse(lead) {
  const firstName = lead.lead_name?.split(' ')[0] || 'there';
  const company = lead.lead_company || 'your team';
  const age = lead.age_days || 0;
  
  // Determine response based on category and timing
  if (lead.reply_category === 'Meeting Request' || lead.reply_category === 'Booked') {
    if (age <= 3) {
      return {
        subject: `Re: Finding a time`,
        body: `Hi ${firstName},

Here are a few options:

• Tomorrow at [TIME]
• [DAY] at [TIME]  
• Or grab a slot: [CALENDAR_LINK]

Let me know what works.`,
        action: 'BOOK NOW'
      };
    } else if (age <= 14) {
      return {
        subject: `Re: Still want to connect?`,
        body: `Hi ${firstName},

Just circling back — are you still interested in chatting about a ${CONTEXT.creator} integration for ${company}?

If timing has changed, no worries. Just let me know and I can reach out when it makes more sense.`,
        action: 'RECONFIRM'
      };
    } else {
      return {
        subject: `Re: One last check`,
        body: `Hi ${firstName},

I wanted to check in one more time about connecting on a ${CONTEXT.creator} campaign.

If you're still interested, I have some availability this week. If not, I'll close this out on my end.

Either way, let me know.`,
        action: 'LAST CHANCE'
      };
    }
  }

  if (lead.reply_category === 'Interested') {
    if (age <= 3) {
      return {
        subject: `Re: ${CONTEXT.creator} x ${company}`,
        body: `Hi ${firstName},

Thanks for the interest.

${CONTEXT.creator} has ${CONTEXT.subs} subscribers doing story-driven content, up to ${CONTEXT.monthlyViews} monthly views. Our ${CONTEXT.topCampaign.name} campaign hit ${CONTEXT.topCampaign.views} views and drove ${CONTEXT.topCampaign.users} new users.

Would a quick 15-min call work to discuss? I can share some examples relevant to ${company}.`,
        action: 'SHARE INFO + BOOK'
      };
    } else if (age <= 14) {
      return {
        subject: `Re: Following up`,
        body: `Hi ${firstName},

Just wanted to follow up on your interest in working with ${CONTEXT.creator}.

Happy to hop on a quick call this week if you'd like to discuss further. Would [DAY] work?`,
        action: 'REACTIVATE'
      };
    } else {
      return {
        subject: `Re: Checking in`,
        body: `Hi ${firstName},

Circling back on ${CONTEXT.creator} — is this still on your radar?

If timing has changed, just let me know and I can follow up later.`,
        action: 'LAST ATTEMPT'
      };
    }
  }

  if (lead.reply_category === 'Information Request') {
    return {
      subject: `Re: Info you requested`,
      body: `Hi ${firstName},

Happy to share more details.

For a story integration (woven into ${CONTEXT.creator}'s content), rates are ${CONTEXT.pricing.integration}. For a dedicated video, ${CONTEXT.pricing.dedicated}.

Want to hop on a call to discuss what would work best for ${company}?`,
      action: 'ANSWER + BOOK'
    };
  }

  // Default
  return {
    subject: `Re: Following up`,
    body: `Hi ${firstName},

Just wanted to follow up. Would a quick call work this week?`,
    action: 'FOLLOW UP'
  };
}

// Priority scoring
function scoreLead(lead) {
  let score = 0;
  
  // Category weight
  const catScores = {
    'Meeting Request': 100,
    'Demo Request': 90,
    'Interested': 80,
    'Information Request': 70
  };
  score += catScores[lead.reply_category] || 50;
  
  // Age (fresher = higher priority)
  if (lead.age_days <= 1) score += 50;
  else if (lead.age_days <= 3) score += 40;
  else if (lead.age_days <= 7) score += 30;
  else if (lead.age_days <= 14) score += 20;
  else score += 10;
  
  // Company known = bonus
  if (lead.lead_company) score += 10;
  
  return score;
}

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  // Fetch pending leads
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .eq('follow_up_status', 'pending')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  const now = Date.now();
  
  // Process and score leads
  const processed = leads
    .map(lead => {
      const age = lead.replied_at 
        ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return { ...lead, age_days: age };
    })
    .filter(l => l.age_days <= 60) // Only last 60 days
    .map(lead => ({
      ...lead,
      score: scoreLead(lead),
      response: generateResponse(lead)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, COUNT);

  if (processed.length === 0) {
    console.log('No pending actions. Inbox is clear.');
    process.exit(0);
  }

  // Build output
  let output = `
╔════════════════════════════════════════════════════════════════════════════╗
║  📤 ACTION QUEUE - ${processed.length} Emails Ready to Send                              ║
╚════════════════════════════════════════════════════════════════════════════╝

`;

  processed.forEach((lead, i) => {
    const urgencyEmoji = lead.age_days <= 1 ? '🔴' : lead.age_days <= 3 ? '🟠' : lead.age_days <= 7 ? '🟡' : '⚪';
    
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${urgencyEmoji} #${i + 1} | ${lead.response.action} | ${lead.age_days}d old

TO: ${lead.lead_email}
NAME: ${lead.lead_name || 'Unknown'} @ ${lead.lead_company || 'Unknown'}
CATEGORY: ${lead.reply_category}

SUBJECT: ${lead.response.subject}

${lead.response.body}

`;
  });

  // Summary
  const urgentCount = processed.filter(l => l.age_days <= 3).length;
  const warmCount = processed.filter(l => l.age_days > 3 && l.age_days <= 7).length;
  const staleCount = processed.filter(l => l.age_days > 7).length;

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 SUMMARY
   🔴 Urgent (0-3d): ${urgentCount}
   🟡 Warm (4-7d): ${warmCount}
   ⚪ Stale (8+d): ${staleCount}

💡 TIP: Work top to bottom. Replace [PLACEHOLDERS] before sending.
`;

  // Output
  if (EXPORT) {
    const filepath = './action-queue.md';
    fs.writeFileSync(filepath, output);
    console.log(`Saved ${processed.length} actions to ${filepath}`);
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
