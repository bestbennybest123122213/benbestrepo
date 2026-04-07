// Add 'open' column to crm_imman_outbound table
const { initSupabase } = require('../lib/supabase');

async function addOpenColumn() {
  const supabase = initSupabase();
  if (!supabase) {
    console.error('Supabase not initialized');
    process.exit(1);
  }

  // First, let's check current table structure by fetching one row
  const { data: sample, error: sampleError } = await supabase
    .from('crm_imman_outbound')
    .select('*')
    .limit(1);
  
  if (sampleError) {
    console.error('Error fetching sample:', sampleError);
    process.exit(1);
  }

  console.log('Current columns:', sample && sample[0] ? Object.keys(sample[0]) : 'no data');
  
  // Check if 'open' column exists
  if (sample && sample[0] && 'open' in sample[0]) {
    console.log('Column "open" already exists!');
    process.exit(0);
  }

  // Add the column using Supabase RPC or raw SQL
  // Since we can't alter tables directly via the client, we'll need to use the SQL editor
  // But we can test if it already exists by trying an update
  
  const { data: testData, error: testError } = await supabase
    .from('crm_imman_outbound')
    .select('id, open')
    .limit(1);
  
  if (testError && testError.message.includes('column')) {
    console.log('Column "open" does not exist. Please run this SQL in Supabase dashboard:');
    console.log('ALTER TABLE crm_imman_outbound ADD COLUMN IF NOT EXISTS open TEXT;');
  } else {
    console.log('Column "open" exists or test passed');
    console.log('Test result:', testData);
  }
}

addOpenColumn().catch(console.error);
