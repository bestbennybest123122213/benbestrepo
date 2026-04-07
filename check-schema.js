const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Columns:', Object.keys(data[0] || {}));
  console.log('\nSample row:', JSON.stringify(data[0], null, 2));
}

checkSchema();
