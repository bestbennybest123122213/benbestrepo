#!/usr/bin/env node
/**
 * Unified Action Dashboard
 * 
 * One command to see everything that needs action today.
 * Combines leads from:
 *   🔥 Hot leads (0-3 days, need immediate response)
 *   🚨 Rescue leads (scheduling limbo, haven't booked)
 *   ⚠️  Triage leads (critical zone, 30-60 days old)
 * 
 * Usage:
 *   node unified-actions.js           # Full action dashboard
 *   node unified-actions.js --quick   # Top 10 only
 *   node unified-actions.js --count   # Just show counts
 *   node unified-actions.js --export  # Export as JSON
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const QUICK_MODE = args.includes('--quick') || args.includes('-q');
const COUNT_MODE = args.includes('--count') || args.includes('-c');
const EXPORT_MODE = args.includes('--export') || args.includes('-e');
const HELP_MODE = args.includes('--help') || args.includes('-h');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const SOURCES = {
  hot: {
    emoji: '🔥',
    label: 'Hot Lead',
    color: 'red',
    description: 'New lead needs immediate response'
  },
  rescue: {
    emoji: '🚨',
    label: 'Rescue',
    color: 'orange',
    description: 'Stuck in scheduling, needs nudge'
  },
  triage: {
    emoji: '⚠️',
    label: 'Triage',
    color: 'yellow',
    description: 'Critical zone, save before lost'
  }
};

const URGENCY_LEVELS = {
  critical: { emoji: '🔴', label: 'CRITICAL', priority: 1, timeMinutes: 5 },
  urgent: { emoji: '🟠', label: 'URGENT', priority: 2, timeMinutes: 10 },
  high: { emoji: '🟡', label: 'HIGH', priority: 3, timeMinutes: 15 },
  medium: { emoji: '🟢', label: 'MEDIUM', priority: 4, timeMinutes: 10 },
  low: { emoji: '⚪', label: 'LOW', priority: 5, timeMinutes: 5 }
};

const ACTIONS = {
  immediate_response: {
    label: 'Send immediate response',
    timeMinutes: 5,
    template: 'Personalized first-touch email'
  },
  calendly_reminder: {
    label: 'Send Calendly reminder',
    timeMinutes: 3,
    template: 'Gentle scheduling nudge'
  },
  urgency_nudge: {
    label: 'Send urgency nudge',
    timeMinutes: 5,
    template: '"Slots filling up" email'
  },
  alternative_offer: {
    label: 'Offer alternatives',
    timeMinutes: 5,
    template: 'Quick call/Loom/email options'
  },
  rescue_email: {
    label: 'Send rescue email',
    timeMinutes: 8,
    template: 'Fresh angle re-engagement'
  },
  last_chance: {
    label: 'Send last chance email',
    timeMinutes: 10,
    template: 'Final follow-up before close'
  },
  value_reminder: {
    label: 'Send value reminder',
    timeMinutes: 8,
    template: 'Recent results showcase'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function formatTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA COLLECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get HOT leads (0-3 days old, not booked)
 * These are new positive replies needing immediate response
 */
async function getHotLeads(client) {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', threeDaysAgo.toISOString())
    .neq('reply_category', 'Booked')
    .neq('reply_category', 'booked')
    .order('replied_at', { ascending: false });
  
  if (error || !leads) return [];
  
  return leads.map(lead => {
    const daysOld = daysSince(lead.replied_at);
    let urgency, action;
    
    if (daysOld <= 1) {
      urgency = URGENCY_LEVELS.critical;
      action = ACTIONS.immediate_response;
    } else if (daysOld <= 2) {
      urgency = URGENCY_LEVELS.urgent;
      action = ACTIONS.immediate_response;
    } else {
      urgency = URGENCY_LEVELS.high;
      action = ACTIONS.immediate_response;
    }
    
    return {
      id: lead.id,
      source: 'hot',
      name: lead.lead_name || 'Unknown',
      email: lead.lead_email,
      company: lead.lead_company || 'Unknown',
      category: lead.reply_category,
      daysOld,
      daysLeft: 3 - daysOld, // Time before it becomes "rescue" territory
      urgency,
      action,
      replyText: lead.reply_text,
      repliedAt: lead.replied_at
    };
  });
}

