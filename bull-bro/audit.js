#!/usr/bin/env node
/**
 * Bull BRO Audit Logger
 * Tracks all system actions for compliance and debugging
 */

const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, 'audit-log.json');
const ARCHIVE_DIR = path.join(__dirname, 'audit-archive');
const MAX_ENTRIES = 1000;

// Valid action types
const VALID_ACTIONS = [
  'draft_created',
  'draft_sent', 
  'draft_edited',
  'draft_approved',
  'draft_archived',
  'draft_requeued',
  'bulk_approve',
  'bulk_archive',
  'bulk_requeue',
  'config_changed',
  'backup_created',
  'backup_restored',
  'health_alert',
  'health_check',
  'system_start',
  'system_stop'
];

/**
 * Load current audit log
 */
function loadAuditLog() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      // Handle legacy format or corrupted data
      if (!data || !Array.isArray(data.entries)) {
        return { entries: Array.isArray(data) ? data : [], lastRotation: new Date().toISOString() };
      }
      return data;
    }
  } catch (e) {
    console.error('Error loading audit log:', e.message);
  }
  return { entries: [], lastRotation: new Date().toISOString() };
}

/**
 * Save audit log
 */
function saveAuditLog(log) {
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(log, null, 2));
}

/**
 * Rotate old entries to archive
 */
function rotateIfNeeded(log) {
  if (log.entries.length <= MAX_ENTRIES) return log;
  
  // Ensure archive directory exists
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
  
  // Move excess entries to archive
  const excess = log.entries.length - MAX_ENTRIES;
  const toArchive = log.entries.splice(0, excess);
  
  const archiveFile = path.join(ARCHIVE_DIR, `audit-${Date.now()}.json`);
  fs.writeFileSync(archiveFile, JSON.stringify({
    archivedAt: new Date().toISOString(),
    entries: toArchive
  }, null, 2));
  
  log.lastRotation = new Date().toISOString();
  console.log(`📦 Rotated ${excess} entries to ${path.basename(archiveFile)}`);
  
  return log;
}

/**
 * Log an audit entry
 * @param {string} action - Action type (e.g., 'draft_created')
 * @param {object} details - Additional details about the action
 * @param {string} user - User who performed the action (default: 'system')
 */
function logAudit(action, details = {}, user = 'system') {
  const log = loadAuditLog();
  
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    user,
    details,
  };
  
  // Warn if action is not in predefined list (but still log it)
  if (!VALID_ACTIONS.includes(action)) {
    console.warn(`⚠️ Unknown action type: ${action}`);
  }
  
  log.entries.push(entry);
  
  // Rotate if needed
  const rotatedLog = rotateIfNeeded(log);
  saveAuditLog(rotatedLog);
  
  return entry;
}

/**
 * Get recent audit entries
 * @param {number} limit - Max entries to return
 * @param {string} filterAction - Filter by action type (optional)
 */
function getRecentAudits(limit = 50, filterAction = null) {
  const log = loadAuditLog();
  let entries = log.entries;
  
  if (filterAction) {
    entries = entries.filter(e => e.action === filterAction);
  }
  
  return entries.slice(-limit).reverse();
}

/**
 * Get audit stats
 */
function getAuditStats() {
  const log = loadAuditLog();
  const stats = {
    totalEntries: log.entries.length,
    lastRotation: log.lastRotation,
    actionCounts: {}
  };
  
  for (const entry of log.entries) {
    stats.actionCounts[entry.action] = (stats.actionCounts[entry.action] || 0) + 1;
  }
  
  // Count archived files
  if (fs.existsSync(ARCHIVE_DIR)) {
    stats.archivedFiles = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.json')).length;
  } else {
    stats.archivedFiles = 0;
  }
  
  return stats;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'log':
      const action = args[1] || 'test_action';
      const details = args[2] ? JSON.parse(args[2]) : { test: true };
      const user = args[3] || 'cli';
      const entry = logAudit(action, details, user);
      console.log('✅ Logged:', entry);
      break;
      
    case 'recent':
      const limit = parseInt(args[1]) || 20;
      const filter = args[2] || null;
      const recent = getRecentAudits(limit, filter);
      console.log(`\n📋 Recent Audit Entries (${recent.length}):\n`);
      for (const e of recent) {
        const time = new Date(e.timestamp).toLocaleString();
        console.log(`  ${time} | ${e.action.padEnd(15)} | ${e.user.padEnd(10)} | ${JSON.stringify(e.details).slice(0, 50)}`);
      }
      break;
      
    case 'stats':
      const stats = getAuditStats();
      console.log('\n📊 Audit Statistics:\n');
      console.log(`  Total entries: ${stats.totalEntries}`);
      console.log(`  Archived files: ${stats.archivedFiles}`);
      console.log(`  Last rotation: ${stats.lastRotation}`);
      console.log('\n  Action counts:');
      for (const [action, count] of Object.entries(stats.actionCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${action.padEnd(20)} ${count}`);
      }
      break;
      
    default:
      console.log(`
Bull BRO Audit Logger

Usage:
  node audit.js log <action> [details_json] [user]  - Log an entry
  node audit.js recent [limit] [action_filter]      - Show recent entries
  node audit.js stats                               - Show statistics

Actions: ${VALID_ACTIONS.join(', ')}
      `);
  }
}

module.exports = { logAudit, getRecentAudits, getAuditStats, VALID_ACTIONS };
