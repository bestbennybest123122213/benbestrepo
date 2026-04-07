-- Domain Health Dashboard - Supabase Tables
-- Run this SQL in Supabase Dashboard > SQL Editor

-- Domain snapshots - daily health of each domain
CREATE TABLE IF NOT EXISTS domain_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  domain TEXT NOT NULL,
  reputation DECIMAL(5,2),
  warmup_reply_rate DECIMAL(5,2),
  active_accounts INTEGER DEFAULT 0,
  total_accounts INTEGER DEFAULT 0,
  daily_capacity INTEGER DEFAULT 0,
  campaign_sends INTEGER DEFAULT 0,
  campaign_replies INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, domain)
);

-- Campaign snapshots - daily performance of each campaign
CREATE TABLE IF NOT EXISTS campaign_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  status TEXT,
  total_leads INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  interested INTEGER DEFAULT 0,
  reply_rate DECIMAL(5,2),
  open_rate DECIMAL(5,2),
  completion_rate DECIMAL(5,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, campaign_id)
);

-- Aggregate snapshots - overall daily totals
CREATE TABLE IF NOT EXISTS aggregate_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  total_domains INTEGER DEFAULT 0,
  total_accounts INTEGER DEFAULT 0,
  active_accounts INTEGER DEFAULT 0,
  total_campaigns INTEGER DEFAULT 0,
  daily_capacity INTEGER DEFAULT 0,
  daily_sent INTEGER DEFAULT 0,
  avg_warmup_rate DECIMAL(5,2),
  avg_reputation DECIMAL(5,2),
  total_leads INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,
  total_interested INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_domain_snapshots_date ON domain_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_domain_snapshots_domain ON domain_snapshots(domain);
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_date ON campaign_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_campaign_snapshots_campaign ON campaign_snapshots(campaign_id);
CREATE INDEX IF NOT EXISTS idx_aggregate_snapshots_date ON aggregate_snapshots(snapshot_date);

-- Enable RLS (Row Level Security) - disabled for server-side access
-- ALTER TABLE domain_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE aggregate_snapshots ENABLE ROW LEVEL SECURITY;
