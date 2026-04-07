/**
 * Morning Briefing Telegram Sender
 * 
 * Generates a compact morning briefing for Telegram.
 * Designed to be run as a cron job at 08:30.
 * 
 * Usage:
 *   gex morning-tg           # Generate Telegram briefing
 *   gex morning-tg --send    # Generate and show copy-paste format
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getPipelineStats() {
  const { data: leads, error } = await supabase
    .from('curated_leads')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching leads:', error);
    return { total: 0, booked: 0, scheduling: 0, urgent: 0, critical: 0 };
  }
  
  const now = Date.now();
  let booked = 0;
  let scheduling = 0;
  let urgent = 0;
  let critical = 0;
  const urgentLeads = [];
  
  leads.forEach(lead => {
    if (lead.booking_status === 'Booked') {
      booked++;
    } else if (['Pending', null, ''].includes(lead.booking_status) && 
               ['Booked', 'Meeting Request', 'Interested', 'Information Request'].includes(lead.lead_category)) {
      scheduling++;
      
      const daysOld = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysOld >= 7 && daysOld <= 13) {
        urgent++;
        urgentLeads.push({
          name: lead.name?.split(/[\s@]/)[0] || 'Unknown',
          company: lead.domain?.split('.')[0] || 'Unknown',
          days: daysOld,
          category: lead.lead_category
        });
      } else if (daysOld >= 14 && daysOld <= 20) {
        critical++;
      }
    }
  });
  
  return {
    total: leads.length,
    booked,
    scheduling,
    urgent,
    critical,
    urgentLeads: urgentLeads.slice(0, 3)
  };
}

function formatTelegramBriefing(stats) {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
  
  let msg = `🌅 *Morning Briefing - ${today}*\n\n`;
  
  // Pipeline overview
  msg += `📊 *Pipeline*\n`;
  msg += `├ Total: ${stats.total}\n`;
  msg += `├ Booked: ${stats.booked} (${Math.round(stats.booked/stats.total*100)}%)\n`;
  msg += `└ Scheduling: ${stats.scheduling}\n\n`;
  
  // Urgency alerts
  if (stats.urgent > 0 || stats.critical > 0) {
    msg += `⚠️ *Action Required*\n`;
    if (stats.urgent > 0) {
      msg += `├ 🟠 ${stats.urgent} urgent (7-13d)\n`;
    }
    if (stats.critical > 0) {
      msg += `├ 🔴 ${stats.critical} critical (14-20d)\n`;
    }
    msg += `└ Send follow-ups TODAY\n\n`;
    
    // Top urgent leads
    if (stats.urgentLeads.length > 0) {
      msg += `📧 *Top Priority*\n`;
      stats.urgentLeads.forEach((lead, i) => {
        const prefix = i === stats.urgentLeads.length - 1 ? '└' : '├';
        msg += `${prefix} ${lead.name} @ ${lead.company} (${lead.days}d)\n`;
      });
      msg += '\n';
    }
  } else {
    msg += `✅ No urgent follow-ups needed\n\n`;
  }
  
  // Quick actions
  msg += `🎯 *Quick Actions*\n`;
  msg += `├ \`gex reply\` - See emails to send\n`;
  msg += `├ \`gex pending\` - All pending leads\n`;
  msg += `└ Full briefing: drafts/MORNING-BRIEFING-*.md\n`;
  
  return msg;
}

async function run(args = []) {
  console.log('\n[Generating Telegram morning briefing...]\n');
  
  const stats = await getPipelineStats();
  const message = formatTelegramBriefing(stats);
  
  console.log('━'.repeat(50));
  console.log('📱 TELEGRAM MESSAGE (copy below)');
  console.log('━'.repeat(50));
  console.log();
  console.log(message);
  console.log('━'.repeat(50));
  
  // Log to engagement tracker
  const engagementPath = path.join(__dirname, 'engagement-tracker.js');
  try {
    const { logBriefing } = require(engagementPath);
    logBriefing();
  } catch (e) {
    // Engagement tracker not available
  }
  
  console.log('\n💡 Send this via Telegram, then log engagement:');
  console.log('   gex engage log briefing');
  console.log();
}

module.exports = { run, formatTelegramBriefing, getPipelineStats };

// CLI execution
if (require.main === module) {
  run(process.argv.slice(2)).catch(console.error);
}
