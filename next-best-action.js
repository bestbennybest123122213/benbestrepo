#!/usr/bin/env node
/**
 * Next Best Action Recommender
 * 
 * Analyzes the pipeline and recommends the SINGLE most impactful action
 * to take right now. Cuts through the noise and gives clear direction.
 * 
 * Usage:
 *   node next-best-action.js         # Get single best action
 *   node next-best-action.js --top3  # Get top 3 actions
 *   node next-best-action.js --all   # Full action queue
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

const args = process.argv.slice(2);
const COUNT = args.includes('--all') ? 20 
            : args.includes('--top3') ? 3 
            : 1;

// Action types with impact scores
const ACTION_TYPES = {
  RESPOND_HOT: { 
    impact: 100, 
    time: '2 min',
    icon: '🔥',
    verb: 'Respond to',
    why: 'Fresh leads have 10x higher conversion'
  },
  SEND_CALENDAR: { 
    impact: 95, 
    time: '1 min',
    icon: '📅',
    verb: 'Send calendar link to',
    why: 'They asked for a meeting!'
  },
  FOLLOW_UP_ENTERPRISE: { 
    impact: 90, 
    time: '5 min',
    icon: '🏢',
    verb: 'Follow up with',
    why: 'Enterprise = bigger deal size'
  },
  NUDGE_COOLING: { 
    impact: 75, 
    time: '3 min',
    icon: '⏰',
    verb: 'Nudge',
    why: 'Before they go cold'
  },
  RE_ENGAGE_INTERESTED: { 
    impact: 65, 
    time: '5 min',
    icon: '💡',
    verb: 'Re-engage',
    why: 'They showed interest'
  },
  LAST_CHANCE: { 
    impact: 50, 
    time: '3 min',
    icon: '⚠️',
    verb: 'Last chance for',
    why: 'About to lose them'
  }
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

  // Calculate actions for each lead
  const actions = leads.map(lead => {
    const age = getAgeDays(lead.replied_at);
    const action = determineAction(lead, age);
    return { lead, action, age };
  })
  .filter(a => a.action !== null)
  .sort((a, b) => b.action.impact - a.action.impact)
  .slice(0, COUNT);

  if (actions.length === 0) {
    console.log(`
✅ No urgent actions right now!

Your pipeline is in good shape. Consider:
• Prospecting for new leads
• Optimizing email templates
• Analyzing what's working (node gex.js winrate)
`);
    return;
  }

  displayActions(actions, leads.length);
}

function determineAction(lead, age) {
  const category = lead.reply_category;
  const isEnterprise = lead.company_size === 'enterprise';
  
  // Hot new lead (< 24h)
  if (age < 1) {
    return { ...ACTION_TYPES.RESPOND_HOT, type: 'RESPOND_HOT' };
  }
  
  // Meeting request within 3 days
  if (category === 'Meeting Request' && age <= 3) {
    return { ...ACTION_TYPES.SEND_CALENDAR, type: 'SEND_CALENDAR' };
  }
  
  // Enterprise waiting (any category, < 7 days)
  if (isEnterprise && age <= 7 && category !== 'Booked') {
    return { ...ACTION_TYPES.FOLLOW_UP_ENTERPRISE, type: 'FOLLOW_UP_ENTERPRISE' };
  }
  
  // Meeting request cooling (4-14 days)
  if (category === 'Meeting Request' && age <= 14) {
    return { ...ACTION_TYPES.NUDGE_COOLING, type: 'NUDGE_COOLING' };
  }
  
  // Interested but waiting (7-21 days)
  if (category === 'Interested' && age <= 21) {
    return { ...ACTION_TYPES.RE_ENGAGE_INTERESTED, type: 'RE_ENGAGE_INTERESTED' };
  }
  
  // Stale meeting request - last chance (15-30 days)
  if (category === 'Meeting Request' && age <= 30) {
    return { ...ACTION_TYPES.LAST_CHANCE, type: 'LAST_CHANCE' };
  }
  
  return null;
}

function displayActions(actions, totalLeads) {
  const single = actions.length === 1;
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🎯 NEXT BEST ACTION${single ? '' : 'S'}                                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  actions.forEach((item, i) => {
    const { lead, action, age } = item;
    const enterprise = lead.company_size === 'enterprise' ? ' 🏢' : '';
    
    if (single) {
      // Single action - detailed view
      console.log(`  ${action.icon} ${action.verb.toUpperCase()}:`);
      console.log('');
      console.log(`     ${lead.lead_name}${enterprise}`);
      console.log(`     ${lead.lead_email}`);
      console.log(`     ${lead.lead_company || 'Unknown Company'}`);
      console.log('');
      console.log(`  📊 ${lead.reply_category} • ${age} day${age !== 1 ? 's' : ''} ago`);
      console.log(`  ⏱️  Est. time: ${action.time}`);
      console.log(`  💡 Why: ${action.why}`);
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('  Quick commands:');
      console.log(`    node gex.js fast draft ${lead.id}    # Generate response`);
      console.log(`    node gex.js book confirm ${lead.lead_email}  # Confirmation`);
      console.log('');
    } else {
      // Multiple actions - compact view
      console.log(`  ${action.icon} ${(i + 1).toString().padStart(2)}. ${action.verb} ${lead.lead_name}${enterprise}`);
      console.log(`       ${lead.lead_email} • ${lead.reply_category} • ${age}d`);
      console.log(`       ${action.why}`);
      console.log('');
    }
  });

  if (!single) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Stats
  const hotCount = actions.filter(a => a.action.impact >= 90).length;
  const timeEstimate = actions.reduce((sum, a) => sum + parseInt(a.action.time), 0);
  
  console.log(`  📈 ${totalLeads} total unbooked | ${hotCount} high-impact actions`);
  console.log(`  ⏱️  Est. time to clear queue: ~${timeEstimate} minutes`);
  console.log('');
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
