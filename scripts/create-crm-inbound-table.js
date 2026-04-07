const { Pool } = require('pg');
require('dotenv').config();

const projectRef = 'rwhqshjmngkyremwandx';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

// Try direct database connection
const connectionString = `postgres://postgres:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`;

async function createTable() {
  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const client = await pool.connect();
    console.log('Connected to database!');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_imman_inbound (
        id SERIAL PRIMARY KEY,
        date_first_response TEXT,
        date_first_call TEXT,
        year TEXT,
        month TEXT,
        name TEXT,
        email TEXT,
        company TEXT,
        company_url TEXT,
        sales_person TEXT DEFAULT 'jan',
        first_call_show_up TEXT,
        financially_qualified TEXT,
        first_call_qualified TEXT,
        second_call_show_up TEXT,
        sale TEXT,
        date_of_close TEXT,
        deal_closed_amount TEXT,
        cash_upfront TEXT,
        commission TEXT,
        follow_up_date TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    console.log('Table crm_imman_inbound created successfully!');
    
    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crm_imman_inbound_email ON crm_imman_inbound(email);
    `);
    console.log('Index created successfully!');
    
    client.release();
    await pool.end();
  } catch (err) {
    console.log('Error:', err.message);
    process.exit(1);
  }
}

createTable();
