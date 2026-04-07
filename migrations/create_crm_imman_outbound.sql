-- Create CRM Imman Outbound table
CREATE TABLE IF NOT EXISTS crm_imman_outbound (
  id SERIAL PRIMARY KEY,
  date_first_response TEXT,
  date_first_call TEXT,
  year TEXT,
  month TEXT,
  name TEXT,
  email TEXT UNIQUE,
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

-- Enable RLS
ALTER TABLE crm_imman_outbound ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all for service role" ON crm_imman_outbound
  FOR ALL USING (true) WITH CHECK (true);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_crm_imman_email ON crm_imman_outbound(email);
