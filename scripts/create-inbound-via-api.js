const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://rwhqshjmngkyremwandx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInboundTable() {
  // Try to query the inbound table to see if it exists
  const { data, error } = await supabase
    .from('crm_imman_inbound')
    .select('id')
    .limit(1);
  
  if (error) {
    console.log('Table does not exist or error:', error.message);
    console.log('Please create the table manually in Supabase dashboard:');
    console.log('Go to: https://supabase.com/dashboard/project/rwhqshjmngkyremwandx/sql/new');
    console.log('And run the SQL from migrations/create_crm_imman_inbound.sql');
  } else {
    console.log('Table crm_imman_inbound exists!');
    console.log('Current rows:', data.length === 0 ? 'Empty' : data.length);
  }
}

testInboundTable();
