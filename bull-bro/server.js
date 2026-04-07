#!/usr/bin/env node
/**
 * Bull BRO API Server
 * REST API for managing drafts, bulk actions, and system status
 * Plus static file serving for the dashboard
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Supabase setup for fetching real replies
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  
  function getFromKeychain(service) {
    try {
      return execSync(`security find-generic-password -a "supabase-leadgen" -s "${service}" -w`, { encoding: 'utf8' }).trim();
    } catch (e) {
      return null;
    }
  }
  
  const supabaseUrl = process.env.SUPABASE_URL || getFromKeychain('supabase-url');
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || getFromKeychain('supabase-service-key');
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    console.log('✅ Supabase connected');
  }
} catch (e) {
  console.log('⚠️ Supabase not available:', e.message);
}

// Helper functions
function mapCategoryToIntent(category) {
  if (!category) return 'neutral';
  const cat = category.toLowerCase();
  if (cat.includes('interested') || cat.includes('positive') || cat.includes('booked')) return 'hot';
  if (cat.includes('information') || cat.includes('question')) return 'warm';
  if (cat.includes('not interested') || cat.includes('objection')) return 'objection';
  if (cat.includes('ooo') || cat.includes('out of office')) return 'ooo';
  return 'neutral';
}

function detectIndustry(company) {
  if (!company) return 'Unknown';
  const c = company.toLowerCase();
  if (c.includes('game') || c.includes('gaming')) return 'Gaming';
  if (c.includes('tech') || c.includes('software') || c.includes('app')) return 'Tech';
  if (c.includes('edu') || c.includes('learn') || c.includes('school')) return 'EdTech';
  if (c.includes('health') || c.includes('fitness') || c.includes('medical')) return 'HealthTech';
  if (c.includes('finance') || c.includes('bank') || c.includes('crypto')) return 'FinTech';
  return 'Other';
}

// Try to load audit, but don't fail if it doesn't exist
let logAudit;
try {
  logAudit = require('./audit').logAudit;
} catch (e) {
  logAudit = (action, details, user) => {
    // Fallback: append to audit-log.json
    const logFile = path.join(__dirname, 'audit-log.json');
    try {
      const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
      log.unshift({ timestamp: new Date().toISOString(), action, details: JSON.stringify(details), user });
      if (log.length > 100) log.length = 100;
      fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    } catch (err) { /* ignore */ }
  };
}

let CONFIG = { confidenceThreshold: 7, hotLeadThreshold: 7, autoPrioritizeHotLeads: true };
try {
  CONFIG = require('./config.json');
} catch (e) { /* use defaults */ }

const PORT = CONFIG.server?.port || 3847;
const DRAFTS_FILE = path.join(__dirname, 'drafts.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit-log.json');
const THREADS_FILE = path.join(__dirname, 'thread-memory.json');
const WINNING_FILE = path.join(__dirname, 'winning-replies.json');
const OBJECTIONS_FILE = path.join(__dirname, 'objection-playbook.json');
const SOP_FILE = path.join(__dirname, 'sop-brain.json');

// SmartLead API config
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY || CONFIG.smartlead?.apiKey || '';
const SMARTLEAD_API_URL = CONFIG.smartlead?.apiUrl || 'https://server.smartlead.ai/api/v1';

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Load drafts
 */
function loadDrafts() {
  try {
    if (fs.existsSync(DRAFTS_FILE)) {
      return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading drafts:', e.message);
  }
  return { drafts: [] };
}

/**
 * Save drafts
 */
function saveDrafts(data) {
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load JSON file safely
 */
function loadJSON(filepath, defaultVal = {}) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
  }
  return defaultVal;
}

/**
 * Save JSON file
 */
function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

/**
 * Fetch from SmartLead API
 */
