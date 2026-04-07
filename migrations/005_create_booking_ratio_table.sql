-- Migration: Create booking_ratio table
-- Purpose: Store computed booking ratios based on Interested Leads data
-- Date: 2025-03-31

-- Create booking_ratio table for tracking historical booking metrics
CREATE TABLE IF NOT EXISTS booking_ratio (
  id SERIAL PRIMARY KEY,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'all_time'
  
  -- Raw counts (from curated_leads)
  total_entries INTEGER DEFAULT 0,           -- All rows
  unique_leads INTEGER DEFAULT 0,            -- Distinct emails
  unique_domains INTEGER DEFAULT 0,          -- Distinct domains
  
  -- Status breakdown (unique leads)
  unique_booked INTEGER DEFAULT 0,
  unique_scheduling INTEGER DEFAULT 0,
  unique_not_booked INTEGER DEFAULT 0,
  
  -- Status breakdown (total entries)
  total_booked INTEGER DEFAULT 0,
  total_scheduling INTEGER DEFAULT 0,
  total_not_booked INTEGER DEFAULT 0,
  
  -- Computed ratios (percentages)
  booking_rate_unique DECIMAL(5,2),          -- unique_booked / unique_leads * 100
  booking_rate_total DECIMAL(5,2),           -- total_booked / total_entries * 100
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  
  -- Unique constraint for period
  UNIQUE(period_start, period_end, period_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_ratio_period ON booking_ratio(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_booking_ratio_type ON booking_ratio(period_type);

-- Enable RLS
ALTER TABLE booking_ratio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON booking_ratio FOR ALL USING (true) WITH CHECK (true);

-- Function to compute and store booking ratio
CREATE OR REPLACE FUNCTION compute_booking_ratio(
  p_period_type TEXT DEFAULT 'all_time',
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_total_entries INTEGER;
  v_unique_leads INTEGER;
  v_unique_domains INTEGER;
  v_unique_booked INTEGER;
  v_unique_scheduling INTEGER;
  v_unique_not_booked INTEGER;
  v_total_booked INTEGER;
  v_total_scheduling INTEGER;
  v_total_not_booked INTEGER;
  v_booking_rate_unique DECIMAL(5,2);
  v_booking_rate_total DECIMAL(5,2);
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Set period bounds
  IF p_start_date IS NOT NULL THEN
    v_period_start := p_start_date;
  ELSE
    SELECT COALESCE(MIN(conv_date::date), CURRENT_DATE) INTO v_period_start FROM curated_leads;
  END IF;
  
  IF p_end_date IS NOT NULL THEN
    v_period_end := p_end_date;
  ELSE
    v_period_end := CURRENT_DATE;
  END IF;
  
  -- Compute stats
  SELECT 
    COUNT(*),
    COUNT(DISTINCT email),
    COUNT(DISTINCT domain),
    COUNT(DISTINCT CASE WHEN status = 'Booked' THEN email END),
    COUNT(DISTINCT CASE WHEN status = 'Scheduling' THEN email END),
    COUNT(DISTINCT CASE WHEN status = 'Not booked' THEN email END),
    COUNT(CASE WHEN status = 'Booked' THEN 1 END),
    COUNT(CASE WHEN status = 'Scheduling' THEN 1 END),
    COUNT(CASE WHEN status = 'Not booked' THEN 1 END)
  INTO 
    v_total_entries, v_unique_leads, v_unique_domains,
    v_unique_booked, v_unique_scheduling, v_unique_not_booked,
    v_total_booked, v_total_scheduling, v_total_not_booked
  FROM curated_leads
  WHERE (conv_date::date >= v_period_start OR conv_date IS NULL)
    AND (conv_date::date <= v_period_end OR conv_date IS NULL);
  
  -- Calculate rates
  IF v_unique_leads > 0 THEN
    v_booking_rate_unique := ROUND((v_unique_booked::DECIMAL / v_unique_leads) * 100, 2);
  ELSE
    v_booking_rate_unique := 0;
  END IF;
  
  IF v_total_entries > 0 THEN
    v_booking_rate_total := ROUND((v_total_booked::DECIMAL / v_total_entries) * 100, 2);
  ELSE
    v_booking_rate_total := 0;
  END IF;
  
  -- Upsert the record
  INSERT INTO booking_ratio (
    period_start, period_end, period_type,
    total_entries, unique_leads, unique_domains,
    unique_booked, unique_scheduling, unique_not_booked,
    total_booked, total_scheduling, total_not_booked,
    booking_rate_unique, booking_rate_total,
    calculated_at
  ) VALUES (
    v_period_start, v_period_end, p_period_type,
    v_total_entries, v_unique_leads, v_unique_domains,
    v_unique_booked, v_unique_scheduling, v_unique_not_booked,
    v_total_booked, v_total_scheduling, v_total_not_booked,
    v_booking_rate_unique, v_booking_rate_total,
    NOW()
  )
  ON CONFLICT (period_start, period_end, period_type) 
  DO UPDATE SET
    total_entries = EXCLUDED.total_entries,
    unique_leads = EXCLUDED.unique_leads,
    unique_domains = EXCLUDED.unique_domains,
    unique_booked = EXCLUDED.unique_booked,
    unique_scheduling = EXCLUDED.unique_scheduling,
    unique_not_booked = EXCLUDED.unique_not_booked,
    total_booked = EXCLUDED.total_booked,
    total_scheduling = EXCLUDED.total_scheduling,
    total_not_booked = EXCLUDED.total_not_booked,
    booking_rate_unique = EXCLUDED.booking_rate_unique,
    booking_rate_total = EXCLUDED.booking_rate_total,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION compute_booking_ratio TO service_role;
