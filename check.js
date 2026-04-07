#!/usr/bin/env node
/**
 * Quick Check - Ultra-fast status in 2 seconds
 */
require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function quickCheck() {
  const client = initSupabase();
  const { data: leads } = await client.from('positive_replies').select('reply_category, replied_at');
  
  const booked = leads.filter(l => l.reply_category === 'Booked').length;
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request').length;
  const interested = leads.filter(l => l.reply_category === 'Interested').length;
  
  const fresh = leads.filter(l => {
    if (!l.replied_at) return false;
    const days = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days <= 7;
  }).length;
  
  const stale = leads.filter(l => {
    if (!l.replied_at) return false;
    const days = Math.floor((Date.now() - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24));
    return days > 14;
  }).length;
  
  console.log('📊 ' + leads.length + ' leads | 🎉 ' + booked + ' booked | 🤝 ' + meetings + ' meetings | 🆕 ' + fresh + ' fresh | ⏰ ' + stale + ' stale');
}

quickCheck().catch(() => console.log('Error - is server running?'));
