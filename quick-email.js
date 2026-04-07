#!/usr/bin/env node
/**
 * Quick Email Generator - Copy to clipboard instantly
 * 
 * Usage: 
 *   node quick-email.js <email>          # Generate email for specific lead
 *   node quick-email.js --list           # Show top 10 leads
 *   node quick-email.js --top <n>        # Generate for top N leads
 */

const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NOTABLE = ['rovio', 'sega', 'unity', 'ign', 'complex', 'udemy', 'replit', 'doist', 'osmo', 'skillz', 'jackpot', 'figure', 'pixonic', 'snail', 'resolution'];

function scoreLead(lead, now) {
  let score = 0;
  const company = (lead.company || '').toLowerCase();
  const days = lead.conversation_date 
    ? Math.floor((now - new Date(lead.conversation_date)) / (1000 * 60 * 60 * 24))
    : 0;
  
  if (days > 60) score += 40;
  else if (days > 30) score += 30;
  else if (days > 14) score += 20;
  
  if (NOTABLE.some(n => company.includes(n))) score += 30;
  if (lead.category === 'Meeting Request') score += 30;
  else score += 20;
  
  return { ...lead, score, days };
}

function generateEmail(lead) {
  const firstName = (lead.name || '').split(' ')[0] || 'there';
  const company = lead.company || 'your company';
  
  const subject = `Quick question, ${firstName}`;
  const body = `Hey ${firstName},

We connected about influencer marketing for ${company}.

Wanted to check if this is still on your radar? If timing isn't right, no worries - just let me know and I'll circle back later.

If you're ready to chat: [YOUR_CALENDAR_LINK]

Best,
Imann`;

  return { subject, body, to: lead.email };
}

function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    // macOS pbcopy
    const proc = exec('pbcopy', (err) => {
      if (err) reject(err);
      else resolve();
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📧 Quick Email Generator

Usage:
  node quick-email.js <email>      Generate email for specific lead
  node quick-email.js --list       Show top 10 leads with scores
  node quick-email.js --top 5      Export top N emails to file
  
Example:
  node quick-email.js olli.laamanen@rovio.com
`);
    return;
  }

  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Scheduling');

  const now = Date.now();
  const scored = leads.map(l => scoreLead(l, now)).sort((a, b) => b.score - a.score);

  // --list: Show top leads
  if (args[0] === '--list') {
    console.log('\n🎯 TOP 10 LEADS TO FOLLOW UP:\n');
    scored.slice(0, 10).forEach((l, i) => {
      console.log(`${i+1}. [${l.score}pts] ${l.name || 'Unknown'} @ ${l.company}`);
      console.log(`   ${l.email} | ${l.days}d stale`);
    });
    return;
  }

  // --top N: Export top N emails
  if (args[0] === '--top') {
    const n = parseInt(args[1]) || 5;
    const top = scored.slice(0, n);
    
    let output = `📧 TOP ${n} FOLLOW-UP EMAILS\nGenerated: ${new Date().toLocaleString()}\n\n`;
    
    top.forEach((l, i) => {
      const email = generateEmail(l);
      output += `${'═'.repeat(50)}\n`;
      output += `EMAIL ${i+1}: ${l.name} @ ${l.company}\n`;
      output += `${'═'.repeat(50)}\n`;
      output += `To: ${email.to}\n`;
      output += `Subject: ${email.subject}\n\n`;
      output += `${email.body}\n\n`;
    });

    const fs = require('fs');
    fs.writeFileSync('quick-emails.txt', output);
    console.log(`✅ Exported ${n} emails to quick-emails.txt`);
    console.log('\nLeads included:');
    top.forEach((l, i) => console.log(`${i+1}. ${l.company} - ${l.name}`));
    return;
  }

  // Specific email lookup
  const email = args[0];
  const lead = leads.find(l => l.email.toLowerCase() === email.toLowerCase());
  
  if (!lead) {
    console.log(`❌ Lead not found: ${email}`);
    console.log('\nTry: node quick-email.js --list');
    return;
  }

  const scoredLead = scoreLead(lead, now);
  const generated = generateEmail(scoredLead);

  console.log(`
📧 EMAIL FOR: ${lead.name} @ ${lead.company}
${'─'.repeat(50)}
To: ${generated.to}
Subject: ${generated.subject}

${generated.body}
${'─'.repeat(50)}
`);

  // Copy to clipboard
  const fullEmail = `To: ${generated.to}\nSubject: ${generated.subject}\n\n${generated.body}`;
  try {
    await copyToClipboard(fullEmail);
    console.log('✅ Copied to clipboard!');
  } catch (e) {
    console.log('(Clipboard copy not available)');
  }
}

main().catch(console.error);
