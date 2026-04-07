#!/usr/bin/env node
/**
 * Action Pack Generator
 * Combines all overnight tools into a single actionable morning summary
 * 
 * Usage:
 *   node gex.js action-pack        - Generate today's action pack
 *   node gex.js apack              - Short alias
 */

const fs = require('fs');
const path = require('path');
const { calculateIntentScore, detectVertical } = require('../lib/intent-signals');

// Load leads data
function getLeadsData() {
  try {
    const dataPath = path.join(__dirname, '..', 'data', 'positive-replies-processed.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return data.leads || [];
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Get fresh leads (< 7 days old)
function getFreshLeads(leads) {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return leads.filter(l => {
    if (!l.conv_date) return false;
    const date = new Date(l.conv_date);
    return date.getTime() > sevenDaysAgo;
  });
}

// Get fast responders (replied < 1 hour)
function getFastResponders(leads) {
  return leads.filter(l => {
    if (!l.ert) return false;
    const parts = l.ert.split(':').map(Number);
    const hours = parts[0] + (parts[1] || 0) / 60;
    return hours < 1;
  });
}

// Get by vertical
function getByVertical(leads) {
  const verticals = { gaming: [], education: [], tech: [], other: [] };
  leads.forEach(l => {
    const v = detectVertical({ name: l.company || '', industry: l.industry || '' });
    if (verticals[v]) {
      verticals[v].push(l);
    } else {
      verticals.other.push(l);
    }
  });
  return verticals;
}

// Generate quick pitch
function generateQuickPitch(lead) {
  const company = lead.company || lead.domain || 'Unknown';
  const firstName = (lead.name || '').split(' ')[0] || '[First Name]';
  const vertical = detectVertical({ name: company });
  
  const pitches = {
    gaming: `Hey ${firstName}, we helped Whiteout Survival get 48M views and 100K+ users through story-driven YouTube content. ${company} has a similar user profile. Worth exploring?`,
    education: `Hey ${firstName}, Gauth AI got 15M+ views and 50K downloads from YouTube integrations. ${company} could see similar results. Quick chat?`,
    tech: `Hey ${firstName}, creator marketing is outperforming paid channels for companies like ${company}. We've helped similar brands see 4x ROAS. Worth 15 minutes?`,
    other: `Hey ${firstName}, noticed ${company} is growing. We've been helping brands like yours reach new audiences through YouTube creators. Worth exploring?`
  };
  
  return pitches[vertical] || pitches.other;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  📋 ACTION PACK - ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).padEnd(40) + '      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const leads = getLeadsData();
  
  if (leads.length === 0) {
    console.log('\x1b[33m⚠️  No leads data found.\x1b[0m');
    return;
  }
  
  // 1. QUICK WINS
  console.log('\x1b[1m🎯 QUICK WINS (Do First - 15 min)\x1b[0m');
  console.log('');
  
  const scheduling = leads.filter(l => l.status === 'Scheduling');
  const fastResponders = getFastResponders(scheduling).slice(0, 3);
  
  if (fastResponders.length > 0) {
    console.log('   Fast responders in Scheduling (high intent):');
    fastResponders.forEach((l, i) => {
      const company = (l.company || l.domain || 'Unknown').slice(0, 20);
      const name = l.name?.split(' ')[0] || '';
      console.log(`   ${i + 1}. \x1b[1m${name} @ ${company}\x1b[0m`);
      console.log(`      "${generateQuickPitch(l).slice(0, 80)}..."`);
      console.log('');
    });
  } else {
    console.log('   No fast responders found in Scheduling.');
    console.log('');
  }
  
  // 2. VERTICAL OPPORTUNITIES
  const verticals = getByVertical(scheduling);
  
  console.log('\x1b[1m🎮 GAMING LEADS (' + verticals.gaming.length + ')\x1b[0m');
  console.log('');
  if (verticals.gaming.length > 0) {
    console.log('   Use Whiteout Survival case study (48M views, 100K users)');
    verticals.gaming.slice(0, 3).forEach(l => {
      console.log(`   • ${l.company || l.domain}`);
    });
  } else {
    console.log('   No gaming leads in Scheduling.');
  }
  console.log('');
  
  console.log('\x1b[1m📚 EDUCATION LEADS (' + verticals.education.length + ')\x1b[0m');
  console.log('');
  if (verticals.education.length > 0) {
    console.log('   Use Gauth AI case study (15M views, 50K downloads)');
    verticals.education.slice(0, 3).forEach(l => {
      console.log(`   • ${l.company || l.domain}`);
    });
  } else {
    console.log('   No education leads in Scheduling.');
  }
  console.log('');
  
  // 3. LEAD MAGNETS TO USE
  console.log('\x1b[1m🎁 LEAD MAGNETS (Today\'s Options)\x1b[0m');
  console.log('');
  console.log('   TIER 1 (Tangible):');
  console.log('   • Creator Match Report - 30 min prep, highest response');
  console.log('   • Competitor Campaign Audit - 20 min prep');
  console.log('');
  console.log('   TIER 2 (Zero Prep):');
  console.log('   • Strategy Session - "I\'d sketch out a 90-day plan on a call"');
  console.log('   • Rate Negotiation - "Most brands overpay by 30-40%"');
  console.log('');
  console.log('   Run: \x1b[2mgex magnets examples\x1b[0m for ready-to-send templates');
  console.log('');
  
  // 4. PIPELINE STATS
  console.log('\x1b[1m📊 PIPELINE SNAPSHOT\x1b[0m');
  console.log('');
  
  const booked = leads.filter(l => l.status === 'Booked').length;
  const schedulingCount = scheduling.length;
  const notBooked = leads.filter(l => l.status === 'Not booked').length;
  const total = leads.length;
  const bookingRate = Math.round((booked / total) * 100);
  
  console.log(`   Total: ${total} leads`);
  console.log(`   Booked: ${booked} (${bookingRate}%)`);
  console.log(`   Scheduling: ${schedulingCount}`);
  console.log(`   Not Booked: ${notBooked}`);
  console.log('');
  
  // 5. TODAY'S FOCUS
  console.log('\x1b[1m⚡ TODAY\'S FOCUS\x1b[0m');
  console.log('');
  
  if (fastResponders.length > 0) {
    console.log('   1. Follow up with fast responders (they\'re engaged)');
  }
  if (verticals.gaming.length > 0) {
    console.log('   2. Send Whiteout case study to gaming leads');
  }
  console.log('   3. Use lead magnets instead of straight pitch');
  console.log('   4. Respond within 15 min for 2.3x better conversion');
  console.log('');
  
  // Commands reference
  console.log('\x1b[2m────────────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log('   \x1b[2mQuick Commands:\x1b[0m');
  console.log('   gex intent --hot      See highest intent leads');
  console.log('   gex lookalike         Find similar companies');
  console.log('   gex magnets examples  Get ready-to-send emails');
  console.log('   gex barrows "Co"      Generate quick pitch');
  console.log('');
}

main().catch(console.error);
