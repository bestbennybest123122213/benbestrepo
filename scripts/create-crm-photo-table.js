#!/usr/bin/env node
// Create CRM Photo table in Supabase

require('dotenv').config();
const { initSupabase } = require('../lib/supabase');

async function createTable() {
  const supabase = initSupabase();
  if (!supabase) {
    console.error('Failed to initialize Supabase');
    process.exit(1);
  }

  console.log('Creating crm_photo table...');

  // First, check if table exists
  const { data: existingData, error: checkError } = await supabase
    .from('crm_photo')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('Table crm_photo already exists!');
    console.log(`Found ${existingData?.length || 0} rows`);
    return;
  }

  // Table doesn't exist, create it using raw SQL via REST API
  // Since we can't run DDL directly, we'll try inserting a test record
  // which will fail if table doesn't exist
  
  console.log('Table does not exist. Please create it manually in Supabase SQL editor:');
  console.log('');
  console.log(`
CREATE TABLE crm_photo (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  company VARCHAR(255),
  email VARCHAR(255),
  domain VARCHAR(255),
  website VARCHAR(500),
  show_up VARCHAR(10),
  financially_qualified VARCHAR(10),
  call_qualified VARCHAR(10),
  second_call VARCHAR(10),
  sale VARCHAR(10),
  date_first_response VARCHAR(50),
  date_first_call VARCHAR(50),
  close_date VARCHAR(50),
  deal_value DECIMAL(12, 2),
  cash_upfront DECIMAL(12, 2),
  commission DECIMAL(12, 2),
  notes TEXT,
  sales_person VARCHAR(100) DEFAULT 'jan',
  source VARCHAR(100) DEFAULT 'outbound',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
  `);
  
  console.log('');
  console.log('After creating the table, run this script again to verify.');
}

createTable().catch(console.error);
