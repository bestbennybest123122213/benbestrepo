#!/usr/bin/env node
/**
 * Pending Leads Monitor
 * Checks for positive replies that haven't been followed up
 * 
 * Usage:
 *   node pending-leads-monitor.js          # Show all pending
 *   node pending-leads-monitor.js --urgent # Only 7+ days old
 *   node pending-leads-monitor.js --critical # Only 14+ days old
 *   node pending-leads-monitor.js --summary # Quick summary
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const URGENT_ONLY = args.includes('--urgent');
const CRITICAL_ONLY = args.includes('--critical');
const SUMMARY_ONLY = args.includes('--summary');

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`
};

function getDaysAgo(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  return Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
}

function getUrgencyEmoji(days) {
  if (days >= 21) return '💀';  // Dead
  if (days >= 14) return '🔴';  // Critical
  if (days >= 7) return '🟠';   // Urgent
  if (days >= 3) return '🟡';   // Warm
  return '🟢';                   // Fresh
}

function estimateDealValue(company, category) {
  // Rough estimates based on company type
  const lowerCompany = (company || '').toLowerCase();
  
  if (lowerCompany.includes('game') || lowerCompany.includes('play')) return '$25-40K';
  if (lowerCompany.includes('ai') || lowerCompany.includes('tech')) return '$20-35K';
  if (category === 'Booked') return '$20-40K';
  if (category === 'Meeting Request') return '$15-30K';
  return '$10-25K';
}

async function main() {
  console.log(colors.bold('\n📋 Pending Leads Monitor\n'));
  
  const client = initSupabase();
  if (!client) {
    console.error('Supabase not configured');
    process.exit(1);
  }
  
  // Get all pending positive replies from last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  const { data, error } = await client
    .from('positive_replies')
    .select('lead_name, lead_company, lead_email, reply_category, replied_at, follow_up_status, campaign_name')
    .eq('follow_up_status', 'pending')
    .gte('replied_at', sixtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });
  
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  // Process and categorize
  const leads = data.map(r => ({
    ...r,
    daysAgo: getDaysAgo(r.replied_at),
    urgency: getUrgencyEmoji(getDaysAgo(r.replied_at)),
    value: estimateDealValue(r.lead_company, r.reply_category)
  }));
  
  // Filter based on flags
  let filtered = leads;
  if (CRITICAL_ONLY) {
    filtered = leads.filter(l => l.daysAgo >= 14);
  } else if (URGENT_ONLY) {
    filtered = leads.filter(l => l.daysAgo >= 7);
  }
  
  // Summary mode
  if (SUMMARY_ONLY) {
    const critical = leads.filter(l => l.daysAgo >= 14).length;
    const urgent = leads.filter(l => l.daysAgo >= 7 && l.daysAgo < 14).length;
    const warm = leads.filter(l => l.daysAgo < 7).length;
    
    console.log('═'.repeat(50));
    console.log(`Total pending: ${colors.bold(leads.length)}`);
    console.log(`  ${colors.red('🔴 Critical (14+ days):')} ${critical}`);
    console.log(`  ${colors.yellow('🟠 Urgent (7-13 days):')} ${urgent}`);
    console.log(`  ${colors.green('🟢 Warm (< 7 days):')} ${warm}`);
    console.log('═'.repeat(50));
    
    if (critical > 0) {
      console.log(colors.red(`\n⚠️  ${critical} leads are about to die! Run: gex pending --critical`));
    }
    return;
  }
  
  // Full report
  console.log('═'.repeat(80));
  console.log(`Found ${colors.bold(filtered.length)} pending leads\n`);
  
  // Group by urgency
  const dead = filtered.filter(l => l.daysAgo >= 21);
  const critical = filtered.filter(l => l.daysAgo >= 14 && l.daysAgo < 21);
  const urgent = filtered.filter(l => l.daysAgo >= 7 && l.daysAgo < 14);
  const warm = filtered.filter(l => l.daysAgo < 7);
  
  const printLead = (l) => {
    const domain = l.lead_email?.split('@')[1] || 'unknown';
    console.log(`${l.urgency} ${String(l.daysAgo).padStart(2)}d | ${(l.lead_name || '?').padEnd(20)} | ${domain.padEnd(25)} | ${l.reply_category.padEnd(18)} | ${l.value}`);
  };
  
  if (dead.length > 0) {
    console.log(colors.red(colors.bold('\n💀 DEAD (21+ days) - Last chance emails only')));
    console.log('─'.repeat(80));
    dead.forEach(printLead);
  }
  
  if (critical.length > 0) {
    console.log(colors.red(colors.bold('\n🔴 CRITICAL (14-20 days) - Send TODAY')));
    console.log('─'.repeat(80));
    critical.forEach(printLead);
  }
  
  if (urgent.length > 0) {
    console.log(colors.yellow(colors.bold('\n🟠 URGENT (7-13 days) - Send this week')));
    console.log('─'.repeat(80));
    urgent.forEach(printLead);
  }
  
  if (warm.length > 0) {
    console.log(colors.green(colors.bold('\n🟢 WARM (< 7 days) - Good shape')));
    console.log('─'.repeat(80));
    warm.forEach(printLead);
  }
  
  // Revenue estimate
  const minValue = filtered.length * 15000 * 0.3; // $15K min * 30% commission
  const maxValue = filtered.length * 35000 * 0.3; // $35K max * 30% commission
  
  console.log('\n' + '═'.repeat(80));
  console.log(colors.bold('💰 Revenue at Risk'));
  console.log(`   Potential deals: $${(filtered.length * 15000 / 1000).toFixed(0)}K - $${(filtered.length * 35000 / 1000).toFixed(0)}K`);
  console.log(`   Commission: $${(minValue / 1000).toFixed(0)}K - $${(maxValue / 1000).toFixed(0)}K`);
  console.log('═'.repeat(80));
  
  // Action items
  if (critical.length > 0 || dead.length > 0) {
    console.log(colors.red(`\n⚡ ACTION: ${critical.length + dead.length} leads need immediate follow-up!`));
    console.log(`   See drafts: ~/clawd/drafts/URGENT-FOLLOWUPS-MAR14.md`);
  }
  
  console.log('');
}

main().catch(console.error);
