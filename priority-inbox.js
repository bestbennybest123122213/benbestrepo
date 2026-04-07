#!/usr/bin/env node
/**
 * Priority Inbox
 * 
 * Single view of everything that needs attention RIGHT NOW.
 * Consolidates hot leads, stale leads, pending meetings into one actionable list.
 * 
 * Usage:
 *   node priority-inbox.js            # Show inbox
 *   node priority-inbox.js --limit 10 # Limit results
 *   node priority-inbox.js --json     # Output as JSON
 *   node priority-inbox.js --telegram # Telegram-formatted
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 15;
const FORMAT = args.includes('--json') ? 'json' 
             : args.includes('--telegram') ? 'telegram'
             : 'cli';

// Priority weights
const PRIORITIES = {
  HOT_NEW: 100,          // <24h reply
  HOT_MEETING: 90,       // Meeting request <3 days
  ENTERPRISE_WAITING: 85, // Enterprise lead waiting
  MEETING_COOLING: 70,    // Meeting request 7-14 days
  INTERESTED_FRESH: 60,   // Interested <7 days
  STALE_MEETING: 50,      // Meeting request 15+ days
  STALE_INTERESTED: 40,   // Interested 15+ days
};

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  // Score and sort all leads
  const scoredLeads = leads.map(lead => {
    const priority = calculatePriority(lead);
    return { ...lead, priority, urgency: getUrgencyLabel(priority) };
  })
  .sort((a, b) => b.priority.score - a.priority.score)
  .slice(0, LIMIT);

  if (FORMAT === 'json') {
    console.log(JSON.stringify(scoredLeads, null, 2));
    return;
  }

  if (FORMAT === 'telegram') {
    console.log(formatTelegram(scoredLeads));
    return;
  }

  displayCLI(scoredLeads, leads.length);
}

function calculatePriority(lead) {
  const age = getAgeDays(lead.replied_at);
  const category = lead.reply_category;
  const isEnterprise = lead.company_size === 'enterprise';
  
  let score = 0;
  let reason = '';
  let action = '';

  // Hot new leads (< 24h)
  if (age < 1) {
    score = PRIORITIES.HOT_NEW;
    reason = '🔥 JUST REPLIED';
    action = 'Respond within 1 hour';
  }
  // Hot meeting requests (< 3 days)
  else if (category === 'Meeting Request' && age <= 3) {
    score = PRIORITIES.HOT_MEETING;
    reason = '📅 WANTS MEETING';
    action = 'Send calendar link NOW';
  }
  // Enterprise waiting
  else if (isEnterprise && age <= 7) {
    score = PRIORITIES.ENTERPRISE_WAITING;
    reason = '🏢 ENTERPRISE';
    action = 'Priority follow-up';
  }
  // Meeting requests cooling (7-14 days)
  else if (category === 'Meeting Request' && age <= 14) {
    score = PRIORITIES.MEETING_COOLING;
    reason = '⏰ MEETING COOLING';
    action = 'Re-send availability';
  }
  // Fresh interested
  else if (category === 'Interested' && age <= 7) {
    score = PRIORITIES.INTERESTED_FRESH;
    reason = '💡 INTERESTED';
    action = 'Share case study';
  }
  // Stale meeting requests
  else if (category === 'Meeting Request' && age > 14) {
    score = PRIORITIES.STALE_MEETING;
    reason = '⚠️ STALE MEETING';
    action = 'Last chance nudge';
  }
  // Stale interested
  else if (category === 'Interested' && age > 14) {
    score = PRIORITIES.STALE_INTERESTED;
    reason = '📉 GOING COLD';
    action = 'Re-engage with value';
  }
  // Everything else
  else {
    score = Math.max(0, 30 - age);
    reason = '📋 IN QUEUE';
    action = 'Follow up when possible';
  }

  // Boost for enterprise
  if (isEnterprise) score += 15;
  
  // Boost for high funding
  if (lead.funding_amount > 100000000) score += 10;
  else if (lead.funding_amount > 10000000) score += 5;

  return { score, reason, action };
}

function getUrgencyLabel(priority) {
  if (priority.score >= 90) return 'URGENT';
  if (priority.score >= 70) return 'HIGH';
  if (priority.score >= 50) return 'MEDIUM';
  return 'LOW';
}

function displayCLI(leads, totalCount) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📥 PRIORITY INBOX                                                       ║
║  Top ${leads.length} actions from ${totalCount} unbooked leads                              ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const urgentCount = leads.filter(l => l.priority.score >= 90).length;
  const highCount = leads.filter(l => l.priority.score >= 70 && l.priority.score < 90).length;

  if (urgentCount > 0) {
    console.log(`  ⚠️  ${urgentCount} URGENT | ${highCount} HIGH PRIORITY\n`);
  }

  leads.forEach((lead, i) => {
    const age = getAgeDays(lead.replied_at);
    const icon = lead.priority.score >= 90 ? '🔴' 
               : lead.priority.score >= 70 ? '🟠' 
               : lead.priority.score >= 50 ? '🟡' 
               : '🟢';
    const enterprise = lead.company_size === 'enterprise' ? ' 🏢' : '';
    
    console.log(`  ${icon} ${(i + 1).toString().padStart(2)}. ${lead.lead_name}${enterprise}`);
    console.log(`      📧 ${lead.lead_email}`);
    console.log(`      🏢 ${lead.lead_company || 'Unknown'} | ${lead.reply_category} | ${age}d ago`);
    console.log(`      ${lead.priority.reason} → ${lead.priority.action}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Generate responses: node gex.js fast');
  console.log('  Email drafts:       node gex.js drafts');
  console.log('  Meeting closer:     node gex.js closer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function formatTelegram(leads) {
  const lines = [];
  
  lines.push('📥 *Priority Inbox*');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  const urgent = leads.filter(l => l.priority.score >= 90);
  const high = leads.filter(l => l.priority.score >= 70 && l.priority.score < 90);
  
  if (urgent.length > 0) {
    lines.push(`🔴 *URGENT (${urgent.length})*`);
    urgent.forEach(l => {
      lines.push(`• ${l.lead_name} @ ${l.lead_company || '?'}`);
      lines.push(`  → ${l.priority.action}`);
    });
    lines.push('');
  }
  
  if (high.length > 0) {
    lines.push(`🟠 *HIGH (${high.length})*`);
    high.forEach(l => {
      lines.push(`• ${l.lead_name} @ ${l.lead_company || '?'}`);
      lines.push(`  → ${l.priority.action}`);
    });
    lines.push('');
  }
  
  lines.push('_Use /gex inbox for full list_');
  
  return lines.join('\n');
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
