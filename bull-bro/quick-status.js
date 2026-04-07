#!/usr/bin/env node
/**
 * Bull BRO Quick Status
 * One-liner overview of all systems
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;

// Icons
const OK = '✅';
const WARN = '⚠️';
const ERR = '❌';
const UNKNOWN = '❓';

const statusIcon = (s) => s === 'ok' ? OK : s === 'warning' ? WARN : s === 'error' ? ERR : UNKNOWN;

function getQuickStatus() {
  const parts = [];
  
  // Health status
  const healthPath = path.join(DATA_DIR, 'health-status.json');
  if (fs.existsSync(healthPath)) {
    try {
      const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
      const sl = health.smartlead?.status || 'unknown';
      const api = health.anthropic?.status || 'unknown';
      const disk = health.disk?.status || 'unknown';
      parts.push(`Health: SL${statusIcon(sl)} API${statusIcon(api)} Disk${statusIcon(disk)}`);
    } catch (e) {
      parts.push('Health: ' + ERR);
    }
  } else {
    parts.push('Health: no check');
  }
  
  // Drafts status
  const draftsPath = path.join(DATA_DIR, 'drafts.json');
  if (fs.existsSync(draftsPath)) {
    try {
      const drafts = JSON.parse(fs.readFileSync(draftsPath, 'utf8'));
      const arr = Array.isArray(drafts) ? drafts : (drafts.drafts || []);
      const pending = arr.filter(d => d.status === 'pending').length;
      const hot = arr.filter(d => d.status === 'pending' && (d.buyingSignals >= 7 || d.sentiment >= 8)).length;
      parts.push(`Drafts: ${pending} pending (${hot} hot)`);
    } catch (e) {
      parts.push('Drafts: ' + ERR);
    }
  } else {
    parts.push('Drafts: none');
  }
  
  // Alerts
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  if (fs.existsSync(alertsPath)) {
    try {
      const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
      const arr = Array.isArray(alerts) ? alerts : [];
      const unresolved = arr.filter(a => a.alerts?.length > 0).length;
      if (unresolved > 0) {
        parts.push(`Alerts: ${WARN}${unresolved}`);
      }
    } catch (e) {}
  }
  
  // Backups
  const backupsDir = path.join(DATA_DIR, 'backups');
  if (fs.existsSync(backupsDir)) {
    try {
      const backups = fs.readdirSync(backupsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const latest = backups.sort().reverse()[0];
      if (latest) {
        const age = Math.round((Date.now() - new Date(latest)) / 1000 / 60 / 60 / 24);
        const icon = age === 0 ? OK : age <= 1 ? OK : age <= 7 ? WARN : ERR;
        parts.push(`Backup: ${icon} ${age === 0 ? 'today' : age + 'd ago'}`);
      }
    } catch (e) {}
  }
  
  return parts.join(' | ');
}

if (require.main === module) {
  console.log('🐂 ' + getQuickStatus());
}

module.exports = { getQuickStatus };
