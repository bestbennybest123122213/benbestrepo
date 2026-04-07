#!/usr/bin/env node
// Import all lead CSVs to Supabase imann_positive_replies table
// Sources: cold_email, reactivation, inbound

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// CSV files and their sources
const files = [
  { path: '/Users/ben/.clawdbot/media/inbound/295ba826-87cb-4af3-9548-776366cb5ead.csv', source: 'cold_email', name: 'CE' },
  { path: '/Users/ben/.clawdbot/media/inbound/b0fd1eab-7fd1-432f-a4d0-f8d3201ba132.csv', source: 'reactivation', name: 'GM' },
  { path: '/Users/ben/.clawdbot/media/inbound/9d2775e7-fbff-4c46-bc4f-b44793cf4c40.csv', source: 'inbound', name: 'IMN' },
  { path: '/Users/ben/.clawdbot/media/inbound/65ea07cf-50c7-46e3-85d4-475b38c81332.csv', source: 'inbound', name: 'ILIM' }
];

function parseCSV(content) {
  const lines = content.split('\n');
  const leads = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV with proper quote handling
    const fields = [];
    let field = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field.trim());
    
    // Extract fields: Name, Email, Company, Website, Category, Status, Month, Year, Date, Lead Response, Response Time, ERT, Follow Up, Meeting Date, Notes
    const [name, email, company, website, category, status, month, year, convDate, leadResponse, responseTime, ert, followUp, meetingDate, notes] = fields;
    
    // Skip rows without email (dashboard rows, empty rows)
    if (!email || !email.includes('@')) continue;
    
    leads.push({
      name: name || '',
      email: email.toLowerCase().trim(),
      company: company || '',
      website: website || '',
      category: category || 'Interested',
      status: status || 'Scheduling',
      conversation_month: month || '',
      conversation_year: year ? parseInt(year) : new Date().getFullYear(),
      conversation_date: convDate ? parseDate(convDate) : null,
      lead_response_time: leadResponse || null,
      our_response_time: responseTime || null,
      meeting_date: meetingDate ? parseDateTime(meetingDate) : null,
      notes: notes || ''
    });
  }
  
  return leads;
}

function parseDate(str) {
  if (!str) return null;
  // Handle MM/DD/YYYY format
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [_, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function parseDateTime(str) {
  if (!str) return null;
  // Handle MM/DD/YYYY HH:MM format
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}):(\d{2})?/);
  if (match) {
    const [_, month, day, year, hour, minute] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${(hour || '12').padStart(2, '0')}:${(minute || '00').padStart(2, '0')}:00`;
  }
  // Try just date
  return parseDate(str) ? parseDate(str) + 'T12:00:00' : null;
}

async function importFile(file) {
  console.log(`\n📂 Importing ${file.name} (${file.source})...`);
  
  const content = fs.readFileSync(file.path, 'utf8');
  const leads = parseCSV(content);
  
  console.log(`   Found ${leads.length} valid leads`);
  
  let imported = 0;
  let errors = 0;
  
  for (const lead of leads) {
    // Prepend source tag to notes if not already there
    const sourceTag = `[${file.source}]`;
    let notesWithSource = lead.notes || '';
    if (!notesWithSource.includes(sourceTag)) {
      notesWithSource = sourceTag + (notesWithSource ? ' ' + notesWithSource : '');
    }
    
    const record = {
      email: lead.email,
      name: lead.name,
      company: lead.company,
      category: lead.category,
      status: lead.status,
      conversation_date: lead.conversation_date,
      conversation_month: lead.conversation_month,
      conversation_year: lead.conversation_year,
      meeting_date: lead.meeting_date,
      notes: notesWithSource,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('imann_positive_replies')
      .upsert(record, { onConflict: 'email' });
    
    if (error) {
      console.error(`   ❌ Error for ${lead.email}: ${error.message}`);
      errors++;
    } else {
      imported++;
    }
  }
  
  console.log(`   ✅ Imported: ${imported}, Errors: ${errors}`);
  return { imported, errors, total: leads.length };
}

async function main() {
  console.log('🚀 Starting bulk import...\n');
  
  let totalImported = 0;
  let totalErrors = 0;
  let totalLeads = 0;
  
  for (const file of files) {
    const result = await importFile(file);
    totalImported += result.imported;
    totalErrors += result.errors;
    totalLeads += result.total;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 IMPORT COMPLETE`);
  console.log(`   Total leads processed: ${totalLeads}`);
  console.log(`   Successfully imported: ${totalImported}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log('='.repeat(50));
  
  // Get unique count
  const { count } = await supabase
    .from('imann_positive_replies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📈 Total unique leads in database: ${count}`);
}

main().catch(console.error);
