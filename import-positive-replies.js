#!/usr/bin/env node
/**
 * Import positive replies from CSV to Supabase
 * Handles deduplication by email and domain
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Status ranking (higher = better)
const STATUS_RANK = { 'Booked': 4, 'Non show up': 3, 'Scheduling': 2, 'Not booked': 1 };

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Skip header row
  const leads = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    
    // Parse CSV row handling quoted fields
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < row.length; j++) {
      const char = row[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    // Extract fields
    const email = (values[1] || '').replace(/[\n\r]/g, '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    
    const status = (values[5] || '').trim();
    // Skip invalid statuses (dashboard rows)
    if (!STATUS_RANK[status] && status !== 'Booked' && status !== 'Scheduling' && status !== 'Not booked' && status !== 'Non show up') {
      continue;
    }
    
    const domain = email.split('@')[1];
    const name = (values[0] || '').trim();
    const company = (values[2] || '').trim();
    const website = (values[3] || '').replace(/[\n\r]/g, '').trim();
    const category = (values[4] || '').trim();
    const convMonth = (values[6] || '').trim();
    const convYear = (values[7] || '').trim();
    const convDate = (values[8] || '').trim();
    const leadResponse = (values[9] || '').trim();
    const responseTime = (values[10] || '').trim();
    const ert = (values[11] || '').trim();
    const followUpDate = (values[12] || '').trim();
    const meetingDate = (values[13] || '').trim();
    const notes = (values[14] || '').trim();
    
    leads.push({
      name,
      email,
      domain,
      company,
      website,
      category,
      status,
      conv_month: convMonth,
      conv_year: convYear,
      conv_date: convDate,
      lead_response: leadResponse,
      response_time: responseTime,
      ert,
      follow_up_date: followUpDate,
      meeting_date: meetingDate,
      notes
    });
  }
  
  return leads;
}

function deduplicateByEmail(leads) {
  const byEmail = {};
  
  for (const lead of leads) {
    const existing = byEmail[lead.email];
    if (!existing || (STATUS_RANK[lead.status] || 0) > (STATUS_RANK[existing.status] || 0)) {
      byEmail[lead.email] = lead;
    }
  }
  
  return Object.values(byEmail);
}

function deduplicateByDomain(leads) {
  // Find domains with booked leads
  const bookedDomains = new Set();
  for (const lead of leads) {
    if (lead.status === 'Booked' || lead.status === 'Non show up') {
      bookedDomains.add(lead.domain);
    }
  }
  
  // Keep only: booked leads OR leads from domains without any booking
  return leads.filter(lead => {
    if (lead.status === 'Booked' || lead.status === 'Non show up') return true;
    return !bookedDomains.has(lead.domain);
  });
}

function calculateStats(leads) {
  const stats = {
    total: leads.length,
    booked: leads.filter(l => l.status === 'Booked').length,
    non_show_up: leads.filter(l => l.status === 'Non show up').length,
    scheduling: leads.filter(l => l.status === 'Scheduling').length,
    not_booked: leads.filter(l => l.status === 'Not booked').length,
    booking_rate: 0,
    ert_stats: { under_15min: 0, under_1h: 0, under_24h: 0, over_24h: 0 }
  };
  
  stats.booking_rate = stats.total > 0 
    ? ((stats.booked + stats.non_show_up) / stats.total * 100).toFixed(1) 
    : 0;
  
  // Calculate ERT distribution
  for (const lead of leads) {
    if (!lead.ert) continue;
    const parts = lead.ert.split(':').map(Number);
    if (parts.length < 2) continue;
    const hours = parts[0] + (parts[1] || 0) / 60;
    
    if (hours < 0.25) stats.ert_stats.under_15min++;
    else if (hours < 1) stats.ert_stats.under_1h++;
    else if (hours < 24) stats.ert_stats.under_24h++;
    else stats.ert_stats.over_24h++;
  }
  
  return stats;
}

async function uploadToSupabase(leads, tableName = 'positive_replies') {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('Supabase credentials not found, skipping upload');
    return false;
  }
  
  try {
    // First, delete existing data
    const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      }
    });
    console.log('Delete existing:', deleteRes.status);
    
    // Insert new data in batches of 100
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize).map(l => ({
        name: l.name,
        email: l.email,
        domain: l.domain,
        company: l.company,
        website: l.website,
        category: l.category,
        status: l.status,
        conv_month: l.conv_month,
        conv_year: l.conv_year,
        conv_date: l.conv_date,
        lead_response: l.lead_response,
        response_time: l.response_time,
        ert: l.ert,
        follow_up_date: l.follow_up_date,
        meeting_date: l.meeting_date,
        notes: l.notes,
        created_at: new Date().toISOString()
      }));
      
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });
      
      if (!insertRes.ok) {
        const text = await insertRes.text();
        console.log(`Batch ${i/batchSize + 1} failed:`, insertRes.status, text);
      } else {
        console.log(`Batch ${i/batchSize + 1} inserted:`, batch.length, 'records');
      }
    }
    
    return true;
  } catch (e) {
    console.log('Supabase error:', e.message);
    return false;
  }
}

async function main() {
  const csvPath = path.join(__dirname, 'data', 'positive-replies.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(1);
  }
  
  console.log('Parsing CSV...');
  const rawLeads = parseCSV(csvPath);
  console.log('Raw leads:', rawLeads.length);
  
  console.log('\nDeduplicating by email...');
  const emailDeduped = deduplicateByEmail(rawLeads);
  console.log('After email dedup:', emailDeduped.length);
  
  console.log('\nDeduplicating by domain...');
  const domainDeduped = deduplicateByDomain(emailDeduped);
  console.log('After domain dedup:', domainDeduped.length);
  
  console.log('\nCalculating stats...');
  const stats = calculateStats(domainDeduped);
  console.log('Stats:', JSON.stringify(stats, null, 2));
  
  // Save processed data locally
  const outputPath = path.join(__dirname, 'data', 'positive-replies-processed.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    leads: domainDeduped,
    stats,
    processedAt: new Date().toISOString()
  }, null, 2));
  console.log('\nSaved to:', outputPath);
  
  // Try to upload to Supabase
  console.log('\nUploading to Supabase...');
  await uploadToSupabase(domainDeduped);
  
  console.log('\nDone!');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
