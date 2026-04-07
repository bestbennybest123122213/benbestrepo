-- Reply Tracking Schema for Time-to-Reply Analytics
-- Tables for tracking conversation threads and response times

-- 1. Conversation threads (one per lead-campaign combo)
CREATE TABLE IF NOT EXISTS conversation_threads (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  lead_id TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_name TEXT,
  lead_company TEXT,
  
  -- Thread status
  status TEXT,  -- REPLIED, INTERESTED, etc.
  first_contact_at TIMESTAMPTZ,  -- When we first sent
  first_reply_at TIMESTAMPTZ,    -- When lead first replied
  last_activity_at TIMESTAMPTZ,  -- Most recent message
  
  -- Aggregates
  total_messages INT DEFAULT 0,
  our_messages INT DEFAULT 0,
  their_messages INT DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(campaign_id, lead_id)
);

-- 2. Individual messages in threads
CREATE TABLE IF NOT EXISTS thread_messages (
  id SERIAL PRIMARY KEY,
  thread_id INT REFERENCES conversation_threads(id) ON DELETE CASCADE,
  
  -- Message details
  message_id TEXT,  -- SmartLead message ID
  stats_id TEXT,    -- SmartLead stats ID
  
  type TEXT NOT NULL,  -- SENT (us) or REPLY (them)
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  
  sent_at TIMESTAMPTZ NOT NULL,
  
  -- For tracking our response time
  is_our_response BOOLEAN DEFAULT FALSE,
  responding_to_message_id INT REFERENCES thread_messages(id),
  response_time_seconds INT,  -- Time from their message to our reply
  
  -- Raw data
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(stats_id)
);

-- 3. Daily response time aggregates (for quick dashboard queries)
CREATE TABLE IF NOT EXISTS response_time_daily (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  
  -- Counts by response time bucket
  under_5min INT DEFAULT 0,
  under_15min INT DEFAULT 0,
  under_1hr INT DEFAULT 0,
  under_3hr INT DEFAULT 0,
  under_24hr INT DEFAULT 0,
  over_24hr INT DEFAULT 0,
  
  -- Averages
  total_responses INT DEFAULT 0,
  avg_response_seconds INT,
  median_response_seconds INT,
  
  -- By week (1-4 of month)
  week_of_month INT,  -- 1, 2, 3, or 4
  month_year TEXT,    -- e.g., "2026-02"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(snapshot_date)
);

-- 4. Weekly rollup (for comparison views)
CREATE TABLE IF NOT EXISTS response_time_weekly (
  id SERIAL PRIMARY KEY,
  
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  week_number INT,  -- 1-4 within month
  month_year TEXT,  -- e.g., "2026-02"
  
  -- Counts by response time bucket
  under_5min INT DEFAULT 0,
  under_15min INT DEFAULT 0,
  under_1hr INT DEFAULT 0,
  under_3hr INT DEFAULT 0,
  under_24hr INT DEFAULT 0,
  over_24hr INT DEFAULT 0,
  
  -- Totals
  total_responses INT DEFAULT 0,
  avg_response_seconds INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(week_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_threads_status ON conversation_threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_campaign ON conversation_threads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON thread_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_daily_date ON response_time_daily(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_weekly_month ON response_time_weekly(month_year);

-- Enable RLS (Row Level Security) - tables private by default
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_time_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_time_weekly ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON conversation_threads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON thread_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON response_time_daily FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON response_time_weekly FOR ALL USING (true) WITH CHECK (true);