/**
 * Get RESCUE leads (4-30 days in scheduling limbo)
 * Focus on "cooling" and "cold" buckets that need urgent rescue
 */
async function getRescueLeads(client) {
  const schedulingCategories = [
    'Scheduling', 'scheduling', 
    'Meeting Requested', 'meeting_requested', 
    'Interested', 'interested'
  ];
  
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .in('reply_category', schedulingCategories)
    .order('replied_at', { ascending: true });
  
  if (error || !leads) return [];
  
  // Filter to 4-30 day range (after hot, before triage)
  return leads
    .map(lead => {
      const daysOld = daysSince(lead.replied_at);
      if (daysOld < 4 || daysOld > 30) return null;
      
      let urgency, action;
      
      if (daysOld >= 15) {
        // Cold (15+ days)
        urgency = URGENCY_LEVELS.urgent;
        action = ACTIONS.rescue_email;
      } else if (daysOld >= 8) {
        // Cooling (8-14 days)
        urgency = URGENCY_LEVELS.high;
        action = ACTIONS.alternative_offer;
      } else if (daysOld >= 4) {
        // Warm (4-7 days)
        urgency = URGENCY_LEVELS.medium;
        action = ACTIONS.urgency_nudge;
      } else {
        return null;
      }
      
      return {
        id: lead.id,
        source: 'rescue',
        name: lead.lead_name || 'Unknown',
        email: lead.lead_email,
        company: lead.lead_company || 'Unknown',
        category: lead.reply_category,
        daysOld,
        daysLeft: 30 - daysOld, // Time before it hits critical zone
        urgency,
        action,
        replyText: lead.reply_text,
        repliedAt: lead.replied_at
      };
    })
    .filter(Boolean);
}

/**
 * Get TRIAGE leads (30-60 days, critical zone)
 * Focus on "Save Now" and "High Priority" categories
 */
