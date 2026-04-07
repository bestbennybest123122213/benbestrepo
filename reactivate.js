#!/usr/bin/env node
/**
 * Cold Lead Reactivation System
 * Identifies cold leads (15+ days) and generates reactivation emails
 * 
 * Usage:
 *   node reactivate.js              # Show cold leads summary
 *   node reactivate.js --generate   # Generate Day 1 emails for all cold leads
 *   node reactivate.js --day=4      # Generate Day 4 emails
 *   node reactivate.js --export     # Export to reactivation-queue.md
 *   node reactivate.js --stats      # Show reactivation statistics
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Email templates by day
const templates = {
  1: {
    subject: "Quick update on ItssIMANNN's latest numbers",
    body: `Hi {{first_name}},

I wanted to share some quick stats that might interest you:

ItssIMANNN just crossed **10.5 million subscribers** and his recent videos are averaging **40-50 million views**. His audience is 65% US-based, primarily 18-34 year olds.

I know we chatted a while back about potential collaboration. If {{company}} is still exploring influencer partnerships, I'd love to reconnect and share some recent campaign results.

No pressure - just wanted to keep you in the loop.

Best,
Jan`
  },
  4: {
    subject: "How Whiteout Survival got 100K+ new users from one video",
    body: `Hi {{first_name}},

Quick case study I thought you'd find interesting:

**Whiteout Survival** partnered with ItssIMANNN for a single integration. Results:
- 48 million views
- 100,000+ new app installs
- Top 10 trending on iOS for 3 days

The key was authentic storytelling - ItssIMANNN wove the game into one of his signature moral skit videos, so it felt natural to his audience.

If {{company}} is looking for similar results, I can share more details on how we structure these integrations.

Best,
Jan`
  },
  8: {
    subject: "Partnership idea for {{company}}",
    body: `Hi {{first_name}},

I've been thinking about how {{company}} could work with ItssIMANNN, and I have a few ideas:

1. **Story Integration** - Your product woven into his narrative content (highest engagement)
2. **Dedicated Review** - Full video focused on {{company}} (best for complex products)
3. **Series Sponsorship** - Ongoing presence across multiple videos (best for brand building)

His audience trusts his recommendations because he only promotes things he genuinely uses. That authenticity drives real conversions.

Would you be open to a quick 15-minute call to explore if there's a fit?

Best,
Jan`
  },
  12: {
    subject: "Q1 slots filling up",
    body: `Hi {{first_name}},

Quick heads up - ItssIMANNN's Q1 calendar is starting to fill up. He typically books 4-6 brand partnerships per quarter, and we're already confirming 2 for January.

If {{company}} has any campaigns planned for early 2026, now would be a good time to discuss timing and rates.

Happy to send over his media kit if helpful.

Best,
Jan`
  },
  16: {
    subject: "Free: ItssIMANNN audience insights for {{company}}",
    body: `Hi {{first_name}},

I put together a quick audience overlap analysis for {{company}} + ItssIMANNN's viewers. Some interesting findings:

- **Demographics match:** His core 18-34 audience aligns with typical buyers in your space
- **Engagement rate:** 8.2% average (3x industry standard)
- **Purchase intent:** 73% of his audience reports buying products he recommends

I can send the full report if you'd like to share with your team - no commitment needed.

Best,
Jan`
  },
  21: {
    subject: "Should I close your file?",
    body: `Hi {{first_name}},

I've reached out a few times about ItssIMANNN partnerships and haven't heard back. Totally understand if the timing isn't right or {{company}} has other priorities.

I'll assume this isn't a fit for now and won't keep emailing. But if things change in the future, my door is always open.

Wishing you and the {{company}} team all the best.

Best,
Jan`
  }
};

async function getColdLeads() {
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  
  const { data, error } = await supabase
    .from('all_replies')
    .select('*')
    .lt('replied_at', fifteenDaysAgo.toISOString())
    .in('reply_category', ['Interested', 'Information Request', 'Meeting Request'])
    .order('replied_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching cold leads:', error);
    return [];
  }
  
  return data || [];
}

function extractFirstName(fullName) {
  if (!fullName) return 'there';
  const parts = fullName.trim().split(' ');
  return parts[0] || 'there';
}

function extractCompany(lead) {
  // Try company field first, then extract from email domain
  if (lead.lead_company) return lead.lead_company;
  if (lead.lead_email) {
    const domain = lead.lead_email.split('@')[1];
    if (domain) {
      const company = domain.split('.')[0];
      return company.charAt(0).toUpperCase() + company.slice(1);
    }
  }
  return 'your company';
}

function generateEmail(lead, day) {
  const template = templates[day];
  if (!template) {
    console.error(`No template for day ${day}`);
    return null;
  }
  
  const firstName = extractFirstName(lead.lead_name);
  const company = extractCompany(lead);
  
  const subject = template.subject
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company\}\}/g, company);
  
  const body = template.body
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company\}\}/g, company);
  
  return {
    to: lead.lead_email,
    from_name: lead.lead_name,
    company,
    subject,
    body,
    lead_id: lead.id,
    day,
    age_days: Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
  };
}

async function showSummary() {
  const leads = await getColdLeads();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🔄 COLD LEAD REACTIVATION SYSTEM                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (leads.length === 0) {
    console.log('✅ No cold leads found (all leads are less than 15 days old)');
    return;
  }
  
  // Group by age bracket
  const brackets = {
    '15-21 days': leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 15 && age <= 21;
    }),
    '22-30 days': leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 22 && age <= 30;
    }),
    '31-60 days': leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 31 && age <= 60;
    }),
    '60+ days': leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age > 60;
    })
  };
  
  console.log('📊 COLD LEADS BY AGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const [bracket, bracketLeads] of Object.entries(brackets)) {
    const bar = '█'.repeat(Math.min(bracketLeads.length, 40));
    console.log(`  ${bracket.padEnd(12)} ${bar} ${bracketLeads.length}`);
  }
  
  console.log('\n📋 TOP 10 REACTIVATION CANDIDATES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Sort by category priority (Interested > Meeting Request > Information Request)
  // then by age (newer first for better reactivation chance)
  const prioritized = leads
    .map(l => ({
      ...l,
      age: Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)),
      priority: l.reply_category === 'Interested' ? 3 : l.reply_category === 'Meeting Request' ? 2 : 1
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.age - b.age; // Newer cold leads first
    })
    .slice(0, 10);
  
  for (let i = 0; i < prioritized.length; i++) {
    const lead = prioritized[i];
    const firstName = extractFirstName(lead.lead_name);
    const company = extractCompany(lead);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${firstName} @ ${company}`);
    console.log(`      ${lead.reply_category} | ${lead.age} days old | ${lead.lead_email}`);
  }
  
  console.log('\n💡 RECOMMENDED ACTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  • ${brackets['15-21 days'].length} leads ready for Day 1 reactivation email`);
  console.log(`  • ${brackets['22-30 days'].length} leads should get Day 8 (direct pitch)`);
  console.log(`  • ${brackets['31-60 days'].length} leads need Day 16 (value add) or Day 21 (breakup)`);
  console.log(`  • ${brackets['60+ days'].length} leads are very cold - consider removing from pipeline`);
  
  console.log('\n  Run: node reactivate.js --generate --day=1 --export');
  console.log('  to generate Day 1 emails for all 15-21 day cold leads\n');
}

async function generateEmails(day, exportToFile = false) {
  const leads = await getColdLeads();
  
  if (leads.length === 0) {
    console.log('No cold leads to reactivate');
    return;
  }
  
  // Filter based on day and lead age
  let targetLeads;
  if (day === 1) {
    targetLeads = leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 15 && age <= 25;
    });
  } else if (day === 4 || day === 8) {
    targetLeads = leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 20 && age <= 35;
    });
  } else if (day === 12 || day === 16) {
    targetLeads = leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 30 && age <= 50;
    });
  } else {
    targetLeads = leads.filter(l => {
      const age = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
      return age >= 45;
    });
  }
  
  const emails = targetLeads.map(l => generateEmail(l, day)).filter(Boolean);
  
  if (exportToFile) {
    let output = `# Reactivation Emails - Day ${day}\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `Total: ${emails.length} emails\n\n`;
    output += `---\n\n`;
    
    for (const email of emails) {
      output += `## ${email.from_name} @ ${email.company}\n`;
      output += `**To:** ${email.to}\n`;
      output += `**Age:** ${email.age_days} days\n`;
      output += `**Subject:** ${email.subject}\n\n`;
      output += email.body;
      output += `\n\n---\n\n`;
    }
    
    const filename = `reactivation-day${day}-${new Date().toISOString().split('T')[0]}.md`;
    fs.writeFileSync(path.join(__dirname, filename), output);
    console.log(`✅ Saved ${emails.length} emails to ${filename}`);
  } else {
    console.log(`\n📧 Generated ${emails.length} Day ${day} reactivation emails\n`);
    for (const email of emails.slice(0, 3)) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`To: ${email.to}`);
      console.log(`Subject: ${email.subject}\n`);
      console.log(email.body);
      console.log('');
    }
    if (emails.length > 3) {
      console.log(`... and ${emails.length - 3} more. Use --export to save all.`);
    }
  }
  
  return emails;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--generate')) {
    const dayArg = args.find(a => a.startsWith('--day='));
    const day = dayArg ? parseInt(dayArg.split('=')[1]) : 1;
    const exportToFile = args.includes('--export');
    await generateEmails(day, exportToFile);
  } else if (args.includes('--stats')) {
    // Show reactivation statistics
    const leads = await getColdLeads();
    console.log('\n📊 REACTIVATION STATS');
    console.log(`Total cold leads: ${leads.length}`);
    console.log(`Potential revenue: $${(leads.length * 500).toLocaleString()} (at $500/booking avg)`);
    console.log(`If 10% convert: $${(leads.length * 0.1 * 500).toLocaleString()}`);
  } else {
    await showSummary();
  }
}

main().catch(console.error);
