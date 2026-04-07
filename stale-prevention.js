#!/usr/bin/env node
/**
 * Stale Prevention Alert System
 * 
 * Identifies leads that are ABOUT to go stale and creates urgent action items.
 * Designed to run on heartbeat to catch problems early.
 * 
 * Usage:
 *   node stale-prevention.js           # Full report
 *   node stale-prevention.js --quiet   # Just counts (for heartbeat check)
 *   node stale-prevention.js --telegram # Telegram-formatted output
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const TELEGRAM = args.includes('--telegram');

// Priority scoring based on category and tier
const CATEGORY_SCORE = {
  'Meeting Request': 100,
  'Booked': 0, // Already converted
  'Interested': 80,
  'Demo Request': 90,
  'Information Request': 60
};

const TIER_SCORE = {
  'enterprise': 50,
  'midmarket': 30,
  'startup': 10,
  'unknown': 0
};

async function runStalePrevention() {
  const client = initSupabase();
  if (!client) {
    console.error('Database not initialized');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (error || !leads) {
    console.error('Error fetching leads:', error?.message);
    process.exit(1);
  }

  const now = Date.now();
  
  // Categorize leads by urgency
  const urgent = {
    critical: [],    // 0-1 days - respond NOW
    warning: [],     // 2-3 days - respond today
    atRisk: [],      // 4-7 days - about to go stale
    stale: [],       // 8-14 days - need reactivation
    cold: []         // 15+ days - may be lost
  };

  leads.forEach(lead => {
    const age = lead.replied_at 
      ? Math.floor((now - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    // Calculate priority score
    const catScore = CATEGORY_SCORE[lead.reply_category] || 50;
    const tierScore = TIER_SCORE[lead.lead_tier] || 0;
    const ageBonus = Math.max(0, 100 - age * 5); // Newer = higher priority
    lead.priority_score = catScore + tierScore + ageBonus;
    lead.age_days = age;
    
    if (age <= 1) urgent.critical.push(lead);
    else if (age <= 3) urgent.warning.push(lead);
    else if (age <= 7) urgent.atRisk.push(lead);
    else if (age <= 14) urgent.stale.push(lead);
    else urgent.cold.push(lead);
  });

  // Sort each bucket by priority
  Object.values(urgent).forEach(bucket => {
    bucket.sort((a, b) => b.priority_score - a.priority_score);
  });

  // QUIET mode - just return counts for heartbeat
  if (QUIET) {
    const criticalCount = urgent.critical.length;
    const warningCount = urgent.warning.length;
    const total = criticalCount + warningCount;
    
    if (total === 0) {
      console.log('No urgent leads');
      process.exit(0);
    }
    
    console.log(`🚨 ${criticalCount} critical, ⚠️ ${warningCount} warning`);
    process.exit(total > 0 ? 1 : 0); // Exit code 1 if action needed
  }

  // TELEGRAM mode - formatted for messaging
  if (TELEGRAM) {
    let msg = '';
    
    if (urgent.critical.length > 0) {
      msg += '🚨 *CRITICAL - Respond NOW*\n';
      urgent.critical.slice(0, 5).forEach(l => {
        msg += `• ${l.lead_name || l.lead_email} @ ${l.lead_company || '?'}\n`;
        msg += `  ${l.reply_category} (${l.age_days}d)\n`;
      });
      msg += '\n';
    }
    
    if (urgent.warning.length > 0) {
      msg += '⚠️ *WARNING - Respond Today*\n';
      urgent.warning.slice(0, 5).forEach(l => {
        msg += `• ${l.lead_name || l.lead_email}\n`;
      });
      msg += '\n';
    }
    
    if (urgent.atRisk.length > 0) {
      msg += `📉 ${urgent.atRisk.length} leads about to go stale (4-7d)\n`;
    }
    
    if (!msg) {
      msg = '✅ No urgent leads right now';
    }
    
    console.log(msg);
    process.exit(0);
  }

  // FULL mode - detailed report
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🚨 STALE PREVENTION ALERT                                               ║
║  Catch leads BEFORE they go cold                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Status overview
  console.log('📊 URGENCY OVERVIEW');
  console.log('━'.repeat(70));
  const statusLine = (emoji, label, count, color) => {
    const bar = '█'.repeat(Math.min(40, count * 2)) + '░'.repeat(Math.max(0, 40 - count * 2));
    console.log(`  ${emoji} ${label.padEnd(25)} ${bar} ${count}`);
  };
  
  statusLine('🔴', 'CRITICAL (0-1 days)', urgent.critical.length);
  statusLine('🟠', 'WARNING (2-3 days)', urgent.warning.length);
  statusLine('🟡', 'AT RISK (4-7 days)', urgent.atRisk.length);
  statusLine('🔵', 'STALE (8-14 days)', urgent.stale.length);
  statusLine('⚫', 'COLD (15+ days)', urgent.cold.length);

  // Action items
  if (urgent.critical.length > 0 || urgent.warning.length > 0) {
    console.log('\n' + '═'.repeat(70));
    console.log('🎯 IMMEDIATE ACTION REQUIRED');
    console.log('═'.repeat(70));
    
    if (urgent.critical.length > 0) {
      console.log('\n🔴 CRITICAL - RESPOND WITHIN HOURS:\n');
      urgent.critical.forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.lead_name || l.lead_email}`);
        if (l.lead_company) console.log(`     @ ${l.lead_company}`);
        console.log(`     ${l.reply_category} | ${l.age_days} days | Score: ${l.priority_score}`);
        console.log(`     Campaign: ${l.campaign_name || 'N/A'}`);
        console.log('');
      });
    }
    
    if (urgent.warning.length > 0) {
      console.log('\n🟠 WARNING - RESPOND TODAY:\n');
      urgent.warning.slice(0, 10).forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.lead_name || l.lead_email}`);
        if (l.lead_company) console.log(`     @ ${l.lead_company}`);
        console.log(`     ${l.reply_category} | ${l.age_days} days | Score: ${l.priority_score}`);
        console.log('');
      });
      if (urgent.warning.length > 10) {
        console.log(`     ... and ${urgent.warning.length - 10} more`);
      }
    }
  }

  // At-risk leads summary
  if (urgent.atRisk.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('🟡 AT RISK - Process this week:');
    console.log('─'.repeat(70));
    console.log(`\n  ${urgent.atRisk.length} leads are 4-7 days old and about to go stale.`);
    console.log('  Top 5 by priority:\n');
    urgent.atRisk.slice(0, 5).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.lead_name || l.lead_email} (${l.reply_category}, ${l.age_days}d)`);
    });
  }

  // Recommendations
  console.log('\n' + '═'.repeat(70));
  console.log('💡 RECOMMENDATIONS');
  console.log('═'.repeat(70));
  
  const totalUrgent = urgent.critical.length + urgent.warning.length;
  const totalAtRisk = urgent.atRisk.length;
  
  if (totalUrgent === 0 && totalAtRisk === 0) {
    console.log('\n  ✅ No urgent leads! Pipeline is healthy.');
  } else {
    if (totalUrgent > 0) {
      console.log(`\n  🔥 You have ${totalUrgent} leads that need immediate attention!`);
      console.log('     Block 30 minutes NOW to respond to critical/warning leads.');
    }
    if (totalAtRisk > 5) {
      console.log(`\n  ⏰ ${totalAtRisk} leads are at risk of going stale.`);
      console.log('     Schedule time this week to process them.');
    }
    
    // Quick win calculation
    const quickWins = urgent.critical.length + urgent.warning.length;
    const potentialRevenue = quickWins * 500; // $500 per booking
    console.log(`\n  💰 Quick win potential: $${potentialRevenue.toLocaleString()}`);
    console.log(`     (${quickWins} hot leads × $500 avg booking value)`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');
}

runStalePrevention().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
