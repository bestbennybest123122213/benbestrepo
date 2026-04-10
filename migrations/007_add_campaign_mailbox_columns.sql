-- Add campaign_name and mailbox columns to crm_imman_outbound
-- campaign_name: which Smartlead campaign the lead came from
-- mailbox: which sending email (from Smartlead) contacted the lead
ALTER TABLE crm_imman_outbound ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE crm_imman_outbound ADD COLUMN IF NOT EXISTS mailbox TEXT;

-- Also add to curated_leads so data flows from webhook -> interested leads -> CRM
ALTER TABLE curated_leads ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE curated_leads ADD COLUMN IF NOT EXISTS mailbox TEXT;
