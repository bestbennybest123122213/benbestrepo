#!/usr/bin/env node
/**
 * Morning Briefing Generator
 * 
 * Generates a comprehensive morning briefing document.
 * Run overnight via cron, ready when Jan wakes up.
 * 
 * Usage:
 *   node morning-briefing-generator.js           # Generate briefing
 *   node morning-briefing-generator.js --save    # Save to file
 *   node morning-briefing-generator.js --telegram # Telegram format
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const args = process.argv.slice(2);
const SAVE = args.includes('--save');
const TELEGRAM = args.includes('--telegram');

async function generateBriefing() {
  const client = initSupabase();
  if (!client) throw new Error('Database not available');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ===== DATA COLLECTION =====

  // 1. New replies (24h)
  const { data: newReplies } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', yesterday.toISOString())
    .order('replied_at', { ascending: false });

  // 2. All pending leads
  const { data: pendingLeads } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  // 3. Hot leads (0-3 days)
  const nowMs = Date.now();
  const hotLeads = (pendingLeads || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age <= 3;
  });

  // 4. Warm leads (4-7 days)
  const warmLeads = (pendingLeads || []).filter(l => {
    const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age > 3 && age <= 7;
  });

  // 5. Meeting requests not yet booked
  const unbookedMeetings = (pendingLeads || []).filter(l => 
    l.reply_category === 'Meeting Request'
  );

  // 6. Week's activity
  const { data: weekReplies } = await client
    .from('positive_replies')
    .select('*')
    .gte('replied_at', weekAgo.toISOString());

  // 7. Pipeline value from deals
  let pipelineValue = 0;
  let activeDeals = [];
  try {
    const dealsPath = './data/deals.json';
    if (fs.existsSync(dealsPath)) {
      const data = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
      activeDeals = data.deals || [];
      pipelineValue = activeDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    }
  } catch (e) {}

  // 8. Commission data
  let totalCommission = 0;
  try {
    const commPath = './data/commissions.json';
    if (fs.existsSync(commPath)) {
      const data = JSON.parse(fs.readFileSync(commPath, 'utf8'));
      const comms = data.commissions || [];
      totalCommission = comms.reduce((sum, c) => sum + (c.commission || 0), 0);
    }
  } catch (e) {}

  // ===== GENERATE BRIEFING =====

  if (TELEGRAM) {
    // Compact Telegram format
    let brief = `☀️ *Morning Briefing*\n${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n`;

    if (newReplies?.length > 0) {
      brief += `🆕 *${newReplies.length} new overnight*\n`;
    }

    if (hotLeads.length > 0) {
      brief += `\n🔴 *${hotLeads.length} HOT - respond TODAY:*\n`;
      hotLeads.slice(0, 3).forEach(l => {
        const name = l.lead_name?.split(' ')[0] || l.lead_email?.split('@')[0];
        brief += `• ${name} @ ${l.lead_company || 'Unknown'}\n`;
      });
    }

    brief += `\n📊 *Quick Stats*\n`;
    brief += `• Pipeline: $${pipelineValue.toLocaleString()}\n`;
    brief += `• Pending: ${pendingLeads?.length || 0}\n`;
    brief += `• Unbooked meetings: ${unbookedMeetings.length}\n\n`;

    brief += `🎯 *Start with:* \`gex queue\``;

    return brief;
  }

  // Full format
  let briefing = `
╔═══════════════════════════════════════════════════════════════════════════╗
║  ☀️ MORNING BRIEFING                                                      ║
║  ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
╚═══════════════════════════════════════════════════════════════════════════╝

`;

  // Section 1: Overnight Activity
  briefing += `📬 OVERNIGHT ACTIVITY\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (newReplies?.length > 0) {
    briefing += `   🆕 ${newReplies.length} new replies overnight:\n`;
    newReplies.slice(0, 5).forEach(r => {
      const name = r.lead_name || r.lead_email?.split('@')[0] || 'Unknown';
      briefing += `      • ${name} @ ${r.lead_company || 'Unknown'} — ${r.reply_category}\n`;
    });
    if (newReplies.length > 5) {
      briefing += `      ... and ${newReplies.length - 5} more\n`;
    }
  } else {
    briefing += `   No new replies overnight.\n`;
  }
  briefing += `\n`;

  // Section 2: Today's Priorities
  briefing += `🎯 TODAY'S PRIORITIES\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (hotLeads.length > 0) {
    briefing += `   🔴 URGENT: ${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} need response TODAY\n`;
    hotLeads.slice(0, 5).forEach((l, i) => {
      const name = l.lead_name || l.lead_email?.split('@')[0] || 'Unknown';
      const company = l.lead_company || 'Unknown';
      const age = l.replied_at ? Math.floor((nowMs - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      briefing += `      ${i + 1}. ${name} @ ${company} (${age}d, ${l.reply_category})\n`;
    });
    briefing += `\n`;
  }

  if (warmLeads.length > 0) {
    briefing += `   🟡 ${warmLeads.length} warm leads (4-7 days) - follow up today\n\n`;
  }

  if (unbookedMeetings.length > 0) {
    briefing += `   📅 ${unbookedMeetings.length} meeting requests awaiting booking\n\n`;
  }

  // Section 3: Pipeline Status
  // Get pipeline score by running command
  let pipelineScoreText = '';
  try {
    const { execSync } = require('child_process');
    const scoreOutput = execSync('node pipeline-score.js --quick 2>/dev/null', { 
      cwd: __dirname, 
      encoding: 'utf8',
      timeout: 5000 
    }).trim();
    // Parse output like "🔴 25/100 →"
    const match = scoreOutput.match(/([🟢🟡🟠🔴])\s*(\d+)\/100/);
    if (match) {
      const [, icon, score] = match;
      const status = parseInt(score) >= 80 ? 'Healthy' : parseInt(score) >= 50 ? 'Needs work' : 'Critical';
      pipelineScoreText = `   Pipeline Score:     ${icon} ${score}/100 (${status})\n`;
    }
  } catch (e) {}

  briefing += `💰 PIPELINE STATUS\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (pipelineScoreText) {
    briefing += pipelineScoreText;
  }
  briefing += `   Active Pipeline:    $${pipelineValue.toLocaleString()}\n`;
  briefing += `   Historical Comm:    $${Math.round(totalCommission).toLocaleString()}\n`;
  briefing += `   Pending Leads:      ${pendingLeads?.length || 0}\n`;
  briefing += `   Week's Replies:     ${weekReplies?.length || 0}\n`;
  briefing += `\n`;

  // Section 3.5: Domain Health (if issues)
  try {
    const { getDomainHealth, categorizeDomains } = require('./domain-alerts.js');
    const domains = await getDomainHealth();
    const { critical, warning } = categorizeDomains(domains);
    
    if (critical.length > 0 || warning.length > 0) {
      briefing += `🏥 DOMAIN HEALTH ALERT\n`;
      briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      if (critical.length > 0) {
        briefing += `   🔴 CRITICAL: ${critical.length} domain(s) below 70%\n`;
        critical.forEach(d => {
          briefing += `      • ${d.domain}: ${d.reputation}%\n`;
        });
      }
      if (warning.length > 0) {
        briefing += `   🟡 WARNING: ${warning.length} domain(s) below 85%\n`;
      }
      briefing += `   → Run: gex domain-alerts --recover <domain>\n`;
      briefing += `\n`;
    }
  } catch (e) {
    // Domain alerts not available, skip
  }

  // Section 3.6: Vertical Focus (top opportunity)
  try {
    const { execSync } = require('child_process');
    const vertOutput = execSync('node strategic-insights.js --focus 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    
    // Strip ANSI codes
    const cleanOutput = vertOutput.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Extract focus areas (lines with ● symbol followed by vertical name)
    const focusLines = cleanOutput.split('\n').filter(l => l.includes('●'));
    if (focusLines.length > 0) {
      briefing += `🎯 VERTICAL FOCUS\n`;
      briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      briefing += `   Top performers (>30% positive rate):\n`;
      focusLines.slice(0, 4).forEach(line => {
        // Match the vertical name after ●
        const match = line.match(/●\s*(.+)/);
        if (match) {
          briefing += `   • ${match[1].trim()}\n`;
        }
      });
      briefing += `   → Run: gex verticals for full analysis\n`;
      briefing += `\n`;
    }
  } catch (e) {
    // Vertical insights not available, skip
  }

  // Section 3.7: Lead Decay Alert (if critical)
  try {
    const { execSync } = require('child_process');
    const decayOutput = execSync('node decay-prevention.js 2>/dev/null', {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    
    // Strip ANSI codes and extract counts
    const cleanOutput = decayOutput.replace(/\x1b\[[0-9;]*m/g, '');
    const lostMatch = cleanOutput.match(/Lost.*?:\s*(\d+)/);
    const criticalMatch = cleanOutput.match(/Critical.*?:\s*(\d+)/);
    
    const lost = lostMatch ? parseInt(lostMatch[1]) : 0;
    const critical = criticalMatch ? parseInt(criticalMatch[1]) : 0;
    
    if (lost + critical > 10) {
      briefing += `⏰ LEAD DECAY ALERT\n`;
      briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      briefing += `   🔴 ${critical + lost} leads at critical/lost stage\n`;
      briefing += `   → Run: gex prevent --critical to see details\n`;
      briefing += `   → Run: gex archive --execute to clean up\n`;
      briefing += `\n`;
    }
  } catch (e) {
    // Decay prevention not available, skip
  }

  // Section 4: Active Deals
  if (activeDeals.length > 0) {
    briefing += `🤝 ACTIVE DEALS\n`;
    briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    activeDeals.forEach(d => {
      briefing += `   • ${d.company}: $${(d.value || 0).toLocaleString()} — ${d.stage}\n`;
      if (d.nextAction) {
        briefing += `     → Next: ${d.nextAction}\n`;
      }
    });
    briefing += `\n`;
  }

  // Section 5: Quick Commands
  briefing += `⚡ QUICK START COMMANDS\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  briefing += `   gex queue           Ready-to-send emails for hot leads\n`;
  briefing += `   gex book --send     Book meeting requests\n`;
  briefing += `   gex qm done 1,2,3   Mark leads as contacted\n`;
  briefing += `   gex dashboard --open   Visual command center\n`;
  briefing += `\n`;

  // Section 6: Top Action
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (hotLeads.length > 0) {
    const top = hotLeads[0];
    briefing += `🎯 #1 PRIORITY: Respond to ${top.lead_name || top.lead_email} @ ${top.lead_company}\n`;
    briefing += `   Run: gex queue\n`;
  } else if (unbookedMeetings.length > 0) {
    briefing += `🎯 #1 PRIORITY: Book ${unbookedMeetings.length} meeting requests\n`;
    briefing += `   Run: gex book --send\n`;
  } else {
    briefing += `🎯 Pipeline is healthy. Focus on outreach.\n`;
  }
  briefing += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  briefing += `Generated: ${now.toLocaleString()}\n`;

  return briefing;
}

async function main() {
  try {
    const briefing = await generateBriefing();

    if (SAVE) {
      const date = new Date().toISOString().slice(0, 10);
      const filename = `./briefings/morning-${date}.md`;
      
      // Ensure directory exists
      if (!fs.existsSync('./briefings')) {
        fs.mkdirSync('./briefings');
      }
      
      fs.writeFileSync(filename, briefing);
      console.log(`✅ Briefing saved to ${filename}`);
    } else {
      console.log(briefing);
    }
  } catch (error) {
    console.error('Error generating briefing:', error.message);
    process.exit(1);
  }
}

main();
