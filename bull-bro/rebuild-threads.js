#!/usr/bin/env node
/**
 * Rebuild threads-cache.json from lead_conversations table
 * Uses the FULL thread data, no skipping
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFreshContent(text) {
  if (!text) return '';
  
  // Cut off at common reply markers
  const markers = [
    /On\s+\w+,\s+\w+\s+\d+,\s+\d{4}\s+at\s+\d+:\d+.*/i,
    /On\s+\w{3},\s+\w{3}\s+\d+,\s+\d{4}\s+at\s+\d+:\d+.*/i,
    /Sent from Gmail Mobile.*/i,
    /Best,\s*\n\s*Deb\s*\n\s*D\s*eborah Smith.*/i,
    /Chief Executive Officer\s*Cell:.*/i,
    /www\.Rewardify\.com.*/i,
    /To schedule a meeting with me:.*/i,
    /Rewardify, Inc\..*/i,
    />\s*wrote:/i
  ];
  
  let clean = text;
  for (const marker of markers) {
    const idx = clean.search(marker);
    if (idx > 20) { // Only cut if there's content before
      clean = clean.substring(0, idx);
    }
  }
  
  return clean.trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

async function rebuild() {
  console.log('🔄 Rebuilding threads from lead_conversations...\n');
  
  // Get all conversations
  const { data: conversations, error } = await supabase
    .from('lead_conversations')
    .select('*')
    .order('email');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`📬 Found ${conversations.length} conversations\n`);
  
  const threads = {};
  let totalMessages = 0;
  
  for (const conv of conversations) {
    const messages = conv.messages || [];
    if (messages.length === 0) continue;
    
    // Format each message
    const formattedMessages = messages.map(m => {
      const isSent = m.type === 'SENT';
      const rawBody = stripHtml(m.email_body || m.body || '');
      // For replies, extract just the fresh content (no quoted history)
      const body = isSent ? rawBody : extractFreshContent(rawBody);
      
      return {
        from: isSent ? 'Imman' : (conv.lead_name || conv.email.split('@')[0]),
        type: isSent ? 'SENT' : 'REPLY',
        date: m.time,
        dateFormatted: formatDate(m.time),
        subject: m.subject || null,
        body: body
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    threads[conv.email] = {
      lead: conv.lead_name || conv.email.split('@')[0],
      company: conv.company || '',
      campaign: conv.campaign_name || null,
      category: conv.lead_category || 'Unknown',
      is_booked: conv.is_booked || false,
      is_golden: conv.is_golden_standard || false,
      messageCount: formattedMessages.length,
      messages: formattedMessages
    };
    
    totalMessages += formattedMessages.length;
  }
  
  // Save to file
  const outPath = path.join(__dirname, 'threads-cache.json');
  fs.writeFileSync(outPath, JSON.stringify(threads, null, 2));
  
  console.log(`✅ Rebuilt ${Object.keys(threads).length} threads`);
  console.log(`📧 Total messages: ${totalMessages}`);
  console.log(`💾 Saved to threads-cache.json`);
  
  // Show sample
  const sample = Object.entries(threads).find(([email]) => email.includes('rewardify'));
  if (sample) {
    console.log(`\n📋 Sample (${sample[0]}): ${sample[1].messageCount} messages`);
  }
}

rebuild().catch(console.error);
