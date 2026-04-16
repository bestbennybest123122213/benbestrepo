-- Migration 008: Add hot_lead column to both CRM tables + campaign_name/mailbox to inbound
ALTER TABLE crm_imman_outbound ADD COLUMN IF NOT EXISTS hot_lead TEXT;
ALTER TABLE crm_imman_inbound ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE crm_imman_inbound ADD COLUMN IF NOT EXISTS mailbox TEXT;
ALTER TABLE crm_imman_inbound ADD COLUMN IF NOT EXISTS hot_lead TEXT;
