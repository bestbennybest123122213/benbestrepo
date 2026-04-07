#!/usr/bin/env node
/**
 * Telegram Daily Digest Generator
 * 
 * Generates a formatted digest for Telegram with:
 * - Pipeline summary
 * - Hot leads
 * - Stale lead alerts
 * - Recommendations
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo, COMPANY_DATA } = require('./lead-enrichment');

async function generateTelegramDigest() {
  const client = initSupabase();
  if (!client) throw new Error('Supabase not initialized');

  // Get all positive replies
  const { data: leads, error } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Categorize
  const booked = leads.filter(l => l.reply_category === 'Booked');
  const meetingRequest = leads.filter(l => l.reply_category === 'Meeting Request');
  const interested = leads.filter(l => l.reply_category === 'Interested');
  const infoRequest = leads.filter(l => l.reply_category === 'Information Request');

  // Calculate stale
  const now = Date.now();
  const stale = leads.filter(l => {
    if (!l.replied_at) return false;
    const days = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 14;
  });
  const critical = stale.filter(l => {
    const days = Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 60;
  });

  // Get enterprise leads
  const enterprise = leads.filter(l => {
    const info = getCompanyInfo(l.lead_email);
    return info?.tier === 'enterprise';
  });

  // Build Telegram-formatted message
  let msg = '📊 *DAILY DIGEST*\n';
  msg += '_' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) + '_\n\n';

  // Pipeline
  msg += '📈 *PIPELINE*\n';
  msg += '```\n';
  msg += 'Booked:          ' + booked.length.toString().padStart(3) + '\n';
  msg += 'Meeting Request: ' + meetingRequest.length.toString().padStart(3) + '\n';
  msg += 'Interested:      ' + interested.length.toString().padStart(3) + '\n';
  msg += 'Info Request:    ' + infoRequest.length.toString().padStart(3) + '\n';
  msg += '─────────────────────\n';
  msg += 'TOTAL:           ' + leads.length.toString().padStart(3) + '\n';
  msg += '```\n\n';

  // Alerts
  if (stale.length > 0) {
    msg += '⚠️ *ALERTS*\n';
    msg += '• ' + stale.length + ' stale leads (>14d)\n';
    if (critical.length > 0) {
      msg += '• 🚨 ' + critical.length + ' critical (>60d)\n';
    }
    msg += '\n';
  }

  // Enterprise leads (high value)
  if (enterprise.length > 0) {
    msg += '🏢 *ENTERPRISE LEADS* (' + enterprise.length + ')\n';
    for (const l of enterprise.slice(0, 5)) {
      const info = getCompanyInfo(l.lead_email);
      const emoji = l.reply_category === 'Booked' ? '✅' : 
                    l.reply_category === 'Meeting Request' ? '🤝' : '👀';
      msg += emoji + ' ' + (l.lead_name || 'N/A') + ' @ ' + (info?.name || l.lead_company || 'N/A') + '\n';
    }
    msg += '\n';
  }

  // Recent activity (last 24h)
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const recent = leads.filter(l => new Date(l.replied_at) > oneDayAgo);
  
  if (recent.length > 0) {
    msg += '🆕 *LAST 24H* (' + recent.length + ' new)\n';
    for (const l of recent.slice(0, 3)) {
      const emoji = l.reply_category === 'Booked' ? '🎉' : 
                    l.reply_category === 'Meeting Request' ? '🤝' : 
                    l.reply_category === 'Interested' ? '✨' : '❓';
      msg += emoji + ' ' + (l.lead_name || l.lead_email.split('@')[0]) + '\n';
    }
    if (recent.length > 3) {
      msg += '_+' + (recent.length - 3) + ' more_\n';
    }
    msg += '\n';
  }

  // Quick stats
  const bookingRate = ((booked.length / leads.length) * 100).toFixed(1);
  msg += '📉 *CONVERSION*\n';
  msg += 'Booking rate: ' + bookingRate + '%\n\n';

  // Action items
  msg += '🎯 *TODAY*\n';
  if (critical.length > 0) {
    msg += '1. Clear ' + Math.min(5, critical.length) + ' critical leads\n';
  }
  if (meetingRequest.length > 0) {
    msg += '2. Book ' + Math.min(3, meetingRequest.length) + ' meeting requests\n';
  }
  if (enterprise.length > 0) {
    const unbookedEnterprise = enterprise.filter(l => l.reply_category !== 'Booked');
    if (unbookedEnterprise.length > 0) {
      msg += '3. Follow up on enterprise leads\n';
    }
  }

  msg += '\n🔗 [Dashboard](http://localhost:3456)';

  return msg;
}

async function main() {
  console.log('📱 Generating Telegram digest...\n');
  
  try {
    const digest = await generateTelegramDigest();
    console.log('='.repeat(50));
    console.log('TELEGRAM MESSAGE (copy below):');
    console.log('='.repeat(50));
    console.log(digest);
    console.log('='.repeat(50));
    
    // Also save to file
    const fs = require('fs');
    fs.writeFileSync('telegram-digest.txt', digest);
    console.log('\nSaved to telegram-digest.txt');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

module.exports = { generateTelegramDigest };

if (require.main === module) {
  main();
}