async function getTriageLeads(client) {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  const { data: allLeads, error } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', sixtyDaysAgo.toISOString())
    .order('replied_at', { ascending: true });
  
  if (error || !allLeads) return [];
  
  // Filter to 30-60 day range (critical zone)
  return allLeads
    .map(lead => {
      const daysOld = daysSince(lead.replied_at);
      if (daysOld < 30 || daysOld > 60) return null;
      
      const daysToLoss = 60 - daysOld;
      let urgency, action;
      
      if (daysToLoss <= 7) {
        // Save Now
        urgency = URGENCY_LEVELS.critical;
        action = ACTIONS.last_chance;
      } else if (daysToLoss <= 14) {
        // High Priority
        urgency = URGENCY_LEVELS.urgent;
        action = ACTIONS.value_reminder;
      } else if (daysToLoss <= 21) {
        // Worth Trying
        urgency = URGENCY_LEVELS.high;
        action = ACTIONS.value_reminder;
      } else {
        // Still some time
        urgency = URGENCY_LEVELS.medium;
        action = ACTIONS.value_reminder;
      }
      
      return {
        id: lead.id,
        source: 'triage',
        name: lead.lead_name || 'Unknown',
        email: lead.lead_email,
        company: lead.lead_company || 'Unknown',
        category: lead.reply_category,
        daysOld,
        daysLeft: daysToLoss,
        urgency,
        action,
        replyText: lead.reply_text,
        repliedAt: lead.replied_at
      };
    })
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function showCountsOnly(allLeads) {
  const counts = {
    hot: allLeads.filter(l => l.source === 'hot').length,
    rescue: allLeads.filter(l => l.source === 'rescue').length,
    triage: allLeads.filter(l => l.source === 'triage').length
  };
  
  const totalTime = allLeads.reduce((sum, l) => sum + l.action.timeMinutes, 0);
  const avgDeal = 20000;
  const conversionRate = 0.25;
  const revenueAtRisk = allLeads.length * avgDeal * conversionRate;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  📊 UNIFIED ACTION COUNTS                                      ║
╚═══════════════════════════════════════════════════════════════╝

  🔥 Hot Leads:    ${String(counts.hot).padStart(4)}   (0-3 days, need response NOW)
  🚨 Rescue:       ${String(counts.rescue).padStart(4)}   (scheduling limbo, 4-30 days)
  ⚠️  Triage:       ${String(counts.triage).padStart(4)}   (critical zone, 30-60 days)
  ────────────────────────
  📋 TOTAL:        ${String(allLeads.length).padStart(4)}   actions needed

  ⏱️  Time to clear: ${formatTime(totalTime)}
  💰 Revenue at risk: $${revenueAtRisk.toLocaleString()}

  💡 Run "gex unified" for full dashboard
`);
}

function showQuickDashboard(allLeads) {
  const top10 = allLeads.slice(0, 10);
  const totalTime = top10.reduce((sum, l) => sum + l.action.timeMinutes, 0);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ⚡ QUICK ACTIONS - Top 10                                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  console.log('  #  │ Source │ Urgency  │ Name                 │ Company              │ Action');
  console.log('  ───┼────────┼──────────┼──────────────────────┼──────────────────────┼─────────────────────');
  
  top10.forEach((lead, i) => {
    const source = SOURCES[lead.source];
    const num = String(i + 1).padStart(2);
    const srcLabel = source.emoji;
    const urgLabel = lead.urgency.emoji + ' ' + lead.urgency.label.padEnd(7);
    const name = truncate(lead.name, 20).padEnd(20);
    const company = truncate(lead.company, 20).padEnd(20);
    const action = truncate(lead.action.label, 20);
    
    console.log(`  ${num} │   ${srcLabel}   │ ${urgLabel} │ ${name} │ ${company} │ ${action}`);
  });
  
  const remaining = allLeads.length - 10;
  if (remaining > 0) {
    console.log(`\n  ... and ${remaining} more actions`);
  }
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⏱️  Time for top 10: ${formatTime(totalTime)} │ 💡 Run "gex unified" for full dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function showFullDashboard(allLeads) {
  const counts = {
    hot: allLeads.filter(l => l.source === 'hot').length,
    rescue: allLeads.filter(l => l.source === 'rescue').length,
    triage: allLeads.filter(l => l.source === 'triage').length
  };
  
  const byCriticality = {
    critical: allLeads.filter(l => l.urgency.priority === 1),
    urgent: allLeads.filter(l => l.urgency.priority === 2),
    high: allLeads.filter(l => l.urgency.priority === 3),
    medium: allLeads.filter(l => l.urgency.priority === 4),
    low: allLeads.filter(l => l.urgency.priority === 5)
  };
  
  const totalTime = allLeads.reduce((sum, l) => sum + l.action.timeMinutes, 0);
  const avgDeal = 20000;
  const conversionRate = 0.25;
  const revenueAtRisk = allLeads.length * avgDeal * conversionRate;
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🎯 UNIFIED ACTION DASHBOARD                                                  ║
║  ${allLeads.length} leads need action today │ ${formatTime(totalTime).padEnd(8)} to clear queue                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  
  // Source breakdown
  console.log('  BY SOURCE');
  console.log('  ─────────────────────────────────────────────────────────────────────────');
  const hotBar = '█'.repeat(Math.min(counts.hot, 30));
  const rescueBar = '█'.repeat(Math.min(counts.rescue, 30));
  const triageBar = '█'.repeat(Math.min(counts.triage, 30));
  
  console.log(`  🔥 Hot (0-3d)      ${String(counts.hot).padStart(3)} │ ${hotBar}`);
  console.log(`  🚨 Rescue (4-30d)  ${String(counts.rescue).padStart(3)} │ ${rescueBar}`);
  console.log(`  ⚠️  Triage (30-60d) ${String(counts.triage).padStart(3)} │ ${triageBar}`);
  console.log('');
  
  // Urgency breakdown
  console.log('  BY URGENCY');
  console.log('  ─────────────────────────────────────────────────────────────────────────');
  const criticalBar = '█'.repeat(Math.min(byCriticality.critical.length, 30));
  const urgentBar = '█'.repeat(Math.min(byCriticality.urgent.length, 30));
  const highBar = '█'.repeat(Math.min(byCriticality.high.length, 30));
  const mediumBar = '█'.repeat(Math.min(byCriticality.medium.length, 30));
  
  console.log(`  🔴 CRITICAL        ${String(byCriticality.critical.length).padStart(3)} │ ${criticalBar}`);
  console.log(`  🟠 URGENT          ${String(byCriticality.urgent.length).padStart(3)} │ ${urgentBar}`);
  console.log(`  🟡 HIGH            ${String(byCriticality.high.length).padStart(3)} │ ${highBar}`);
  console.log(`  🟢 MEDIUM          ${String(byCriticality.medium.length).padStart(3)} │ ${mediumBar}`);
  console.log('');
  
  // Stats summary
  console.log('  📊 SUMMARY');
  console.log('  ─────────────────────────────────────────────────────────────────────────');
  console.log(`  Total actions needed:     ${allLeads.length}`);
  console.log(`  Time to clear queue:      ${formatTime(totalTime)}`);
  console.log(`  Revenue at risk:          $${revenueAtRisk.toLocaleString()}`);
  console.log(`  (Based on $${avgDeal.toLocaleString()} avg deal, ${(conversionRate * 100).toFixed(0)}% conversion)`);
  console.log('');
  
  // Action list by urgency
  const showLimit = 8;
  
  // CRITICAL actions
  if (byCriticality.critical.length > 0) {
    console.log('  🔴 CRITICAL - Do these RIGHT NOW');
    console.log('  ─────────────────────────────────────────────────────────────────────────');
    
    byCriticality.critical.slice(0, showLimit).forEach(lead => {
      const source = SOURCES[lead.source];
      const daysLabel = lead.source === 'triage' 
        ? `${lead.daysLeft}d left`
        : `${lead.daysOld}d old`;
      
      console.log(`    ${source.emoji} ${truncate(lead.name, 18).padEnd(18)} │ ${truncate(lead.company, 18).padEnd(18)} │ ${daysLabel.padEnd(9)} │ ${lead.action.label}`);
      console.log(`       📧 ${lead.email}`);
    });
    
    if (byCriticality.critical.length > showLimit) {
      console.log(`       ... and ${byCriticality.critical.length - showLimit} more`);
    }
    console.log('');
  }
  
  // URGENT actions
  if (byCriticality.urgent.length > 0) {
    console.log('  🟠 URGENT - Do these TODAY');
    console.log('  ─────────────────────────────────────────────────────────────────────────');
    
    byCriticality.urgent.slice(0, showLimit).forEach(lead => {
      const source = SOURCES[lead.source];
      const daysLabel = lead.source === 'triage' 
        ? `${lead.daysLeft}d left`
        : `${lead.daysOld}d old`;
      
      console.log(`    ${source.emoji} ${truncate(lead.name, 18).padEnd(18)} │ ${truncate(lead.company, 18).padEnd(18)} │ ${daysLabel.padEnd(9)} │ ${lead.action.label}`);
      console.log(`       📧 ${lead.email}`);
    });
    
    if (byCriticality.urgent.length > showLimit) {
      console.log(`       ... and ${byCriticality.urgent.length - showLimit} more`);
    }
    console.log('');
  }
  
  // HIGH actions
  if (byCriticality.high.length > 0) {
    console.log('  🟡 HIGH - Schedule for this week');
    console.log('  ─────────────────────────────────────────────────────────────────────────');
    
    byCriticality.high.slice(0, showLimit).forEach(lead => {
      const source = SOURCES[lead.source];
      const daysLabel = lead.source === 'triage' 
        ? `${lead.daysLeft}d left`
        : `${lead.daysOld}d old`;
      
      console.log(`    ${source.emoji} ${truncate(lead.name, 18).padEnd(18)} │ ${truncate(lead.company, 18).padEnd(18)} │ ${daysLabel.padEnd(9)} │ ${lead.action.label}`);
    });
    
    if (byCriticality.high.length > showLimit) {
      console.log(`       ... and ${byCriticality.high.length - showLimit} more`);
    }
    console.log('');
  }
  
  // MEDIUM actions (brief)
  if (byCriticality.medium.length > 0) {
    console.log(`  🟢 MEDIUM - ${byCriticality.medium.length} leads can wait but don't forget them`);
    console.log('');
  }
  
  // Quick actions reference
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  QUICK ACTIONS');
  console.log('  ─────────────────────────────────────────────────────────────────────────');
  console.log('  gex unified --quick     Top 10 actions only');
  console.log('  gex unified --count     Just show counts');
  console.log('  gex rescue draft <email>  Generate rescue email');
  console.log('  gex triage draft <email>  Generate triage email');
  console.log('  gex qm <email>          Mark lead as contacted');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function exportLeads(allLeads) {
  const exportDir = path.join(__dirname, 'data');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  
  const exportData = {
    generated_at: new Date().toISOString(),
    summary: {
      total: allLeads.length,
      hot: allLeads.filter(l => l.source === 'hot').length,
      rescue: allLeads.filter(l => l.source === 'rescue').length,
      triage: allLeads.filter(l => l.source === 'triage').length,
      critical: allLeads.filter(l => l.urgency.priority === 1).length,
      urgent: allLeads.filter(l => l.urgency.priority === 2).length
    },
    leads: allLeads.map(l => ({
      source: l.source,
      urgency: l.urgency.label,
      name: l.name,
      email: l.email,
      company: l.company,
      daysOld: l.daysOld,
      daysLeft: l.daysLeft,
      action: l.action.label,
      timeMinutes: l.action.timeMinutes
    }))
  };
  
  const exportPath = path.join(exportDir, 'unified-actions.json');
  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  
  console.log(`\n✅ Exported ${allLeads.length} leads to ${exportPath}\n`);
}

function showHelp() {
  console.log(`
  🎯 UNIFIED ACTION DASHBOARD

  See everything that needs action today in one place.
  Combines Hot leads, Rescue leads, and Triage leads.

  USAGE:
    gex unified              Full action dashboard
    gex unified --quick      Top 10 actions only
    gex unified --count      Just show counts per source
    gex unified --export     Export to JSON

  ALIASES:
    gex all                  Same as unified
    gex everything           Same as unified
    gex master               Same as unified
    gex combined             Same as unified

  SOURCES:
    🔥 Hot (0-3 days)        New replies needing immediate response
    🚨 Rescue (4-30 days)    Stuck in scheduling, need nudge
    ⚠️  Triage (30-60 days)   Critical zone, save before lost

  URGENCY LEVELS:
    🔴 CRITICAL              Do RIGHT NOW (~5 min each)
    🟠 URGENT                Do TODAY (~10 min each)
    🟡 HIGH                  This week (~15 min each)
    🟢 MEDIUM                Don't forget (~10 min each)

  RELATED COMMANDS:
    gex rescue               Scheduling rescue dashboard
    gex triage               Critical lead triage
    gex rescue draft <email> Generate rescue email
    gex triage draft <email> Generate triage email
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  if (HELP_MODE) {
    showHelp();
    return;
  }
  
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    console.error('   Run "gex doctor" to check configuration');
    process.exit(1);
  }
  
  // Collect leads from all sources in parallel
  const [hotLeads, rescueLeads, triageLeads] = await Promise.all([
    getHotLeads(client),
    getRescueLeads(client),
    getTriageLeads(client)
  ]);
  
  // Combine and sort by urgency priority (1=critical first)
  const allLeads = [...hotLeads, ...rescueLeads, ...triageLeads]
    .sort((a, b) => {
      // First by urgency priority
      if (a.urgency.priority !== b.urgency.priority) {
        return a.urgency.priority - b.urgency.priority;
      }
      // Then by days left (fewer days = more urgent)
      return a.daysLeft - b.daysLeft;
    });
  
  // Remove duplicates (same email appearing in multiple sources)
  const seen = new Set();
  const uniqueLeads = allLeads.filter(lead => {
    if (seen.has(lead.email)) return false;
    seen.add(lead.email);
    return true;
  });
  
  if (uniqueLeads.length === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  ✅ ALL CLEAR!                                                 ║
║  No leads need immediate action. Pipeline is healthy.          ║
╚═══════════════════════════════════════════════════════════════╝
`);
    return;
  }
  
  // Display based on mode
  if (EXPORT_MODE) {
    exportLeads(uniqueLeads);
  } else if (COUNT_MODE) {
    showCountsOnly(uniqueLeads);
  } else if (QUICK_MODE) {
    showQuickDashboard(uniqueLeads);
  } else {
    showFullDashboard(uniqueLeads);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