async function fetchSmartLead(endpoint, options = {}) {
  const https = require('https');
  const url = new URL(`${SMARTLEAD_API_URL}${endpoint}`);
  if (SMARTLEAD_API_KEY) {
    url.searchParams.set('api_key', SMARTLEAD_API_KEY);
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

/**
 * Parse JSON body from request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle CORS preflight
 */
function handleCORS(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
}

// ============ BULK ACTIONS ============

/**
 * Bulk approve drafts
 */
function bulkApprove(ids, user = 'api') {
  const data = loadDrafts();
  // Handle both array format and {drafts: [...]} format
  const drafts = Array.isArray(data) ? data : (data.drafts || []);
  const results = { approved: [], notFound: [], alreadyApproved: [] };
  
  for (const id of ids) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) {
      results.notFound.push(id);
    } else if (draft.status === 'approved') {
      results.alreadyApproved.push(id);
    } else {
      draft.status = 'approved';
      draft.approvedAt = new Date().toISOString();
      draft.approvedBy = user;
      results.approved.push(id);
    }
  }
  
  // Save in original format
  saveDrafts(Array.isArray(data) ? drafts : { drafts });
  
  logAudit('bulk_approve', {
    total: ids.length,
    approved: results.approved.length,
    notFound: results.notFound.length,
    alreadyApproved: results.alreadyApproved.length,
    ids: results.approved
  }, user);
  
  return results;
}

/**
 * Bulk archive drafts
 */
function bulkArchive(ids, user = 'api') {
  const data = loadDrafts();
  const drafts = Array.isArray(data) ? data : (data.drafts || []);
  const results = { archived: [], notFound: [], alreadyArchived: [] };
  
  for (const id of ids) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) {
      results.notFound.push(id);
    } else if (draft.status === 'archived') {
      results.alreadyArchived.push(id);
    } else {
      draft.status = 'archived';
      draft.archivedAt = new Date().toISOString();
      draft.archivedBy = user;
      results.archived.push(id);
    }
  }
  
  saveDrafts(Array.isArray(data) ? drafts : { drafts });
  
  logAudit('bulk_archive', {
    total: ids.length,
    archived: results.archived.length,
    notFound: results.notFound.length,
    alreadyArchived: results.alreadyArchived.length,
    ids: results.archived
  }, user);
  
  return results;
}

/**
 * Bulk requeue drafts
 */
function bulkRequeue(ids, user = 'api') {
  const data = loadDrafts();
  const drafts = Array.isArray(data) ? data : (data.drafts || []);
  const results = { requeued: [], notFound: [], alreadyPending: [] };
  
  for (const id of ids) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) {
      results.notFound.push(id);
    } else if (draft.status === 'pending') {
      results.alreadyPending.push(id);
    } else {
      draft.status = 'pending';
      draft.requeuedAt = new Date().toISOString();
      draft.requeuedBy = user;
      delete draft.approvedAt;
      delete draft.archivedAt;
      results.requeued.push(id);
    }
  }
  
  saveDrafts(Array.isArray(data) ? drafts : { drafts });
  
  logAudit('bulk_requeue', {
    total: ids.length,
    requeued: results.requeued.length,
    notFound: results.notFound.length,
    alreadyPending: results.alreadyPending.length,
    ids: results.requeued
  }, user);
  
  return results;
}

// ============ REQUEST HANDLER ============

