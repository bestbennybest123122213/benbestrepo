-- SmartLead Data Tables for Bull OS
-- Run this in Supabase SQL Editor
-- Created: 2026-03-14

-- =========================================
-- TABLE 1: Daily Stats (scraped from SmartLead)
-- One row per day, stores aggregate stats
-- =========================================
CREATE TABLE IF NOT EXISTS smartlead_daily_stats (
  id BIGSERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  
  -- Core metrics (from day-wise-overall-stats API)
  sent INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  
  -- Positive metrics (from category-wise-response API)
  positive INTEGER DEFAULT 0,
  interested INTEGER DEFAULT 0,
  meeting_request INTEGER DEFAULT 0,
  booked INTEGER DEFAULT 0,
  
  -- Calculated rates
  reply_rate DECIMAL(5,2),
  positive_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  
  -- Metadata
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT DEFAULT 'api',
  
  -- Constraints
  CONSTRAINT valid_rates CHECK (
    (reply_rate IS NULL OR (reply_rate >= 0 AND reply_rate <= 100)) AND
    (positive_rate IS NULL OR (positive_rate >= 0 AND positive_rate <= 100)) AND
    (bounce_rate IS NULL OR (bounce_rate >= 0 AND bounce_rate <= 100))
  )
);

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_smartlead_daily_stats_date ON smartlead_daily_stats(stat_date DESC);

-- =========================================
-- TABLE 2: Monthly Aggregates
-- Pre-calculated monthly totals for fast queries
-- =========================================
CREATE TABLE IF NOT EXISTS smartlead_monthly_stats (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL UNIQUE,  -- Format: '2026-03'
  
  -- Core metrics
  sent INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  positive INTEGER DEFAULT 0,
  
  -- Rates
  reply_rate DECIMAL(5,2),
  positive_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  
  -- Date range
  start_date DATE,
  end_date DATE,
  
  -- Metadata
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smartlead_monthly_stats_month ON smartlead_monthly_stats(year_month DESC);

-- =========================================
-- TABLE 3: All Replies (detailed)
-- Every reply received with full metadata
-- =========================================
CREATE TABLE IF NOT EXISTS smartlead_replies (
  id BIGSERIAL PRIMARY KEY,
  
  -- SmartLead identifiers
  smartlead_lead_id BIGINT,
  smartlead_campaign_id BIGINT,
  smartlead_email_id BIGINT,
  
  -- Lead info
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  
  -- Reply details
  reply_text TEXT,
  reply_subject TEXT,
  reply_date TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Categorization
  sentiment TEXT,  -- 'positive', 'neutral', 'negative'
  category TEXT,   -- 'Interested', 'Meeting Request', 'Out Of Office', etc.
  is_positive BOOLEAN DEFAULT FALSE,
  
  -- Campaign info
  campaign_name TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  raw_data JSONB,
  
  -- Unique constraint on SmartLead email ID
  CONSTRAINT unique_smartlead_email UNIQUE (smartlead_email_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_smartlead_replies_date ON smartlead_replies(reply_date DESC);
CREATE INDEX IF NOT EXISTS idx_smartlead_replies_positive ON smartlead_replies(is_positive) WHERE is_positive = true;
CREATE INDEX IF NOT EXISTS idx_smartlead_replies_email ON smartlead_replies(email);
CREATE INDEX IF NOT EXISTS idx_smartlead_replies_campaign ON smartlead_replies(smartlead_campaign_id);

-- =========================================
-- TABLE 4: Scrape Log
-- Track when scrapes happen for debugging
-- =========================================
CREATE TABLE IF NOT EXISTS smartlead_scrape_log (
  id BIGSERIAL PRIMARY KEY,
  scrape_type TEXT NOT NULL,  -- 'daily', 'monthly', 'replies', 'full'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  success BOOLEAN DEFAULT FALSE,
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_smartlead_scrape_log_type ON smartlead_scrape_log(scrape_type, started_at DESC);

-- =========================================
-- VIEWS for easy querying
-- =========================================

-- View: Last 7 days stats
CREATE OR REPLACE VIEW smartlead_last_7d AS
SELECT 
  SUM(sent) as sent,
  SUM(replied) as replied,
  SUM(positive) as positive,
  SUM(bounced) as bounced,
  MIN(stat_date) as start_date,
  MAX(stat_date) as end_date
FROM smartlead_daily_stats
WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days';

-- View: Last 30 days stats
CREATE OR REPLACE VIEW smartlead_last_30d AS
SELECT 
  SUM(sent) as sent,
  SUM(replied) as replied,
  SUM(positive) as positive,
  SUM(bounced) as bounced,
  MIN(stat_date) as start_date,
  MAX(stat_date) as end_date
FROM smartlead_daily_stats
WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days';

-- View: All-time totals
CREATE OR REPLACE VIEW smartlead_all_time AS
SELECT 
  SUM(sent) as sent,
  SUM(replied) as replied,
  SUM(positive) as positive,
  SUM(bounced) as bounced,
  MIN(stat_date) as first_date,
  MAX(stat_date) as last_date,
  COUNT(DISTINCT stat_date) as days_tracked
FROM smartlead_daily_stats;

-- =========================================
-- FUNCTIONS for data sync
-- =========================================

-- Function to get stats for a date range
CREATE OR REPLACE FUNCTION get_smartlead_stats(
  p_start_date DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  sent BIGINT,
  replied BIGINT,
  positive BIGINT,
  bounced BIGINT,
  reply_rate DECIMAL,
  positive_rate DECIMAL,
  bounce_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.sent), 0)::BIGINT as sent,
    COALESCE(SUM(s.replied), 0)::BIGINT as replied,
    COALESCE(SUM(s.positive), 0)::BIGINT as positive,
    COALESCE(SUM(s.bounced), 0)::BIGINT as bounced,
    CASE WHEN COALESCE(SUM(s.sent), 0) > 0 
         THEN ROUND(COALESCE(SUM(s.replied), 0)::DECIMAL / SUM(s.sent) * 100, 2)
         ELSE 0 END as reply_rate,
    CASE WHEN COALESCE(SUM(s.replied), 0) > 0 
         THEN ROUND(COALESCE(SUM(s.positive), 0)::DECIMAL / SUM(s.replied) * 100, 2)
         ELSE 0 END as positive_rate,
    CASE WHEN COALESCE(SUM(s.sent), 0) > 0 
         THEN ROUND(COALESCE(SUM(s.bounced), 0)::DECIMAL / SUM(s.sent) * 100, 2)
         ELSE 0 END as bounce_rate
  FROM smartlead_daily_stats s
  WHERE s.stat_date >= p_start_date AND s.stat_date <= p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- GRANT PERMISSIONS
-- =========================================
-- Uncomment if needed for your Supabase setup
-- GRANT SELECT, INSERT, UPDATE ON smartlead_daily_stats TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON smartlead_monthly_stats TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON smartlead_replies TO authenticated;
-- GRANT SELECT, INSERT ON smartlead_scrape_log TO authenticated;
-- GRANT SELECT ON smartlead_last_7d TO authenticated;
-- GRANT SELECT ON smartlead_last_30d TO authenticated;
-- GRANT SELECT ON smartlead_all_time TO authenticated;
