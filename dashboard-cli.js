#!/usr/bin/env node
/**
 * CLI Dashboard
 * 
 * A terminal dashboard that shows everything at a glance:
 * - Pipeline stats
 * - Top leads
 * - Quick actions
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function showDashboard() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Calculate stats
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const unbooked = leads.filter(l => l.reply_category !== 'Booked');
  const meetings = unbooked.filter(l => l.reply_category === 'Meeting Request');
  const hot = unbooked.filter(l => getAge(l) <= 3);
  const stale = unbooked.filter(l => getAge(l) > 14);
  const enterprise = unbooked.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise';
  });

  const bookingRate = ((booked.length / leads.length) * 100).toFixed(1);

  // Clear and draw
  console.clear();
  
  const date = new Date().toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  console.log(`
╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║   ██████╗ ███████╗██╗  ██╗     ██████╗ ███████╗                                ║
║  ██╔════╝ ██╔════╝╚██╗██╔╝    ██╔═══██╗██╔════╝                                ║
║  ██║  ███╗█████╗   ╚███╔╝     ██║   ██║███████╗                                ║
║  ██║   ██║██╔══╝   ██╔██╗     ██║   ██║╚════██║                                ║
║  ╚██████╔╝███████╗██╔╝ ██╗    ╚██████╔╝███████║                                ║
║   ╚═════╝ ╚══════╝╚═╝  ╚═╝     ╚═════╝ ╚══════╝                                ║
║                                                                                ║
║   Lead Generation Command Center                        ${date}   ║
║                                                                                ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   📊 PIPELINE                           🎯 PRIORITIES                          ║
║   ─────────────────                     ─────────────────                      ║
║   Total:      ${leads.length.toString().padEnd(4)}                          🔥 Hot leads:    ${hot.length.toString().padEnd(4)}                     ║
║   Booked:     ${booked.length.toString().padEnd(4)} (${bookingRate}%)               🏢 Enterprise:   ${enterprise.length.toString().padEnd(4)}                     ║
║   Meetings:   ${meetings.length.toString().padEnd(4)}                          ⏰ Stale:        ${stale.length.toString().padEnd(4)}                     ║
║   Unbooked:   ${unbooked.length.toString().padEnd(4)}                                                               ║
║                                                                                ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   🏆 TOP 5 QUICK WINS                                                          ║
║   ─────────────────────────────────────────────────────────────────────────    ║`);

  // Show top 5 leads
  const topLeads = unbooked
    .map(l => {
      const info = getCompanyInfo(l.lead_email);
      let score = 0;
      if (l.reply_category === 'Meeting Request') score += 40;
      if (info?.tier === 'enterprise') score += 25;
      if (getAge(l) <= 3) score += 25;
      return { ...l, score, company: info?.name || 'N/A', tier: info?.tier };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  topLeads.forEach((l, i) => {
    const name = (l.lead_name || 'N/A').slice(0, 18).padEnd(18);
    const company = (l.company || 'N/A').slice(0, 18).padEnd(18);
    const emoji = l.tier === 'enterprise' ? '🏢' : l.reply_category === 'Meeting Request' ? '📅' : '💡';
    console.log(`║   ${emoji} ${i + 1}. ${name} @ ${company} ${l.score.toString().padStart(3)}pts        ║`);
  });

  console.log(`║                                                                                ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   ⚡ QUICK COMMANDS                                                            ║
║   ─────────────────────────────────────────────────────────────────────────    ║
║   node gex.js planner      Daily action plan                                   ║
║   node gex.js rank         Priority lead scoring                               ║
║   node gex.js drafts 5     Generate 5 email drafts                             ║
║   node gex.js calendar     Meeting booking messages                            ║
║   node gex.js goals        Check goal progress                                 ║
║                                                                                ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   🔗 http://localhost:3456                                 Press Ctrl+C to exit║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
`);
}

// Auto-refresh mode
async function watchMode() {
  await showDashboard();
  
  // Refresh every 30 seconds
  setInterval(async () => {
    await showDashboard();
  }, 30000);
}

async function main() {
  const watch = process.argv[2] === 'watch' || process.argv[2] === '-w';
  
  if (watch) {
    await watchMode();
  } else {
    await showDashboard();
  }
}

module.exports = { showDashboard };

if (require.main === module) {
  main().catch(console.error);
}
