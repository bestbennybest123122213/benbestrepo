#!/usr/bin/env node
/**
 * Inbound Metrics & Strategy
 * Track inbound vs outbound performance and growth actions.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (subcommand === 'strategy' || subcommand === 'playbook') {
    console.log('\n📈 INBOUND STRATEGY QUICK REFERENCE');
    console.log('═'.repeat(50));
    console.log('\nWhy Inbound Matters:');
    console.log('  - Inbound close rate: 100% (20/20)');
    console.log('  - Outbound close rate: 20% (32/160)');
    console.log('  - Inbound is 5x more effective');
    console.log('\n4 Ways to Get More Inbound:');
    console.log('  1. ASK FOR REFERRALS - After every campaign');
    console.log('     → gex referral template');
    console.log('  2. PUBLISH CASE STUDIES - Whiteout, Gauth AI');
    console.log('     → Post on LinkedIn weekly');
    console.log('  3. LINKEDIN PRESENCE - 1 post per week');
    console.log('     → Share results, insights, hot takes');
    console.log('  4. INDUSTRY PRESENCE - Podcasts, events');
    console.log('     → 1 per quarter');
    console.log('\nFull playbook: drafts/INBOUND-STRATEGY-PLAYBOOK.md');
    return;
  }

  // Default: show metrics
  try {
    const { data: leads, error } = await supabase
      .from('curated_leads')
      .select('*');
    
    if (error) throw error;

    const stats = {
      inbound: { total: 0, booked: 0 },
      outbound: { total: 0, booked: 0 }
    };

    leads.forEach(lead => {
      const source = (lead.source || 'outbound').toLowerCase();
      const key = source === 'inbound' ? 'inbound' : 'outbound';
      stats[key].total++;
      if (lead.status === 'Booked') stats[key].booked++;
    });

    console.log('\n📊 INBOUND VS OUTBOUND METRICS');
    console.log('═'.repeat(50));
    
    console.log('\n┌─────────────┬────────┬────────┬────────────┐');
    console.log('│ Source      │ Leads  │ Booked │ Close Rate │');
    console.log('├─────────────┼────────┼────────┼────────────┤');
    
    const inRate = stats.inbound.total > 0 ? ((stats.inbound.booked / stats.inbound.total) * 100).toFixed(0) : 0;
    const outRate = stats.outbound.total > 0 ? ((stats.outbound.booked / stats.outbound.total) * 100).toFixed(0) : 0;
    
    console.log(`│ Inbound     │ ${String(stats.inbound.total).padStart(6)} │ ${String(stats.inbound.booked).padStart(6)} │ ${String(inRate + '%').padStart(10)} │`);
    console.log(`│ Outbound    │ ${String(stats.outbound.total).padStart(6)} │ ${String(stats.outbound.booked).padStart(6)} │ ${String(outRate + '%').padStart(10)} │`);
    console.log('└─────────────┴────────┴────────┴────────────┘');

    const multiplier = (inRate / outRate).toFixed(1);
    console.log(`\n🎯 Inbound is ${multiplier}x more effective than outbound.`);
    
    console.log('\n💡 Recommendations:');
    console.log('  → gex referral template   - Get referral ask email');
    console.log('  → gex inbound strategy    - View growth playbook');
    console.log('  → gex referral status     - Track referral progress');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main().catch(console.error);
