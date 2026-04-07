-- Fix RLS Security Issues
-- Run this in Supabase Dashboard > SQL Editor

-- Enable RLS on all existing tables
ALTER TABLE ben_6k_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_csv_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_campaign_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_mixed_leads_enriched ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_gaming_leads_enriched ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_gaming_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ben_mixed_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE all_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on new dashboard tables
ALTER TABLE domain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregate_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service_role full access (our backend)
-- This allows the dashboard to work while blocking public access

CREATE POLICY "Service role full access" ON ben_6k_leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_csv_backups FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_campaign_exports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_mixed_leads_enriched FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_gaming_leads_enriched FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_gaming_leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ben_mixed_leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON all_leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON leads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON domain_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON campaign_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON aggregate_snapshots FOR ALL USING (auth.role() = 'service_role');
