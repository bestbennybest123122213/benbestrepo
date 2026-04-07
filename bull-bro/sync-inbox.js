#!/usr/bin/env node
/**
 * Sync SmartLead replies to local SQLite database
 * No external setup needed - just run it
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const path = require('path');

const DB_PATH = path.join(__dirname, 'inbox.db');
const db = new Database(DB_PATH);

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    smartlead_id TEXT UNIQUE,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    campaign_id INTEGER,
    campaign_name TEXT,
    reply_text TEXT,
    reply_category TEXT,
    reply_date TEXT,
    lead_status TEXT,
    industry TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_inbox_date ON inbox(reply_date DESC);
  CREATE INDEX IF NOT EXISTS idx_inbox_category ON inbox(reply_category);
`);

// Get Supabase credentials
function getFromKeychain(service) {
  try {
    return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

// SmartLead API
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_BASE = 'https://server.smartlead.ai/api/v1';

async function fetchSmartLead(endpoint) {
  const url = `${SMARTLEAD_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${SMARTLEAD_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SmartLead API error: ${res.status}`);
  return res.json();
}

function detectIndustry(company) {
  if (!company) return 'Unknown';
  const c = company.toLowerCase();
  if (c.includes('game') || c.includes('gaming')) return 'Gaming';
  if (c.includes('tech') || c.includes('software') || c.includes('app')) return 'Tech';
  if (c.includes('edu') || c.includes('learn') || c.includes('school')) return 'EdTech';
  if (c.includes('health') || c.includes('fitness')) return 'HealthTech';
  if (c.includes('finance') || c.includes('crypto')) return 'FinTech';
  return 'Other';
}

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO inbox 
  (smartlead_id, email, first_name, last_name, company, campaign_id, campaign_name, reply_text, reply_category, reply_date, lead_status, industry)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

async function syncFromSupabase() {
  if (!supabase) {
    console.log('⚠️ No Supabase connection');
    return 0;
  }
  
  console.log('📥 Syncing from Supabase...');
  
  const { data: existing, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  
  if (error || !existing) {
    console.error('❌ Supabase error:', error?.message);
    return 0;
  }
  
  console.log(`📦 Found ${existing.length} replies`);
  
  let synced = 0;
  for (const r of existing) {
    try {
      insertStmt.run(
        r.id?.toString() || `${r.email}-${r.campaign_id}`,
        r.email || r.lead_email,
        r.first_name || r.lead_name?.split(' ')[0],
        r.last_name || r.lead_name?.split(' ').slice(1).join(' '),
        r.company || r.lead_company,
        r.campaign_id,
        r.campaign_name,
        r.last_reply || r.reply_text || r.message,
        r.reply_category || r.category || 'Unknown',
        r.conversation_date || r.created_at,
        r.status,
        detectIndustry(r.company || r.lead_company)
      );
      synced++;
    } catch (e) {
      // Ignore duplicates
    }
  }
  
  console.log(`✅ Synced ${synced} from Supabase`);
  return synced;
}

async function syncFromSmartLead() {
  if (!SMARTLEAD_API_KEY) {
    console.log('⚠️ No SmartLead API key');
    return 0;
  }
  
  console.log('📥 Syncing from SmartLead API...');
  
  try {
    const campaigns = await fetchSmartLead('/campaigns');
    const campaignList = campaigns.data || campaigns || [];
    console.log(`📋 Found ${campaignList.length} campaigns`);
    
    let totalSynced = 0;
    
    for (const campaign of campaignList.slice(0, 15)) {
      try {
        const stats = await fetchSmartLead(`/campaigns/${campaign.id}/statistics?limit=100`);
        const leads = Array.isArray(stats) ? stats : (stats.data || []);
        
        const replied = leads.filter(l => l.reply_time || l.replied);
        
        for (const l of replied) {
          try {
            insertStmt.run(
              `sl-${campaign.id}-${l.id || l.lead_id}`,
              l.email,
              l.first_name,
              l.last_name,
              l.company_name || l.company,
              campaign.id,
              campaign.name,
              l.reply || l.last_reply || '',
              l.lead_category || 'Unknown',
              l.reply_time,
              l.lead_status,
              detectIndustry(l.company_name || l.company)
            );
            totalSynced++;
          } catch (e) {
            // Ignore duplicates
          }
        }
        
        if (replied.length > 0) {
          console.log(`  ✅ ${campaign.name}: ${replied.length} replies`);
        }
      } catch (e) {
        console.error(`  ⚠️ ${campaign.name}: ${e.message}`);
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`✅ Synced ${totalSynced} from SmartLead`);
    return totalSynced;
  } catch (e) {
    console.error('❌ SmartLead error:', e.message);
    return 0;
  }
}

async function main() {
  console.log('🐂 Bull BRO Inbox Sync\n');
  console.log(`📁 Database: ${DB_PATH}\n`);
  
  // Sync from all sources
  await syncFromSupabase();
  await syncFromSmartLead();
  
  // Count total
  const { count } = db.prepare('SELECT COUNT(*) as count FROM inbox').get();
  console.log(`\n📬 Total inbox: ${count} replies`);
  
  // Show sample
  const recent = db.prepare(`
    SELECT first_name, company, reply_category, reply_date 
    FROM inbox 
    ORDER BY reply_date DESC 
    LIMIT 5
  `).all();
  
  if (recent.length) {
    console.log('\n📬 Recent replies:');
    recent.forEach(r => {
      const date = r.reply_date ? new Date(r.reply_date).toLocaleDateString() : 'unknown';
      console.log(`  • ${r.first_name || '?'} @ ${r.company || '?'} - ${r.reply_category} (${date})`);
    });
  }
}

main().catch(console.error);
