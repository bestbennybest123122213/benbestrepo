-- Create curated_leads table (single source of truth for dashboard)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
-- 
-- IMPORTANT: This table allows MULTIPLE entries with the same email!
-- Same lead contacting multiple times = multiple rows.
-- Use aggregate queries (COUNT DISTINCT) for unique lead counts.
-- See migrations/004_allow_duplicate_emails.sql for the migration.

CREATE TABLE IF NOT EXISTS curated_leads (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,  -- NOT UNIQUE - allows multiple entries per email
  name TEXT,
  company TEXT,
  domain TEXT,
  category TEXT,
  status TEXT,  -- Booked, Scheduling, Not booked
  conv_date TEXT,
  conv_month TEXT,
  conv_year TEXT,
  lead_response TIMESTAMPTZ,  -- When lead replied
  response_time TIMESTAMPTZ,  -- When we responded
  ert_seconds INTEGER,        -- Response time in seconds
  ert TEXT,                   -- Response time as HH:MM:SS
  meeting_date TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curated_status ON curated_leads(status);
CREATE INDEX IF NOT EXISTS idx_curated_email ON curated_leads(email);
CREATE INDEX IF NOT EXISTS idx_curated_lead_response ON curated_leads(lead_response);

-- Enable RLS
ALTER TABLE curated_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON curated_leads FOR ALL USING (true) WITH CHECK (true);
