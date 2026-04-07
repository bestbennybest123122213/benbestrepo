#!/usr/bin/env node
/**
 * Import conversations from lead_conversations to bull_bro_inbox
 * and generate threads-cache.json
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function importConversations() {
  console.log('🐂 Importing conversations to Bull BRO\n');
  
  // Fetch all conversations from lead_conversations
  const { data: conversations, error } = await supabase
    .from('lead_conversations')
    .select('*')
    .order('last_reply_time', { ascending: false });
  
  if (error) {
    console.error('Error fetching conversations:', error);
    return;
  }
  
  console.log(`📋 Found ${conversations.length} conversations\n`);
  
  let imported = 0;
  const threadsCache = {};
  
  for (const conv of conversations) {
    // Parse messages from JSON
    const messages = typeof conv.messages === 'string' 
      ? JSON.parse(conv.messages) 
      : conv.messages || [];
    
    // Extract reply text from lead's messages
    const leadReplies = messages.filter(m => 
      m.type === 'REPLY' || m.type === 'RECEIVED' || 
      (m.from && !m.from.toLowerCase().includes('imman'))
    );
    
    const replyText = leadReplies.map(m => {
      const body = m.email_body || m.body || m.text || '';
      return body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n\n---\n\n');
    
    // Format thread for cache
    const thread = messages.map(m => ({
      from: m.type === 'SENT' || (m.from && m.from.toLowerCase().includes('imman')) 
        ? 'Imman' 
        : conv.name || conv.email,
      date: m.time || m.sent_time || m.date,
      subject: m.subject,
      body: (m.email_body || m.body || m.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }));
    
    // Upsert to bull_bro_inbox
    const { error: upsertError } = await supabase
      .from('bull_bro_inbox')
      .upsert({
        smartlead_id: `${conv.email}-${conv.campaign_id}`,
        email: conv.email,
        first_name: conv.name?.split(' ')[0] || '',
        company: conv.company || '',
        campaign_name: conv.campaign_name || '',
        reply_text: replyText.substring(0, 4000) || 'No reply text',
        reply_category: conv.category || 'Unknown',
        reply_date: conv.last_reply_time
      }, { onConflict: 'smartlead_id' });
    
    if (!upsertError) {
      imported++;
      
      // Add to threads cache
      threadsCache[conv.email] = {
        lead: conv.name,
        campaign: conv.campaign_name,
        category: conv.category,
        is_booked: conv.is_booked || false,
        is_golden: conv.is_golden_standard || false,
        messages: thread
      };
    } else {
      console.log(`  ⚠️ Error for ${conv.email}: ${upsertError.message}`);
    }
    
    if (imported % 100 === 0) {
      console.log(`  ... ${imported} imported`);
    }
  }
  
  // Save threads cache
  const cachePath = path.join(__dirname, 'threads-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(threadsCache, null, 2));
  
  console.log(`\n✅ Imported ${imported} conversations`);
  console.log(`💾 Saved ${Object.keys(threadsCache).length} threads to threads-cache.json`);
  
  // Stats
  const { count } = await supabase.from('bull_bro_inbox').select('*', { count: 'exact', head: true });
  console.log(`\n📊 Total in bull_bro_inbox: ${count}`);
}

importConversations().catch(console.error);
