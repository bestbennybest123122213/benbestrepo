-- Migration: Allow duplicate emails in curated_leads
-- Purpose: Store every interaction as a new row, same lead can have multiple entries
-- Date: 2025-03-31
-- Issue: System was deduplicating by email, merging multiple contacts from same lead

-- Remove the UNIQUE constraint on email column
-- This allows multiple rows with the same email address
ALTER TABLE curated_leads DROP CONSTRAINT IF EXISTS curated_leads_email_key;

-- Also drop any unique index on email if it exists separately
DROP INDEX IF EXISTS curated_leads_email_key;
DROP INDEX IF EXISTS idx_curated_leads_email_unique;

-- Keep the regular index for performance (non-unique)
-- The idx_curated_email index already exists and is not unique
-- CREATE INDEX IF NOT EXISTS idx_curated_email ON curated_leads(email);

-- Add a comment to the table explaining the change
COMMENT ON TABLE curated_leads IS 'Stores ALL lead interactions including repeat contacts. Same email can appear multiple times. Use aggregate queries for unique lead counts.';

-- Create a view for unique lead counts (computed/summary layer)
CREATE OR REPLACE VIEW curated_leads_summary AS
SELECT 
  COUNT(*) as total_entries,
  COUNT(DISTINCT email) as unique_leads,
  COUNT(DISTINCT domain) as unique_domains,
  COUNT(CASE WHEN status = 'Booked' THEN 1 END) as total_booked,
  COUNT(DISTINCT CASE WHEN status = 'Booked' THEN email END) as unique_booked,
  COUNT(CASE WHEN status = 'Scheduling' THEN 1 END) as total_scheduling,
  COUNT(DISTINCT CASE WHEN status = 'Scheduling' THEN email END) as unique_scheduling,
  COUNT(CASE WHEN status = 'Not booked' THEN 1 END) as total_not_booked,
  COUNT(DISTINCT CASE WHEN status = 'Not booked' THEN email END) as unique_not_booked
FROM curated_leads;

-- Grant access to the view
GRANT SELECT ON curated_leads_summary TO anon, authenticated, service_role;
