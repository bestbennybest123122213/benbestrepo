#!/usr/bin/env node
/**
 * Batch Actions
 * 
 * Process multiple leads at once:
 * - Generate emails for all hot leads
 * - Mark multiple leads as contacted
 * - Export specific groups
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');
const { TEMPLATES, renderTemplate } = require('./email-templates');

async function batchDrafts(filter = 'hot', count = 10) {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Filter leads
  let filtered;
  switch (filter) {
    case 'hot':
      filtered = leads.filter(l => getAge(l) <= 3);
      break;
    case 'meetings':
      filtered = leads.filter(l => l.reply_category === 'Meeting Request');
      break;
    case 'enterprise':
      filtered = leads.filter(l => {
        const info = getCompanyInfo(l.lead_email);
        return info?.tier === 'enterprise';
      });
      break;
    case 'stale':
      filtered = leads.filter(l => getAge(l) > 14);
      break;
    default:
      filtered = leads;
  }

  const selected = filtered.slice(0, count);

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📧 BATCH EMAIL GENERATOR                                                ║
║  Generating ${selected.length} emails for ${filter} leads                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const drafts = [];

  selected.forEach((lead, i) => {
    const info = getCompanyInfo(lead.lead_email);
    const firstName = lead.lead_name 
      ? lead.lead_name.split(' ')[0]
      : lead.lead_email.split('@')[0].split('.')[0];
    
    // Pick template based on category and age
    let templateKey = 'first_followup';
    if (lead.reply_category === 'Meeting Request') {
      templateKey = 'meeting_response';
    } else if (getAge(lead) > 14) {
      templateKey = 'reactivation';
    }

    const template = TEMPLATES[templateKey];
    let subject = template.subject.replace('{{original_subject}}', 'your interest');
    let body = template.body
      .replace(/{{first_name}}/g, firstName)
      .replace(/{{company}}/g, info?.name || lead.lead_company || 'your company')
      .replace(/{{topic}}/g, 'collaboration')
      .replace(/{{availability_slots}}/g, '• Tomorrow 10am\n• Tomorrow 2pm\n• Friday 11am')
      .replace(/{{calendly_link}}/g, '[YOUR_CALENDLY_LINK]');

    drafts.push({
      to: lead.lead_email,
      name: lead.lead_name,
      company: info?.name || lead.lead_company,
      subject,
      body,
      template: templateKey
    });

    console.log(`  ${i + 1}. ${lead.lead_email}`);
    console.log(`     Template: ${template.name}`);
  });

  // Save to file
  const output = drafts.map(d => `
TO: ${d.to}
NAME: ${d.name || 'N/A'} @ ${d.company || 'N/A'}
TEMPLATE: ${d.template}
SUBJECT: ${d.subject}
──────────────────────────────────────────────────────────────────────────
${d.body}
══════════════════════════════════════════════════════════════════════════
`).join('\n');

  fs.writeFileSync('batch-drafts.txt', output);
  console.log(`\n✅ Saved ${drafts.length} drafts to batch-drafts.txt`);

  return drafts;
}

async function batchMark(emails, status) {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  console.log(`\n📝 Marking ${emails.length} leads as ${status}...\n`);

  for (const email of emails) {
    const { error } = await client
      .from('positive_replies')
      .update({ 
        follow_up_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) {
      console.log(`  ❌ ${email}: ${error.message}`);
    } else {
      console.log(`  ✅ ${email}`);
    }
  }

  console.log('\nDone!');
}

async function main() {
  const action = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  switch (action) {
    case 'drafts':
      await batchDrafts(arg1 || 'hot', parseInt(arg2) || 10);
      break;
    case 'mark':
      // Read emails from file or comma-separated
      let emails = [];
      if (arg1 && fs.existsSync(arg1)) {
        emails = fs.readFileSync(arg1, 'utf8')
          .split('\n')
          .filter(e => e.includes('@'));
      } else if (arg1) {
        emails = arg1.split(',').map(e => e.trim());
      }
      if (emails.length === 0) {
        console.log('Usage: node batch-actions.js mark <emails.txt or email1,email2,...> <status>');
        return;
      }
      await batchMark(emails, arg2 || 'contacted');
      break;
    default:
      console.log(`
Batch Actions - Process multiple leads at once

Commands:
  drafts <filter> [count]    Generate email drafts
                             Filters: hot, meetings, enterprise, stale
                             Example: node batch-actions.js drafts enterprise 20

  mark <emails> <status>     Mark leads with status
                             Example: node batch-actions.js mark emails.txt contacted
                             Example: node batch-actions.js mark "a@b.com,c@d.com" booked
`);
  }
}

module.exports = { batchDrafts, batchMark };

if (require.main === module) {
  main().catch(console.error);
}
