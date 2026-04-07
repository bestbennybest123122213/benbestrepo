#!/usr/bin/env node
/**
 * Batch Follow-up Generator
 * Generates follow-up emails for ALL pending leads (said YES but no follow-up)
 * 
 * Commands:
 *   gex batch-followups           - Generate all follow-ups
 *   gex batch-followups --critical - Only 14+ days old
 *   gex batch-followups --export   - Export SmartLead CSV
 *   gex batch-followups --preview  - Show count only
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const args = process.argv.slice(2);
const CRITICAL = args.includes('--critical') || args.includes('-c');
const EXPORT = args.includes('--export') || args.includes('-e');
const PREVIEW = args.includes('--preview') || args.includes('-p');
const HELP = args.includes('--help') || args.includes('-h');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

if (HELP) {
  console.log(`
${c.bold}Batch Follow-up Generator${c.reset}

Generates personalized follow-up emails for all pending leads.
These are leads who said YES but never got a follow-up.

${c.bold}Usage:${c.reset}
  gex batch-followups              Generate all follow-ups
  gex batch-followups --critical   Only 14+ days old (about to die)
  gex batch-followups --export     Export SmartLead-ready CSV
  gex batch-followups --preview    Just show count, no generation

${c.bold}Aliases:${c.reset}
  bf, batch, followup-all, rescue-all

${c.bold}Output:${c.reset}
  drafts/BATCH-FOLLOWUPS-[date].md - All email templates
  exports/batch-followups-[date].csv - SmartLead import ready
`);
  process.exit(0);
}

// Email templates by category
const templates = {
  'Meeting Request': (lead) => ({
    subject: `Re: ${lead.company} x ItssIMANNN`,
    body: `Hey ${lead.name || 'there'},

Following up on your meeting request about a potential ItssIMANNN collaboration.

Would love to find a time that works for a quick chat. Here's my calendar: [CALENDLY]

Best,
Jan`
  }),
  
  'Interested': (lead) => ({
    subject: `Quick follow-up on ItssIMANNN`,
    body: `Hey ${lead.name || 'there'},

Circling back on our conversation about ItssIMANNN. 

Still interested in exploring a collaboration? Happy to jump on a quick call whenever works.

Jan`
  }),
  
  'Information Request': (lead) => ({
    subject: `Re: ItssIMANNN info`,
    body: `Hey ${lead.name || 'there'},

Following up on your request for more info about ItssIMANNN.

Quick stats:
- 10M+ subscribers
- 100M+ monthly views
- Story-driven moral content (very brand-safe)

Would a quick call help answer your questions?

Jan`
  }),
  
  'Booked': (lead) => ({
    subject: `Re: Meeting confirmation`,
    body: `Hey ${lead.name || 'there'},

I see we had something scheduled. Wanted to make sure we're still on track.

If you need to reschedule, no problem - here's my updated availability: [CALENDLY]

Jan`
  }),
  
  'default': (lead) => ({
    subject: `Quick follow-up from BY Influence`,
    body: `Hey ${lead.name || 'there'},

Following up on our previous conversation about an ItssIMANNN collaboration.

Still on your radar? Happy to chat whenever works.

Jan`
  })
};

// Get template for a lead
function getTemplate(lead) {
  const category = lead.category || 'default';
  const templateFn = templates[category] || templates['default'];
  return templateFn(lead);
}

// Format lead name from email
function extractName(email) {
  if (!email) return null;
  const local = email.split('@')[0];
  // Try to extract first name from patterns like john.doe, john_doe, johnd
  const parts = local.split(/[._]/);
  if (parts.length > 0) {
    let name = parts[0];
    // Capitalize
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return null;
}

// Extract company from email domain
function extractCompany(email) {
  if (!email) return 'your company';
  const domain = email.split('@')[1];
  if (!domain) return 'your company';
  const name = domain.split('.')[0];
  // Capitalize
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function run() {
  console.log(`\n${c.bold}${c.cyan}📧 Batch Follow-up Generator${c.reset}\n`);

  // Get pending leads (follow_up_status = 'pending' means not yet followed up)
  let query = supabase
    .from('positive_replies')
    .select('*')
    .in('reply_category', ['Meeting Request', 'Interested', 'Information Request', 'Booked'])
    .eq('follow_up_status', 'pending')
    .order('created_at', { ascending: false });

  if (CRITICAL) {
    // Only 14+ days old
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    query = query.lt('created_at', cutoff.toISOString());
  }

  const { data: leads, error } = await query;

  if (error) {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log(`${c.green}✓ No pending leads found!${c.reset}\n`);
    process.exit(0);
  }

  // Group by age
  const now = new Date();
  const grouped = {
    critical: [], // 14+ days
    urgent: [],   // 7-13 days
    warm: []      // < 7 days
  };

  leads.forEach(lead => {
    const created = new Date(lead.created_at);
    const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    lead.daysOld = days;
    lead.name = lead.lead_name || extractName(lead.lead_email);
    lead.company = lead.lead_company || extractCompany(lead.lead_email);
    lead.category = lead.reply_category; // Alias for templates
    
    if (days >= 14) grouped.critical.push(lead);
    else if (days >= 7) grouped.urgent.push(lead);
    else grouped.warm.push(lead);
  });

  console.log(`${c.bold}Found ${leads.length} pending leads:${c.reset}`);
  console.log(`  ${c.red}🔴 Critical (14+ days): ${grouped.critical.length}${c.reset}`);
  console.log(`  ${c.yellow}🟠 Urgent (7-13 days): ${grouped.urgent.length}${c.reset}`);
  console.log(`  ${c.green}🟢 Warm (< 7 days): ${grouped.warm.length}${c.reset}\n`);

  if (PREVIEW) {
    console.log(`${c.dim}Run without --preview to generate emails${c.reset}\n`);
    process.exit(0);
  }

  // Generate emails
  const date = new Date().toISOString().split('T')[0];
  const draftsDir = path.join(__dirname, '..', 'drafts');
  const exportsDir = path.join(__dirname, 'exports');
  
  // Ensure directories exist
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  // Generate markdown with all emails
  let markdown = `# Batch Follow-up Emails - ${date}\n\n`;
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += `**Total: ${leads.length} emails**\n`;
  markdown += `- Critical (14+ days): ${grouped.critical.length}\n`;
  markdown += `- Urgent (7-13 days): ${grouped.urgent.length}\n`;
  markdown += `- Warm (< 7 days): ${grouped.warm.length}\n\n`;
  markdown += `---\n\n`;

  // SmartLead CSV data
  const csvRows = [['email', 'first_name', 'company', 'subject', 'body', 'days_old', 'category']];

  // Process leads by priority
  const allLeads = [...grouped.critical, ...grouped.urgent, ...grouped.warm];
  
  allLeads.forEach((lead, i) => {
    const email = getTemplate(lead);
    
    // Markdown
    const urgency = lead.daysOld >= 14 ? '🔴' : lead.daysOld >= 7 ? '🟠' : '🟢';
    markdown += `## ${i + 1}. ${urgency} ${lead.name || 'Lead'} @ ${lead.company} (${lead.daysOld}d)\n\n`;
    markdown += `**Email:** ${lead.lead_email}\n`;
    markdown += `**Category:** ${lead.category}\n`;
    markdown += `**Days Old:** ${lead.daysOld}\n\n`;
    markdown += `**Subject:** ${email.subject}\n\n`;
    markdown += `\`\`\`\n${email.body}\n\`\`\`\n\n`;
    markdown += `---\n\n`;

    // CSV row
    csvRows.push([
      lead.lead_email,
      lead.name || '',
      lead.company || '',
      email.subject,
      email.body.replace(/\n/g, '\\n'),
      lead.daysOld,
      lead.category
    ]);
  });

  // Write markdown
  const mdPath = path.join(draftsDir, `BATCH-FOLLOWUPS-${date}.md`);
  fs.writeFileSync(mdPath, markdown);
  console.log(`${c.green}✓ Generated ${allLeads.length} email templates${c.reset}`);
  console.log(`  ${c.dim}${mdPath}${c.reset}\n`);

  // Write CSV if requested
  if (EXPORT) {
    const csvContent = csvRows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const csvPath = path.join(exportsDir, `batch-followups-${date}.csv`);
    fs.writeFileSync(csvPath, csvContent);
    console.log(`${c.green}✓ Exported SmartLead CSV${c.reset}`);
    console.log(`  ${c.dim}${csvPath}${c.reset}\n`);
  }

  // Revenue estimate
  const avgDealSize = 25000; // $25K average
  const commissionRate = 0.3;  // 30%
  const potentialRevenue = allLeads.length * avgDealSize * 0.3; // 30% close rate on warm leads
  const potentialCommission = potentialRevenue * commissionRate;

  console.log(`${c.bold}💰 Revenue at Risk${c.reset}`);
  console.log(`  Potential deals: $${(potentialRevenue).toLocaleString()}`);
  console.log(`  Commission: $${(potentialCommission).toLocaleString()}\n`);

  // Next steps
  console.log(`${c.bold}Next Steps:${c.reset}`);
  console.log(`  1. Open ${c.cyan}drafts/BATCH-FOLLOWUPS-${date}.md${c.reset}`);
  console.log(`  2. Personalize and send top 10-20 emails`);
  if (!EXPORT) {
    console.log(`  3. Or run ${c.cyan}gex batch-followups --export${c.reset} for SmartLead CSV`);
  } else {
    console.log(`  3. Import ${c.cyan}exports/batch-followups-${date}.csv${c.reset} to SmartLead`);
  }
  console.log('');
}

run().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`);
  process.exit(1);
});
