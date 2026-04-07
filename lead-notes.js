#!/usr/bin/env node
/**
 * Lead Notes Manager
 * 
 * Add, view, and manage notes on leads for better follow-up context.
 * 
 * Usage:
 *   node lead-notes.js <email>                  # View notes for lead
 *   node lead-notes.js <email> add "note"       # Add a note
 *   node lead-notes.js recent                   # Recent notes
 *   node lead-notes.js search <term>            # Search notes
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const NOTES_FILE = path.join(__dirname, 'lead-notes.json');

async function main() {
  const client = initSupabase();
  if (!client) {
    console.error('❌ Database not initialized');
    process.exit(1);
  }

  // Load notes
  let notes = {};
  try {
    notes = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
  } catch (e) {
    notes = {};
  }

  if (args.length === 0) {
    showHelp();
    return;
  }

  const action = args[0];

  if (action === 'recent') {
    showRecent(notes);
    return;
  }

  if (action === 'search' && args[1]) {
    searchNotes(notes, args[1]);
    return;
  }

  // Otherwise, first arg is email
  const email = action;
  const subAction = args[1];
  const noteText = args.slice(2).join(' ');

  // Find lead
  const { data: lead } = await client
    .from('positive_replies')
    .select('*')
    .eq('lead_email', email)
    .single();

  if (!lead) {
    console.log(`❌ No lead found with email: ${email}`);
    console.log('');
    console.log('Try searching by partial email or name.');
    return;
  }

  if (subAction === 'add' && noteText) {
    addNote(notes, email, noteText, lead);
  } else {
    viewNotes(notes, lead);
  }
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📝 LEAD NOTES MANAGER                                                   ║
╚══════════════════════════════════════════════════════════════════════════╝

  Usage:
    node lead-notes.js <email>                  # View notes for lead
    node lead-notes.js <email> add "note"       # Add a note
    node lead-notes.js recent                   # Recent notes
    node lead-notes.js search <term>            # Search notes

  Examples:
    node lead-notes.js nick.depalo@unity.com
    node lead-notes.js nick.depalo@unity.com add "Mentioned interested in Q2"
    node lead-notes.js search "enterprise"
`);
}

function viewNotes(notes, lead) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📝 LEAD NOTES                                                           ║
╚══════════════════════════════════════════════════════════════════════════╝

  👤 ${lead.lead_name}
  📧 ${lead.lead_email}
  🏢 ${lead.lead_company || 'Unknown'}
  📊 ${lead.reply_category} | ${getAgeDays(lead.replied_at)} days ago
`);

  const leadNotes = notes[lead.lead_email] || [];

  if (leadNotes.length === 0) {
    console.log('  📭 No notes yet.');
    console.log('');
    console.log(`  Add one: node lead-notes.js ${lead.lead_email} add "your note"`);
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 NOTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    leadNotes.forEach((note, i) => {
      const date = new Date(note.date).toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      console.log(`  ${i + 1}. [${date}]`);
      console.log(`     ${note.text}`);
      console.log('');
    });
  }

  console.log('');
}

function addNote(notes, email, noteText, lead) {
  if (!notes[email]) {
    notes[email] = [];
  }

  const newNote = {
    text: noteText,
    date: new Date().toISOString()
  };

  notes[email].push(newNote);
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));

  console.log(`
✅ Note added for ${lead.lead_name}

  "${noteText}"

Total notes for this lead: ${notes[email].length}
`);
}

function showRecent(notes) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📝 RECENT NOTES                                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  // Flatten and sort by date
  const allNotes = [];
  Object.entries(notes).forEach(([email, leadNotes]) => {
    leadNotes.forEach(note => {
      allNotes.push({ email, ...note });
    });
  });

  allNotes.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allNotes.length === 0) {
    console.log('  No notes yet. Add some!');
    console.log('');
    return;
  }

  allNotes.slice(0, 10).forEach(note => {
    const date = new Date(note.date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric' 
    });
    console.log(`  [${date}] ${note.email}`);
    console.log(`    ${note.text.slice(0, 60)}${note.text.length > 60 ? '...' : ''}`);
    console.log('');
  });

  console.log(`  Total: ${allNotes.length} notes across ${Object.keys(notes).length} leads`);
  console.log('');
}

function searchNotes(notes, term) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 SEARCH RESULTS: "${term}"                                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const termLower = term.toLowerCase();
  const matches = [];

  Object.entries(notes).forEach(([email, leadNotes]) => {
    leadNotes.forEach(note => {
      if (note.text.toLowerCase().includes(termLower)) {
        matches.push({ email, ...note });
      }
    });
  });

  if (matches.length === 0) {
    console.log(`  No notes found containing "${term}"`);
    console.log('');
    return;
  }

  console.log(`  Found ${matches.length} matches:\n`);

  matches.forEach(note => {
    const date = new Date(note.date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric' 
    });
    console.log(`  [${date}] ${note.email}`);
    console.log(`    ${note.text}`);
    console.log('');
  });
}

function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
