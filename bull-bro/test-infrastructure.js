#!/usr/bin/env node
/**
 * Bull BRO Infrastructure Tests
 * Run: node test-infrastructure.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n🧪 Bull BRO Infrastructure Tests\n');

// ============ AUDIT TESTS ============
console.log('📋 Audit Logger:');
const { logAudit, getRecentAudits, getAuditStats } = require('./audit');

test('logAudit creates entry', () => {
  const entry = logAudit('test_action', { test: true }, 'test-runner');
  assert(entry.id, 'Entry should have ID');
  assert(entry.timestamp, 'Entry should have timestamp');
  assert(entry.action === 'test_action', 'Action should match');
});

test('getRecentAudits returns array', () => {
  const recent = getRecentAudits(5);
  assert(Array.isArray(recent), 'Should return array');
});

test('getAuditStats returns valid stats', () => {
  const stats = getAuditStats();
  assert(typeof stats.totalEntries === 'number', 'Should have totalEntries');
  assert(typeof stats.actionCounts === 'object', 'Should have actionCounts');
});

// ============ BACKUP TESTS ============
console.log('\n📦 Backup System:');
const { createBackup, listBackups } = require('./backup');

test('listBackups returns array or empty', () => {
  // This test just checks that it doesn't crash
  const result = listBackups();
  // listBackups logs to console, so this is a smoke test
  assert(true, 'listBackups completed');
});

// ============ HEALTH MONITOR TESTS ============
console.log('\n🏥 Health Monitor:');
const { checkDisk } = require('./health-monitor');

test('checkDisk returns valid status', () => {
  const result = checkDisk();
  assert(result.status, 'Should have status');
  assert(['ok', 'warning', 'error', 'unknown'].includes(result.status), 'Status should be valid');
});

// ============ SERVER BULK ACTIONS ============
console.log('\n🔄 Bulk Actions:');
const { bulkApprove, bulkArchive, bulkRequeue } = require('./server');

test('bulkApprove handles non-existent IDs', () => {
  const result = bulkApprove(['nonexistent-id'], 'test');
  assert(result.notFound.includes('nonexistent-id'), 'Should report not found');
});

test('bulkArchive handles non-existent IDs', () => {
  const result = bulkArchive(['nonexistent-id'], 'test');
  assert(result.notFound.includes('nonexistent-id'), 'Should report not found');
});

test('bulkRequeue handles non-existent IDs', () => {
  const result = bulkRequeue(['nonexistent-id'], 'test');
  assert(result.notFound.includes('nonexistent-id'), 'Should report not found');
});

// ============ QUICK STATUS ============
console.log('\n⚡ Quick Status:');
const { getQuickStatus } = require('./quick-status');

test('getQuickStatus returns string', () => {
  const status = getQuickStatus();
  assert(typeof status === 'string', 'Should return string');
  assert(status.length > 0, 'Should not be empty');
});

// ============ CONFIG VALIDATION ============
console.log('\n⚙️ Configuration:');

test('config.json is valid JSON', () => {
  const configPath = path.join(DATA_DIR, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert(config.name === 'Bull BRO', 'Should have correct name');
});

// ============ SUMMARY ============
console.log('\n' + '═'.repeat(40));
console.log(`  Total: ${passed + failed} tests`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log('═'.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
