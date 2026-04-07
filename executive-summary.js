#!/usr/bin/env node
/**
 * Executive Summary Generator
 * 
 * One-page summary of everything for quick review
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

async function generateExecutiveSummary() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads');

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Categorize
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const hot = leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked');
  const stale = leads.filter(l => getAge(l) > 14 && l.reply_category !== 'Booked');
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
  });

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                  ║
║   📊 EXECUTIVE SUMMARY                                                           ║
║   ${date.padEnd(70)}   ║
║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   PIPELINE                                                                       ║
║   ─────────────────────────────────────────                                      ║
║   Total Leads:         ${leads.length.toString().padEnd(5)}                                                   ║
║   Booked:              ${booked.length.toString().padEnd(5)} (${((booked.length/leads.length)*100).toFixed(1)}%)                                           ║
║   Meeting Requests:    ${meetings.length.toString().padEnd(5)} ← RESPOND TO THESE                              ║
║   Interested:          ${interested.length.toString().padEnd(5)}                                                   ║
║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   🚨 URGENT                                                                      ║
║   ─────────────────────────────────────────                                      ║
║   🔥 Hot leads (0-3d):        ${hot.length.toString().padEnd(5)}                                             ║
║   🏢 Enterprise unbooked:     ${enterprise.length.toString().padEnd(5)}                                             ║
║   ⚠️  Stale (>14d):            ${stale.length.toString().padEnd(5)}                                             ║
║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   🏢 TOP ENTERPRISE ACCOUNTS                                                     ║
║   ─────────────────────────────────────────                                      ║`);

  enterprise.slice(0, 5).forEach(l => {
    const info = getCompanyInfo(l.lead_email);
    const line = `   ${(l.lead_name || 'N/A').substring(0, 20).padEnd(22)} @ ${(info?.name || 'N/A').substring(0, 20).padEnd(22)} ${l.reply_category.substring(0,15)}`;
    console.log(`║${line.padEnd(82)}║`);
  });

  console.log(`║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   📋 TODAY'S PRIORITIES                                                          ║
║   ─────────────────────────────────────────                                      ║
║   1. Respond to ${Math.min(5, hot.length)} hot leads (within 3 days = 9x conversion)                       ║
║   2. Book ${Math.min(5, meetings.length)} meeting requests                                                   ║
║   3. Follow up on ${Math.min(5, enterprise.length)} enterprise accounts                                          ║
║   4. Process ${Math.min(10, stale.length)} stale leads (close or reactivate)                              ║
║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   ⏱️  ESTIMATED TIME                                                              ║
║   ─────────────────────────────────────────                                      ║
║   Hot leads:       ${(hot.length * 5).toString().padEnd(4)} min                                                   ║
║   Meeting booking: ${(Math.min(10, meetings.length) * 3).toString().padEnd(4)} min                                                   ║
║   Stale cleanup:   ${(Math.min(10, stale.length) * 3).toString().padEnd(4)} min                                                   ║
║   ───────────────────────                                                        ║
║   TOTAL:           ${((hot.length * 5) + (Math.min(10, meetings.length) * 3) + (Math.min(10, stale.length) * 3)).toString().padEnd(4)} min                                                   ║
║                                                                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║   🔗 QUICK ACCESS                                                                ║
║   ─────────────────────────────────────────                                      ║
║   Dashboard:   http://localhost:3456                                             ║
║   Mobile:      http://localhost:3456/mobile.html                                 ║
║   CLI:         node gex.js help                                                  ║
║                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  try {
    await generateExecutiveSummary();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

module.exports = { generateExecutiveSummary };

if (require.main === module) {
  main();
}
