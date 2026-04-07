#!/usr/bin/env node
require('dotenv').config();

const sql = `
CREATE TABLE IF NOT EXISTS imann_positive_replies (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  category TEXT DEFAULT 'Interested',
  status TEXT NOT NULL,
  conversation_month TEXT,
  conversation_year INTEGER,
  conversation_date DATE,
  lead_response_at TIMESTAMPTZ,
  our_response_at TIMESTAMPTZ,
  response_time_seconds INTEGER,
  meeting_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)`;

const { Pool } = require('pg');

// Try different connection methods
async function createTable() {
  // Method 1: Try pooler connection
  const projectRef = 'rwhqshjmngkyremwandx';
  
  // Get database password from Supabase - typically stored separately
  // For now, try using the service key as password (won't work but let's see)
  
  // Method 2: Try via supabase-js experimental SQL
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  // Try RPC call if there's a function
  console.log('Attempting to create table via Supabase...');
  
  // Last resort: output instructions
  console.log('\n📋 Please run this SQL in Supabase Dashboard > SQL Editor:\n');
  console.log(sql);
  console.log('\n');
  
  // Check if table exists now
  const { data, error } = await supabase
    .from('imann_positive_replies')
    .select('id')
    .limit(1);
  
  if (error && error.message.includes('does not exist')) {
    console.log('❌ Table does not exist yet. Please create it manually.');
    console.log('\n🔗 Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
  } else if (error) {
    console.log('Error checking table:', error.message);
  } else {
    console.log('✅ Table already exists!');
  }
}

createTable().catch(console.error);
