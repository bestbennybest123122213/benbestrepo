-- Daily domain statistics table
CREATE TABLE IF NOT EXISTS domain_daily_stats (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  
  -- Account info
  account_count INTEGER DEFAULT 0,
  active_warmup INTEGER DEFAULT 0,
  
  -- Campaign stats (excludes warmup)
  sent INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  
  -- Calculated rates
  reply_rate DECIMAL(5,2) DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Warmup health
  warmup_reply_rate INTEGER DEFAULT 0,
  warmup_reputation INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one row per domain per day
  UNIQUE(domain, snapshot_date)
);

-- Index for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_domain_daily_date ON domain_daily_stats(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_domain_daily_domain ON domain_daily_stats(domain);
CREATE INDEX IF NOT EXISTS idx_domain_daily_domain_date ON domain_daily_stats(domain, snapshot_date DESC);

-- View for easy querying with time periods
CREATE OR REPLACE VIEW domain_stats_summary AS
SELECT 
  domain,
  -- Latest stats
  (SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain ORDER BY snapshot_date DESC LIMIT 1) as lifetime_sent,
  (SELECT replies FROM domain_daily_stats d2 WHERE d2.domain = d1.domain ORDER BY snapshot_date DESC LIMIT 1) as lifetime_replies,
  -- 7 day stats (difference between today and 7 days ago)
  (SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain ORDER BY snapshot_date DESC LIMIT 1) -
  COALESCE((SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain AND snapshot_date <= CURRENT_DATE - INTERVAL '7 days' ORDER BY snapshot_date DESC LIMIT 1), 0) as sent_7d,
  -- 14 day stats
  (SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain ORDER BY snapshot_date DESC LIMIT 1) -
  COALESCE((SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain AND snapshot_date <= CURRENT_DATE - INTERVAL '14 days' ORDER BY snapshot_date DESC LIMIT 1), 0) as sent_14d,
  -- 30 day stats
  (SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain ORDER BY snapshot_date DESC LIMIT 1) -
  COALESCE((SELECT sent FROM domain_daily_stats d2 WHERE d2.domain = d1.domain AND snapshot_date <= CURRENT_DATE - INTERVAL '30 days' ORDER BY snapshot_date DESC LIMIT 1), 0) as sent_30d
FROM domain_daily_stats d1
GROUP BY domain;
