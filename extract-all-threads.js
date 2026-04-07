#!/usr/bin/env node
/**
 * Extract ALL SmartLead Responses with Full Threads
 * 
 * Purpose: Fetch every historical response from SmartLead inbox,
 * get full message threads, and store in Supabase.
 * 
 * Features:
 * - Paginated fetch of all inbox replies
 * - Full thread extraction for each lead
 * - Progress tracking with checkpoints
 * - Rate limiting to avoid API throttling
 * - Special handling for "Booked" leads (golden standard)
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CHECKPOINT_FILE = path.join(__dirname, 'data', 'extract-checkpoint.json');
const OUTPUT_FILE = path.join(__dirname, 'data', 'all-threads.json');
const BOOKED_FILE = path.join(__dirname, 'data', 'booked-leads-golden.json');

// SmartLead category IDs
const CATEGORIES = {
  1: 'Interested',
  2: 'Meeting Request',
  3: 'Not Interested',
  4: 'Do Not Contact',
  5: 'Information Request',
  6: 'Out Of Office',
  7: 'Wrong Person',
  8: 'Uncategorizable',
  9: 'Bounce',
  96206: 'Subsequence',
  96207: 'Booked'
};

// Booked leads emails (provided by Jan)
const BOOKED_EMAILS = [
  'alex.me@imagen-ai.com',
  'anastasia.k@outpost.me',
  'anders@chimi-online.com',
  'andre@infinitygames.io',
  'anifowoshe.o@dreamworksdirect.com',
  'aradhana.c@increff.com',
  'arun@ada.ac.uk',
  'chall@brainscape.com',
  'd.corazzi@eyeora.com',
  'dallen@monsterminigolf.com',
  'dana@turborilla.com',
  'daniel@eyeora.com',
  'daniel@fifthdoor.com',
  'debsmith@rewardify.com',
  'deniz@candywriter.com',
  'dennis@ez-robot.com',
  'doug@canaryspeech.com',
  'eliel@qoris.ai',
  'elifnaz.erdogan@roamless.com',
  'epodgorsky@gmail.com',
  'frankd@homeinspotv.com',
  'hamza.ahmed@gyandhan.com',
  'jaarji@rhei.com',
  'jdepalma@touchinghearts.com',
  'jerome.agyemang@payincgroup.com',
  'joey.daroza@claybourneco.com',
  'kgroves@passpass.com',
  'kwaku.wize@gmail.com',
  'michael@picomy.com',
  'mika@ence.fi',
  'mo@toplitz-productions.com',
  'nicole.heriman@heygen.com',
  'nimo@poki.com',
  'nkanopoulos@britesolar.com',
  'richard@nerdlegame.com',
  'rj@zoop.com',
  'ryan.walsh@valqari.com',
  'shyama.gupta@increff.com',
  'smriti@unstop.com',
  'stuart@liveplaymobile.com',
  'tvallortigara@skillz.com',
  'vlad@cm.games',
  'yvonne.li@opus.pro',
  'ziva@poki.com'
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { offset: 0, processed: [], failed: [], lastRun: null };
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// Fetch inbox replies with CLI
async function fetchInboxReplies(offset = 0, limit = 20) {
  try {
    const cmd = `smartlead inbox replies --limit ${limit} --offset ${offset} --format json`;
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const result = JSON.parse(output);
    return result.data || [];
  } catch (error) {
    log(`Error fetching inbox at offset ${offset}: ${error.message}`);
    return [];
  }
}

// Fetch full message thread for a lead
async function fetchMessageThread(campaignId, leadId) {
  try {
    const cmd = `smartlead leads messages --campaign-id ${campaignId} --lead-id ${leadId} --format json`;
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const result = JSON.parse(output);
    // Messages are in history array
    return result.history || result || [];
  } catch (error) {
    log(`Error fetching thread for campaign ${campaignId}, lead ${leadId}: ${error.message}`);
    return null;
  }
}

// Validate thread is complete (no truncation)
function validateThread(messages) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { valid: false, reason: 'empty_or_null' };
  }
  
  for (const msg of messages) {
    const body = msg.email_body || msg.body || msg.message || msg.content || '';
    // Check for truncation indicators
    if (body.includes('...') && body.trim().length < 50) {
      return { valid: false, reason: 'truncated_with_dots' };
    }
    if (body.includes('[truncated]') || body.includes('[...]')) {
      return { valid: false, reason: 'explicitly_truncated' };
    }
  }
  
  return { valid: true };
}

// Main extraction logic
async function extractAllThreads() {
  log('=== Starting Full Thread Extraction ===');
  
  let checkpoint = loadCheckpoint();
  let offset = checkpoint.offset;
  let allReplies = [];
  let allThreads = [];
  let bookedThreads = [];
  let processedCount = 0;
  let failedCount = 0;
  
  // Phase 1: Fetch ALL inbox replies
  log('Phase 1: Fetching all inbox replies...');
  
  while (true) {
    const replies = await fetchInboxReplies(offset, 20);
    
    if (replies.length === 0) {
      log(`No more replies at offset ${offset}. Total collected: ${allReplies.length}`);
      break;
    }
    
    allReplies.push(...replies);
    log(`Fetched ${replies.length} replies at offset ${offset}. Total: ${allReplies.length}`);
    
    offset += 20;
    await sleep(200); // Rate limiting
  }
  
  log(`Total inbox replies found: ${allReplies.length}`);
  
  // Save raw replies
  const rawRepliesFile = path.join(__dirname, 'data', 'raw-inbox-replies.json');
  fs.writeFileSync(rawRepliesFile, JSON.stringify(allReplies, null, 2));
  log(`Saved raw replies to ${rawRepliesFile}`);
  
  // Phase 2: Fetch full threads for each reply
  log('Phase 2: Fetching full message threads...');
  
  // For fresh run, clear the processed set to get ALL threads
  const processedEmails = new Set();
  
  for (let i = 0; i < allReplies.length; i++) {
    const reply = allReplies[i];
    const email = reply.lead_email;
    const campaignId = reply.email_campaign_id;
    const leadId = reply.email_lead_id;
    const categoryId = reply.lead_category_id;
    const categoryName = CATEGORIES[categoryId] || 'Unknown';
    
    // Skip if already processed
    if (processedEmails.has(email)) {
      continue;
    }
    
    log(`[${i + 1}/${allReplies.length}] Processing: ${email} (${categoryName})`);
    
    // Fetch full thread
    const messages = await fetchMessageThread(campaignId, leadId);
    
    if (!messages) {
      log(`  ❌ Failed to fetch thread for ${email}`);
      checkpoint.failed.push({ email, campaignId, leadId, error: 'fetch_failed' });
      failedCount++;
      await sleep(500);
      continue;
    }
    
    // Validate thread completeness
    const validation = validateThread(messages);
    if (!validation.valid) {
      log(`  ⚠️ Thread validation failed for ${email}: ${validation.reason}`);
      // Still save it but flag it
    }
    
    const threadData = {
      email,
      name: `${reply.lead_first_name || ''} ${reply.lead_last_name || ''}`.trim(),
      company: reply.lead_company || null,
      campaign_id: campaignId,
      campaign_name: reply.email_campaign_name,
      lead_id: leadId,
      category_id: categoryId,
      category: categoryName,
      is_booked: BOOKED_EMAILS.includes(email.toLowerCase()),
      last_reply_time: reply.last_reply_time,
      messages: messages,
      message_count: messages.length,
      validation: validation,
      extracted_at: new Date().toISOString()
    };
    
    allThreads.push(threadData);
    
    // Track booked leads separately
    if (threadData.is_booked || categoryId === 96207) {
      bookedThreads.push(threadData);
      log(`  ⭐ BOOKED LEAD: ${email}`);
    }
    
    processedEmails.add(email);
    checkpoint.processed.push(email);
    processedCount++;
    
    // Save checkpoint every 50 leads
    if (processedCount % 50 === 0) {
      checkpoint.lastRun = new Date().toISOString();
      saveCheckpoint(checkpoint);
      
      // Also save intermediate results
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allThreads, null, 2));
      fs.writeFileSync(BOOKED_FILE, JSON.stringify(bookedThreads, null, 2));
      log(`  💾 Checkpoint saved. Processed: ${processedCount}, Failed: ${failedCount}`);
    }
    
    // Rate limiting
    await sleep(300);
  }
  
  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allThreads, null, 2));
  fs.writeFileSync(BOOKED_FILE, JSON.stringify(bookedThreads, null, 2));
  checkpoint.lastRun = new Date().toISOString();
  checkpoint.completed = true;
  saveCheckpoint(checkpoint);
  
  log('=== Extraction Complete ===');
  log(`Total threads extracted: ${allThreads.length}`);
  log(`Booked leads (golden standard): ${bookedThreads.length}`);
  log(`Failed extractions: ${failedCount}`);
  log(`Output files:`);
  log(`  - ${OUTPUT_FILE}`);
  log(`  - ${BOOKED_FILE}`);
  
  return { allThreads, bookedThreads };
}

// Upload to Supabase
async function uploadToSupabase(threads) {
  log('=== Uploading to Supabase ===');
  
  // First, create/update the table schema
  const createTableSQL = `
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
  `;
  
  log('Creating/updating table schema...');
  
  // Upload threads in batches
  const batchSize = 50;
  let uploaded = 0;
  let errors = 0;
  
  for (let i = 0; i < threads.length; i += batchSize) {
    const batch = threads.slice(i, i + batchSize).map(t => ({
      email: t.email,
      name: t.name,
      company: t.company,
      campaign_id: String(t.campaign_id),
      campaign_name: t.campaign_name,
      lead_id: String(t.lead_id),
      category: t.category,
      category_id: t.category_id,
      is_booked: t.is_booked,
      is_golden_standard: t.is_booked || t.category_id === 96207,
      last_reply_time: t.last_reply_time,
      messages: t.messages,
      message_count: t.message_count,
      thread_valid: t.validation?.valid ?? true,
      validation_notes: t.validation?.reason || null,
      extracted_at: t.extracted_at
    }));
    
    const { data, error } = await supabase
      .from('lead_conversations')
      .upsert(batch, { 
        onConflict: 'email,campaign_id',
        ignoreDuplicates: false 
      });
    
    if (error) {
      log(`Error uploading batch ${i}-${i + batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      uploaded += batch.length;
    }
    
    log(`Uploaded ${uploaded}/${threads.length} threads (${errors} errors)`);
  }
  
  log(`=== Upload Complete ===`);
  log(`Successfully uploaded: ${uploaded}`);
  log(`Errors: ${errors}`);
}

// Main
async function main() {
  const startTime = Date.now();
  
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Extract all threads
  const { allThreads, bookedThreads } = await extractAllThreads();
  
  // Upload to Supabase
  await uploadToSupabase(allThreads);
  
  const duration = Math.round((Date.now() - startTime) / 1000 / 60);
  log(`Total runtime: ${duration} minutes`);
  
  // Summary stats
  const stats = {
    totalThreads: allThreads.length,
    bookedLeads: bookedThreads.length,
    byCategory: {},
    extractionTime: new Date().toISOString(),
    durationMinutes: duration
  };
  
  for (const t of allThreads) {
    stats.byCategory[t.category] = (stats.byCategory[t.category] || 0) + 1;
  }
  
  const statsFile = path.join(__dirname, 'data', 'extraction-stats.json');
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  
  log('Extraction stats:');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch(console.error);