async function handleRequest(req, res) {
  const { method, url } = req;
  
  // Handle CORS
  if (method === 'OPTIONS') {
    return handleCORS(res);
  }
  
  console.log(`${new Date().toISOString()} ${method} ${url}`);
  
  try {
    // ---- Health & Status ----
    if (method === 'GET' && url === '/api/health') {
      const statusFile = path.join(__dirname, 'health-status.json');
      if (fs.existsSync(statusFile)) {
        const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        return sendJSON(res, 200, status);
      }
      return sendJSON(res, 200, { status: 'no health check run yet' });
    }
    
    if (method === 'GET' && url === '/api/config') {
      return sendJSON(res, 200, CONFIG);
    }
    
    // ---- Drafts CRUD ----
    if (method === 'GET' && url === '/api/drafts') {
      const data = loadDrafts();
      return sendJSON(res, 200, data);
    }
    
    if (method === 'GET' && url.startsWith('/api/drafts/')) {
      const id = url.split('/')[3];
      const data = loadDrafts();
      const draft = data.drafts.find(d => d.id === id);
      if (draft) {
        return sendJSON(res, 200, draft);
      }
      return sendJSON(res, 404, { error: 'Draft not found' });
    }
    
    // ---- Bulk Actions ----
    if (method === 'POST' && url === '/api/drafts/bulk-approve') {
      const body = await parseBody(req);
      if (!body.ids || !Array.isArray(body.ids)) {
        return sendJSON(res, 400, { error: 'ids array required' });
      }
      const results = bulkApprove(body.ids, body.user || 'api');
      return sendJSON(res, 200, { 
        success: true, 
        message: `Approved ${results.approved.length} drafts`,
        results 
      });
    }
    
    if (method === 'POST' && url === '/api/drafts/bulk-archive') {
      const body = await parseBody(req);
      if (!body.ids || !Array.isArray(body.ids)) {
        return sendJSON(res, 400, { error: 'ids array required' });
      }
      const results = bulkArchive(body.ids, body.user || 'api');
      return sendJSON(res, 200, { 
        success: true, 
        message: `Archived ${results.archived.length} drafts`,
        results 
      });
    }
    
    if (method === 'POST' && url === '/api/drafts/bulk-requeue') {
      const body = await parseBody(req);
      if (!body.ids || !Array.isArray(body.ids)) {
        return sendJSON(res, 400, { error: 'ids array required' });
      }
      const results = bulkRequeue(body.ids, body.user || 'api');
      return sendJSON(res, 200, { 
        success: true, 
        message: `Requeued ${results.requeued.length} drafts`,
        results 
      });
    }
    
    // ---- Audit Log ----
    if (method === 'GET' && url === '/api/audit') {
      const auditFile = path.join(__dirname, 'audit-log.json');
      if (fs.existsSync(auditFile)) {
        const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
        return sendJSON(res, 200, audit);
      }
      return sendJSON(res, 200, { entries: [] });
    }
    
    // ---- Alerts ----
    if (method === 'GET' && url === '/api/alerts') {
      const alertsFile = path.join(__dirname, 'alerts.json');
      if (fs.existsSync(alertsFile)) {
        const alerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
        return sendJSON(res, 200, alerts);
      }
      return sendJSON(res, 200, { alerts: [] });
    }
    
    // ---- Backups ----
    if (method === 'GET' && url === '/api/backups') {
      const backupDir = path.join(__dirname, 'backups');
      if (fs.existsSync(backupDir)) {
        const backups = fs.readdirSync(backupDir)
          .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
          .reverse();
        return sendJSON(res, 200, { backups });
      }
      return sendJSON(res, 200, { backups: [] });
    }
    
    if (method === 'POST' && url === '/api/backups/create') {
      const { createBackup } = require('./backup');
      const result = createBackup();
      return sendJSON(res, 200, { success: true, ...result });
    }
    
    // ---- Stats (for dashboard) ----
    if (method === 'GET' && url === '/api/stats') {
      const data = loadDrafts();
      const drafts = Array.isArray(data) ? data : (data.drafts || []);
      const pending = drafts.filter(d => d.status === 'pending');
      const hotLeads = pending.filter(d => (d.buyingSignals || 0) >= (CONFIG.hotLeadThreshold || 7));
      const today = new Date().toISOString().split('T')[0];
      const sentToday = drafts.filter(d => d.sentAt && d.sentAt.startsWith(today));
      const totalSent = drafts.filter(d => d.status === 'sent' || d.status === 'approved').length;
      const totalResponded = drafts.filter(d => d.responded).length;
      const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
      
      return sendJSON(res, 200, {
        pending: pending.length,
        hotLeads: hotLeads.length,
        sentToday: sentToday.length,
        approved: drafts.filter(d => d.status === 'approved').length,
        total: drafts.length
      });
    }
    
    // ---- Audit Log (dashboard format) ----
    if (method === 'GET' && url === '/api/audit-log') {
      if (fs.existsSync(AUDIT_LOG_FILE)) {
        const log = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
        return sendJSON(res, 200, log);
      }
      return sendJSON(res, 200, []);
    }
    
    // ---- PUT Config ----
    if (method === 'PUT' && url === '/api/config') {
      const body = await parseBody(req);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(body, null, 2));
      CONFIG = body;
      logAudit('config_updated', { 
        confidenceThreshold: body.confidenceThreshold, 
        hotLeadThreshold: body.hotLeadThreshold 
      }, 'dashboard');
      return sendJSON(res, 200, { success: true, config: body });
    }
    
    // ---- Send Draft ----
    if (method === 'POST' && url.match(/^\/api\/drafts\/[^/]+\/send$/)) {
      const id = url.split('/')[3];
      const data = loadDrafts();
      const drafts = Array.isArray(data) ? data : (data.drafts || []);
      const draft = drafts.find(d => d.id === id);
      if (!draft) {
        return sendJSON(res, 404, { error: 'Draft not found' });
      }
      draft.status = 'sent';
      draft.sentAt = new Date().toISOString();
      if (Array.isArray(data)) {
        fs.writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2));
      } else {
        saveDrafts(data);
      }
      logAudit('draft_sent', { id, leadName: draft.leadName, company: draft.company }, 'dashboard');
      return sendJSON(res, 200, draft);
    }
    
    // ============ SMARTLEAD INBOX ============
    
    if (method === 'GET' && url.startsWith('/api/smartlead/inbox')) {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const limit = parseInt(urlObj.searchParams.get('limit') || '200');
      
      // Try Supabase first for real data
      if (supabase) {
        try {
          const { data: replies, error } = await supabase
            .from('bull_bro_inbox')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
          
          if (error) throw error;
          
          // bull_bro_inbox is the single source of truth
          const allReplies = [];
          
          // Merge and dedupe
          const combined = [...(replies || []), ...(allReplies || [])];
          const seen = new Set();
          const uniqueReplies = combined.filter(r => {
            const key = r.email || r.lead_email || r.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, limit);
          
          return sendJSON(res, 200, {
            success: true,
            source: 'supabase',
            count: uniqueReplies.length,
            replies: uniqueReplies.map(r => ({
              id: r.id || r.lead_id,
              from: `${r.first_name || r.lead_name || 'Unknown'} <${r.email || r.lead_email || ''}>`,
              firstName: r.first_name || r.lead_name?.split(' ')[0],
              company: r.company || r.lead_company || '',
              email: r.email || r.lead_email,
              subject: `Re: ${r.campaign_name || 'Outreach'}`,
              body: r.last_reply || r.reply_text || r.message || '',
              preview: (r.last_reply || r.reply_text || r.message || '').substring(0, 100) + '...',
              date: r.conversation_date || r.created_at,
              category: r.reply_category || r.category || r.lead_category || 'New',
              campaign: r.campaign_name || 'Unknown',
              intent: mapCategoryToIntent(r.reply_category || r.category || r.lead_category),
              leadData: {
                firstName: r.first_name || r.lead_name?.split(' ')[0],
                company: r.company || r.lead_company,
                industry: r.industry || detectIndustry(r.company || r.lead_company),
                email: r.email || r.lead_email
              }
            }))
          });
        } catch (e) {
          console.error('Supabase error:', e.message);
          // Fall through to SmartLead API
        }
      }
      
      // If no Supabase or Supabase failed, try SmartLead API
      if (!SMARTLEAD_API_KEY) {
        return sendJSON(res, 200, {
          success: false,
          mock: true,
          message: 'No data source available. Configure Supabase or SMARTLEAD_API_KEY.',
          replies: []
        });
      }
      
      try {
        // Fetch campaigns first
        const campaigns = await fetchSmartLead('/campaigns');
        const allReplies = [];
        
        // Fetch replies from each campaign
        for (const campaign of (campaigns.data || campaigns || []).slice(0, 5)) {
          const replies = await fetchSmartLead(`/campaigns/${campaign.id}/leads?reply_status=replied&limit=${limit}`);
          if (replies.data) {
            allReplies.push(...replies.data.map(r => ({
              ...r,
              campaign: campaign.name
            })));
          }
        }
        
        return sendJSON(res, 200, {
          success: true,
          source: 'smartlead_api',
          count: allReplies.length,
          replies: allReplies.slice(0, limit)
        });
      } catch (e) {
        return sendJSON(res, 500, { error: 'SmartLead API error: ' + e.message });
      }
    }
    
    // ============ TRAINING ENDPOINTS ============
    
    // Add winning reply
    if (method === 'POST' && url === '/api/training/winning') {
      const body = await parseBody(req);
      if (!body.reply) {
        return sendJSON(res, 400, { error: 'reply text required' });
      }
      
      const data = loadJSON(WINNING_FILE, { replies: [], stats: { totalWins: 0, byIntent: {}, byIndustry: {} } });
      
      const entry = {
        id: `win_${Date.now()}`,
        reply: body.reply,
        intent: body.intent || 'general',
        industry: body.industry || 'unknown',
        leadEmail: body.leadEmail || null,
        company: body.company || null,
        notes: body.notes || '',
        timestamp: new Date().toISOString()
      };
      
      data.replies.push(entry);
      data.stats.totalWins++;
      data.stats.byIntent[entry.intent] = (data.stats.byIntent[entry.intent] || 0) + 1;
      data.stats.byIndustry[entry.industry] = (data.stats.byIndustry[entry.industry] || 0) + 1;
      data.lastUpdated = new Date().toISOString().split('T')[0];
      
      saveJSON(WINNING_FILE, data);
      logAudit('winning_reply_added', { intent: entry.intent, industry: entry.industry }, 'dashboard');
      
      return sendJSON(res, 200, { success: true, entry });
    }
    
    // Get winning replies
    if (method === 'GET' && url === '/api/training/winning') {
      const data = loadJSON(WINNING_FILE, { replies: [], stats: {} });
      return sendJSON(res, 200, data);
    }
    
    // Add objection
    if (method === 'POST' && url === '/api/training/objection') {
      const body = await parseBody(req);
      if (!body.key || !body.phrases || !body.counter) {
        return sendJSON(res, 400, { error: 'key, phrases array, and counter required' });
      }
      
      const data = loadJSON(OBJECTIONS_FILE, { objections: {} });
      
      data.objections[body.key] = {
        phrases: Array.isArray(body.phrases) ? body.phrases : [body.phrases],
        counter: body.counter,
        win_rate: 0,
        times_used: 0
      };
      data.lastUpdated = new Date().toISOString().split('T')[0];
      
      saveJSON(OBJECTIONS_FILE, data);
      logAudit('objection_added', { key: body.key }, 'dashboard');
      
      return sendJSON(res, 200, { success: true, key: body.key });
    }
    
    // Get objections
    if (method === 'GET' && url === '/api/training/objections') {
      const data = loadJSON(OBJECTIONS_FILE, { objections: {} });
      return sendJSON(res, 200, data);
    }
    
    // Update objection
    if (method === 'PUT' && url.startsWith('/api/training/objections/')) {
      const key = decodeURIComponent(url.split('/')[4]);
      const body = await parseBody(req);
      
      const data = loadJSON(OBJECTIONS_FILE, { objections: {} });
      
      if (!data.objections[key]) {
        return sendJSON(res, 404, { error: 'Objection not found' });
      }
      
      data.objections[key] = { ...data.objections[key], ...body };
      data.lastUpdated = new Date().toISOString().split('T')[0];
      
      saveJSON(OBJECTIONS_FILE, data);
      logAudit('objection_updated', { key }, 'dashboard');
      
      return sendJSON(res, 200, { success: true, objection: data.objections[key] });
    }
    
    // Increment objection usage/win
    if (method === 'POST' && url.match(/^\/api\/training\/objections\/[^/]+\/(used|won)$/)) {
      const parts = url.split('/');
      const key = decodeURIComponent(parts[4]);
      const action = parts[5];
      
      const data = loadJSON(OBJECTIONS_FILE, { objections: {} });
      
      if (!data.objections[key]) {
        return sendJSON(res, 404, { error: 'Objection not found' });
      }
      
      data.objections[key].times_used = (data.objections[key].times_used || 0) + 1;
      if (action === 'won') {
        const wins = (data.objections[key].times_won || 0) + 1;
        data.objections[key].times_won = wins;
        data.objections[key].win_rate = Math.round((wins / data.objections[key].times_used) * 100);
      }
      
      saveJSON(OBJECTIONS_FILE, data);
      
      return sendJSON(res, 200, { success: true, objection: data.objections[key] });
    }
    
    // ============ THREADS / CONTEXT MEMORY ============
    
    const THREADS_CACHE_FILE = path.join(__dirname, 'threads-cache.json');
    
    // Get all threads (from threads-cache.json - full threads)
    if (method === 'GET' && url === '/api/threads') {
      const data = loadJSON(THREADS_CACHE_FILE, {});
      const threads = Object.entries(data).map(([email, thread]) => ({
        id: email,
        email,
        ...thread
      }));
      return sendJSON(res, 200, { threads, total: threads.length });
    }
    
    // Get single thread
    if (method === 'GET' && url.startsWith('/api/threads/') && !url.includes('/status')) {
      const id = decodeURIComponent(url.split('/')[3]);
      
      // Try threads-cache.json first (rebuilt from lead_conversations)
      const cacheData = loadJSON(THREADS_CACHE_FILE, {});
      
      if (cacheData[id]) {
        const thread = cacheData[id];
        
        // Format thread with 🔵/🟢 markers
        const formattedThread = (thread.messages || []).map(m => {
          const isOurs = m.type === 'SENT' || m.from === 'Imman';
          const sender = isOurs ? 'IMMAN' : (thread.lead || id.split('@')[0]).toUpperCase();
          const icon = isOurs ? '🟢' : '🔵';
          
          return {
            icon,
            sender,
            date: m.dateFormatted || m.date,
            body: m.body,
            isOurs
          };
        });
        
        return sendJSON(res, 200, { 
          id,
          email: id,
          lead: thread.lead,
          company: thread.company,
          category: thread.category,
          campaign: thread.campaign,
          is_booked: thread.is_booked,
          is_golden: thread.is_golden,
          messageCount: thread.messageCount,
          messages: formattedThread,
          formattedThread
        });
      }
      
      // Fallback to local file
      const data = loadJSON(THREADS_FILE, { threads: {} });
      
      if (!data.threads[id]) {
        return sendJSON(res, 404, { error: 'Thread not found' });
      }
      
      return sendJSON(res, 200, { id, ...data.threads[id] });
    }
    
    // Search threads
    if (method === 'GET' && url.startsWith('/api/threads/search')) {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const query = (urlObj.searchParams.get('q') || '').toLowerCase();
      
      const data = loadJSON(THREADS_FILE, { threads: {} });
      const results = Object.entries(data.threads)
        .filter(([key, thread]) => {
          return key.toLowerCase().includes(query) ||
                 thread.lead?.email?.toLowerCase().includes(query) ||
                 thread.lead?.company?.toLowerCase().includes(query);
        })
        .map(([key, thread]) => ({ id: key, ...thread, messageCount: thread.messages?.length || 0 }));
      
      return sendJSON(res, 200, { results });
    }
    
    // Update thread status (won/lost)
    if (method === 'PUT' && url.match(/^\/api\/threads\/[^/]+\/status$/)) {
      const id = decodeURIComponent(url.split('/')[3]);
      const body = await parseBody(req);
      
      const data = loadJSON(THREADS_FILE, { threads: {} });
      
      if (!data.threads[id]) {
        return sendJSON(res, 404, { error: 'Thread not found' });
      }
      
      data.threads[id].status = body.status;
      data.threads[id][`${body.status}At`] = new Date().toISOString();
      
      saveJSON(THREADS_FILE, data);
      logAudit('thread_status_changed', { id, status: body.status }, 'dashboard');
      
      return sendJSON(res, 200, { success: true, thread: data.threads[id] });
    }
    
    // ============ TEMPLATES (SOP BRAIN) ============
    
    // Get all templates
    if (method === 'GET' && url === '/api/templates') {
      const data = loadJSON(SOP_FILE, { templates: {} });
      return sendJSON(res, 200, data);
    }
    
    // Update template
    if (method === 'PUT' && url.startsWith('/api/templates/')) {
      const parts = url.split('/').slice(3);
      const body = await parseBody(req);
      
      const data = loadJSON(SOP_FILE, { templates: {} });
      
      // Navigate to the template
      let current = data.templates;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = decodeURIComponent(parts[i]);
        if (!current[key]) {
          return sendJSON(res, 404, { error: 'Template path not found' });
        }
        current = current[key];
      }
      
      const templateKey = decodeURIComponent(parts[parts.length - 1]);
      if (!current[templateKey]) {
        return sendJSON(res, 404, { error: 'Template not found' });
      }
      
      current[templateKey] = { ...current[templateKey], ...body };
      
      saveJSON(SOP_FILE, data);
      logAudit('template_updated', { path: parts.join('/') }, 'dashboard');
      
      return sendJSON(res, 200, { success: true, template: current[templateKey] });
    }
    
    // Add new template
    if (method === 'POST' && url === '/api/templates') {
      const body = await parseBody(req);
      if (!body.category || !body.key || !body.template) {
        return sendJSON(res, 400, { error: 'category, key, and template required' });
      }
      
      const data = loadJSON(SOP_FILE, { templates: {} });
      
      if (!data.templates[body.category]) {
        data.templates[body.category] = {};
      }
      
      data.templates[body.category][body.key] = body.template;
      
      saveJSON(SOP_FILE, data);
      logAudit('template_added', { category: body.category, key: body.key }, 'dashboard');
      
      return sendJSON(res, 200, { success: true });
    }
    
    // Test template with sample data
    if (method === 'POST' && url === '/api/templates/test') {
      const body = await parseBody(req);
      if (!body.script || !body.data) {
        return sendJSON(res, 400, { error: 'script and data required' });
      }
      
      let result = body.script;
      for (const [key, value] of Object.entries(body.data)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      
      return sendJSON(res, 200, { success: true, result });
    }
    
    // Match template based on message content
    if (method === 'POST' && url === '/api/templates/match') {
      const body = await parseBody(req);
      const message = (body.message || '').toLowerCase();
      const lead = body.lead || {};
      const firstName = lead.firstName || 'there';
      
      // Load copy rules
      const COPY_RULES_FILE = path.join(__dirname, 'copy-rules.json');
      const rules = loadJSON(COPY_RULES_FILE, { never: [], always: [], style: {}, variations: {} });
      
      // Helper to pick random variation
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const v = rules.variations || {};
      
      // Build response from variations
      const opener = (v.opener ? pick(v.opener) : `Cool, ${firstName}.`).replace(/\{\{firstName\}\}/g, firstName);
      const times = v.time_slots ? pick(v.time_slots) : "I'm free Mon 12pm or 3pm and Wed 1pm or 4pm EST, either works?";
      const calendly = v.calendly_intro ? pick(v.calendly_intro) : "Here's my calendly.";
      const closing = v.closing ? pick(v.closing) : "Best,\nImman";
      
      // Simple intent detection and response generation
      let response;
      
      if (message.includes('interested') || message.includes('let\'s talk') || message.includes('schedule') || message.includes('connect') || message.includes('call') || message.includes('let me know') || message.includes('times that work')) {
        response = `${opener}\n\n${times}\n\n${calendly}\nhttps://calendly.com/jan__w/partnership_itssimannn\n\n${closing}`;
      } else if (message.includes('not the right time') || message.includes('busy') || message.includes('january') || message.includes('next year')) {
        response = `Hey ${firstName},\n\nTotally get it. Mind if I ping you in January when things calm down?\n\nBest,\nImman`;
      } else if (message.includes('send more info') || message.includes('more details') || message.includes('tell me more')) {
        response = `Hey ${firstName},\n\nQuick overview:\n\n• ItssIMANNN: 10M+ subs, up to 361M monthly views\n• Whiteout Survival: 48M views, 100K+ users\n• Gauth AI: 15M+ views\n\nWorth a quick 15-min call?\n\nBest,\nImman`;
      } else if (message.includes('budget') || message.includes('cost') || message.includes('price') || message.includes('rate')) {
        response = `Hey ${firstName},\n\nCampaigns typically run $15K-45K depending on integration type.\n\nQuick call to figure out what works for you?\n\nBest,\nImman`;
      } else if (message.includes('meeting') || message.includes('calendar') || message.includes('book')) {
        response = `${opener}\n\n${times}\n\n${calendly}\nhttps://calendly.com/jan__w/partnership_itssimannn\n\n${closing}`;
      } else {
        // Generic follow-up - use variations
        response = `${opener}\n\n${times}\n\n${calendly}\nhttps://calendly.com/jan__w/partnership_itssimannn\n\n${closing}`;
      }
      
      // Apply copy rules - remove banned phrases
      for (const banned of rules.never || []) {
        response = response.replace(new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
      }
      
      // Clean up any double spaces or empty lines from removals
      response = response.replace(/  +/g, ' ').replace(/\n\n\n+/g, '\n\n').trim();
      
      return sendJSON(res, 200, { success: true, response });
    }
    
    // ============ ENHANCED STATS ============
    
    if (method === 'GET' && url === '/api/stats/full') {
      const drafts = loadDrafts();
      const draftList = Array.isArray(drafts) ? drafts : (drafts.drafts || []);
      const threads = loadJSON(THREADS_FILE, { threads: {} });
      const winning = loadJSON(WINNING_FILE, { replies: [], stats: {} });
      const objections = loadJSON(OBJECTIONS_FILE, { objections: {} });
      const sop = loadJSON(SOP_FILE, { templates: {} });
      
      // Calculate stats
      const totalReplies = draftList.length;
      const threadsList = Object.values(threads.threads);
      const wins = threadsList.filter(t => t.status === 'won').length;
      const losses = threadsList.filter(t => t.status === 'lost').length;
      const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
      
      // Top performing objection handlers
      const objectionStats = Object.entries(objections.objections)
        .map(([key, obj]) => ({
          key,
          timesUsed: obj.times_used || 0,
          winRate: obj.win_rate || 0
        }))
        .sort((a, b) => b.timesUsed - a.timesUsed)
        .slice(0, 5);
      
      // Template usage (count templates)
      let templateCount = 0;
      const countTemplates = (obj) => {
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') {
            if (val.script || val.trigger) templateCount++;
            else countTemplates(val);
          }
        }
      };
      countTemplates(sop.templates || {});
      
      return sendJSON(res, 200, {
        totalReplies,
        totalThreads: threadsList.length,
        wins,
        losses,
        winRate,
        totalWinningReplies: winning.replies?.length || 0,
        topObjections: objectionStats,
        templateCount,
        byIntent: winning.stats?.byIntent || {},
        byIndustry: winning.stats?.byIndustry || {}
      });
    }
    
    // ---- Static Files ----
    // Serve index.html for root
    let filePath = url === '/' ? '/index.html' : url;
    // Remove query strings
    filePath = filePath.split('?')[0];
    const fullPath = path.join(__dirname, filePath);
    
    // Security: prevent directory traversal
    if (!fullPath.startsWith(__dirname)) {
      return sendJSON(res, 403, { error: 'Forbidden' });
    }
    
    // Try to serve static file
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(content);
    }
    
    // ---- 404 ----
    return sendJSON(res, 404, { error: 'Not found' });
    
  } catch (e) {
    console.error('Error:', e);
    return sendJSON(res, 500, { error: e.message });
  }
}

