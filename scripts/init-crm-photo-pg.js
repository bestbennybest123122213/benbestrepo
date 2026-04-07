#!/usr/bin/env node
// Create CRM Photo table via direct PostgreSQL connection

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:HUWCP0mlzUiTQqMo@db.rwhqshjmngkyremwandx.supabase.co:5432/postgres';

async function createTable() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Create the table
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS crm_photo (
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
    `;
    
    await client.query(createTableSQL);
    console.log('Table crm_photo created (or already exists)');
    
    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_crm_photo_email ON crm_photo(email);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_crm_photo_domain ON crm_photo(domain);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_crm_photo_company ON crm_photo(company);');
    console.log('Indexes created');
    
    // Check row count
    const result = await client.query('SELECT COUNT(*) as count FROM crm_photo;');
    console.log(`Table has ${result.rows[0].count} rows`);
    
    // Grant permissions
    await client.query(`
      GRANT ALL ON crm_photo TO postgres;
      GRANT ALL ON crm_photo TO anon;
      GRANT ALL ON crm_photo TO authenticated;
      GRANT ALL ON crm_photo TO service_role;
    `);
    console.log('Permissions granted');
    
    console.log('\n✅ CRM Photo table ready!');
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTable();
