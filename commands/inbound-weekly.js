#!/usr/bin/env node
/**
 * Weekly Inbound Report
 * Track inbound growth progress week over week.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const REFERRALS_FILE = path.join(__dirname, '../data/referrals.json');
const CONTENT_FILE = path.join(__dirname, '../data/content-calendar.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

async function main() {
  console.log('\n📊 WEEKLY INBOUND REPORT');
  console.log('═'.repeat(50));
  console.log(`Week of ${new Date().toISOString().split('T')[0]}\n`);

  // 1. Conversion metrics
  try {
    const { data: leads } = await supabase.from('curated_leads').select('*');
    const stats = { inbound: { total: 0, booked: 0 }, outbound: { total: 0, booked: 0 } };
    
    leads?.forEach(lead => {
      const source = (lead.source || 'outbound').toLowerCase();
      const key = source === 'inbound' ? 'inbound' : 'outbound';
      stats[key].total++;
      if (lead.status === 'Booked') stats[key].booked++;
    });

    console.log('📈 CONVERSION METRICS');
    console.log('─'.repeat(40));
    const inRate = stats.inbound.total > 0 ? ((stats.inbound.booked / stats.inbound.total) * 100).toFixed(0) : 0;
    const outRate = stats.outbound.total > 0 ? ((stats.outbound.booked / stats.outbound.total) * 100).toFixed(0) : 0;
    console.log(`Inbound:  ${stats.inbound.booked}/${stats.inbound.total} = ${inRate}% close rate`);
    console.log(`Outbound: ${stats.outbound.booked}/${stats.outbound.total} = ${outRate}% close rate`);
    console.log(`Advantage: ${(inRate / outRate).toFixed(1)}x\n`);
  } catch (e) {
    console.log('Could not fetch conversion metrics\n');
  }

  // 2. Referral activity
  const referrals = loadJSON(REFERRALS_FILE);
  console.log('📣 REFERRAL ACTIVITY');
  console.log('─'.repeat(40));
  console.log(`Asks sent:    ${referrals.asks?.length || 0}`);
  console.log(`Received:     ${referrals.received?.length || 0}`);
  console.log(`Converted:    ${referrals.converted?.length || 0}`);
  
  if (!referrals.asks || referrals.asks.length === 0) {
    console.log(`\n⚠️  No referral asks yet. Send 3 this week.`);
    console.log(`   → gex referral template`);
  }
  console.log('');

  // 3. Content activity
  const content = loadJSON(CONTENT_FILE);
  const thisWeek = content.posts?.filter(p => {
    const postDate = new Date(p.date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return postDate >= weekAgo;
  }) || [];

  console.log('📝 CONTENT ACTIVITY');
  console.log('─'.repeat(40));
  console.log(`Posts this week: ${thisWeek.length}`);
  console.log(`Target: 1 per week`);
  
  if (thisWeek.length === 0) {
    console.log(`\n⚠️  No posts this week. Time to post.`);
    console.log(`   → gex content ideas`);
  } else {
    thisWeek.forEach(p => console.log(`   ✓ ${p.date}: ${p.topic}`));
  }
  console.log('');

  // 4. Action items
  console.log('🎯 THIS WEEK\'S ACTIONS');
  console.log('─'.repeat(40));
  console.log('1. Ask 3 happy clients for referrals');
  console.log('2. Post 1 case study on LinkedIn');
  console.log('3. Track everything with gex commands');
  console.log('');
  console.log('Commands:');
  console.log('  gex referral ask <company>  - Log referral ask');
  console.log('  gex content posted <topic>  - Log LinkedIn post');
  console.log('  gex inbound                 - Check metrics');
}

main().catch(console.error);