// ============ SERVER ============

if (require.main === module) {
  const server = http.createServer(handleRequest);
  
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🐂 BULL BRO API                        ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                 ║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  Dashboard:     http://localhost:${PORT}
  
  Core:
    GET  /api/health              - Health status
    GET  /api/config              - Configuration
    GET  /api/stats/full          - Full stats dashboard
  
  SmartLead:
    GET  /api/smartlead/inbox     - Fetch replies (?limit=200)
  
  Training:
    POST /api/training/winning    - Add winning reply
    GET  /api/training/winning    - List winning replies
    POST /api/training/objection  - Add objection handler
    GET  /api/training/objections - List objections
  
  Threads:
    GET  /api/threads             - List all threads
    GET  /api/threads/:id         - Thread details
    GET  /api/threads/search?q=   - Search threads
    PUT  /api/threads/:id/status  - Mark won/lost
  
  Templates:
    GET  /api/templates           - List SOP templates
    PUT  /api/templates/:path     - Update template
    POST /api/templates/test      - Test with variables
  
  Drafts:
    GET  /api/drafts              - List drafts
    POST /api/drafts/bulk-*       - Bulk actions
    `);
    
    logAudit('system_start', { port: PORT }, 'server');
  });
  
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    logAudit('system_stop', {}, 'server');
    process.exit(0);
  });
}

module.exports = { bulkApprove, bulkArchive, bulkRequeue };
