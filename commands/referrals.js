#!/usr/bin/env node
/**
 * Referral Tracking System - Inbound Growth
 * Track referral asks, received referrals, and conversions.
 */

const fs = require('fs');
const path = require('path');

const REFERRALS_FILE = path.join(__dirname, '../data/referrals.json');

function loadReferrals() {
  try {
    return JSON.parse(fs.readFileSync(REFERRALS_FILE, 'utf8'));
  } catch {
    return { asks: [], received: [], converted: [] };
  }
}

function saveReferrals(data) {
  fs.writeFileSync(REFERRALS_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const data = loadReferrals();
  const subcommand = args[0];

  if (!subcommand || subcommand === 'status') {
    console.log('\n📣 REFERRAL SYSTEM STATUS');
    console.log('═'.repeat(40));
    console.log(`Asks sent:     ${data.asks?.length || 0}`);
    console.log(`Received:      ${data.received?.length || 0}`);
    console.log(`Converted:     ${data.converted?.length || 0}`);
    console.log(`Success rate:  ${data.received?.length ? ((data.converted?.length / data.received?.length) * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log('');
    console.log('Why referrals matter:');
    console.log('  - Inbound close rate: 100% (20/20)');
    console.log('  - Outbound close rate: 20% (32/160)');
    console.log('  - Each referral is worth 5x an outbound lead');
    console.log('');
    console.log('Commands:');
    console.log('  gex referral ask <company>    - Log a referral ask');
    console.log('  gex referral got <company>    - Log a referral received');
    console.log('  gex referral won <company>    - Log a converted referral');
    console.log('  gex referral list             - Show all referrals');
    console.log('  gex referral template         - Show ask email template');
    return;
  }

  if (subcommand === 'ask') {
    const company = args.slice(1).join(' ') || 'Unknown';
    data.asks = data.asks || [];
    data.asks.push({ company, date: new Date().toISOString().split('T')[0] });
    saveReferrals(data);
    console.log(`✅ Logged referral ask to ${company}`);
    console.log(`Total asks: ${data.asks.length}`);
    return;
  }

  if (subcommand === 'got') {
    const company = args.slice(1).join(' ') || 'Unknown';
    data.received = data.received || [];
    data.received.push({ company, date: new Date().toISOString().split('T')[0] });
    saveReferrals(data);
    console.log(`✅ Logged referral from ${company}`);
    console.log(`Total received: ${data.received.length}`);
    return;
  }

  if (subcommand === 'won') {
    const company = args.slice(1).join(' ') || 'Unknown';
    data.converted = data.converted || [];
    data.converted.push({ company, date: new Date().toISOString().split('T')[0] });
    saveReferrals(data);
    console.log(`🎉 Logged converted referral: ${company}`);
    console.log(`Total converted: ${data.converted.length}`);
    return;
  }

  if (subcommand === 'list') {
    console.log('\n📋 REFERRAL HISTORY');
    console.log('═'.repeat(50));
    
    console.log('\n🔔 Asks Sent:');
    if ((data.asks || []).length === 0) console.log('  None yet - ask happy clients for referrals.');
    (data.asks || []).forEach(r => console.log(`  ${r.date} - ${r.company}`));
    
    console.log('\n📥 Received:');
    if ((data.received || []).length === 0) console.log('  None yet.');
    (data.received || []).forEach(r => console.log(`  ${r.date} - ${r.company}`));
    
    console.log('\n✅ Converted:');
    if ((data.converted || []).length === 0) console.log('  None yet.');
    (data.converted || []).forEach(r => console.log(`  ${r.date} - ${r.company}`));
    return;
  }

  if (subcommand === 'template') {
    console.log('\n📧 REFERRAL ASK TEMPLATE');
    console.log('═'.repeat(50));
    console.log(`
Hey [Name],

Loved working on the [Campaign Name] with you. The results speak for 
themselves - [specific metric like "48M views" or "100K new users"].

Quick question: do you know anyone else in [their industry] who might 
want similar results? Happy to offer you 5% of any deal that comes 
through as a thank-you.

No pressure at all, just thought I'd ask.

Best,
Jan
`);
    console.log('Usage: Send this after every successful campaign.');
    console.log('Track with: gex referral ask <company>\n');
    return;
  }

  console.log('Unknown subcommand. Use: gex referral --help');
}

main().catch(console.error);
