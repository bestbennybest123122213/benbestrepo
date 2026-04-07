-- Migration: Add response time tracking
-- Run this in Supabase SQL Editor

-- Add response time columns to conversation_threads
ALTER TABLE conversation_threads 
ADD COLUMN IF NOT EXISTS avg_response_seconds INTEGER,
ADD COLUMN IF NOT EXISTS first_response_seconds INTEGER,
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;

-- Create response time aggregates table
CREATE TABLE IF NOT EXISTS response_time_aggregates (
  id SERIAL PRIMARY KEY,
  period_type TEXT NOT NULL, -- 'week' or 'month'
  period_key TEXT NOT NULL,  -- '2026-W04' or '2026-01'
  response_count INTEGER DEFAULT 0,
  first_response_count INTEGER DEFAULT 0,
  avg_response_seconds INTEGER,
  avg_first_response_seconds INTEGER,
  min_response_seconds INTEGER,
  max_response_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_type, period_key)
);

-- Enable RLS
ALTER TABLE response_time_aggregates ENABLE ROW LEVEL SECURITY;

-- Create policy (same as other tables)
CREATE POLICY "Service role only" ON response_time_aggregates
  FOR ALL USING (auth.role() = 'service_role');

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_response_time_aggregates_period 
ON response_time_aggregates(period_type, period_key);

-- Create index on conversation_threads for response time queries
CREATE INDEX IF NOT EXISTS idx_conversation_threads_first_reply 
ON conversation_threads(first_reply_at);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_response 
ON conversation_threads(first_response_seconds) WHERE first_response_seconds IS NOT NULL;

COMMENT ON TABLE response_time_aggregates IS 'Weekly and monthly response time statistics';
COMMENT ON COLUMN conversation_threads.first_response_seconds IS 'Time in seconds from lead first reply to our first response';
COMMENT ON COLUMN conversation_threads.avg_response_seconds IS 'Average time in seconds for all our responses to their messages';
