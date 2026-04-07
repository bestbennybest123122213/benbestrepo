-- =============================================================================
-- SUPABASE SECURITY FIX - APPLIED 2026-02-03
-- =============================================================================
-- This file documents all SQL changes made to secure the database.
-- All tables now have Row Level Security (RLS) enabled.
-- The dashboard backend uses the service_role key to bypass RLS for internal ops.

-- =============================================================================
-- PART 1: Enable RLS on all lead and snapshot tables
-- =============================================================================
ALTER TABLE ben_6k_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_csv_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_campaign_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_mixed_leads_enriched ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_gaming_leads_enriched ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_gaming_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_mixed_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE all_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregate_snapshots ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 2: Enable RLS on messaging and metrics tables
-- =============================================================================
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_time_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_time_weekly ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 3: Create email reply tracking tables (with RLS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS all_replies (
  id BIGSERIAL PRIMARY KEY,
  lead_email TEXT NOT NULL,
  reply_timestamp TIMESTAMPTZ NOT NULL,
  subject TEXT,
  from_email TEXT,
  snippet TEXT,
  message_id TEXT UNIQUE,
  is_positive BOOLEAN DEFAULT NULL,
  sentiment_category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positive_replies (
  id BIGSERIAL PRIMARY KEY,
  lead_email TEXT NOT NULL,
  reply_timestamp TIMESTAMPTZ NOT NULL,
  subject TEXT,
  snippet TEXT,
  message_id TEXT UNIQUE REFERENCES all_replies(message_id),
  sentiment_score NUMERIC,
  follow_up_status TEXT DEFAULT 'pending',
  snooze_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add snooze_until if table already exists
ALTER TABLE positive_replies
  ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

ALTER TABLE all_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE positive_replies ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECURITY STATUS: COMPLETE
-- =============================================================================
-- All 18 tables now have RLS enabled:
--   1.  ben_6k_leads
--   2.  ben_csv_backups
--   3.  ben_campaign_exports
--   4.  ben_mixed_leads_enriched
--   5.  ben_gaming_leads_enriched
--   6.  ben_gaming_leads
--   7.  ben_mixed_leads
--   8.  all_leads
--   9.  leads
--   10. domain_snapshots
--   11. campaign_snapshots
--   12. aggregate_snapshots
--   13. conversation_threads
--   14. thread_messages
--   15. response_time_daily
--   16. response_time_weekly
--   17. all_replies (NEW)
--   18. positive_replies (NEW)
--
-- Dashboard backend (server.js) uses SUPABASE_SERVICE_KEY to bypass RLS.
-- Public anon key access is now blocked unless RLS policies are added.
-- =============================================================================
