-- Imann Booking & Positive Replies Table
-- Private data - do not expose publicly

CREATE TABLE IF NOT EXISTS imann_positive_replies (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  category TEXT DEFAULT 'Interested',
  status TEXT NOT NULL, -- 'Booked', 'Not booked', 'Scheduling', 'Non show up'
  conversation_month TEXT,
  conversation_year INTEGER,
  conversation_date DATE,
  lead_response_at TIMESTAMPTZ, -- When lead responded
  our_response_at TIMESTAMPTZ,  -- When we responded
  response_time_seconds INTEGER, -- Calculated ERT in seconds
  meeting_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(email, conversation_date)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_imann_status ON imann_positive_replies(status);
CREATE INDEX IF NOT EXISTS idx_imann_conv_date ON imann_positive_replies(conversation_date);
CREATE INDEX IF NOT EXISTS idx_imann_conv_month ON imann_positive_replies(conversation_year, conversation_month);

-- RLS policies (if needed)
-- ALTER TABLE imann_positive_replies ENABLE ROW LEVEL SECURITY;
