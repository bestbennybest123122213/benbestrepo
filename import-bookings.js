#!/usr/bin/env node
/**
 * Import Imann booking data from CSV to Supabase
 * Usage: node import-bookings.js /path/to/csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initSupabase } = require('./lib/supabase');

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse date in various formats
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  // Clean up the string
  dateStr = dateStr.trim().replace(/\n/g, '');
  
  // Try MM/DD/YYYY HH:MM format
  const match1 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (match1) {
    const [_, month, day, year, hour, min] = match1;
    return new Date(year, month - 1, day, hour, min);
  }
  
  // Try MM/DD/YY HH:MM format
  const match2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (match2) {
    const [_, month, day, year, hour, min] = match2;
    const fullYear = parseInt(year) > 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
    return new Date(fullYear, month - 1, day, hour, min);
  }
  
  // Try MM/DD/YYYY format (date only)
  const match3 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match3) {
    const [_, month, day, year] = match3;
    return new Date(year, month - 1, day);
  }
  
  // Try MM/DD/YY format (date only)
  const match4 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (match4) {
    const [_, month, day, year] = match4;
    const fullYear = parseInt(year) > 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
    return new Date(fullYear, month - 1, day);
  }
  
  return null;
}

// Parse ERT like "1:39:00" to seconds
function parseERT(ertStr) {
  if (!ertStr || ertStr.trim() === '') return null;
  
  const match = ertStr.match(/(\d+):(\d{2}):(\d{2})/);
  if (match) {
    const [_, hours, mins, secs] = match;
    return parseInt(hours) * 3600 + parseInt(mins) * 60 + parseInt(secs);
  }
  return null;
}

// Month name to number
const monthMap = {
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
};

async function importBookings(csvPath) {
  const client = initSupabase();
  if (!client) {
    console.error('Failed to initialize Supabase');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  
  // Parse CSV properly handling quoted fields with newlines
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    if (char === '"') inQuotes = !inQuotes;
    if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) lines.push(currentLine);
      currentLine = '';
    } else if (char !== '\r') {
      currentLine += char;
    }
  }
  if (currentLine.trim()) lines.push(currentLine);
  
  console.log('Parsed', lines.length, 'CSV lines');
  
  // Known column positions from the Imann CSV (headers have multiline values)
  // 0: Name, 1: Email, 2: Company, 3: Website, 4: Category, 5: Status
  // 6: Conversation [Month], 7: Conversation [Year], 8: Converstaion [MM/DD/YY]
  // 9: Lead Response, 10: Response Time, 11: ERT, 12: Follow Up date
  // 13: Date of meeting (EST), 14: Notes
  const nameIdx = 0;
  const emailIdx = 1;
  const companyIdx = 2;
  const websiteIdx = 3;
  const categoryIdx = 4;
  const statusIdx = 5;
  const convMonthIdx = 6;
  const convYearIdx = 7;
  const convDateIdx = 8;
  const leadRespIdx = 9;
  const ourRespIdx = 10;
  const ertIdx = 11;
  const meetingIdx = 13;
  const notesIdx = 14;
  
  console.log('Using fixed column indices for Imann CSV');
  
  const records = [];
  let skipped = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    
    const email = cols[emailIdx]?.trim().replace(/\n/g, '');
    const status = cols[statusIdx]?.trim();
    
    // Skip rows without valid email or status
    if (!email || !email.includes('@') || !status) {
      skipped++;
      continue;
    }
    
    // Skip if status is not one we care about
    const validStatuses = ['Booked', 'Not booked', 'Scheduling', 'Non show up'];
    if (!validStatuses.includes(status)) {
      skipped++;
      continue;
    }
    
    const convMonth = cols[convMonthIdx]?.trim().toLowerCase();
    const convYear = parseInt(cols[convYearIdx]?.trim()) || 2025;
    const convDateStr = cols[convDateIdx]?.trim();
    const leadRespStr = cols[leadRespIdx]?.trim();
    const ourRespStr = cols[ourRespIdx]?.trim();
    const ertStr = cols[ertIdx]?.trim();
    const meetingStr = cols[meetingIdx]?.trim();
    
    const convDate = parseDate(convDateStr);
    const leadResp = parseDate(leadRespStr);
    const ourResp = parseDate(ourRespStr);
    const meeting = parseDate(meetingStr);
    const ertSeconds = parseERT(ertStr);
    
    records.push({
      name: cols[nameIdx]?.trim().replace(/\n/g, '') || null,
      email: email,
      company: cols[companyIdx]?.trim().replace(/\n/g, '') || null,
      website: cols[websiteIdx]?.trim().replace(/\n/g, '').replace(/^https?:\/\//, '') || null,
      category: cols[categoryIdx]?.trim() || 'Interested',
      status: status,
      conversation_month: convMonth ? convMonth.charAt(0).toUpperCase() + convMonth.slice(1) : null,
      conversation_year: convYear,
      conversation_date: convDate?.toISOString().split('T')[0] || null,
      lead_response_at: leadResp?.toISOString() || null,
      our_response_at: ourResp?.toISOString() || null,
      response_time_seconds: ertSeconds,
      meeting_date: meeting?.toISOString() || null,
      notes: cols[notesIdx]?.trim() || null
    });
  }
  
  console.log(`\nParsed ${records.length} valid records (skipped ${skipped})`);
  
  // Dedupe by email (keep the latest/last occurrence)
  const byEmail = new Map();
  for (const r of records) {
    byEmail.set(r.email.toLowerCase(), r);
  }
  const deduped = Array.from(byEmail.values());
  console.log(`After deduplication: ${deduped.length} unique emails`);
  
  // Show sample
  console.log('\nSample records:');
  deduped.slice(0, 3).forEach(r => {
    console.log(`  ${r.name} (${r.email}) - ${r.status} - ${r.conversation_month} ${r.conversation_year}`);
  });
  
  // Count by status
  const byCounts = {};
  for (const r of deduped) {
    byCounts[r.status] = (byCounts[r.status] || 0) + 1;
  }
  console.log('\nBy status:', byCounts);
  
  // Upsert to Supabase
  console.log('\nUpserting to Supabase...');
  
  const { data, error } = await client
    .from('imann_positive_replies')
    .upsert(deduped, { 
      onConflict: 'email',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('Upsert error:', error);
    
    // If table doesn't exist, show create statement
    if (error.message.includes('does not exist')) {
      console.log('\n⚠️  Table does not exist. Please run this SQL first:');
      console.log(fs.readFileSync(path.join(__dirname, 'BOOKING_SCHEMA.sql'), 'utf8'));
    }
    process.exit(1);
  }
  
  console.log(`✅ Successfully imported ${deduped.length} records`);
  
  // Quick stats
  const { data: stats } = await client
    .from('imann_positive_replies')
    .select('status', { count: 'exact' });
  
  const { count: totalCount } = await client
    .from('imann_positive_replies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\nTotal records in table: ${totalCount}`);
}

// Run
const csvPath = process.argv[2] || '/Users/ben/.clawdbot/media/inbound/245e0cca-db75-48fc-868b-8f64a2616669.csv';
importBookings(csvPath).catch(console.error);
