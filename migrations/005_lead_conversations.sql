-- Migration: Create lead_conversations table for full thread storage
-- Purpose: Store complete email threads from SmartLead with all messages
-- Date: 2026-04-02

CREATE TABLE IF NOT EXISTS lead_conversations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  lead_id TEXT,
  category TEXT,
  category_id INTEGER,
  is_booked BOOLEAN DEFAULT FALSE,
  is_golden_standard BOOLEAN DEFAULT FALSE,
  last_reply_time TIMESTAMPTZ,
  messages JSONB,
  message_count INTEGER,
  thread_valid BOOLEAN DEFAULT TRUE,
  validation_notes TEXT,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_conv_email ON lead_conversations(email);
CREATE INDEX IF NOT EXISTS idx_lead_conv_category ON lead_conversations(category);
CREATE INDEX IF NOT EXISTS idx_lead_conv_booked ON lead_conversations(is_booked);
CREATE INDEX IF NOT EXISTS idx_lead_conv_golden ON lead_conversations(is_golden_standard);

ALTER TABLE lead_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON lead_conversations 
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE lead_conversations IS 'Complete email threads from SmartLead with full message history. Booked leads marked as golden_standard for reply training.';
