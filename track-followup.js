#!/usr/bin/env node
/**
 * Track Follow-Up - Mark a lead as contacted
 * Usage: node track-followup.js <email> [notes]
 * 
 * Example: node track-followup.js olli@rovio.com "Sent re-engagement email"
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function trackFollowup(email, notes) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  
  // Get current lead
  const { data: lead, error: fetchError } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('email', email)
    .single();
  
  if (fetchError || !lead) {
    console.log(`❌ Lead not found: ${email}`);
    return;
  }
  
  // Update notes with follow-up timestamp
  const followupNote = `[Followed up ${dateStr}]${notes ? ' ' + notes : ''}`;
  const existingNotes = lead.notes || '';
  const newNotes = existingNotes 
    ? existingNotes + '\n' + followupNote 
    : followupNote;
  
  const { error: updateError } = await supabase
    .from('imann_positive_replies')
    .update({ 
      notes: newNotes,
      updated_at: now.toISOString()
    })
    .eq('email', email);
  
  if (updateError) {
    console.log(`❌ Error updating: ${updateError.message}`);
    return;
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✅ FOLLOW-UP TRACKED                                         ║
╚══════════════════════════════════════════════════════════════╝

Lead:    ${lead.name || 'Unknown'} @ ${lead.company || 'Unknown'}
Email:   ${email}
Status:  ${lead.status}
Date:    ${dateStr}
${notes ? `Notes:   ${notes}` : ''}

Updated notes:
${newNotes}
`);
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`
Usage: node track-followup.js <email> [notes]

Examples:
  node track-followup.js olli@rovio.com
  node track-followup.js olli@rovio.com "Sent re-engagement email"
  node track-followup.js tala@repl.it "Called, voicemail"
`);
  process.exit(1);
}

const email = args[0];
const notes = args.slice(1).join(' ');

trackFollowup(email, notes);
