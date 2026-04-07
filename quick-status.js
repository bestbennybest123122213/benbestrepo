#!/usr/bin/env node
/**
 * Quick Status - One-liner pipeline status
 * 
 * Ultra-fast status check for busy days.
 * 
 * Usage:
 *   node quick-status.js    # One-line status
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function quickStatus() {
  const client = initSupabase();
  if (!client) {
    console.log('❌ Database offline');
    return;
  }

  const now = Date.now();

  // Get pending leads
  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .eq('follow_up_status', 'pending')
    .neq('reply_category', 'Booked');

  const pending = leads?.length || 0;
  
  // Count by age
  const hot = (leads || []).filter(l => {
    const age = l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age <= 3;
  }).length;

  const warm = (leads || []).filter(l => {
    const age = l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    return age > 3 && age <= 7;
  }).length;

  // Status emoji based on hot leads
  const status = hot > 0 ? '🔴' : warm > 0 ? '🟡' : '🟢';

  // Build one-liner
  let line = `${status} `;
  
  if (hot > 0) {
    line += `${hot} HOT | `;
  }
  if (warm > 0) {
    line += `${warm} warm | `;
  }
  
  line += `${pending} pending`;

  if (hot > 0) {
    line += ' → Run: gex queue';
  }

  console.log(line);
}

quickStatus().catch(() => {
  console.log('❌ Error');
  process.exit(1);
});
