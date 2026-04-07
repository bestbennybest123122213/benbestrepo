-- Domain Health Table
-- Stores aggregated email health metrics per domain per date range

CREATE TABLE IF NOT EXISTS domain_health (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  accounts INTEGER DEFAULT 0,
  lead_contacted INTEGER DEFAULT 0,
  email_sent INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  reply_rate DECIMAL(5,2) DEFAULT 0,
  positive_rate DECIMAL(5,2) DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain, date_start, date_end)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_domain_health_domain ON domain_health(domain);
CREATE INDEX IF NOT EXISTS idx_domain_health_dates ON domain_health(date_start, date_end);

-- Also create mailbox_health for raw per-account data
CREATE TABLE IF NOT EXISTS mailbox_health (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  domain TEXT NOT NULL,
  lead_contacted INTEGER DEFAULT 0,
  email_sent INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  opened_pct DECIMAL(5,2) DEFAULT 0,
  replied_pct DECIMAL(5,2) DEFAULT 0,
  positive_pct DECIMAL(5,2) DEFAULT 0,
  bounce_pct DECIMAL(5,2) DEFAULT 0,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, date_start, date_end)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_health_email ON mailbox_health(email);
CREATE INDEX IF NOT EXISTS idx_mailbox_health_domain ON mailbox_health(domain);
