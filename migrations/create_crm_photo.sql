-- CRM Photo Table for Photography Business Leads
-- Based on crm_imman_outbound structure

CREATE TABLE IF NOT EXISTS crm_photo (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  company VARCHAR(255),
  email VARCHAR(255),
  domain VARCHAR(255),
  website VARCHAR(500),
  
  -- Pipeline stages (Yes/No)
  show_up VARCHAR(10),              -- Did they show up for first call?
  financially_qualified VARCHAR(10), -- Can they afford services?
  call_qualified VARCHAR(10),        -- Are they a good fit?
  second_call VARCHAR(10),           -- Had second call?
  sale VARCHAR(10),                  -- Did we close?
  
  -- Dates
  date_first_response VARCHAR(50),
  date_first_call VARCHAR(50),
  close_date VARCHAR(50),
  
  -- Financials
  deal_value DECIMAL(12, 2),
  cash_upfront DECIMAL(12, 2),
  commission DECIMAL(12, 2),
  
  -- Notes
  notes TEXT,
  sales_person VARCHAR(100) DEFAULT 'jan',
  source VARCHAR(100) DEFAULT 'outbound',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for searching
CREATE INDEX IF NOT EXISTS idx_crm_photo_email ON crm_photo(email);
CREATE INDEX IF NOT EXISTS idx_crm_photo_domain ON crm_photo(domain);
CREATE INDEX IF NOT EXISTS idx_crm_photo_company ON crm_photo(company);

-- Enable RLS (Row Level Security) - disabled for now since we access via service key
-- ALTER TABLE crm_photo ENABLE ROW LEVEL SECURITY;

-- Grant access
GRANT ALL ON crm_photo TO postgres;
GRANT ALL ON crm_photo TO anon;
GRANT ALL ON crm_photo TO authenticated;
GRANT ALL ON crm_photo TO service_role;
