require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function upload() {
  // Load local curated data
  const localData = JSON.parse(fs.readFileSync('data/positive-replies-processed.json', 'utf8'));
  console.log('Local data:', localData.leads.length, 'leads');
  
  // Check if table exists, create if not
  const { error: checkError } = await supabase.from('curated_leads').select('id').limit(1);
  
  if (checkError && checkError.code === '42P01') {
    console.log('Table does not exist. Please create it first with:');
    console.log(`
CREATE TABLE curated_leads (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  company TEXT,
  domain TEXT,
  category TEXT,
  status TEXT,
  conv_date TEXT,
  conv_month TEXT,
  conv_year TEXT,
  lead_response TIMESTAMPTZ,
  response_time TIMESTAMPTZ,
  ert_seconds INTEGER,
  ert TEXT,
  meeting_date TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_curated_status ON curated_leads(status);
CREATE INDEX idx_curated_email ON curated_leads(email);
    `);
    return;
  }
  
  // Parse ERT to seconds
  function ertToSeconds(ert) {
    if (!ert) return null;
    const parts = ert.split(':').map(Number);
    if (parts.length < 2) return null;
    return parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  
  // Parse date string to ISO
  function parseDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d+)\/(\d+)\/(\d+)\s*(\d+)?:?(\d+)?/);
    if (!match) return null;
    const [_, month, day, year, hour, min] = match;
    const fullYear = parseInt(year) < 100 ? 2000 + parseInt(year) : parseInt(year);
    const date = new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hour || 0), parseInt(min || 0));
    return date.toISOString();
  }
  
  // Transform leads
  const records = localData.leads.map(l => ({
    email: l.email,
    name: l.name,
    company: l.company || l.domain,
    domain: l.domain,
    category: l.category,
    status: l.status,
    conv_date: l.conv_date,
    conv_month: l.conv_month,
    conv_year: l.conv_year,
    lead_response: parseDate(l.lead_response),
    response_time: parseDate(l.response_time),
    ert_seconds: ertToSeconds(l.ert),
    ert: l.ert,
    meeting_date: l.meeting_date,
    notes: l.notes,
    source: l.source || 'curated_spreadsheet'
  }));
  
  console.log('Uploading', records.length, 'records...');
  
  // Upsert in batches
  const batchSize = 50;
  let uploaded = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from('curated_leads').upsert(batch, { onConflict: 'email' });
    if (error) {
      console.error('Error uploading batch:', error.message);
    } else {
      uploaded += batch.length;
      console.log('Uploaded', uploaded, '/', records.length);
    }
  }
  
  console.log('Done! Uploaded', uploaded, 'leads to curated_leads table');
}

upload();
