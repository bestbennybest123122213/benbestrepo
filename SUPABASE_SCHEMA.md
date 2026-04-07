# Supabase Schema Design for GEX OS

## Why Supabase?
- SmartLead API doesn't support per-domain time-based filtering
- By storing daily snapshots, we CAN build daily/weekly/monthly trends
- Track things SmartLead doesn't expose (reply times within conversations)
- Own our data, faster queries, custom analytics

---

## Tables

### 1. `domains`
Track all sending domains.
```sql
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_name TEXT UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('hypertide', 'google')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. `email_accounts`
Track all email accounts.
```sql
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlead_id INTEGER UNIQUE,
  email TEXT UNIQUE NOT NULL,
  domain_id UUID REFERENCES domains(id),
  warmup_status TEXT,
  warmup_reply_rate INTEGER,
  warmup_reputation INTEGER,
  daily_capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `campaigns`
Track all campaigns.
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlead_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  type TEXT CHECK (type IN ('hypertide', 'google')),
  sequence_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. `campaign_stats_daily` ⭐ KEY TABLE
Daily snapshots of campaign performance - enables time-based trending!
```sql
CREATE TABLE campaign_stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  date DATE NOT NULL,
  -- Lead counts
  total_leads INTEGER,
  completed INTEGER,
  in_progress INTEGER,
  not_started INTEGER,
  blocked INTEGER,
  -- Email metrics
  sent INTEGER,
  replied INTEGER,
  bounced INTEGER,
  interested INTEGER,
  not_interested INTEGER,
  out_of_office INTEGER,
  -- Rates (stored for quick access)
  completion_rate DECIMAL(5,2),
  reply_rate DECIMAL(5,2),
  positive_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);
```

### 5. `domain_stats_daily` ⭐ KEY TABLE
Daily snapshots of domain performance - THIS SOLVES THE TIME-BASED PROBLEM!
```sql
CREATE TABLE domain_stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domains(id),
  date DATE NOT NULL,
  -- Performance
  sent INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  -- Capacity
  daily_capacity INTEGER,
  daily_sent INTEGER,
  utilization DECIMAL(5,2),
  -- Warmup health
  avg_warmup_reply_rate INTEGER,
  avg_reputation INTEGER,
  -- Rates
  reply_rate DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain_id, date)
);
```

### 6. `leads`
Store leads with reply tracking.
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlead_id INTEGER UNIQUE,
  campaign_id UUID REFERENCES campaigns(id),
  email TEXT NOT NULL,
  company TEXT,
  status TEXT, -- interested, not_interested, out_of_office, etc.
  sequence_number INTEGER,
  first_sent_at TIMESTAMPTZ,
  first_reply_at TIMESTAMPTZ,
  reply_time_minutes INTEGER, -- Calculated: first_reply - first_sent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7. `messages` ⭐ FOR REPLY TIME TRACKING
Store individual messages in conversations.
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  smartlead_message_id TEXT,
  direction TEXT CHECK (direction IN ('outbound', 'inbound')),
  sent_at TIMESTAMPTZ NOT NULL,
  from_email TEXT,
  subject TEXT,
  -- For reply time calculation
  previous_message_id UUID REFERENCES messages(id),
  reply_time_minutes INTEGER, -- Time since previous message
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8. `sync_log`
Track sync operations.
```sql
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'full', 'campaigns', 'domains', 'leads', 'messages'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_synced INTEGER,
  status TEXT DEFAULT 'running',
  error_message TEXT
);
```

---

## Indexes for Performance
```sql
CREATE INDEX idx_campaign_stats_date ON campaign_stats_daily(date);
CREATE INDEX idx_campaign_stats_campaign ON campaign_stats_daily(campaign_id);
CREATE INDEX idx_domain_stats_date ON domain_stats_daily(date);
CREATE INDEX idx_domain_stats_domain ON domain_stats_daily(domain_id);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_messages_lead ON messages(lead_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);
```

---

## Sync Strategy

### 1. Daily Snapshot Sync (runs at midnight or early morning)
- Fetch all campaign stats from SmartLead
- Insert into `campaign_stats_daily` with today's date
- Aggregate domain stats and insert into `domain_stats_daily`
- This builds our historical data!

### 2. Real-time Lead Sync (runs every 15-30 min)
- Fetch leads with status changes
- Update `leads` table
- Fetch new messages for reply time tracking
- Update `messages` table

### 3. Hourly Account Sync
- Update `email_accounts` with warmup status changes
- Update domain aggregates

---

## Queries This Enables

### Daily/Weekly/Monthly Domain Trends
```sql
-- Last 7 days per domain
SELECT 
  d.domain_name,
  ds.date,
  ds.sent,
  ds.replies,
  ds.reply_rate
FROM domain_stats_daily ds
JOIN domains d ON d.id = ds.domain_id
WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY d.domain_name, ds.date;
```

### Average Reply Time by Campaign
```sql
SELECT 
  c.name,
  AVG(l.reply_time_minutes) as avg_reply_time_mins,
  COUNT(*) as total_replies
FROM leads l
JOIN campaigns c ON c.id = l.campaign_id
WHERE l.first_reply_at IS NOT NULL
GROUP BY c.id, c.name;
```

### Reply Time Distribution
```sql
SELECT 
  CASE 
    WHEN reply_time_minutes < 60 THEN '< 1 hour'
    WHEN reply_time_minutes < 240 THEN '1-4 hours'
    WHEN reply_time_minutes < 1440 THEN '4-24 hours'
    ELSE '> 24 hours'
  END as reply_bucket,
  COUNT(*) as count
FROM messages
WHERE direction = 'inbound' AND reply_time_minutes IS NOT NULL
GROUP BY 1;
```

---

## Next Steps
1. Get Supabase credentials (URL + anon key)
2. Run schema creation
3. Build sync script
4. Update GEX OS to pull from Supabase for historical data
5. Add reply time analytics to dashboard
